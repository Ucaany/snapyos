using SnapyOS.Core;

namespace SnapyOS.Wpf.Kiosk;

/// <summary>Native boundary for the Windows Media Foundation or DirectShow implementation.</summary>
public sealed class NativeUvcCameraBackend : IWindowsUvcBackend
{
    public Task<IReadOnlyList<UvcDeviceDescriptor>> EnumerateAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException("Windows camera backend is not available in this build.");
    }

    public Task<IWindowsUvcSession> OpenAsync(UvcDeviceDescriptor device, UvcCameraOptions options, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("Windows camera backend is not available in this build.");
}
