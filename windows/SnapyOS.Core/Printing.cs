using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace SnapyOS.Core;

public enum PrinterAvailability { Unknown, Online, Offline, Error }
public enum PrinterDriverStatus { Unknown, Installed, Error }
public enum PrintOrientation { Portrait, Landscape }
public enum PrintJobState { Queued, Printing, Completed, Failed, Cancelled }

public sealed record PaperProfile(string Name, double WidthMm, double HeightMm, bool Borderless);
public sealed record PrinterDescriptor(string StableId, string Name, string DriverName, PrinterDriverStatus DriverStatus, PrinterAvailability Availability, bool IsDefault, IReadOnlyList<PaperProfile> PaperProfiles, bool BorderlessCapable, int QueueLength = 0)
{
    public PrinterDescriptor(string stableId, string name, string driverName, PrinterAvailability availability, bool isDefault, IReadOnlyList<PaperProfile> paperProfiles, bool borderlessCapable)
        : this(stableId, name, driverName, PrinterDriverStatus.Unknown, availability, isDefault, paperProfiles, borderlessCapable) { }
}
public sealed record PrintRequest(string PrinterId, ReadOnlyMemory<byte> Document, string ContentType, PaperProfile Paper, PrintOrientation Orientation, int Copies, string IdempotencyKey);
public sealed record PrintJob(string JobId, string PrinterId, string IdempotencyKey, PrintJobState State, DateTimeOffset SubmittedAt, string? Error);

public interface IWindowsPrintSpooler
{
    Task<IReadOnlyList<PrinterDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default);
    Task<PrintJob> SubmitAsync(PrintRequest request, CancellationToken cancellationToken = default);
    Task<PrintJob?> GetJobAsync(string jobId, CancellationToken cancellationToken = default);
    Task<bool> CancelAsync(string jobId, CancellationToken cancellationToken = default);
    Task<PrintJob> TestPrintAsync(string printerId, CancellationToken cancellationToken = default);
}

public sealed class WindowsPrintSpoolerAdapter(IWindowsPrintSpooler spooler, bool compatibilityFallback = false)
{
    private readonly ConcurrentDictionary<string, PrintJob> _idempotency = new(StringComparer.Ordinal);
    public bool CompatibilityFallback { get; } = compatibilityFallback;
    public string BackendName => CompatibilityFallback ? "compatibility-fallback" : "windows-spooler";

    public Task<IReadOnlyList<PrinterDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default) => spooler.EnumerateAsync(cancellationToken);

    public async Task<PrintJob> SubmitAsync(PrintRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Copies is < 1 or > 99) throw new ArgumentOutOfRangeException(nameof(request), "Copies must be 1-99.");
        if (request.Document.Length == 0) throw new ArgumentException("Document cannot be empty.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.ContentType)) throw new ArgumentException("Content type is required.", nameof(request));
        if (request.Paper.WidthMm <= 0 || request.Paper.HeightMm <= 0) throw new ArgumentOutOfRangeException(nameof(request), "Paper dimensions must be positive.");
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey)) throw new ArgumentException("Idempotency key is required.", nameof(request));
        if (_idempotency.TryGetValue(request.IdempotencyKey, out var existing)) return existing;
        var job = await spooler.SubmitAsync(request, cancellationToken).ConfigureAwait(false);
        _idempotency.TryAdd(request.IdempotencyKey, job);
        return job;
    }

    public Task<PrintJob?> GetJobAsync(string jobId, CancellationToken cancellationToken = default) => spooler.GetJobAsync(jobId, cancellationToken);
    public Task<bool> CancelAsync(string jobId, CancellationToken cancellationToken = default) => spooler.CancelAsync(jobId, cancellationToken);
    public Task<PrintJob> TestPrintAsync(string printerId, CancellationToken cancellationToken = default) => spooler.TestPrintAsync(printerId, cancellationToken);
    public Task<PrintJob> RetryAsync(PrintRequest request, CancellationToken cancellationToken = default) => SubmitAsync(request with { IdempotencyKey = request.IdempotencyKey + ":retry" }, cancellationToken);
}

public sealed class FakePrintSpooler(IReadOnlyList<PrinterDescriptor> printers) : IWindowsPrintSpooler
{
    private readonly ConcurrentDictionary<string, PrintJob> _jobs = new();
    private int _nextId;
    public bool FailSubmit { get; init; }
    public Task<IReadOnlyList<PrinterDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default) => Task.FromResult(printers);
    public Task<PrintJob> SubmitAsync(PrintRequest request, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (FailSubmit) throw new InvalidOperationException("fake spooler failure");
        var job = new PrintJob($"fake-job-{Interlocked.Increment(ref _nextId)}", request.PrinterId, request.IdempotencyKey, PrintJobState.Queued, DateTimeOffset.UtcNow, null);
        _jobs[job.JobId] = job;
        return Task.FromResult(job);
    }
    public Task<PrintJob?> GetJobAsync(string jobId, CancellationToken cancellationToken = default) => Task.FromResult(_jobs.TryGetValue(jobId, out var job) ? job : null);
    public Task<bool> CancelAsync(string jobId, CancellationToken cancellationToken = default) => Task.FromResult(_jobs.TryRemove(jobId, out _));
    public Task<PrintJob> TestPrintAsync(string printerId, CancellationToken cancellationToken = default) => SubmitAsync(new(printerId, new byte[] { 1 }, "application/pdf", new("test", 101.6, 152.4, false), PrintOrientation.Portrait, 1, $"test:{printerId}"), cancellationToken);
}
