using System.Printing;
using System.Security.Cryptography;
using System.Text;
using SnapyOS.Core;

namespace SnapyOS.Printing;

public sealed class NativeWindowsPrintSpooler : IWindowsPrintSpooler
{
    public Task<IReadOnlyList<PrinterDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var server = new LocalPrintServer();
        var defaultQueue = server.DefaultPrintQueue?.FullName;
        var printers = server.GetPrintQueues().Select(queue => new PrinterDescriptor(
            StableId: StableId(queue.FullName),
            Name: queue.FullName,
            DriverName: queue.QueueDriver.Name,
            DriverStatus: PrinterDriverStatus.Installed,
            Availability: ToAvailability(queue.QueueStatus),
            IsDefault: string.Equals(queue.FullName, defaultQueue, StringComparison.OrdinalIgnoreCase),
            PaperProfiles: [],
            BorderlessCapable: false,
            QueueLength: queue.GetPrintJobInfoCollection().Cast<object>().Count())).ToArray();
        return Task.FromResult<IReadOnlyList<PrinterDescriptor>>(printers);
    }

    public Task<PrintJob> SubmitAsync(PrintRequest request, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("Native spooler document submission requires a Windows print-format adapter; no external helper is used.");

    public Task<PrintJob?> GetJobAsync(string jobId, CancellationToken cancellationToken = default) =>
        Task.FromResult<PrintJob?>(null);

    public Task<bool> CancelAsync(string jobId, CancellationToken cancellationToken = default) =>
        Task.FromResult(false);

    public Task<PrintJob> TestPrintAsync(string printerId, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("Native test print requires a Windows print-format adapter.");

    private static PrinterAvailability ToAvailability(PrintQueueStatus status) =>
        status.HasFlag(PrintQueueStatus.Offline) ? PrinterAvailability.Offline :
        status.HasFlag(PrintQueueStatus.Error) ? PrinterAvailability.Error : PrinterAvailability.Online;

    private static string StableId(string name) => $"windows-spooler-{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(name.Trim().ToLowerInvariant())))[..16].ToLowerInvariant()}";
}
