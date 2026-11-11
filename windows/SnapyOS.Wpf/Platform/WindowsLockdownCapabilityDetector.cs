using Microsoft.Win32;
using SnapyOS.Core;

namespace SnapyOS.Wpf.Platform;

public interface ILockdownCapabilityDetector
{
    KioskCapability Detect(bool osPolicyActive = false);
}

public sealed class WindowsLockdownCapabilityDetector : ILockdownCapabilityDetector
{
    public KioskCapability Detect(bool osPolicyActive = false)
    {
        if (!OperatingSystem.IsWindows())
            return new(OsKioskCapability.Unknown, "Non-Windows", Environment.OSVersion.Version, false, "Windows policy probe is unavailable on this platform.");
        var edition = ReadEdition();
        var version = Environment.OSVersion.Version;
        var supported = edition.Contains("Enterprise", StringComparison.OrdinalIgnoreCase) ||
                        edition.Contains("Education", StringComparison.OrdinalIgnoreCase) ||
                        edition.Contains("IoT", StringComparison.OrdinalIgnoreCase);
        return new(
            osPolicyActive ? OsKioskCapability.Configured : supported ? OsKioskCapability.SupportedNotConfigured : OsKioskCapability.UnsupportedEdition,
            edition,
            version,
            IsElevated(),
            osPolicyActive ? "OS policy is reported active by deployment." : "Read-only capability probe; no policy was changed.");
    }

    private static string ReadEdition() =>
        Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion", "EditionID", null)?.ToString() ?? "Unknown";

    private static bool IsElevated() =>
        new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
}
