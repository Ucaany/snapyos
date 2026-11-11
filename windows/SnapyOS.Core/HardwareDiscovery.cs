using System.ComponentModel.DataAnnotations;
using SnapyOS.Contracts;

namespace SnapyOS.Core;

public enum HardwareConnectionType { Usb, Network, Serial, Bluetooth, Unknown }
public enum HardwareProtocol { Uvc, WindowsMediaFoundation, DirectShow, Ptp, Mtp, GPhoto2, LibGPhoto2, Unknown }
public enum CertificationStatus { Unknown, Candidate, Verified, Blocked }
public enum WindowsCompatibility { Unknown, Windows10, Windows11, Windows10And11, NotCompatible }

public sealed record HardwareCapabilities(
    bool StillCapture,
    bool LivePreview,
    bool ExposureControl,
    bool Autofocus,
    bool Reconnect,
    bool GifSuitability);

public sealed record HardwareCatalogItem : ContractDocument
{
    [Required, StringLength(128)] public required string HardwareId { get; init; }
    [Required, StringLength(128)] public required string Manufacturer { get; init; }
    [Required, StringLength(160)] public required string Model { get; init; }
    [Required] public HardwareConnectionType ConnectionType { get; init; }
    [Required] public HardwareProtocol Protocol { get; init; }
    [Required] public required HardwareCapabilities Capabilities { get; init; }
    [Required] public CertificationStatus Certification { get; init; }
    [Required] public WindowsCompatibility WindowsCompatibility { get; init; }
    [StringLength(2000)] public string KnownLimitations { get; init; } = string.Empty;
    public bool IsPreferred { get; init; }

    public string DisplayName => $"{Manufacturer} {Model}".Trim();
}

public sealed record HardwareDiscoveryResult(
    DateTimeOffset DiscoveredAt,
    IReadOnlyList<HardwareCatalogItem> Devices,
    IReadOnlyList<string> Diagnostics);

public interface IHardwareDiscoveryProvider
{
    HardwareProtocol Protocol { get; }
    Task<IReadOnlyList<HardwareCatalogItem>> DiscoverAsync(CancellationToken cancellationToken = default);
}

public sealed class HardwareDiscoveryService(IEnumerable<IHardwareDiscoveryProvider> providers)
{
    public async Task<HardwareDiscoveryResult> DiscoverAsync(CancellationToken cancellationToken = default)
    {
        var devices = new List<HardwareCatalogItem>();
        var diagnostics = new List<string>();
        foreach (var provider in providers.OrderBy(Priority))
        {
            try
            {
                var discovered = await provider.DiscoverAsync(cancellationToken).ConfigureAwait(false);
                devices.AddRange(discovered.Where(IsUsable));
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception) { diagnostics.Add($"{provider.Protocol}: discovery failed"); }
        }
        return new HardwareDiscoveryResult(DateTimeOffset.UtcNow, devices, diagnostics);
    }

    private static bool IsUsable(HardwareCatalogItem device) =>
        device.Protocol != HardwareProtocol.Unknown &&
        device.Certification != CertificationStatus.Blocked &&
        device.WindowsCompatibility != WindowsCompatibility.NotCompatible;

    private static int Priority(IHardwareDiscoveryProvider provider) => provider.Protocol switch
    {
        HardwareProtocol.Uvc => 0,
        HardwareProtocol.WindowsMediaFoundation => 1,
        HardwareProtocol.DirectShow => 2,
        HardwareProtocol.Ptp => 3,
        HardwareProtocol.Mtp => 4,
        HardwareProtocol.GPhoto2 => 5,
        HardwareProtocol.LibGPhoto2 => 6,
        _ => 99
    };
}

public sealed class FakeHardwareDiscoveryProvider(HardwareProtocol protocol, IReadOnlyList<HardwareCatalogItem> devices) : IHardwareDiscoveryProvider
{
    public HardwareProtocol Protocol { get; } = protocol;
    public bool Fail { get; init; }
    public Task<IReadOnlyList<HardwareCatalogItem>> DiscoverAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (Fail) throw new InvalidOperationException("fake discovery failure");
        return Task.FromResult(devices);
    }
}
