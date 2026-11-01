using SnapyOS.LocalStore;
using Xunit;

namespace SnapyOS.LocalStore.Tests;

public sealed class LocalStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-store-{Guid.NewGuid():N}");
    private readonly LocalStore _store;

    public LocalStoreTests()
    {
        _store = new LocalStore(LocalStoreOptions.ForDirectory(_root));
    }

    [Fact]
    public void Insert_session_persists_metadata()
    {
        var session = _store.InsertSession("local_1", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow);
        Assert.Equal("local_1", session.SessionId);
        Assert.Equal("active", _store.GetSession("local_1")!.State);
    }

    [Fact]
    public void Register_media_stores_metadata_only_and_checksum()
    {
        Directory.CreateDirectory(Path.Combine(_root, "media"));
        File.WriteAllText(Path.Combine(_root, "media", "photo.jpg"), "photo");
        _store.InsertSession("local_1", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow);
        var media = _store.RegisterMedia("media_1", "local_1", "photo.jpg", "photo", DateTimeOffset.UtcNow.AddDays(3));
        Assert.Equal("photo.jpg", media.RelativePath);
        Assert.NotEmpty(media.Sha256);
        Assert.True(File.Exists(Path.Combine(_root, "media", media.RelativePath)));
    }

    [Fact]
    public void Queue_sync_persists_pending_item()
    {
        _store.InsertSession("local_1", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow);
        var item = _store.QueueSync("local_1", "sync-key", DateTimeOffset.UtcNow);
        Assert.Equal(LocalSyncState.Pending, item.State);
    }

    [Fact]
    public void Restart_recovery_requeues_running_queue()
    {
        _store.InsertSession("local_1", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow);
        var queue = _store.QueueSync("local_1", "sync-key", DateTimeOffset.UtcNow);
        _store.MarkQueueRunning(queue.QueueId);
        var report = _store.RecoverAfterRestart(DateTimeOffset.UtcNow);
        Assert.Equal(1, report.Requeued);
        Assert.Equal(LocalSyncState.Retrying, _store.GetQueue(queue.QueueId)!.State);

        _store.Dispose();
        using var reopened = new LocalStore(LocalStoreOptions.ForDirectory(_root));
        Assert.Equal(2, reopened.SchemaVersion);
    }

    [Fact]
    public void Retention_guard_removes_expired_synced_media()
    {
        Directory.CreateDirectory(Path.Combine(_root, "media"));
        File.WriteAllText(Path.Combine(_root, "media", "photo.jpg"), "photo");
        _store.InsertSession("local_1", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow);
        _store.RegisterMedia("media_1", "local_1", "photo.jpg", "photo", DateTimeOffset.UtcNow.AddDays(-1));
        _store.MarkMediaSynced("media_1");
        Assert.Equal(1, _store.GuardRetention(DateTimeOffset.UtcNow));
        Assert.True(File.Exists(Path.Combine(_root, "media", "photo.jpg")));
    }

    [Fact]
    public void Restart_recovery_quarantines_missing_media()
    {
        Directory.CreateDirectory(Path.Combine(_root, "media"));
        var path = Path.Combine(_root, "media", "photo.jpg");
        File.WriteAllText(path, "photo");
        _store.InsertSession("local_1", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow);
        _store.RegisterMedia("media_1", "local_1", "photo.jpg", "photo", DateTimeOffset.UtcNow.AddDays(3));
        File.Delete(path);

        var report = _store.RecoverAfterRestart(DateTimeOffset.UtcNow);

        Assert.Equal(1, report.MissingFiles);
        Assert.Equal(LocalQuarantineState.Quarantined, _store.GetMedia("media_1")!.QuarantineState);
    }

    [Fact]
    public void Missing_file_is_rejected()
    {
        _store.InsertSession("local_1", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow);
        Assert.Throws<FileNotFoundException>(() => _store.RegisterMedia("media_1", "local_1", "missing.jpg", "photo", DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Duplicate_idempotency_key_is_rejected()
    {
        _store.InsertSession("local_1", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow);
        Assert.Throws<InvalidOperationException>(() => _store.InsertSession("local_2", "business", "booth", "package", "session-key", DateTimeOffset.UtcNow));
    }

    public void Dispose()
    {
        _store.Dispose();
        try { Directory.Delete(_root, true); } catch { }
    }
}
