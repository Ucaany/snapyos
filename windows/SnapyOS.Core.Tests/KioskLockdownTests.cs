using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class KioskLockdownTests
{
    [Fact]
    public void Unsupported_edition_uses_application_fallback()
    {
        var capability = new KioskCapability(OsKioskCapability.UnsupportedEdition, "Core", new(10, 0), false);
        var status = KioskLockdownPlanner.CreateStatus(capability, true, false, false, true, null);
        Assert.Equal(KioskLockdownMode.ApplicationFallback, status.Mode);
        Assert.DoesNotContain("OS AKTIF", status.Label);
    }

    [Fact]
    public void Active_supported_policy_is_full_os_configured()
    {
        var capability = new KioskCapability(OsKioskCapability.Configured, "Enterprise", new(10, 0), true);
        var status = KioskLockdownPlanner.CreateStatus(capability, true, true, true, true, null);
        Assert.Equal(KioskLockdownMode.FullOsConfigured, status.Mode);
    }

    [Fact]
    public void Booth_binding_rejects_another_booth()
    {
        var configured = new BoothBinding("device-a", "business", "booth-a");
        var detected = new BoothBinding("device-b", "business", "booth-b");
        Assert.Throws<ConfigurationException>(() => KioskConfigurationValidator.ValidateBinding(configured, detected));
    }
}
