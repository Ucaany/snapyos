using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class ProtocolCameraTests
{
    [Fact]
    public async Task Enumerates_and_normalizes_identity()
    {
        var descriptor = Device(HardwareProtocol.Ptp, ProtocolCameraSupport.Compatible, new HashSet<ProtocolOperation> { ProtocolOperation.StillCapture, ProtocolOperation.ImageTransfer });
        var provider = new FakeProtocolCameraProvider(HardwareProtocol.Ptp, [descriptor]);
        var devices = await ProtocolCameraAdapter.EnumerateUsbAsync(provider);
        Assert.StartsWith("ptp-", devices[0].StableId);
    }

    [Fact]
    public async Task Supports_capture_and_transfer_only_when_capability_exists()
    {
        var descriptor = Device(HardwareProtocol.Mtp, ProtocolCameraSupport.TransferOnly, new HashSet<ProtocolOperation> { ProtocolOperation.ImageTransfer });
        await using var adapter = new ProtocolCameraAdapter(new FakeProtocolCameraProvider(HardwareProtocol.Mtp, [descriptor]), descriptor);
        var image = await adapter.TransferLatestAsync();
        Assert.Equal("capture.jpg", image.FileName);
        await Assert.ThrowsAsync<NotSupportedException>(() => adapter.CaptureAsync());
        await Assert.ThrowsAsync<NotSupportedException>(() => adapter.PreviewAsync());
    }

    [Fact]
    public async Task Discovery_orders_protocols_and_keeps_limitations()
    {
        var ptp = Device(HardwareProtocol.Ptp, ProtocolCameraSupport.Certified, new HashSet<ProtocolOperation> { ProtocolOperation.StillCapture });
        var mtp = Device(HardwareProtocol.Mtp, ProtocolCameraSupport.TransferOnly, new HashSet<ProtocolOperation> { ProtocolOperation.ImageTransfer });
        var result = await new ProtocolCameraDiscoveryService([
            new FakeProtocolCameraProvider(HardwareProtocol.Mtp, [mtp]),
            new FakeProtocolCameraProvider(HardwareProtocol.Ptp, [ptp])
        ]).DiscoverUsbAsync();

        Assert.Equal(new[] { HardwareProtocol.Ptp, HardwareProtocol.Mtp }, result.Devices.Select(device => device.Protocol));
        Assert.Equal(ProtocolCameraSupport.TransferOnly, result.Devices[1].Support);
        Assert.Contains("hardware certification", result.Devices[1].KnownLimitations);
    }

    [Fact]
    public async Task Unsupported_device_is_rejected_with_health_state()
    {
        var descriptor = Device(HardwareProtocol.Ptp, ProtocolCameraSupport.Unsupported, new HashSet<ProtocolOperation>());
        await using var adapter = new ProtocolCameraAdapter(new FakeProtocolCameraProvider(HardwareProtocol.Ptp, [descriptor]), descriptor);
        await Assert.ThrowsAsync<NotSupportedException>(() => adapter.OpenAsync());
        Assert.Equal(ProtocolCameraHealth.Unsupported, adapter.Health);
        Assert.Equal("Unsupported", adapter.SupportStatus);
    }

    [Fact]
    public async Task Exposure_and_preview_are_capability_gated()
    {
        var descriptor = Device(HardwareProtocol.LibGPhoto2, ProtocolCameraSupport.Compatible, new HashSet<ProtocolOperation> { ProtocolOperation.ExposureControl, ProtocolOperation.LivePreview });
        await using var adapter = new ProtocolCameraAdapter(new FakeProtocolCameraProvider(HardwareProtocol.LibGPhoto2, [descriptor]), descriptor);
        await adapter.SetExposureAsync(4);
        var preview = await adapter.PreviewAsync();
        Assert.NotEmpty(preview.Content.ToArray());
        await Assert.ThrowsAsync<NotSupportedException>(() => adapter.CaptureAsync());
    }

    [Fact]
    public async Task Timeout_is_enforced()
    {
        var descriptor = Device(HardwareProtocol.Ptp, ProtocolCameraSupport.Compatible, new HashSet<ProtocolOperation> { ProtocolOperation.StillCapture });
        var provider = new FakeProtocolCameraProvider(HardwareProtocol.Ptp, [descriptor]) { Delay = TimeSpan.FromSeconds(1) };
        await using var adapter = new ProtocolCameraAdapter(provider, descriptor, TimeSpan.FromMilliseconds(10));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => adapter.CaptureAsync());
        Assert.Equal(ProtocolCameraHealth.Degraded, adapter.Health);
    }

    [Fact]
    public async Task Exclusive_access_and_reconnect_work()
    {
        var descriptor = Device(HardwareProtocol.GPhoto2, ProtocolCameraSupport.Compatible, new HashSet<ProtocolOperation> { ProtocolOperation.StillCapture });
        var provider = new FakeProtocolCameraProvider(HardwareProtocol.GPhoto2, [descriptor]);
        await using var first = new ProtocolCameraAdapter(provider, descriptor);
        await using var second = new ProtocolCameraAdapter(provider, descriptor);
        await first.OpenAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => second.OpenAsync());
        await first.ReconnectAsync();
    }

    private static ProtocolCameraDescriptor Device(HardwareProtocol protocol, ProtocolCameraSupport support, IReadOnlySet<ProtocolOperation> operations) => new("", "Acme", "Uncertified", "usb-1", protocol, support, operations, "Model support requires hardware certification.");
}
