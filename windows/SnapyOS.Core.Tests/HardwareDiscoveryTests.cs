using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class HardwareDiscoveryTests
{
    [Fact]
    public async Task Providers_run_in_protocol_priority_order()
    {
        var device = new HardwareCatalogItem
        {
            HardwareId = "camera-1", Manufacturer = "Fake", Model = "UVC Cam",
            ConnectionType = HardwareConnectionType.Usb, Protocol = HardwareProtocol.Uvc,
            Capabilities = new(true, true, false, true, true, true),
            Certification = CertificationStatus.Candidate,
            WindowsCompatibility = WindowsCompatibility.Windows10And11
        };
        var service = new HardwareDiscoveryService([
            new FakeHardwareDiscoveryProvider(HardwareProtocol.GPhoto2, [device with { HardwareId = "gphoto" }]),
            new FakeHardwareDiscoveryProvider(HardwareProtocol.Uvc, [device])
        ]);
        var result = await service.DiscoverAsync();
        Assert.Equal(new[] { "camera-1", "gphoto" }, result.Devices.Select(x => x.HardwareId));
    }

    [Fact]
    public async Task Provider_failure_is_diagnostic_not_global_failure()
    {
        var service = new HardwareDiscoveryService([
            new FakeHardwareDiscoveryProvider(HardwareProtocol.Uvc, []) { Fail = true },
            new FakeHardwareDiscoveryProvider(HardwareProtocol.Ptp, [])
        ]);
        var result = await service.DiscoverAsync();
        Assert.Single(result.Diagnostics);
    }

    [Fact]
    public async Task Blocked_and_incompatible_devices_are_excluded()
    {
        var baseDevice = new HardwareCatalogItem
        {
            HardwareId = "camera", Manufacturer = "Fake", Model = "Cam",
            ConnectionType = HardwareConnectionType.Usb, Protocol = HardwareProtocol.Uvc,
            Capabilities = new(true, true, false, true, true, true),
            Certification = CertificationStatus.Candidate,
            WindowsCompatibility = WindowsCompatibility.Windows10And11
        };
        var service = new HardwareDiscoveryService([
            new FakeHardwareDiscoveryProvider(HardwareProtocol.Uvc, [
                baseDevice with { HardwareId = "blocked", Certification = CertificationStatus.Blocked },
                baseDevice with { HardwareId = "unsupported", WindowsCompatibility = WindowsCompatibility.NotCompatible },
                baseDevice with { HardwareId = "accepted" }
            ])
        ]);

        var result = await service.DiscoverAsync();

        Assert.Single(result.Devices);
        Assert.Equal("accepted", result.Devices[0].HardwareId);
        Assert.Equal("Fake Cam", result.Devices[0].DisplayName);
    }

    [Fact]
    public async Task Cancellation_is_preserved()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var service = new HardwareDiscoveryService([new FakeHardwareDiscoveryProvider(HardwareProtocol.Uvc, [])]);
        await Assert.ThrowsAsync<OperationCanceledException>(() => service.DiscoverAsync(cts.Token));
    }
}
