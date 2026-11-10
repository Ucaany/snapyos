using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace SnapyOS.Core;

public enum ProtocolCameraSupport { Certified, Compatible, TransferOnly, Unsupported }
public enum ProtocolOperation { StillCapture, ImageTransfer, LivePreview, ExposureControl }
public enum ProtocolCameraHealth { Disconnected, Ready, Busy, Unsupported, Degraded, Faulted }
public enum ProtocolCameraTransport { Ptp, Mtp, GPhoto2, LibGPhoto2 }

public sealed record ProtocolCameraDescriptor(
    string StableId,
    string Manufacturer,
    string Model,
    string UsbInstanceId,
    HardwareProtocol Protocol,
    ProtocolCameraSupport Support,
    IReadOnlySet<ProtocolOperation> SupportedOperations,
    string KnownLimitations);

public sealed record TransferredImage(string FileName, ReadOnlyMemory<byte> Content, DateTimeOffset TransferredAt);
public sealed record ProtocolPreview(ReadOnlyMemory<byte> Content, DateTimeOffset CapturedAt);

public interface IProtocolCameraBackend
{
    HardwareProtocol Protocol { get; }
    Task<IReadOnlyList<ProtocolCameraDescriptor>> EnumerateUsbAsync(CancellationToken cancellationToken = default);
    Task<IProtocolCameraSession> OpenAsync(ProtocolCameraDescriptor device, CancellationToken cancellationToken = default);
}

public sealed record ProtocolCameraDiscoveryResult(
    DateTimeOffset DiscoveredAt,
    IReadOnlyList<ProtocolCameraDescriptor> Devices,
    IReadOnlyList<string> Diagnostics);

public sealed class ProtocolCameraDiscoveryService(IEnumerable<IProtocolCameraBackend> backends)
{
    private static readonly HardwareProtocol[] Priority =
    [HardwareProtocol.Ptp, HardwareProtocol.Mtp, HardwareProtocol.GPhoto2, HardwareProtocol.LibGPhoto2];

    public async Task<ProtocolCameraDiscoveryResult> DiscoverUsbAsync(CancellationToken cancellationToken = default)
    {
        var devices = new List<ProtocolCameraDescriptor>();
        var diagnostics = new List<string>();
        foreach (var backend in backends.OrderBy(backend => ProtocolPriority(backend.Protocol)))
        {
            try
            {
                var discovered = await backend.EnumerateUsbAsync(cancellationToken).ConfigureAwait(false);
                devices.AddRange(discovered.Select(device => Normalize(device with { Protocol = backend.Protocol })));
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception) { diagnostics.Add($"{backend.Protocol}: USB discovery failed"); }
        }

        return new ProtocolCameraDiscoveryResult(DateTimeOffset.UtcNow, devices, diagnostics);
    }

    private static int ProtocolPriority(HardwareProtocol protocol)
    {
        var index = Array.IndexOf(Priority, protocol);
        return index < 0 ? int.MaxValue : index;
    }

    private static ProtocolCameraDescriptor Normalize(ProtocolCameraDescriptor device)
    {
        if (!string.IsNullOrWhiteSpace(device.StableId)) return device;
        var seed = $"{device.Manufacturer}|{device.Model}|{device.UsbInstanceId}|{device.Protocol}";
        var id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(seed))).ToLowerInvariant()[..24];
        return device with { StableId = $"{device.Protocol.ToString().ToLowerInvariant()}-{id}" };
    }
}

public interface IProtocolCameraSession : IAsyncDisposable
{
    Task<ReadOnlyMemory<byte>> CaptureAsync(CancellationToken cancellationToken);
    Task<TransferredImage> TransferLatestAsync(CancellationToken cancellationToken);
    Task<ProtocolPreview> PreviewAsync(CancellationToken cancellationToken);
    Task SetExposureAsync(int value, CancellationToken cancellationToken);
}

public sealed class ProtocolCameraAdapter : IAsyncDisposable
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new(StringComparer.OrdinalIgnoreCase);
    private readonly IProtocolCameraBackend _backend;
    private readonly TimeSpan _timeout;
    private IProtocolCameraSession? _session;
    private SemaphoreSlim? _lock;

    private static readonly HardwareProtocol[] SupportedProtocols =
    [HardwareProtocol.Ptp, HardwareProtocol.Mtp, HardwareProtocol.GPhoto2, HardwareProtocol.LibGPhoto2];

    public ProtocolCameraAdapter(IProtocolCameraBackend backend, ProtocolCameraDescriptor device, TimeSpan? timeout = null)
    {
        _backend = backend;
        Device = Normalize(device);
        _timeout = timeout ?? TimeSpan.FromSeconds(20);
        Health = Device.Support == ProtocolCameraSupport.Unsupported
            ? ProtocolCameraHealth.Unsupported
            : ProtocolCameraHealth.Disconnected;
    }

    public ProtocolCameraDescriptor Device { get; }
    public bool IsOpen => _session is not null;
    public ProtocolCameraHealth Health { get; private set; }
    public string SupportStatus => Device.Support.ToString();

    public static async Task<IReadOnlyList<ProtocolCameraDescriptor>> EnumerateUsbAsync(IProtocolCameraBackend backend, CancellationToken cancellationToken = default)
    {
        var devices = await backend.EnumerateUsbAsync(cancellationToken).ConfigureAwait(false);
        return devices.Select(Normalize).ToArray();
    }

    public async Task OpenAsync(CancellationToken cancellationToken = default)
    {
        if (_session is not null) return;
        ValidateBackend();
        if (Device.Support == ProtocolCameraSupport.Unsupported)
        {
            Health = ProtocolCameraHealth.Unsupported;
            throw new NotSupportedException($"Camera is unsupported: {Device.KnownLimitations}");
        }

        _lock = Locks.GetOrAdd(Device.StableId, _ => new SemaphoreSlim(1, 1));
        if (!await _lock.WaitAsync(0, cancellationToken).ConfigureAwait(false))
        {
            Health = ProtocolCameraHealth.Busy;
            throw new InvalidOperationException("Camera is already in use.");
        }

        try
        {
            _session = await Run(ct => _backend.OpenAsync(Device, ct), cancellationToken).ConfigureAwait(false);
            Health = ProtocolCameraHealth.Ready;
        }
        catch
        {
            Release();
            Health = ProtocolCameraHealth.Faulted;
            throw;
        }
    }

    public Task<ReadOnlyMemory<byte>> CaptureAsync(CancellationToken cancellationToken = default) => RunCapability(ProtocolOperation.StillCapture, ct => _session!.CaptureAsync(ct), cancellationToken);
    public Task<TransferredImage> TransferLatestAsync(CancellationToken cancellationToken = default) => RunCapability(ProtocolOperation.ImageTransfer, ct => _session!.TransferLatestAsync(ct), cancellationToken);
    public Task<ProtocolPreview> PreviewAsync(CancellationToken cancellationToken = default) => RunCapability(ProtocolOperation.LivePreview, ct => _session!.PreviewAsync(ct), cancellationToken);
    public Task SetExposureAsync(int value, CancellationToken cancellationToken = default) => RunCapability(ProtocolOperation.ExposureControl, ct => _session!.SetExposureAsync(value, ct), cancellationToken);

    public async Task<bool> ReconnectAsync(CancellationToken cancellationToken = default)
    {
        await DisposeSessionAsync().ConfigureAwait(false);
        try
        {
            await OpenAsync(cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch
        {
            Health = Device.Support == ProtocolCameraSupport.Unsupported
                ? ProtocolCameraHealth.Unsupported
                : ProtocolCameraHealth.Disconnected;
            return false;
        }
    }

    public async ValueTask DisposeAsync() => await DisposeSessionAsync().ConfigureAwait(false);

    private async Task<T> RunCapability<T>(ProtocolOperation operation, Func<CancellationToken, Task<T>> call, CancellationToken cancellationToken)
    {
        if (!Device.SupportedOperations.Contains(operation)) throw new NotSupportedException($"{operation} is unsupported for this camera.");
        if (_session is null) await OpenAsync(cancellationToken).ConfigureAwait(false);
        try { return await Run(call, cancellationToken).ConfigureAwait(false); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { Health = ProtocolCameraHealth.Degraded; throw; }
    }

    private async Task RunCapability(ProtocolOperation operation, Func<CancellationToken, Task> call, CancellationToken cancellationToken)
    {
        if (!Device.SupportedOperations.Contains(operation)) throw new NotSupportedException($"{operation} is unsupported for this camera.");
        if (_session is null) await OpenAsync(cancellationToken).ConfigureAwait(false);
        try { await Run(call, cancellationToken).ConfigureAwait(false); }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { Health = ProtocolCameraHealth.Degraded; throw; }
    }

    private async Task<T> Run<T>(Func<CancellationToken, Task<T>> call, CancellationToken cancellationToken)
    {
        using var timeout = CreateTimeout(cancellationToken);
        return await call(timeout.Token).ConfigureAwait(false);
    }

    private async Task Run(Func<CancellationToken, Task> call, CancellationToken cancellationToken)
    {
        using var timeout = CreateTimeout(cancellationToken);
        await call(timeout.Token).ConfigureAwait(false);
    }

    private CancellationTokenSource CreateTimeout(CancellationToken cancellationToken)
    {
        if (_timeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(cancellationToken), "Camera operation timeout must be positive.");
        var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_timeout);
        return timeout;
    }

    private void ValidateBackend()
    {
        if (!SupportedProtocols.Contains(_backend.Protocol))
            throw new NotSupportedException($"Protocol {_backend.Protocol} is not supported by this adapter.");
        if (_backend.Protocol != Device.Protocol)
            throw new InvalidOperationException($"Backend protocol {_backend.Protocol} does not match device protocol {Device.Protocol}.");
    }

    private async Task DisposeSessionAsync()
    {
        if (_session is not null)
        {
            await _session.DisposeAsync().ConfigureAwait(false);
            _session = null;
        }
        Release();
        if (Health != ProtocolCameraHealth.Unsupported) Health = ProtocolCameraHealth.Disconnected;
    }

    private void Release()
    {
        if (_lock is not null)
        {
            _lock.Release();
            _lock = null;
        }
    }

    private static ProtocolCameraDescriptor Normalize(ProtocolCameraDescriptor device)
    {
        if (!string.IsNullOrWhiteSpace(device.StableId)) return device;
        var seed = $"{device.Manufacturer}|{device.Model}|{device.UsbInstanceId}|{device.Protocol}";
        var id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(seed))).ToLowerInvariant()[..24];
        return device with { StableId = $"{device.Protocol.ToString().ToLowerInvariant()}-{id}" };
    }
}

public sealed class FakeProtocolCameraProvider(HardwareProtocol protocol, IReadOnlyList<ProtocolCameraDescriptor> devices) : IProtocolCameraBackend
{
    public HardwareProtocol Protocol { get; } = protocol;
    public bool FailOpen { get; init; }
    public bool FailDiscovery { get; init; }
    public TimeSpan Delay { get; init; }

    public async Task<IReadOnlyList<ProtocolCameraDescriptor>> EnumerateUsbAsync(CancellationToken cancellationToken = default)
    {
        await Task.Delay(Delay, cancellationToken).ConfigureAwait(false);
        if (FailDiscovery) throw new InvalidOperationException("fake discovery failure");
        return devices;
    }

    public async Task<IProtocolCameraSession> OpenAsync(ProtocolCameraDescriptor device, CancellationToken cancellationToken = default)
    {
        await Task.Delay(Delay, cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        if (FailOpen) throw new InvalidOperationException("fake open failure");
        return new FakeProtocolSession(Delay);
    }
}


public sealed class FakeProtocolSession(TimeSpan delay = default) : IProtocolCameraSession
{
    public async Task<ReadOnlyMemory<byte>> CaptureAsync(CancellationToken cancellationToken)
    {
        await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
        return new byte[] { 1, 2 };
    }

    public async Task<TransferredImage> TransferLatestAsync(CancellationToken cancellationToken)
    {
        await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
        return new TransferredImage("capture.jpg", new byte[] { 1, 2 }, DateTimeOffset.UtcNow);
    }

    public async Task<ProtocolPreview> PreviewAsync(CancellationToken cancellationToken)
    {
        await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
        return new ProtocolPreview(new byte[] { 3 }, DateTimeOffset.UtcNow);
    }

    public async Task SetExposureAsync(int value, CancellationToken cancellationToken) => await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
