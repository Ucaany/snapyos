using SnapyOS.Agent;
using SnapyOS.Core;

namespace SnapyOS.Wpf.Platform;

public interface IKioskStatusService
{
    KioskStatus Read();
}

public sealed class KioskStatusService(
    ILockdownCapabilityDetector capabilityDetector,
    IBoothInstanceGuard instanceGuard,
    PairingClient pairing,
    IStartupStatusProbe startup,
    IWatchdogStatusProbe watchdog) : IKioskStatusService
{
    public KioskStatus Read()
    {
        var capability = capabilityDetector.Detect();
        var profile = pairing.Snapshot.Profile;
        var booth = profile is null ? null : new BoothBinding(profile.DeviceId, profile.BusinessSlug, profile.PhotoboxSlug);
        const string taskName = "SnapyOS Kiosk";
        return KioskLockdownPlanner.CreateStatus(capability, false, startup.IsRegistered(taskName), watchdog.IsRunning(), instanceGuard.IsHeld, booth);
    }
}
