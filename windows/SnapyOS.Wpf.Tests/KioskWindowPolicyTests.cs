using SnapyOS.Wpf.Kiosk;
using Xunit;

namespace SnapyOS.Wpf.Tests;

public sealed class KioskWindowPolicyTests
{
    [Fact]
    public void Fallback_policy_is_fullscreen_topmost_and_non_resizable()
    {
        var policy = KioskWindowPolicy.ApplicationFallback;
        Assert.True(policy.Fullscreen);
        Assert.True(policy.Topmost);
        Assert.True(policy.NoResize);
        Assert.True(policy.HideFromTaskbar);
        Assert.True(policy.BlockNormalClose);
    }

    [Fact]
    public void Invalid_close_attempt_is_ignored()
    {
        Assert.Equal(KioskInputAction.Ignore, KioskInputPolicy.OnCloseAttempt(false));
        Assert.Equal(KioskInputAction.OpenMaintenance, KioskInputPolicy.OnCloseAttempt(true));
        Assert.Equal(KioskInputAction.RestoreFocus, KioskInputPolicy.OnDeactivated());
    }
}
