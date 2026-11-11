using SnapyOS.Core;
using SnapyOS.LocalStore;
using Xunit;

namespace SnapyOS.LocalStore.Tests;

public sealed class LocalGifOutboxTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-gif-outbox-{Guid.NewGuid():N}");
    private readonly LocalStore _store;

    public LocalGifOutboxTests() => _store = new LocalStore(LocalStoreOptions.ForDirectory(_root));

    [Fact]
    public void Registers_gif_metadata_without_cloud_upload()
    {
        _store.InsertSession("local_1", "biz", "box", "pkg", "session-key", DateTimeOffset.UtcNow);
        var path = Path.Combine(_root, "media", "result.gif");
        File.WriteAllBytes(path, [1, 2, 3]);
        var output = new LocalGifOutput(path, 3, "checksum", 1, 1, 1, 0);
        var media = new LocalGifOutbox(_store).RegisterOutput("gif_1", "local_1", output, DateTimeOffset.UtcNow.AddDays(3));
        Assert.Equal("gif", media.MediaKind);
        Assert.Equal(LocalSyncState.Pending, media.SyncState);
    }

    public void Dispose()
    {
        _store.Dispose();
        try { Directory.Delete(_root, true); } catch { }
    }
}
