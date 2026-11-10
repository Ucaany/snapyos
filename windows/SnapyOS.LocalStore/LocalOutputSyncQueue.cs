using System.Security.Cryptography;
using SnapyOS.Core;

namespace SnapyOS.LocalStore;

[System.Diagnostics.CodeAnalysis.SuppressMessage("Naming", "CA1711", Justification = "Queue is the persisted domain term.")]
public sealed class LocalOutputSyncQueue : IOutputSyncStore
{
    private readonly LocalStore _store;
    private readonly ResultManifestRepository _manifests;
    private readonly Func<string> _deviceId;
    private readonly string _quarantineRoot;

    public LocalOutputSyncQueue(LocalStore store, ResultManifestRepository manifests, Func<string> deviceId, string? quarantineRoot = null)
    {
        _store = store;
        _manifests = manifests;
        _deviceId = deviceId;
        _quarantineRoot = quarantineRoot ?? Path.Combine(Path.GetDirectoryName(store.MediaRoot) ?? ".", "quarantine");
    }

    public void Enqueue(string sessionId, string idempotencyKey, DateTimeOffset nextAttemptAt) => _store.QueueSync(sessionId, idempotencyKey, nextAttemptAt);

    public IReadOnlyList<OutputSyncQueueItem> ListDue(DateTimeOffset now) =>
        _store.ListDueSync(now).Select(item => new OutputSyncQueueItem(item.QueueId, item.SessionId, item.IdempotencyKey, item.Attempts, item.CloudSessionId)).ToArray();

    public OutputSyncQueueItem? Claim(string queueId, DateTimeOffset now, DateTimeOffset leaseUntil)
    {
        var item = _store.TryClaimSync(queueId, now, leaseUntil);
        return item is null ? null : new(item.QueueId, item.SessionId, item.IdempotencyKey, item.Attempts, item.CloudSessionId);
    }

    public void SaveCloudSessionId(string queueId, string cloudSessionId) => _store.SaveCloudSessionId(queueId, cloudSessionId);
    public void Retry(string queueId, DateTimeOffset nextAttemptAt, string errorMessage) => _store.FailSync(queueId, nextAttemptAt, errorMessage);
    public void Synced(string queueId, DateTimeOffset completedAt) => _store.MarkSyncSynced(queueId, completedAt);
    public void Quarantined(string queueId, string reason) => _store.MarkSyncQuarantined(queueId, reason);

    public OutputSyncSession? ReadSession(string sessionId)
    {
        var session = _store.GetSession(sessionId);
        var manifest = _manifests.Read(sessionId);
        if (session is null || manifest is null) return null;
        var queue = _store.ListAllSync().SingleOrDefault(item => item.SessionId == sessionId);
        var outputs = ReadFinalOutputs(sessionId);
        var request = new OutputSyncRequest(
            session.BusinessSlug,
            session.PhotoboxSlug,
            _deviceId(),
            session.SessionId,
            session.PackageId,
            manifest.TransactionReference,
            session.CreatedAt,
            manifest.RetentionUntil,
            session.IdempotencyKey ?? throw new InvalidDataException("Session idempotency key is missing."),
            manifest,
            outputs);
        return new(request, queue?.CloudSessionId);
    }

    public IReadOnlyList<OutputSyncFile> ReadFinalOutputs(string sessionId)
    {
        var manifest = _manifests.Read(sessionId) ?? throw new InvalidDataException("Result manifest not found.");
        var outputs = new List<OutputSyncFile>();
        foreach (var metadata in manifest.Outputs)
        {
            if (metadata.Kind is not ("photo_strip" or "gif")) throw new InvalidDataException("Manifest contains a forbidden output kind.");
            var media = _store.ListFinalSessionMedia(sessionId).SingleOrDefault(item => item.MediaKind == metadata.Kind);
            if (media is null) throw new FileNotFoundException("Final output metadata is missing.");
            var path = _store.ResolveStoredMediaPath(media.RelativePath);
            if (!File.Exists(path)) throw new FileNotFoundException("Final output is missing.", path);
            var info = new FileInfo(path);
            if (info.Length != metadata.SizeBytes) throw new InvalidDataException("Final output size does not match manifest.");
            using var stream = File.OpenRead(path);
            var hash = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
            if (!hash.Equals(metadata.Sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Final output checksum does not match manifest.");
            outputs.Add(new(metadata.Kind, path, info.Length, hash, metadata.Format));
        }
        return outputs;
    }

    public void ApplyAck(string sessionId, CloudResultAck ack)
    {
        var manifest = _manifests.Read(sessionId) ?? throw new InvalidDataException("Result manifest not found.");
        _manifests.Save(ResultManifestFactory.ApplyAck(ResultManifestFactory.MarkUploading(manifest), ack));
    }

    public void MarkFinalOutputsSynced(string sessionId)
    {
        foreach (var media in _store.ListFinalSessionMedia(sessionId)) _store.MarkMediaSynced(media.MediaId);
    }

    public QuarantineResult Quarantine(string sessionId, string reason)
    {
        var manifest = _manifests.Read(sessionId) ?? throw new InvalidDataException("Result manifest not found.");
        var copied = _store.QuarantineFinalOutputs(sessionId, _quarantineRoot, _store.ListFinalSessionMedia(sessionId));
        File.WriteAllText(Path.Combine(copied.Directory, "manifest.json"), System.Text.Json.JsonSerializer.Serialize(manifest));
        return copied;
    }

    public void Cleanup(DateTimeOffset now)
    {
        foreach (var item in _store.ListAllSync())
        {
            if (item.State != LocalSyncState.Synced) continue;
            _store.DeleteSyncedMedia(item.SessionId, now);
        }
    }

    public void Recover(DateTimeOffset now)
    {
        _store.RecoverExpiredSyncClaims(now);
        _store.RecoverAfterRestart(now);
    }
}
