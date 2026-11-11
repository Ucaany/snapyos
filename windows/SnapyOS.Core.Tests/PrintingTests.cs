using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class PrintingTests
{
    [Fact]
    public async Task Enumerates_printers_and_test_prints()
    {
        var printer = new PrinterDescriptor("printer-1", "Fake", "Driver", PrinterAvailability.Online, true, [new("4x6", 101.6, 152.4, false)], false);
        var adapter = new WindowsPrintSpoolerAdapter(new FakePrintSpooler([printer]));
        var printers = await adapter.EnumerateAsync();
        Assert.Single(printers);
        Assert.True(printers[0].IsDefault);
        Assert.Equal(PrintJobState.Queued, (await adapter.TestPrintAsync("printer-1")).State);
    }

    [Fact]
    public async Task Driver_status_and_queue_metadata_are_exposed()
    {
        var printer = new PrinterDescriptor("printer-1", "Fake", "Driver", PrinterDriverStatus.Installed, PrinterAvailability.Online, true, [new("4x6", 101.6, 152.4, true)], true, 3);
        var adapter = new WindowsPrintSpoolerAdapter(new FakePrintSpooler([printer]));
        var actual = (await adapter.EnumerateAsync())[0];
        Assert.Equal(PrinterDriverStatus.Installed, actual.DriverStatus);
        Assert.Equal(3, actual.QueueLength);
        Assert.True(actual.BorderlessCapable);
        Assert.True(actual.PaperProfiles[0].Borderless);
    }

    [Fact]
    public void Compatibility_fallback_is_explicit()
    {
        var adapter = new WindowsPrintSpoolerAdapter(new FakePrintSpooler([]), compatibilityFallback: true);
        Assert.True(adapter.CompatibilityFallback);
        Assert.Equal("compatibility-fallback", adapter.BackendName);
    }

    [Fact]
    public async Task Idempotency_returns_same_job()
    {
        var adapter = new WindowsPrintSpoolerAdapter(new FakePrintSpooler([]));
        var request = new PrintRequest("printer", new byte[] { 1 }, "application/pdf", new("4x6", 101.6, 152.4, false), PrintOrientation.Portrait, 2, "job-key");
        var first = await adapter.SubmitAsync(request);
        var second = await adapter.SubmitAsync(request);
        Assert.Equal(first.JobId, second.JobId);
    }

    [Fact]
    public async Task Cancel_and_retry_are_supported()
    {
        var spooler = new FakePrintSpooler([]);
        var adapter = new WindowsPrintSpoolerAdapter(spooler);
        var request = new PrintRequest("printer", new byte[] { 1 }, "application/pdf", new("4x6", 101.6, 152.4, false), PrintOrientation.Landscape, 1, "job-key");
        var job = await adapter.SubmitAsync(request);
        Assert.True(await adapter.CancelAsync(job.JobId));
        Assert.NotEqual(job.JobId, (await adapter.RetryAsync(request)).JobId);
    }

    [Fact]
    public async Task Invalid_request_is_rejected()
    {
        var adapter = new WindowsPrintSpoolerAdapter(new FakePrintSpooler([]));
        var request = new PrintRequest("printer", ReadOnlyMemory<byte>.Empty, "application/pdf", new("4x6", 101.6, 152.4, false), PrintOrientation.Portrait, 1, "key");
        await Assert.ThrowsAsync<ArgumentException>(() => adapter.SubmitAsync(request));
    }
}
