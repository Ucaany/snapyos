using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using SnapyOS.Contracts;

namespace SnapyOS.Core;

public enum CameraHealthState { Disconnected, Ready, Streaming, Capturing, Busy, Degraded, Faulted }
public enum CameraRotation { None = 0, Clockwise90 = 90, HalfTurn = 180, Clockwise270 = 270 }

public readonly record struct CameraResolution(int Width, int Height)
{
    public override string ToString() => $"{Width}x{Height}";
}

public readonly record struct CameraFrameRate(int Numerator, int Denominator = 1)
{
    public double FramesPerSecond => (double)Numerator / Denominator;
}

public sealed record UvcDeviceDescriptor(
    string StableId,
    string Name,
    string Manufacturer,
    string Model,
    string InstanceId,
    string DevicePath,
    IReadOnlyList<CameraResolution> Resolutions,
    IReadOnlyList<CameraFrameRate> FrameRates)
{
    public string DisplayName => $"{Manufacturer} {Model}".Trim();
}

public sealed record CameraFrame(
    ReadOnlyMemory<byte> Payload,
    CameraResolution Resolution,
    CameraFrameRate FrameRate,
    bool Mirrored,
    CameraRotation Rotation,
    DateTimeOffset CapturedAt);

public sealed record UvcCameraOptions(
    CameraResolution Resolution,
    CameraFrameRate FrameRate,
    bool Mirror,
    CameraRotation Rotation,
    TimeSpan OperationTimeout)
{
    public static UvcCameraOptions Default => new(new(1920, 1080), new(30), false, CameraRotation.None, TimeSpan.FromSeconds(10));
}

public interface IWindowsUvcBackend
{
    Task<IReadOnlyList<UvcDeviceDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default);
    Task<IWindowsUvcSession> OpenAsync(UvcDeviceDescriptor device, UvcCameraOptions options, CancellationToken cancellationToken = default);
}

public interface IWindowsUvcSession : IAsyncDisposable
{
    Task<CameraFrame> ReadPreviewAsync(CancellationToken cancellationToken);
    Task<CameraFrame> CaptureStillAsync(CancellationToken cancellationToken);
    Task SetTransformAsync(bool mirror, CameraRotation rotation, CancellationToken cancellationToken);
}

public interface IUvcCamera : IAsyncDisposable
{
    UvcDeviceDescriptor Device { get; }
    CameraHealthState Health { get; }
    Task StartPreviewAsync(CancellationToken cancellationToken = default);
    IAsyncEnumerable<CameraFrame> PreviewAsync(CancellationToken cancellationToken = default);
    Task<CameraFrame> CaptureStillAsync(CancellationToken cancellationToken = default);
    Task<bool> ReconnectAsync(CancellationToken cancellationToken = default);
}

public sealed class FakeUvcCameraAdapter : IUvcCamera
{
    private readonly UvcCameraOptions _options;
    private bool _started;
    private bool _disposed;
    private int _captureCount;

    public FakeUvcCameraAdapter(UvcDeviceDescriptor device, UvcCameraOptions? options = null)
    {
        Device = device;
        _options = options ?? UvcCameraOptions.Default;
        Health = CameraHealthState.Disconnected;
    }

    public UvcDeviceDescriptor Device { get; }
    public CameraHealthState Health { get; private set; }

    public Task StartPreviewAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();
        cancellationToken.ThrowIfCancellationRequested();
        _started = true;
        Health = CameraHealthState.Ready;
        return Task.CompletedTask;
    }

    public async IAsyncEnumerable<CameraFrame> PreviewAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await StartPreviewAsync(cancellationToken).ConfigureAwait(false);
        while (!cancellationToken.IsCancellationRequested)
        {
            Health = CameraHealthState.Streaming;
            yield return Frame();
            await Task.Yield();
        }
        Health = CameraHealthState.Ready;
    }

    public async Task<CameraFrame> CaptureStillAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();
        await StartPreviewAsync(cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        Health = CameraHealthState.Capturing;
        var frame = Frame();
        Health = CameraHealthState.Ready;
        return frame;
    }

    public Task<bool> ReconnectAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();
        cancellationToken.ThrowIfCancellationRequested();
        _started = true;
        Health = CameraHealthState.Ready;
        return Task.FromResult(true);
    }

    public ValueTask DisposeAsync()
    {
        if (!_disposed)
        {
            _disposed = true;
            _started = false;
            Health = CameraHealthState.Disconnected;
        }
        return ValueTask.CompletedTask;
    }

    private CameraFrame Frame() => new(
        new byte[] { (byte)++_captureCount },
        _options.Resolution,
        _options.FrameRate,
        _options.Mirror,
        _options.Rotation,
        DateTimeOffset.UtcNow);

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, nameof(FakeUvcCameraAdapter));
        if (!_started && Health != CameraHealthState.Disconnected) throw new InvalidOperationException("Fake camera is not ready.");
    }
}

public sealed class WindowsUvcCameraAdapter : IUvcCamera
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> DeviceLocks = new(StringComparer.OrdinalIgnoreCase);
    private readonly IWindowsUvcBackend _backend;
    private readonly UvcCameraOptions _options;
    private readonly SemaphoreSlim _operation = new(1, 1);
    private IWindowsUvcSession? _session;
    private SemaphoreSlim? _deviceLock;
    private bool _disposed;

    public WindowsUvcCameraAdapter(IWindowsUvcBackend backend, UvcDeviceDescriptor device, UvcCameraOptions? options = null)
    {
        _backend = backend;
        Device = NormalizeIdentity(device);
        _options = options ?? UvcCameraOptions.Default;
        Health = CameraHealthState.Disconnected;
    }

    public UvcDeviceDescriptor Device { get; }
    public CameraHealthState Health { get; private set; }

    public static async Task<IReadOnlyList<UvcDeviceDescriptor>> EnumerateAsync(IWindowsUvcBackend backend, CancellationToken cancellationToken = default)
    {
        var devices = await backend.EnumerateAsync(cancellationToken).ConfigureAwait(false);
        return devices.Select(NormalizeIdentity).ToArray();
    }

    public async Task StartPreviewAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();
        if (_session is not null) return;
        _deviceLock = DeviceLocks.GetOrAdd(Device.StableId, _ => new SemaphoreSlim(1, 1));
        if (!await _deviceLock.WaitAsync(0, cancellationToken).ConfigureAwait(false))
        {
            Health = CameraHealthState.Busy;
            throw new InvalidOperationException("Camera is already in use.");
        }

        try
        {
            ValidateOptions();
            _session = await WithTimeout(
                ct => _backend.OpenAsync(Device, _options, ct), cancellationToken).ConfigureAwait(false);
            await WithTimeout(ct => _session.SetTransformAsync(_options.Mirror, _options.Rotation, ct), cancellationToken).ConfigureAwait(false);
            Health = CameraHealthState.Ready;
        }
        catch
        {
            ReleaseDeviceLock();
            Health = CameraHealthState.Faulted;
            throw;
        }
    }

    public async IAsyncEnumerable<CameraFrame> PreviewAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await StartPreviewAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                CameraFrame frame;
                try
                {
                    Health = CameraHealthState.Streaming;
                    frame = await WithTimeout(ct => _session!.ReadPreviewAsync(ct), cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { yield break; }
                catch
                {
                    Health = CameraHealthState.Degraded;
                    throw;
                }
                yield return frame;
            }
        }
        finally
        {
            if (_session is not null && Health == CameraHealthState.Streaming) Health = CameraHealthState.Ready;
        }
    }

    public async Task<CameraFrame> CaptureStillAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();
        await StartPreviewAsync(cancellationToken).ConfigureAwait(false);
        await _operation.WaitAsync(cancellationToken).ConfigureAwait(false);
        var succeeded = false;
        try
        {
            Health = CameraHealthState.Capturing;
            var frame = await WithTimeout(ct => _session!.CaptureStillAsync(ct), cancellationToken).ConfigureAwait(false);
            succeeded = true;
            return frame;
        }
        catch
        {
            Health = CameraHealthState.Degraded;
            throw;
        }
        finally
        {
            _operation.Release();
            if (succeeded && _session is not null) Health = CameraHealthState.Ready;
        }
    }

    public async Task<bool> ReconnectAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();
        await DisposeSessionAsync().ConfigureAwait(false);
        try
        {
            await StartPreviewAsync(cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch { Health = CameraHealthState.Disconnected; return false; }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        await DisposeSessionAsync().ConfigureAwait(false);
        _operation.Dispose();
    }

    private async Task DisposeSessionAsync()
    {
        if (_session is not null)
        {
            await _session.DisposeAsync().ConfigureAwait(false);
            _session = null;
        }
        ReleaseDeviceLock();
        Health = CameraHealthState.Disconnected;
    }

    private void ReleaseDeviceLock()
    {
        if (_deviceLock is null) return;
        _deviceLock.Release();
        _deviceLock = null;
    }

    private async Task<T> WithTimeout<T>(Func<CancellationToken, Task<T>> operation, CancellationToken cancellationToken)
    {
        using var timeout = CreateTimeout(cancellationToken);
        return await operation(timeout.Token).ConfigureAwait(false);
    }

    private async Task WithTimeout(Func<CancellationToken, Task> operation, CancellationToken cancellationToken)
    {
        using var timeout = CreateTimeout(cancellationToken);
        await operation(timeout.Token).ConfigureAwait(false);
    }

    private CancellationTokenSource CreateTimeout(CancellationToken cancellationToken)
    {
        if (_options.OperationTimeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(cancellationToken), "Camera operation timeout must be positive.");
        var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_options.OperationTimeout);
        return timeout;
    }

    private void ValidateOptions()
    {
        if (_options.Resolution.Width <= 0 || _options.Resolution.Height <= 0)
            throw new ArgumentOutOfRangeException(nameof(_options.Resolution));
        if (_options.FrameRate.Numerator <= 0 || _options.FrameRate.Denominator <= 0)
            throw new ArgumentOutOfRangeException(nameof(_options.FrameRate));
        if (Device.Resolutions.Count > 0 && !Device.Resolutions.Contains(_options.Resolution))
            throw new NotSupportedException($"Resolution {_options.Resolution} is not supported by {Device.DisplayName}.");
        if (Device.FrameRates.Count > 0 && !Device.FrameRates.Contains(_options.FrameRate))
            throw new NotSupportedException($"Frame rate {_options.FrameRate.FramesPerSecond:0.##} is not supported by {Device.DisplayName}.");
    }

    private static UvcDeviceDescriptor NormalizeIdentity(UvcDeviceDescriptor device)
    {
        if (!string.IsNullOrWhiteSpace(device.StableId)) return device;
        var seed = $"{device.Manufacturer}|{device.Model}|{device.InstanceId}|{device.DevicePath}";
        var stable = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(seed))).ToLowerInvariant();
        return device with { StableId = $"uvc-{stable[..24]}" };
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, nameof(WindowsUvcCameraAdapter));
    }
}
