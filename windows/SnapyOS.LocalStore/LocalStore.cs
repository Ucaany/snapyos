using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public enum LocalSyncState { Pending, Running, Synced, Retrying, Failed, Quarantined }
public enum LocalQuarantineState { None, Required, Quarantined, Released }

public sealed record LocalStoreOptions(string DatabasePath, string MediaRoot)
{
    public static LocalStoreOptions ForDirectory(string directory) => new(
        Path.Combine(directory, "snapyos.db"),
        Path.Combine(directory, "media"));
}

public sealed record SessionRecord(
    string SessionId,
    string BusinessSlug,
    string PhotoboxSlug,
    string PackageId,
    string State,
    DateTimeOffset CreatedAt,
    DateTimeOffset? FinalizedAt,
    DateTimeOffset? RetentionUntil,
    string? IdempotencyKey);

public sealed record MediaRecord(
    string MediaId,
    string SessionId,
    string RelativePath,
    string MediaKind,
    long SizeBytes,
    string Sha256,
    LocalSyncState SyncState,
    LocalQuarantineState QuarantineState,
    DateTimeOffset RetentionUntil);

public sealed record SyncQueueItem(
    string QueueId,
    string SessionId,
    string IdempotencyKey,
    LocalSyncState State,
    int Attempts,
    DateTimeOffset NextAttemptAt,
    string? LastError);

public sealed record RecoveryReport(int Requeued, int Quarantined, int MissingFiles);
public sealed record SecurityAuditRow(string EventType, string? PinKind, DateTimeOffset OccurredAt);

public sealed class LocalStore : IDisposable
{
    public const int CurrentSchemaVersion = 2;
    private readonly LocalStoreOptions _options;
    private readonly SqliteConnection _connection;
    private bool _disposed;

    public LocalStore(LocalStoreOptions options)
    {
        _options = options;
        Directory.CreateDirectory(Path.GetDirectoryName(options.DatabasePath) ?? ".");
        Directory.CreateDirectory(options.MediaRoot);
        _connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = options.DatabasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        }.ToString());
        _connection.Open();
        ConfigureConnection();
        Migrate();
    }

    public int SchemaVersion => Convert.ToInt32(Scalar("PRAGMA user_version;"));

    public SessionRecord InsertSession(
        string sessionId,
        string businessSlug,
        string photoboxSlug,
        string packageId,
        string idempotencyKey,
        DateTimeOffset createdAt,
        DateTimeOffset? retentionUntil = null)
    {
        using var tx = _connection.BeginTransaction();
        using var command = CreateCommand(@"
INSERT INTO sessions(session_id, business_slug, photobox_slug, package_id, state, created_at, retention_until, idempotency_key)
VALUES($id, $business, $photobox, $package, 'active', $created, $retention, $key);", tx);
        Add(command, "$id", sessionId);
        Add(command, "$business", businessSlug);
        Add(command, "$photobox", photoboxSlug);
        Add(command, "$package", packageId);
        Add(command, "$created", createdAt.ToString("O"));
        Add(command, "$retention", retentionUntil?.ToString("O"));
        Add(command, "$key", idempotencyKey);
        try
        {
            command.ExecuteNonQuery();
            tx.Commit();
        }
        catch (SqliteException ex) when (ex.SqliteErrorCode == 19)
        {
            throw new InvalidOperationException("Session idempotency key already exists.", ex);
        }
        return GetSession(sessionId) ?? throw new InvalidOperationException("Session insert failed.");
    }

    public MediaRecord RegisterMedia(
        string mediaId,
        string sessionId,
        string relativePath,
        string mediaKind,
        DateTimeOffset retentionUntil)
    {
        var absolutePath = ResolveMediaPath(relativePath);
        if (!File.Exists(absolutePath)) throw new FileNotFoundException("Media file does not exist.", absolutePath);
        var info = new FileInfo(absolutePath);
        var checksum = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(absolutePath))).ToLowerInvariant();
        using var tx = _connection.BeginTransaction();
        using var command = CreateCommand(@"
INSERT INTO media_records(media_id, session_id, relative_path, media_kind, size_bytes, sha256, sync_state, quarantine_state, retention_until)
VALUES($id, $session, $path, $kind, $size, $sha, 'Pending', 'None', $retention);", tx);
        Add(command, "$id", mediaId);
        Add(command, "$session", sessionId);
        Add(command, "$path", relativePath);
        Add(command, "$kind", mediaKind);
        Add(command, "$size", info.Length);
        Add(command, "$sha", checksum);
        Add(command, "$retention", retentionUntil.ToString("O"));
        command.ExecuteNonQuery();
        tx.Commit();
        return GetMedia(mediaId) ?? throw new InvalidOperationException("Media insert failed.");
    }

    public SyncQueueItem QueueSync(string sessionId, string idempotencyKey, DateTimeOffset nextAttemptAt)
    {
        using var tx = _connection.BeginTransaction();
        using var command = CreateCommand(@"
INSERT INTO sync_queue(queue_id, session_id, idempotency_key, state, attempts, next_attempt_at)
VALUES($id, $session, $key, 'Pending', 0, $next);", tx);
        var queueId = $"queue_{Guid.NewGuid():N}";
        Add(command, "$id", queueId);
        Add(command, "$session", sessionId);
        Add(command, "$key", idempotencyKey);
        Add(command, "$next", nextAttemptAt.ToString("O"));
        try { command.ExecuteNonQuery(); tx.Commit(); }
        catch (SqliteException ex) when (ex.SqliteErrorCode == 19) { throw new InvalidOperationException("Sync idempotency key already exists.", ex); }
        return GetQueue(queueId) ?? throw new InvalidOperationException("Sync queue insert failed.");
    }

    public RecoveryReport RecoverAfterRestart(DateTimeOffset now)
    {
        using var tx = _connection.BeginTransaction();
        var requeued = Execute(@"UPDATE sync_queue SET state='Retrying', next_attempt_at=$now, last_error='Recovered after restart' WHERE state='Running';", tx, ("$now", now.ToString("O")));
        var quarantined = 0;
        var missing = 0;
        foreach (var media in ListMedia(LocalQuarantineState.None, tx))
        {
            if (File.Exists(ResolveMediaPath(media.RelativePath))) continue;
            missing += 1;
            quarantined += Execute(@"UPDATE media_records SET sync_state='Quarantined', quarantine_state='Quarantined' WHERE media_id=$id;", tx, ("$id", media.MediaId));
            Execute(@"INSERT INTO audit_events(event_id, event_type, entity_id, created_at, detail) VALUES($id, 'MediaMissing', $entity, $at, 'File missing during restart recovery');", tx,
                ("$id", $"audit_{Guid.NewGuid():N}"), ("$entity", media.MediaId), ("$at", now.ToString("O")));
        }
        tx.Commit();
        return new RecoveryReport(requeued, quarantined, missing);
    }

    public int GuardRetention(DateTimeOffset now)
    {
        using var tx = _connection.BeginTransaction();
        var count = 0;
        foreach (var media in ListMedia(LocalQuarantineState.None))
        {
            if (media.RetentionUntil > now || media.SyncState != LocalSyncState.Synced) continue;
            if (!File.Exists(ResolveMediaPath(media.RelativePath))) continue;
            File.Delete(ResolveMediaPath(media.RelativePath));
            count += Execute(@"UPDATE media_records SET sync_state='Synced', quarantine_state='Released' WHERE media_id=$id;", tx, ("$id", media.MediaId));
        }
        tx.Commit();
        return count;
    }

    public SessionRecord? GetSession(string id) => QuerySingle(@"SELECT * FROM sessions WHERE session_id=$id;", ("$id", id), ReadSession);
    public MediaRecord? GetMedia(string id) => QuerySingle(@"SELECT * FROM media_records WHERE media_id=$id;", ("$id", id), ReadMedia);
    public SyncQueueItem? GetQueue(string id) => QuerySingle(@"SELECT * FROM sync_queue WHERE queue_id=$id;", ("$id", id), ReadQueue);

    public void MarkMediaSynced(string mediaId)
    {
        Execute(@"UPDATE media_records SET sync_state='Synced' WHERE media_id=$id;", null, ("$id", mediaId));
    }

    public void Execute(string sql, SqliteTransaction? tx = null, params (string Name, object? Value)[] parameters) => ExecuteInternal(sql, tx, parameters);
    public (int FailedAttempts, DateTimeOffset LockedUntil) ReadPinLockout(SnapyOS.Security.PinKind kind)
    {
        using var command = CreateCommand("SELECT failed_attempts, locked_until FROM security_pin_lockouts WHERE pin_kind=$kind;", null, ("$kind", kind.ToString()));
        using var reader = command.ExecuteReader();
        if (!reader.Read()) return (0, DateTimeOffset.MinValue);
        return (reader.GetInt32(0), reader.IsDBNull(1) ? DateTimeOffset.MinValue : DateTimeOffset.Parse(reader.GetString(1)));
    }
    public void SavePinLockout(SnapyOS.Security.PinKind kind, int failedAttempts, DateTimeOffset? lockedUntil) => ExecuteInternal(@"INSERT INTO security_pin_lockouts(pin_kind, failed_attempts, locked_until) VALUES($kind, $attempts, $until) ON CONFLICT(pin_kind) DO UPDATE SET failed_attempts=excluded.failed_attempts, locked_until=excluded.locked_until;", null, ("$kind", kind.ToString()), ("$attempts", failedAttempts), ("$until", lockedUntil?.ToString("O")));
    public void WriteSecurityAudit(string eventType, SnapyOS.Security.PinKind? kind, DateTimeOffset occurredAt) => ExecuteInternal("INSERT INTO security_audit_events(event_id, event_type, pin_kind, occurred_at) VALUES($id, $event, $kind, $at);", null, ("$id", $"audit_{Guid.NewGuid():N}"), ("$event", eventType), ("$kind", kind?.ToString()), ("$at", occurredAt.ToString("O")));
    public IReadOnlyList<SecurityAuditRow> ReadSecurityAuditEvents()
    {
        using var command = CreateCommand("SELECT event_type, pin_kind, occurred_at FROM security_audit_events ORDER BY occurred_at;", null);
        using var reader = command.ExecuteReader();
        var result = new List<SecurityAuditRow>();
        while (reader.Read()) result.Add(new(reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1), DateTimeOffset.Parse(reader.GetString(2))));
        return result;
    }

    public void MarkQueueRunning(string queueId)
    {
        Execute(@"UPDATE sync_queue SET state='Running' WHERE queue_id=$id;", null, ("$id", queueId));
    }

    public SqliteTransaction BeginTransaction() => _connection.BeginTransaction();
    public void ExecuteInTransaction(SqliteTransaction tx, string sql, params (string Name, object? Value)[] parameters) => Execute(sql, tx, parameters);
    public void InsertConfigRevision(SnapyOS.Core.ConfigurationDocument document, string checksum, string json, string state)
    {
        Execute(@"INSERT INTO config_revisions(revision_id, config_key, revision, checksum, created_at, state, payload_json)
VALUES($id, 'application', $version, $checksum, $created, $state, $payload);", null,
            ("$id", document.RevisionId), ("$version", document.CreatedAt.UtcDateTime.Ticks), ("$checksum", checksum), ("$created", document.CreatedAt.ToString("O")), ("$state", state), ("$payload", json));
    }
    public void DeleteConfigRevision(string revisionId) => Execute("DELETE FROM config_revisions WHERE revision_id=$id;", null, ("$id", revisionId));
    public SnapyOS.Core.ConfigurationDocument? ReadActiveConfigRevision() => ReadConfigRevisionByState("active");
    public IReadOnlyList<SnapyOS.Core.ConfigurationDocument> ReadBackupConfigRevisions() => ReadConfigRevisionsByState("backup");
    public SnapyOS.Core.ConfigurationDocument? ReadConfigRevision(string revisionId) => ReadConfigRevisionById(revisionId);

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _connection.Dispose();
    }

    private void ConfigureConnection()
    {
        Execute("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;", null);
    }

    private void Migrate()
    {
        var version = SchemaVersion;
        using var tx = _connection.BeginTransaction();
        Execute(@"CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);", tx);
        if (version < 1)
        {
            const string migration = @"
CREATE TABLE sessions(session_id TEXT PRIMARY KEY, business_slug TEXT NOT NULL, photobox_slug TEXT NOT NULL, package_id TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, finalized_at TEXT, retention_until TEXT, idempotency_key TEXT NOT NULL UNIQUE);
CREATE TABLE media_records(media_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id), relative_path TEXT NOT NULL, media_kind TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, sync_state TEXT NOT NULL, quarantine_state TEXT NOT NULL, retention_until TEXT NOT NULL);
CREATE TABLE print_jobs(print_job_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id), state TEXT NOT NULL, created_at TEXT NOT NULL, submitted_at TEXT, completed_at TEXT, last_error TEXT);
CREATE TABLE sync_queue(queue_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id), idempotency_key TEXT NOT NULL UNIQUE, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, last_error TEXT);
CREATE TABLE config_revisions(revision_id TEXT PRIMARY KEY, config_key TEXT NOT NULL, revision INTEGER NOT NULL, checksum TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(config_key, revision));
CREATE TABLE audit_events(event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL, detail TEXT);
CREATE TABLE template_cache(template_id TEXT PRIMARY KEY, version TEXT NOT NULL, checksum TEXT NOT NULL, payload_json TEXT NOT NULL, cached_at TEXT NOT NULL, retention_until TEXT NOT NULL);
CREATE TABLE hardware_snapshots(snapshot_id TEXT PRIMARY KEY, device_kind TEXT NOT NULL, status TEXT NOT NULL, captured_at TEXT NOT NULL, payload_json TEXT NOT NULL);
CREATE INDEX idx_media_retention ON media_records(retention_until, sync_state);
CREATE INDEX idx_sync_due ON sync_queue(next_attempt_at, state);
PRAGMA user_version=1;";
            Execute(migration, tx);
            var checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(migration))).ToLowerInvariant();
            Execute("INSERT INTO schema_migrations(version, checksum, applied_at) VALUES(1, $checksum, $at);", tx, ("$checksum", checksum), ("$at", DateTimeOffset.UtcNow.ToString("O")));
            version = 1;
        }
        if (version < 2)
        {
            const string migration = "ALTER TABLE config_revisions ADD COLUMN state TEXT NOT NULL DEFAULT 'backup'; ALTER TABLE config_revisions ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'; PRAGMA user_version=2;";
            Execute(migration, tx);
            var checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(migration))).ToLowerInvariant();
            Execute("INSERT INTO schema_migrations(version, checksum, applied_at) VALUES(2, $checksum, $at);", tx, ("$checksum", checksum), ("$at", DateTimeOffset.UtcNow.ToString("O")));
        }
        tx.Commit();
    }

    private string ResolveMediaPath(string relativePath)
    {
        var root = Path.GetFullPath(_options.MediaRoot);
        var full = Path.GetFullPath(Path.Combine(root, relativePath));
        if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Media path escapes media root.");
        return full;
    }

    private T? QuerySingle<T>(string sql, (string Name, object? Value) parameter, Func<SqliteDataReader, T> read)
    {
        using var command = CreateCommand(sql, null, parameter);
        using var reader = command.ExecuteReader();
        return reader.Read() ? read(reader) : default;
    }

    private List<MediaRecord> ListMedia(LocalQuarantineState state, SqliteTransaction? tx = null)
    {
        using var command = CreateCommand("SELECT * FROM media_records WHERE quarantine_state=$state;", tx, ("$state", state.ToString()));
        using var reader = command.ExecuteReader();
        var result = new List<MediaRecord>();
        while (reader.Read()) result.Add(ReadMedia(reader));
        return result;
    }

    private SessionRecord ReadSession(SqliteDataReader reader) => new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), DateTimeOffset.Parse(reader.GetString(5)), reader.IsDBNull(6) ? null : DateTimeOffset.Parse(reader.GetString(6)), reader.IsDBNull(7) ? null : DateTimeOffset.Parse(reader.GetString(7)), reader.GetString(8));
    private MediaRecord ReadMedia(SqliteDataReader reader) => new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetInt64(4), reader.GetString(5), Enum.Parse<LocalSyncState>(reader.GetString(6)), Enum.Parse<LocalQuarantineState>(reader.GetString(7)), DateTimeOffset.Parse(reader.GetString(8)));
    private SyncQueueItem ReadQueue(SqliteDataReader reader) => new(reader.GetString(0), reader.GetString(1), reader.GetString(2), Enum.Parse<LocalSyncState>(reader.GetString(3)), reader.GetInt32(4), DateTimeOffset.Parse(reader.GetString(5)), reader.IsDBNull(6) ? null : reader.GetString(6));

    private static readonly JsonSerializerOptions ConfigJson = new(JsonSerializerDefaults.Web);

    private ConfigurationDocument? ReadConfigRevisionByState(string state) => ReadConfigRevision("SELECT payload_json FROM config_revisions WHERE state=$state ORDER BY created_at DESC LIMIT 1;", ("$state", state));
    private IReadOnlyList<ConfigurationDocument> ReadConfigRevisionsByState(string state)
    {
        using var command = CreateCommand("SELECT payload_json FROM config_revisions WHERE state=$state ORDER BY created_at DESC;", null, ("$state", state));
        using var reader = command.ExecuteReader();
        var items = new List<ConfigurationDocument>();
        while (reader.Read()) items.Add(JsonSerializer.Deserialize<ConfigurationDocument>(reader.GetString(0), ConfigJson) ?? throw new ConfigurationException("Stored configuration is invalid."));
        return items;
    }
    private ConfigurationDocument? ReadConfigRevisionById(string id) => ReadConfigRevision("SELECT payload_json FROM config_revisions WHERE revision_id=$id;", ("$id", id));
    private ConfigurationDocument? ReadConfigRevision(string sql, (string Name, object? Value) parameter)
    {
        using var command = CreateCommand(sql, null, parameter);
        using var reader = command.ExecuteReader();
        return reader.Read() ? JsonSerializer.Deserialize<ConfigurationDocument>(reader.GetString(0), ConfigJson) : null;
    }

    private SqliteCommand CreateCommand(string sql, SqliteTransaction? tx, params (string Name, object? Value)[] parameters)
    {
        var command = _connection.CreateCommand();
        command.CommandText = sql;
        command.Transaction = tx;
        foreach (var (name, value) in parameters) Add(command, name, value);
        return command;
    }

    private static void Add(SqliteCommand command, string name, object? value) => command.Parameters.AddWithValue(name, value ?? DBNull.Value);
    private int Execute(string sql, SqliteTransaction? tx, params (string Name, object? Value)[] parameters) => ExecuteInternal(sql, tx, parameters);
    private int ExecuteInternal(string sql, SqliteTransaction? tx, params (string Name, object? Value)[] parameters) { using var command = CreateCommand(sql, tx, parameters); return command.ExecuteNonQuery(); }
    private object Scalar(string sql) { using var command = CreateCommand(sql, null); return command.ExecuteScalar()!; }
}
