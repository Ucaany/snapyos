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
    string? IdempotencyKey,
    DateTimeOffset? ExpiresAt = null,
    DateTimeOffset? LastActivityAt = null,
    string? LastError = null);

public sealed record SessionTransitionRecord(
    string TransitionId,
    string SessionId,
    string? FromState,
    string ToState,
    DateTimeOffset OccurredAt,
    string Reason,
    string? OperationKey);

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
    string? LastError,
    string? CloudSessionId = null,
    DateTimeOffset? ClaimedUntil = null,
    string? QuarantineReason = null,
    DateTimeOffset? CompletedAt = null);

public sealed record RecoveryReport(int Requeued, int Quarantined, int MissingFiles);
public sealed record SyncStatusSnapshot(int Pending, int Retrying, int Running, string? LastError);
public sealed record SecurityAuditRow(string EventType, string? PinKind, DateTimeOffset OccurredAt);


public sealed class LocalStore : IDisposable
{
    public const int CurrentSchemaVersion = 5;
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
    public string MediaRoot => _options.MediaRoot;

    public SessionRecord InsertSession(
        string sessionId,
        string businessSlug,
        string photoboxSlug,
        string packageId,
        string idempotencyKey,
        DateTimeOffset createdAt,
        DateTimeOffset? retentionUntil = null,
        DateTimeOffset? expiresAt = null)
    {
        expiresAt ??= createdAt.AddMinutes(5);
        using var tx = _connection.BeginTransaction();
        using var command = CreateCommand(@"
INSERT INTO sessions(session_id, business_slug, photobox_slug, package_id, state, created_at, retention_until, idempotency_key, expires_at, last_activity_at)
VALUES($id, $business, $photobox, $package, 'active', $created, $retention, $key, $expires, $activity);", tx);
        Add(command, "$id", sessionId);
        Add(command, "$business", businessSlug);
        Add(command, "$photobox", photoboxSlug);
        Add(command, "$package", packageId);
        Add(command, "$created", createdAt.ToString("O"));
        Add(command, "$retention", retentionUntil?.ToString("O"));
        Add(command, "$key", idempotencyKey);
        Add(command, "$expires", expiresAt.Value.ToString("O"));
        Add(command, "$activity", createdAt.ToString("O"));
        try
        {
            command.ExecuteNonQuery();
            Execute("INSERT INTO session_transitions(transition_id, session_id, from_state, to_state, occurred_at, reason) VALUES($transition, $session, NULL, $state, $at, 'Started');", tx,
                ("$transition", $"transition_{Guid.NewGuid():N}"), ("$session", sessionId), ("$state", "active"), ("$at", createdAt.ToString("O")));
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

    public void UpdateSessionExpiry(string sessionId, DateTimeOffset expiresAt) =>
        Execute("UPDATE sessions SET expires_at=$expires, last_activity_at=$at WHERE session_id=$id;", null,
            ("$expires", expiresAt.ToString("O")), ("$at", DateTimeOffset.UtcNow.ToString("O")), ("$id", sessionId));

    public SessionRecord? GetSession(string id) => QuerySingle(@"SELECT session_id, business_slug, photobox_slug, package_id, state, created_at, finalized_at, retention_until, idempotency_key, expires_at, last_activity_at, last_error FROM sessions WHERE session_id=$id;", ("$id", id), ReadSession);
    public IReadOnlyList<SessionTransitionRecord> ReadSessionTransitions(string sessionId)
    {
        using var command = CreateCommand("SELECT transition_id, session_id, from_state, to_state, occurred_at, reason, operation_key FROM session_transitions WHERE session_id=$id ORDER BY occurred_at, transition_id;", null, ("$id", sessionId));
        using var reader = command.ExecuteReader();
        var result = new List<SessionTransitionRecord>();
        while (reader.Read()) result.Add(new(reader.GetString(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2), reader.GetString(3), DateTimeOffset.Parse(reader.GetString(4)), reader.GetString(5), reader.IsDBNull(6) ? null : reader.GetString(6)));
        return result;
    }

    public bool TryTransitionSession(string sessionId, string expectedState, string nextState, DateTimeOffset occurredAt, string reason, string? operationKey = null, string? lastError = null)
    {
        using var tx = _connection.BeginTransaction();
        if (operationKey is not null)
        {
            var existingSession = ScalarInTransaction("SELECT session_id FROM session_transitions WHERE operation_key=$key;", tx, ("$key", operationKey)) as string;
            if (existingSession is not null)
            {
                tx.Commit();
                return string.Equals(existingSession, sessionId, StringComparison.Ordinal);
            }
        }
        var updated = Execute("UPDATE sessions SET state=$next, last_activity_at=$at, last_error=$error, finalized_at=CASE WHEN lower($next) IN ('finalize', 'finalized') THEN $at ELSE finalized_at END WHERE session_id=$id AND state=$expected;", tx, ("$next", nextState), ("$at", occurredAt.ToString("O")), ("$error", lastError), ("$id", sessionId), ("$expected", expectedState));
        if (updated != 1) { tx.Rollback(); return false; }
        Execute("INSERT INTO session_transitions(transition_id, session_id, from_state, to_state, occurred_at, reason, operation_key) VALUES($transition, $session, $from, $to, $at, $reason, $key);", tx,
            ("$transition", $"transition_{Guid.NewGuid():N}"), ("$session", sessionId), ("$from", expectedState), ("$to", nextState), ("$at", occurredAt.ToString("O")), ("$reason", reason), ("$key", operationKey));
        tx.Commit();
        return true;
    }

    public IReadOnlyList<SessionRecord> ListSessionsDue(DateTimeOffset now)
    {
        using var command = CreateCommand("SELECT session_id, business_slug, photobox_slug, package_id, state, created_at, finalized_at, retention_until, idempotency_key, expires_at, last_activity_at, last_error FROM sessions WHERE expires_at <= $now AND lower(state) NOT IN ('synced', 'failed', 'timedout', 'quarantined', 'outputmanifest', 'pendingsync', 'finalize', 'finalized');", null, ("$now", now.ToString("O")));
        using var reader = command.ExecuteReader();
        var result = new List<SessionRecord>();
        while (reader.Read()) result.Add(ReadSession(reader));
        return result;
    }
    public MediaRecord? GetMedia(string id) => QuerySingle(@"SELECT * FROM media_records WHERE media_id=$id;", ("$id", id), ReadMedia);
    public SyncQueueItem? GetQueue(string id) => QuerySingle(@"SELECT queue_id, session_id, idempotency_key, state, attempts, next_attempt_at, last_error, cloud_session_id, claimed_until, quarantine_reason, completed_at FROM sync_queue WHERE queue_id=$id;", ("$id", id), ReadQueue);

    public IReadOnlyList<SyncQueueItem> ListAllSync()
    {
        using var command = CreateCommand("SELECT queue_id, session_id, idempotency_key, state, attempts, next_attempt_at, last_error, cloud_session_id, claimed_until, quarantine_reason, completed_at FROM sync_queue;", null);
        using var reader = command.ExecuteReader();
        var result = new List<SyncQueueItem>();
        while (reader.Read()) result.Add(ReadQueue(reader));
        return result;
    }

    public IReadOnlyList<SyncQueueItem> ListDueSync(DateTimeOffset now)
    {
        using var command = CreateCommand(@"SELECT queue_id, session_id, idempotency_key, state, attempts, next_attempt_at, last_error, cloud_session_id, claimed_until, quarantine_reason, completed_at FROM sync_queue WHERE state IN ('Pending','Retrying') AND next_attempt_at <= $now ORDER BY next_attempt_at, queue_id;", null, ("$now", now.ToString("O")));
        using var reader = command.ExecuteReader();
        var result = new List<SyncQueueItem>();
        while (reader.Read()) result.Add(ReadQueue(reader));
        return result;
    }

    public SyncQueueItem? TryClaimSync(string queueId, DateTimeOffset now, DateTimeOffset claimedUntil)
    {
        using var tx = _connection.BeginTransaction();
        var updated = Execute(@"UPDATE sync_queue SET state='Running', claimed_until=$until WHERE queue_id=$id AND state IN ('Pending','Retrying') AND next_attempt_at <= $now AND (claimed_until IS NULL OR claimed_until <= $now);", tx,
            ("$id", queueId), ("$now", now.ToString("O")), ("$until", claimedUntil.ToString("O")));
        if (updated != 1) { tx.Rollback(); return null; }
        tx.Commit();
        return GetQueue(queueId);
    }

    public void SaveCloudSessionId(string queueId, string cloudSessionId) => Execute("UPDATE sync_queue SET cloud_session_id=$cloud WHERE queue_id=$id AND state='Running';", null, ("$cloud", cloudSessionId), ("$id", queueId));

    public void RecoverExpiredSyncClaims(DateTimeOffset now) => Execute("UPDATE sync_queue SET state='Retrying', claimed_until=NULL, last_error='Recovered after restart' WHERE state='Running' AND (claimed_until IS NULL OR claimed_until <= $now);", null, ("$now", now.ToString("O")));

    public void FailSync(string queueId, DateTimeOffset nextAttemptAt, string error)
    {
        Execute("UPDATE sync_queue SET state='Retrying', attempts=attempts+1, next_attempt_at=$next, last_error=$error, claimed_until=NULL WHERE queue_id=$id AND state='Running';", null,
            ("$next", nextAttemptAt.ToString("O")), ("$error", error[..Math.Min(500, error.Length)]), ("$id", queueId));
    }

    public void MarkSyncSynced(string queueId, DateTimeOffset completedAt) => Execute("UPDATE sync_queue SET state='Synced', completed_at=$at, claimed_until=NULL, last_error=NULL WHERE queue_id=$id AND state='Running';", null, ("$at", completedAt.ToString("O")), ("$id", queueId));

    public void MarkSyncQuarantined(string queueId, string reason) => Execute("UPDATE sync_queue SET state='Quarantined', quarantine_reason=$reason, claimed_until=NULL, last_error=$reason WHERE queue_id=$id AND state='Running';", null, ("$reason", reason[..Math.Min(500, reason.Length)]), ("$id", queueId));

    public IReadOnlyList<MediaRecord> ListSessionMedia(string sessionId) => ListMediaForSession(sessionId);

    public IReadOnlyList<MediaRecord> ListFinalSessionMedia(string sessionId) => ListMediaForSession(sessionId).Where(media => media.MediaKind is "photo_strip" or "gif").ToArray();

    public SyncStatusSnapshot ReadSyncStatus()
    {
        using var command = CreateCommand("SELECT state, COUNT(*), MAX(last_error) FROM sync_queue GROUP BY state;", null);
        using var reader = command.ExecuteReader();
        var pending = 0; var retrying = 0; var running = 0; string? error = null;
        while (reader.Read())
        {
            var state = reader.GetString(0);
            var count = reader.GetInt32(1);
            if (state == "Pending") pending = count;
            else if (state == "Retrying") retrying = count;
            else if (state == "Running") running = count;
            if (!reader.IsDBNull(2)) error = reader.GetString(2);
        }
        return new(pending, retrying, running, error);
    }

    public void MarkMediaSynced(string mediaId)
    {
        Execute(@"UPDATE media_records SET sync_state='Synced' WHERE media_id=$id;", null, ("$id", mediaId));
    }

    public QuarantineResult QuarantineFinalOutputs(string sessionId, string quarantineRoot, IEnumerable<MediaRecord> outputs)
    {
        var destination = Path.Combine(quarantineRoot, sessionId);
        Directory.CreateDirectory(destination);
        var copied = 0;
        foreach (var media in outputs)
        {
            if (media.MediaKind is not ("photo_strip" or "gif")) continue;
            var source = ResolveMediaPath(media.RelativePath);
            var target = Path.Combine(destination, Path.GetFileName(media.RelativePath));
            File.Copy(source, target, true);
            copied++;
        }
        return new(destination, copied);
    }

    public string ResolveStoredMediaPath(string relativePath) => ResolveMediaPath(relativePath);

    public int DeleteSyncedMedia(string sessionId, DateTimeOffset now)
    {
        var deleted = 0;
        foreach (var media in ListSessionMedia(sessionId))
        {
            if (media.MediaKind is not ("photo_strip" or "gif") || media.SyncState != LocalSyncState.Synced || media.RetentionUntil > now) continue;
            var path = ResolveMediaPath(media.RelativePath);
            if (File.Exists(path)) File.Delete(path);
            deleted += Execute("UPDATE media_records SET sync_state='Deleted', quarantine_state='Released' WHERE media_id=$id;", null, ("$id", media.MediaId));
        }
        return deleted;
    }

    public SqliteCommand CreatePublicCommand(string sql, params (string Name, object? Value)[] parameters) => CreateCommand(sql, null, parameters);
    public SqliteCommand CreateCommandForCatalog(string sql, SqliteTransaction? tx = null, params (string Name, object? Value)[] parameters) => CreateCommand(sql, tx, parameters);
    public int Execute(string sql, SqliteTransaction? tx = null, params (string Name, object? Value)[] parameters) => ExecuteInternal(sql, tx, parameters);
    public (int FailedAttempts, DateTimeOffset LockedUntil) ReadPinLockout(string pinKind)
    {
        using var command = CreateCommand("SELECT failed_attempts, locked_until FROM security_pin_lockouts WHERE pin_kind=$kind;", null, ("$kind", pinKind));
        using var reader = command.ExecuteReader();
        if (!reader.Read()) return (0, DateTimeOffset.MinValue);
        return (reader.GetInt32(0), reader.IsDBNull(1) ? DateTimeOffset.MinValue : DateTimeOffset.Parse(reader.GetString(1)));
    }
    public void SavePinLockout(string pinKind, int failedAttempts, DateTimeOffset? lockedUntil) => ExecuteInternal(@"INSERT INTO security_pin_lockouts(pin_kind, failed_attempts, locked_until) VALUES($kind, $attempts, $until) ON CONFLICT(pin_kind) DO UPDATE SET failed_attempts=excluded.failed_attempts, locked_until=excluded.locked_until;", null, ("$kind", pinKind), ("$attempts", failedAttempts), ("$until", lockedUntil?.ToString("O")));
    public void WriteSecurityAudit(string eventType, string? pinKind, DateTimeOffset occurredAt) => ExecuteInternal("INSERT INTO security_audit_events(event_id, event_type, pin_kind, occurred_at) VALUES($id, $event, $kind, $at);", null, ("$id", $"audit_{Guid.NewGuid():N}"), ("$event", eventType), ("$kind", pinKind), ("$at", occurredAt.ToString("O")));
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
    public int ExecuteInTransaction(SqliteTransaction tx, string sql, params (string Name, object? Value)[] parameters) => Execute(sql, tx, parameters);
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
            version = 2;
        }
        if (version < 3)
        {
            const string migration = @"
ALTER TABLE sessions ADD COLUMN expires_at TEXT;
ALTER TABLE sessions ADD COLUMN last_activity_at TEXT;
ALTER TABLE sessions ADD COLUMN last_error TEXT;
UPDATE sessions SET expires_at=created_at, last_activity_at=created_at WHERE expires_at IS NULL;
CREATE INDEX idx_sessions_expiry ON sessions(state, expires_at);
CREATE TABLE session_transitions(transition_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id), from_state TEXT, to_state TEXT NOT NULL, occurred_at TEXT NOT NULL, reason TEXT NOT NULL, operation_key TEXT UNIQUE);
INSERT INTO session_transitions(transition_id, session_id, from_state, to_state, occurred_at, reason) SELECT 'migration_' || session_id, session_id, NULL, state, created_at, 'MigrationV3' FROM sessions;
PRAGMA user_version=3;";
            Execute(migration, tx);
            var checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(migration))).ToLowerInvariant();
            Execute("INSERT INTO schema_migrations(version, checksum, applied_at) VALUES(3, $checksum, $at);", tx, ("$checksum", checksum), ("$at", DateTimeOffset.UtcNow.ToString("O")));
            version = 3;
        }
        if (version < 4)
        {
            const string migration = @"
CREATE TABLE template_catalog_versions(catalog_version TEXT PRIMARY KEY, payload_json TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE template_catalog_assets(catalog_version TEXT NOT NULL REFERENCES template_catalog_versions(catalog_version) ON DELETE CASCADE, asset_id TEXT NOT NULL, relative_path TEXT NOT NULL, object_key TEXT NOT NULL, expected_sha256 TEXT NOT NULL, expected_size INTEGER NOT NULL, content_type TEXT NOT NULL, downloaded_bytes INTEGER NOT NULL DEFAULT 0, etag TEXT, state TEXT NOT NULL, quarantine_reason TEXT, PRIMARY KEY(catalog_version, asset_id));
CREATE TABLE template_catalog_state(key TEXT PRIMARY KEY, catalog_version TEXT, updated_at TEXT NOT NULL);
PRAGMA user_version=4;";
            Execute(migration, tx);
            var checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(migration))).ToLowerInvariant();
            Execute("INSERT INTO schema_migrations(version, checksum, applied_at) VALUES(4, $checksum, $at);", tx, ("$checksum", checksum), ("$at", DateTimeOffset.UtcNow.ToString("O")));
            version = 4;
        }
        if (version < 5)
        {
            const string migration = @"
ALTER TABLE sync_queue ADD COLUMN cloud_session_id TEXT;
ALTER TABLE sync_queue ADD COLUMN claimed_until TEXT;
ALTER TABLE sync_queue ADD COLUMN quarantine_reason TEXT;
ALTER TABLE sync_queue ADD COLUMN completed_at TEXT;
CREATE INDEX idx_sync_claim ON sync_queue(state, next_attempt_at, claimed_until);
PRAGMA user_version=5;";
            Execute(migration, tx);
            var checksum = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(migration))).ToLowerInvariant();
            Execute("INSERT INTO schema_migrations(version, checksum, applied_at) VALUES(5, $checksum, $at);", tx, ("$checksum", checksum), ("$at", DateTimeOffset.UtcNow.ToString("O")));
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

    private List<MediaRecord> ListMediaForSession(string sessionId)
    {
        using var command = CreateCommand("SELECT * FROM media_records WHERE session_id=$session;", null, ("$session", sessionId));
        using var reader = command.ExecuteReader();
        var result = new List<MediaRecord>();
        while (reader.Read()) result.Add(ReadMedia(reader));
        return result;
    }

    private SessionRecord ReadSession(SqliteDataReader reader) => new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), DateTimeOffset.Parse(reader.GetString(5)), reader.IsDBNull(6) ? null : DateTimeOffset.Parse(reader.GetString(6)), reader.IsDBNull(7) ? null : DateTimeOffset.Parse(reader.GetString(7)), reader.GetString(8), reader.IsDBNull(9) ? null : DateTimeOffset.Parse(reader.GetString(9)), reader.IsDBNull(10) ? null : DateTimeOffset.Parse(reader.GetString(10)), reader.IsDBNull(11) ? null : reader.GetString(11));
    private MediaRecord ReadMedia(SqliteDataReader reader) => new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetInt64(4), reader.GetString(5), Enum.Parse<LocalSyncState>(reader.GetString(6)), Enum.Parse<LocalQuarantineState>(reader.GetString(7)), DateTimeOffset.Parse(reader.GetString(8)));
    private SyncQueueItem ReadQueue(SqliteDataReader reader) => new(reader.GetString(0), reader.GetString(1), reader.GetString(2), Enum.Parse<LocalSyncState>(reader.GetString(3)), reader.GetInt32(4), DateTimeOffset.Parse(reader.GetString(5)), reader.IsDBNull(6) ? null : reader.GetString(6), reader.IsDBNull(7) ? null : reader.GetString(7), reader.IsDBNull(8) ? null : DateTimeOffset.Parse(reader.GetString(8)), reader.IsDBNull(9) ? null : reader.GetString(9), reader.IsDBNull(10) ? null : DateTimeOffset.Parse(reader.GetString(10)));

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
    private int ExecuteInternal(string sql, SqliteTransaction? tx, params (string Name, object? Value)[] parameters) { using var command = CreateCommand(sql, tx, parameters); return command.ExecuteNonQuery(); }
    private object Scalar(string sql) { using var command = CreateCommand(sql, null); return command.ExecuteScalar()!; }
    private object ScalarInTransaction(string sql, SqliteTransaction tx, params (string Name, object? Value)[] parameters) { using var command = CreateCommand(sql, tx, parameters); return command.ExecuteScalar()!; }
}
