using System.Text.Json.Nodes;

namespace SnapyOS.Booth.Core.Hardware;

/// <summary>Status satu adapter kamera. Padanan <c>CameraStatus</c> runtime Node.</summary>
public sealed record CameraStatus(string Adapter, bool Connected, bool Mock, string? LastError);

/// <summary>Status printer. <c>ok</c> berarti printer dikenal spooler, bukan "kertas siap".</summary>
public sealed record PrinterHealth(string Adapter, bool Ok, bool Mock, string? LastError);

/// <summary>Hasil submit print. <c>JobId</c> boleh null — spooler Windows tidak selalu memberi id.</summary>
public sealed record SubmitResult(bool Ok, string? JobId, string? Message);

/// <summary>
/// Kontrak adapter kamera. Preview gagal TIDAK membatalkan capture (aturan
/// <c>runtime/camera/types.ts</c>): kiosk boleh melanjutkan dengan masih frame.
/// </summary>
public interface ICamera
{
    string Kind { get; }

    bool Mock { get; }

    Task<CameraStatus> StatusAsync(CancellationToken cancellationToken = default);

    Task<byte[]> PreviewAsync(CancellationToken cancellationToken = default);

    Task<byte[]> CaptureAsync(CancellationToken cancellationToken = default);
}

/// <summary>Kontrak adapter printer. <c>SubmitAsync</c> = spooler menerima, bukan "kertas keluar".</summary>
public interface IPrinter
{
    string Kind { get; }

    bool Mock { get; }

    Task<PrinterHealth> HealthAsync(string? printerName, CancellationToken cancellationToken = default);

    Task<SubmitResult> SubmitAsync(JsonObject request, bool test, CancellationToken cancellationToken = default);
}

/// <summary>
/// Kamera mock untuk pengujian tanpa perangkat. <c>Mock = true</c> supaya UI
/// melabelinya; hanya boleh aktif bila <c>SNAPYOS_ALLOW_MOCK=1</c> (dijaga config).
/// </summary>
public sealed class MockCamera : ICamera
{
    // JPEG 1×1 valid — penanda bahwa frame ini bukan foto pelanggan.
    private static readonly byte[] Frame = Convert.FromBase64String(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
        "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
        "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==");

    public string Kind => "mock";

    public bool Mock => true;

    public Task<CameraStatus> StatusAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(new CameraStatus(Kind, true, true, null));

    public Task<byte[]> PreviewAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(Frame);

    public Task<byte[]> CaptureAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(Frame);
}

/// <summary>Printer mock: menerima pekerjaan tanpa menyentuh spooler.</summary>
public sealed class MockPrinter : IPrinter
{
    private int _counter;

    public string Kind => "mock";

    public bool Mock => true;

    public Task<PrinterHealth> HealthAsync(string? printerName, CancellationToken cancellationToken = default) =>
        Task.FromResult(new PrinterHealth(Kind, true, true, null));

    public Task<SubmitResult> SubmitAsync(JsonObject request, bool test, CancellationToken cancellationToken = default)
    {
        var job = $"MOCK-{Interlocked.Increment(ref _counter)}";
        return Task.FromResult(new SubmitResult(true, job, test ? "Halaman uji mock." : null));
    }
}
