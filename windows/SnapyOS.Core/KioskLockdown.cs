namespace SnapyOS.Core;

public enum OsKioskCapability
{
    Unknown,
    UnsupportedEdition,
    SupportedNotConfigured,
    Configured
}

public enum KioskLockdownMode
{
    Unknown,
    ApplicationFallback,
    FullOsSupportedNotConfigured,
    FullOsConfigured
}

public sealed record KioskCapability(
    OsKioskCapability OsPolicy,
    string WindowsEdition,
    Version WindowsVersion,
    bool IsElevated,
    string? Detail = null);

public sealed record BoothBinding(string DeviceId, string BusinessSlug, string PhotoboxSlug)
{
    public bool Matches(BoothBinding other) =>
        string.Equals(DeviceId, other.DeviceId, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(BusinessSlug, other.BusinessSlug, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(PhotoboxSlug, other.PhotoboxSlug, StringComparison.OrdinalIgnoreCase);
}

public sealed record KioskDeploymentOptions(
    string StartupTaskName = "SnapyOS Kiosk",
    TimeSpan? RelaunchDelay = null,
    int MaxRelaunches = 5,
    bool RequireFullOsLockdown = false)
{
    public TimeSpan EffectiveRelaunchDelay => RelaunchDelay ?? TimeSpan.FromSeconds(2);
}

public sealed record KioskStatus(
    KioskLockdownMode Mode,
    KioskCapability Capability,
    bool StartupRegistered,
    bool WatchdogRunning,
    bool SingleBoothLockHeld,
    BoothBinding? ActiveBooth,
    string Label,
    string Detail);

public static class KioskLockdownPlanner
{
    public static KioskLockdownMode SelectMode(KioskCapability capability, bool osPolicyActive) =>
        capability.OsPolicy switch
        {
            OsKioskCapability.Configured when osPolicyActive => KioskLockdownMode.FullOsConfigured,
            OsKioskCapability.Configured or OsKioskCapability.SupportedNotConfigured => KioskLockdownMode.FullOsSupportedNotConfigured,
            OsKioskCapability.UnsupportedEdition => KioskLockdownMode.ApplicationFallback,
            _ => KioskLockdownMode.Unknown
        };

    public static KioskStatus CreateStatus(
        KioskCapability capability,
        bool osPolicyActive,
        bool startupRegistered,
        bool watchdogRunning,
        bool singleBoothLockHeld,
        BoothBinding? activeBooth)
    {
        var mode = SelectMode(capability, osPolicyActive);
        var (label, detail) = mode switch
        {
            KioskLockdownMode.FullOsConfigured => ("LOCKDOWN OS AKTIF", "Windows menegakkan kebijakan kiosk pada edisi ini."),
            KioskLockdownMode.FullOsSupportedNotConfigured => ("FALLBACK APLIKASI", "Kebijakan kiosk Windows tersedia, tetapi belum aktif; aplikasi tetap memakai lockdown sendiri."),
            KioskLockdownMode.ApplicationFallback => ("FALLBACK APLIKASI", "Edisi Windows ini tidak mendukung lockdown OS penuh; status ini bukan lockdown OS."),
            _ => ("STATUS LOCKDOWN TIDAK DIKETAHUI", "Capability Windows belum dapat diverifikasi.")
        };
        detail = $"{detail} Startup: {(startupRegistered ? "aktif" : "belum terdaftar")}. Watchdog: {(watchdogRunning ? "aktif" : "tidak terdeteksi")}. Lock mesin: {(singleBoothLockHeld ? "dipegang" : "tidak dipegang")}.";
        return new(mode, capability, startupRegistered, watchdogRunning, singleBoothLockHeld, activeBooth, label, detail);
    }
}

public static class KioskConfigurationValidator
{
    public static void ValidateBinding(BoothBinding configured, BoothBinding detected)
    {
        ArgumentNullException.ThrowIfNull(configured);
        ArgumentNullException.ThrowIfNull(detected);
        if (!configured.Matches(detected))
            throw new ConfigurationException("Booth binding mismatch. This PC is already assigned to another booth.");
    }
}
