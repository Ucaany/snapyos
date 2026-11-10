using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class ResultSyncWorkerTests
{
    [Fact]
    public async Task Worker_claims_once_uploads_final_outputs_and_applies_ack()
    {
        var queue = new FakeQueue();
        var publisher = new FakePublisher();
        var worker = new ResultSyncWorker(queue, publisher, () => "device-token", new FakeDiskGuard(), () => DateTimeOffset.Parse("2026-01-01T00:00:00Z"), () => 0.5);

        var report = await worker.RunOnceAsync();

        Assert.Equal(1, report.Synced);
        Assert.Equal("local-cloud", queue.SavedCloudSessionId);
        Assert.Equal("ack-token", queue.Ack?.ResultToken);
        Assert.Equal(["photo_strip", "gif"], publisher.OutputKinds);
        Assert.DoesNotContain("photo", publisher.OutputKinds);
    }

    private sealed class FakeDiskGuard : IOutputSyncDiskGuard
    {
        public bool CanSync(string path) => true;
    }

    private sealed class FakePublisher : IOutputSyncPublisher
    {
        public List<string> OutputKinds { get; } = [];
        public Task<CloudSession> CreateSessionAsync(OutputSyncRequest request, string deviceToken, CancellationToken cancellationToken = default) => Task.FromResult(new CloudSession("local-cloud"));
        public Task<CloudResultAck> UploadOutputsAsync(OutputSyncRequest request, CloudSession session, string deviceToken, CancellationToken cancellationToken = default)
        {
            OutputKinds.AddRange(request.Outputs.Select(output => output.Kind));
            return Task.FromResult(new CloudResultAck("ack-token", "https://example.test/r/ack-token"));
        }
    }

    private sealed class FakeQueue : IOutputSyncStore
    {
        private readonly OutputSyncQueueItem _item = new("queue", "session", "booth:session", 0, null);
        public string? SavedCloudSessionId { get; private set; }
        public CloudResultAck? Ack { get; private set; }
        public IReadOnlyList<OutputSyncQueueItem> ListDue(DateTimeOffset now) => [_item];
        public OutputSyncQueueItem? Claim(string queueId, DateTimeOffset now, DateTimeOffset leaseUntil) => _item;
        public void SaveCloudSessionId(string queueId, string cloudSessionId) => SavedCloudSessionId = cloudSessionId;
        public void Retry(string queueId, DateTimeOffset nextAttemptAt, string error) => throw new InvalidOperationException(error);
        public void Synced(string queueId, DateTimeOffset completedAt) { }
        public void Quarantined(string queueId, string reason) { }
        public OutputSyncSession? ReadSession(string sessionId) => new(new("biz", "booth", "device", "session", "pkg", "tx", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(3), "booth:session", Manifest(), []), null);
        public IReadOnlyList<OutputSyncFile> ReadFinalOutputs(string sessionId) => [new("photo_strip", "/tmp/strip.jpg", 1, new string('a', 64), "jpeg"), new("gif", "/tmp/result.gif", 1, new string('b', 64), "gif")];
        public void MarkFinalOutputsSynced(string sessionId) { }
        public void ApplyAck(string sessionId, CloudResultAck ack) => Ack = ack;
        public QuarantineResult Quarantine(string sessionId, string reason) => new("/tmp/quarantine", 2);
        public void Cleanup(DateTimeOffset now) { }
        public void Recover(DateTimeOffset now) { }

        private static ResultManifest Manifest() => ResultManifestFactory.Create("session", "tx", [new("photo_strip", "/tmp/strip.jpg", 1, new string('a', 64), "jpeg"), new("gif", "/tmp/result.gif", 1, new string('b', 64), "gif")], DateTimeOffset.UtcNow.AddDays(3));
    }
}
