using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace SnapyOS.Booth.Core;

/// <summary>
/// Store lokal booth (SQLite) — padanan <c>runtime/db/index.ts</c>.
/// Satu berkas <c>snapyos.db</c> di data dir, WAL agar penulisan sesi tidak
/// memblokir pembacaan status. Isi sengaja tipis: buka/migrasi + setelan/meta +
/// export/import; penulisan sesi diserahkan ke fase berikutnya.
/// </summary>
public sealed class Store : IDisposable
{
    /// <summary>Versi skema saat ini. Naikkan saat ada migrasi baru.</summary>
    public const int SchemaVersion = 2;

    /// <summary>Nama berkas store.</summary>
    public const string DbFile = "snapyos.db";

    /// <summary>Awalan kunci meta yang tidak boleh keluar dari mesin (hash PIN darurat + rate-limit).</summary>
    public const string SecretKeyPrefix = "exit_pin_";

    private static readonly string[] Migrations =
    [
        """
        create table if not exists device_settings (
          key text primary key,
          value_json text not null,
          updated_at text not null
        );

        create table if not exists sessions (
          id text primary key,
          cloud_id text,
          business_slug text not null,
          photobox_slug text not null,
          package_id text not null,
          template_id text,
          state text not null,
          expires_at text not null,
          retake_count integer not null default 0,
          package_snapshot_json text not null,
          payment_method text,
          client_created_at text not null,
          synced_at text,
          created_at text not null,
          updated_at text not null
        );
        create index if not exists idx_sessions_state on sessions (state, expires_at);
        create index if not exists idx_sessions_unsynced on sessions (created_at) where synced_at is null;

        create table if not exists captures (
          id text primary key,
          session_id text not null references sessions (id) on delete cascade,
          slot_index integer not null,
          file_path text not null,
          created_at text not null,
          unique (session_id, slot_index)
        );

        create table if not exists finalize_queue (
          id text primary key,
          session_id text not null unique references sessions (id) on delete cascade,
          payload_path text not null,
          attempts integer not null default 0,
          next_attempt_at text not null,
          last_error text,
          created_at text not null
        );
        create index if not exists idx_finalize_due on finalize_queue (next_attempt_at);

        create table if not exists events (
          id integer primary key autoincrement,
          at text not null,
          kind text not null,
          session_id text,
          detail_json text
        );
        create index if not exists idx_events_at on events (at);
        create index if not exists idx_events_kind on events (kind, at);

        create table if not exists meta (
          key text primary key,
          value text not null
        );
        """,
        """
        alter table captures add column idempotency_key text;
        create unique index if not exists idx_captures_idempotency
          on captures (session_id, idempotency_key) where idempotency_key is not null;
        """,
    ];

    private readonly SqliteConnection _connection;

    private Store(SqliteConnection connection)
    {
        _connection = connection;
    }

    /// <summary>True bila kunci meta tidak boleh keluar dari mesin.</summary>
    public static bool IsSecretKey(string key) => key.StartsWith(SecretKeyPrefix, StringComparison.Ordinal);

    /// <summary>
    /// Buka (dan buat bila perlu) store di <paramref name="dataDir"/>/snapyos.db.
    /// Migrasi dijalankan di sini, jadi setiap pemanggil mendapat skema mutakhir.
    /// </summary>
    public static Store Open(string dataDir)
    {
        string path;
        if (dataDir == ":memory:")
        {
            path = ":memory:";
        }
        else
        {
            Directory.CreateDirectory(dataDir);
            path = Path.Combine(dataDir, DbFile);
        }

        var builder = new SqliteConnectionStringBuilder { DataSource = path, ForeignKeys = true };
        var connection = new SqliteConnection(builder.ConnectionString);
        connection.Open();
        if (path != ":memory:")
        {
            Execute(connection, "pragma journal_mode = wal");
            Execute(connection, "pragma synchronous = normal");
        }
        Migrate(connection);
        return new Store(connection);
    }

    /// <summary>Jalankan migrasi yang belum diterapkan. Idempoten.</summary>
    public static int Migrate(SqliteConnection connection)
    {
        var version = ReadVersion(connection);
        while (version < SchemaVersion)
        {
            var sql = Migrations[version];
            using (var transaction = connection.BeginTransaction())
            {
                using (var command = connection.CreateCommand())
                {
                    command.Transaction = transaction;
                    command.CommandText = sql;
                    command.ExecuteNonQuery();
                }
                using (var bump = connection.CreateCommand())
                {
                    bump.Transaction = transaction;
                    bump.CommandText = $"pragma user_version = {version + 1}";
                    bump.ExecuteNonQuery();
                }
                transaction.Commit();
            }
            version += 1;
        }
        return version;
    }

    public static int ReadVersion(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "pragma user_version";
        return Convert.ToInt32(command.ExecuteScalar() ?? 0);
    }

    private static void Execute(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    /// <summary>Versi skema store saat ini (dibaca <c>pragma user_version</c>).</summary>
    public int CurrentSchemaVersion() => ReadVersion(_connection);

    /// <summary>
    /// Koneksi mentah untuk modul yang mengelola tabelnya sendiri (sessions,
    /// captures, finalize_queue). Satu koneksi dipakai bersama; WAL membuat
    /// penulisan sesi tidak memblokir pembacaan status.
    /// </summary>
    public SqliteConnection Connection => _connection;

    // --- device_settings ---

    public JsonNode? GetSetting(string key)
    {
        using var command = _connection.CreateCommand();
        command.CommandText = "select value_json from device_settings where key = $key";
        command.Parameters.AddWithValue("$key", key);
        var value = command.ExecuteScalar() as string;
        if (value is null)
        {
            return null;
        }
        try
        {
            return JsonNode.Parse(value);
        }
        catch (JsonException)
        {
            // Baris rusak tidak boleh menjatuhkan runtime; anggap belum di-set.
            return null;
        }
    }

    public void SetSetting(string key, JsonNode? value)
    {
        SetSetting(_connection, null, key, value);
    }

    private static void SetSetting(SqliteConnection connection, SqliteTransaction? transaction, string key, JsonNode? value)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            "insert into device_settings (key, value_json, updated_at) values ($key, $value, $at) " +
            "on conflict (key) do update set value_json = excluded.value_json, updated_at = excluded.updated_at";
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value?.ToJsonString() ?? "null");
        command.Parameters.AddWithValue("$at", DateTimeOffset.UtcNow.ToString("o"));
        command.ExecuteNonQuery();
    }

    public Dictionary<string, JsonNode?> ListSettings()
    {
        var result = new Dictionary<string, JsonNode?>(StringComparer.Ordinal);
        using var command = _connection.CreateCommand();
        command.CommandText = "select key, value_json from device_settings order by key";
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            try
            {
                result[reader.GetString(0)] = JsonNode.Parse(reader.GetString(1));
            }
            catch (JsonException)
            {
                // lewati baris rusak
            }
        }
        return result;
    }

    // --- meta ---

    public string? GetMeta(string key)
    {
        using var command = _connection.CreateCommand();
        command.CommandText = "select value from meta where key = $key";
        command.Parameters.AddWithValue("$key", key);
        return command.ExecuteScalar() as string;
    }

    public void SetMeta(string key, string value)
    {
        SetMeta(_connection, null, key, value);
    }

    private static void SetMeta(SqliteConnection connection, SqliteTransaction? transaction, string key, string value)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            "insert into meta (key, value) values ($key, $value) " +
            "on conflict (key) do update set value = excluded.value";
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value);
        command.ExecuteNonQuery();
    }

    public void DeleteMeta(string key)
    {
        using var command = _connection.CreateCommand();
        command.CommandText = "delete from meta where key = $key";
        command.Parameters.AddWithValue("$key", key);
        command.ExecuteNonQuery();
    }

    // --- events ---

    /// <summary>Catatan kejadian lokal (mis. <c>exit_pin_emergency_used</c>).</summary>
    public void InsertEvent(string kind, string? sessionId = null, JsonNode? detail = null)
    {
        using var command = _connection.CreateCommand();
        command.CommandText =
            "insert into events (at, kind, session_id, detail_json) values ($at, $kind, $session, $detail)";
        command.Parameters.AddWithValue("$at", DateTimeOffset.UtcNow.ToString("o"));
        command.Parameters.AddWithValue("$kind", kind);
        command.Parameters.AddWithValue("$session", (object?)sessionId ?? DBNull.Value);
        command.Parameters.AddWithValue("$detail", (object?)detail?.ToJsonString() ?? DBNull.Value);
        command.ExecuteNonQuery();
    }

    // --- export / import ---

    /// <summary>
    /// Export setelan untuk dipindah ke booth lain. Semua kunci <c>exit_pin_*</c>
    /// dibuang: PIN darurat terikat ke mesin, bukan ke konfigurasi.
    /// </summary>
    public StoreExport ExportStore()
    {
        var meta = new SortedDictionary<string, string>(StringComparer.Ordinal);
        using (var command = _connection.CreateCommand())
        {
            command.CommandText = "select key, value from meta order by key";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                var key = reader.GetString(0);
                if (!IsSecretKey(key))
                {
                    meta[key] = reader.GetString(1);
                }
            }
        }

        var settings = new SortedDictionary<string, JsonNode?>(StringComparer.Ordinal);
        foreach (var pair in ListSettings())
        {
            settings[pair.Key] = pair.Value;
        }

        return new StoreExport(ReadVersion(_connection), settings, meta);
    }

    /// <summary>
    /// Impor hasil <see cref="ExportStore"/>. Kunci <c>exit_pin_*</c> diabaikan
    /// meski ada di payload — menerimanya berarti PIN darurat booth A bisa
    /// dipakai di booth B.
    /// </summary>
    public void ImportStore(StoreExport payload)
    {
        using var transaction = _connection.BeginTransaction();
        try
        {
            foreach (var (key, value) in payload.DeviceSettings)
            {
                SetSetting(_connection, transaction, key, value);
            }
            foreach (var (key, value) in payload.Meta)
            {
                if (!IsSecretKey(key))
                {
                    SetMeta(_connection, transaction, key, value);
                }
            }
            transaction.Commit();
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }

    public void Dispose() => _connection.Dispose();
}

/// <summary>Padanan <c>StoreExport</c> runtime Node.</summary>
public sealed record StoreExport(
    int SchemaVersion,
    IReadOnlyDictionary<string, JsonNode?> DeviceSettings,
    IReadOnlyDictionary<string, string> Meta
);
