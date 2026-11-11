using System.Security.Cryptography;

namespace SnapyOS.Core;

public interface IOutputSyncStore
{
    IReadOnlyList<OutputSyncQueueItem> ListDue(DateTimeOffset now);
    OutputSyncQueueItem? Claim(string queueId, DateTimeOffset now, DateTimeOffset leaseUntil);
    void SaveCloudSessionId(string queueId, string cloudSessionId);
    void Retry(string queueId, DateTimeOffset nextAttemptAt, string errorMessage);
    void Synced(string queueId, DateTimeOffset completedAt);
    void Quarantined(string queueId, string reason);
    OutputSyncSession? ReadSession(string sessionId);
    IReadOnlyList<OutputSyncFile> ReadFinalOutputs(string sessionId);
    void MarkFinalOutputsSynced(string sessionId);
    void ApplyAck(string sessionId, CloudResultAck ack);
    QuarantineResult Quarantine(string sessionId, string reason);
    void Cleanup(DateTimeOffset now);
    void Recover(DateTimeOffset now);
}

public sealed record OutputSyncQueueItem(string QueueId, string SessionId, string IdempotencyKey, int Attempts, string? CloudSessionId);
public sealed record OutputSyncSession(OutputSyncRequest Request, string? CloudSessionId);
public sealed record QuarantineResult(string Directory, int FilesCopied);

public interface IOutputSyncDiskGuard
{
    bool CanSync(string path);
}

public sealed class DriveSpaceGuard(long minimumFreeBytes) : IOutputSyncDiskGuard
{
    public bool CanSync(string path)
    {
        var root = Path.GetPathRoot(Path.GetFullPath(path));
        return root is not null && new DriveInfo(root).AvailableFreeSpace >= minimumFreeBytes;
    }
}

public sealed class ResultSyncWorker(
    IOutputSyncStore queue,
    IOutputSyncPublisher publisher,
    Func<string?> deviceToken,
    IOutputSyncDiskGuard disk,
    Func<DateTimeOffset>? now = null,
    Func<double>? random = null,
    Func<bool>? enabled = null)
{
    public const int MaxBackoffSeconds = 300;
    private readonly Func<DateTimeOffset> _now = now ?? (() => DateTimeOffset.UtcNow);
    private readonly Func<double> _random = random ?? Random.Shared.NextDouble;
    private readonly Func<bool> _enabled = enabled ?? (() => true);

    public async Task<SyncRunReport> RunOnceAsync(CancellationToken cancellationToken = default)
    {
        var current = _now();
        queue.Recover(current);
        if (!_enabled() || string.IsNullOrWhiteSpace(deviceToken())) return new(0, 0, 0, 0);
        var report = new SyncRunReport(0, 0, 0, 0);
        foreach (var due in queue.ListDue(current))
        {
            if (!disk.CanSync(Path.GetTempPath())) break;
            var claimed = queue.Claim(due.QueueId, current, current.AddMinutes(2));
            if (claimed is null) continue;
            try
            {
                var result = await SyncOneAsync(claimed, cancellationToken).ConfigureAwait(false);
                report = result switch
                {
                    SyncOutcome.Synced => report with { Synced = report.Synced + 1 },
                    SyncOutcome.Quarantined => report with { Quarantined = report.Quarantined + 1 },
                    _ => report with { Retrying = report.Retrying + 1 }
                };
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (ex is CloudSyncException { IsPermanent: true } || ex is InvalidDataException or FileNotFoundException)
                {
                    try
                    {
                        queue.Quarantine(claimed.SessionId, ex.Message);
                        queue.Quarantined(claimed.QueueId, ex.Message);
                        report = report with { Quarantined = report.Quarantined + 1 };
                    }
                    catch (Exception quarantineError)
                    {
                        Retry(claimed, quarantineError.Message);
                        report = report with { Retrying = report.Retrying + 1 };
                    }
                }
                else
                {
                    Retry(claimed, ex.Message);
                    report = report with { Retrying = report.Retrying + 1 };
                }
            }
        }
        queue.Cleanup(_now());
        return report;
    }

    private async Task<SyncOutcome> SyncOneAsync(OutputSyncQueueItem item, CancellationToken cancellationToken)
    {
        var session = queue.ReadSession(item.SessionId) ?? throw new InvalidDataException("Sync session not found.");
        var outputs = queue.ReadFinalOutputs(item.SessionId);
        if (outputs.Count == 0) return Quarantine(item, "No final outputs.");
        var token = deviceToken() ?? throw new InvalidOperationException("Device token unavailable.");
        var cloud = item.CloudSessionId is null
            ? await publisher.CreateSessionAsync(session.Request with { IdempotencyKey = item.IdempotencyKey }, token, cancellationToken).ConfigureAwait(false)
            : new CloudSession(item.CloudSessionId);
        if (item.CloudSessionId is null) queue.SaveCloudSessionId(item.QueueId, cloud.SessionId);
        var ack = await publisher.UploadOutputsAsync(session.Request with { IdempotencyKey = item.IdempotencyKey, Outputs = outputs }, cloud, token, cancellationToken).ConfigureAwait(false);
        queue.ApplyAck(item.SessionId, ack);
        queue.MarkFinalOutputsSynced(item.SessionId);
        queue.Synced(item.QueueId, _now());
        return SyncOutcome.Synced;
    }

    private SyncOutcome Quarantine(OutputSyncQueueItem item, string reason)
    {
        try
        {
            queue.Quarantine(item.SessionId, reason);
            queue.Quarantined(item.QueueId, reason);
            return SyncOutcome.Quarantined;
        }
        catch { throw; }
    }

    private void Retry(OutputSyncQueueItem item, string error)
    {
        var exponent = Math.Min(Math.Max(item.Attempts + 1, 0), 20);
        var baseSeconds = Math.Min(MaxBackoffSeconds, 1 << exponent);
        var jitter = 0.8 + 0.4 * Math.Clamp(_random(), 0, 1);
        queue.Retry(item.QueueId, _now().AddSeconds(Math.Round(baseSeconds * jitter)), error);
    }

    private enum SyncOutcome { Synced, Retrying, Quarantined }
}

public sealed record SyncRunReport(int Synced, int Retrying, int Quarantined, int Skipped);
