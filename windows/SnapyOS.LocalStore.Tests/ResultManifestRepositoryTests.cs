using SnapyOS.Core;
using SnapyOS.LocalStore;
using Xunit;

namespace SnapyOS.LocalStore.Tests;

public sealed class ResultManifestRepositoryTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-result-{Guid.NewGuid():N}");
    private readonly LocalStore _store;

    public ResultManifestRepositoryTests() => _store = new LocalStore(LocalStoreOptions.ForDirectory(_root));

    [Fact]
    public void Saves_and_reads_manifest_without_raw_photo()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("gif", "/media/result.gif", 10, new string('a', 64), "gif")], DateTimeOffset.UtcNow.AddDays(3));
        var repository = new ResultManifestRepository(_store);
        repository.Save(manifest);
        var loaded = repository.Read("session");
        Assert.Equal(manifest, loaded);
        Assert.DoesNotContain("/media", System.Text.Json.JsonSerializer.Serialize(loaded));
    }

    [Fact]
    public void Persists_upload_ack_and_rejects_qr_before_ack()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("gif", "/media/result.gif", 10, new string('a', 64), "gif")], DateTimeOffset.UtcNow.AddDays(3));
        var repository = new ResultManifestRepository(_store);
        repository.Save(manifest);
        Assert.Throws<InvalidOperationException>(() => ResultManifestFactory.QrPayload(repository.Read("session")!));
        repository.MarkUploading("session");
        var acked = repository.ApplyAck("session", new("result-token", "https://example.test/r/result-token"));
        Assert.Equal(ResultUploadState.CloudAcked, acked.UploadState);
        Assert.Equal(acked, repository.Read("session"));
        Assert.Equal("https://example.test/r/result-token", ResultManifestFactory.QrPayload(acked));
    }

    [Fact]
    public void Failed_manifest_stays_local_and_can_retry()
    {
        var manifest = ResultManifestFactory.Create("session", "tx", [new("gif", "/media/result.gif", 10, new string('a', 64), "gif")], DateTimeOffset.UtcNow.AddDays(3));
        var repository = new ResultManifestRepository(_store);
        repository.Save(manifest);
        repository.MarkUploading("session");
        var failed = repository.MarkFailed("session");
        Assert.Equal(ResultAccessState.LocalOnly, failed.AccessState);
        Assert.Equal(ResultUploadState.Uploading, repository.MarkUploading("session").UploadState);
    }

    public void Dispose()
    {
        _store.Dispose();
        try { Directory.Delete(_root, true); } catch { }
    }
}
