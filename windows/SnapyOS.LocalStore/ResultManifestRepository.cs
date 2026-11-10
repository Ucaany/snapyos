using System.Text.Json;
using SnapyOS.Core;

namespace SnapyOS.LocalStore;

public sealed class ResultManifestRepository(LocalStore store)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly LocalStore _store = store;

    public void Save(ResultManifest manifest)
    {
        ResultManifestFactory.Validate(manifest);
        EnsureSchema();
        _store.Execute(@"INSERT INTO result_manifests(session_id, manifest_json, updated_at) VALUES($session, $manifest, $updated) ON CONFLICT(session_id) DO UPDATE SET manifest_json=excluded.manifest_json, updated_at=excluded.updated_at;", null,
            ("$session", manifest.SessionId), ("$manifest", JsonSerializer.Serialize(manifest, Json)), ("$updated", DateTimeOffset.UtcNow.ToString("O")));
    }

    public ResultManifest? Read(string sessionId)
    {
        EnsureSchema();
        using var command = _store.CreatePublicCommand("SELECT manifest_json FROM result_manifests WHERE session_id=$session;", ("$session", sessionId));
        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;
        var manifest = JsonSerializer.Deserialize<ResultManifest>(reader.GetString(0), Json) ?? throw new InvalidOperationException("Stored result manifest is invalid.");
        ResultManifestFactory.Validate(manifest);
        return manifest;
    }

    public ResultManifest MarkUploading(string sessionId) => Update(sessionId, ResultManifestFactory.MarkUploading);

    public ResultManifest MarkFailed(string sessionId) => Update(sessionId, ResultManifestFactory.MarkFailed);

    public ResultManifest ApplyAck(string sessionId, CloudResultAck ack) => Update(sessionId, manifest => ResultManifestFactory.ApplyAck(manifest, ack));

    public ResultManifest MarkExpired(string sessionId, DateTimeOffset now) => Update(sessionId, manifest => ResultManifestFactory.MarkExpired(manifest, now));

    private ResultManifest Update(string sessionId, Func<ResultManifest, ResultManifest> transition)
    {
        var manifest = Read(sessionId) ?? throw new KeyNotFoundException($"Result manifest not found: {sessionId}");
        var updated = transition(manifest);
        Save(updated);
        return updated;
    }

    private void EnsureSchema() => _store.Execute(@"CREATE TABLE IF NOT EXISTS result_manifests(session_id TEXT PRIMARY KEY, manifest_json TEXT NOT NULL, updated_at TEXT NOT NULL);", null);
}
