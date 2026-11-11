using SnapyOS.Contracts;
using SnapyOS.Wpf.Kiosk;
using Xunit;

namespace SnapyOS.Wpf.Tests;

public sealed class KioskFlowTests
{
    [Fact]
    public void Customer_stage_map_excludes_technical_surfaces()
    {
        var screens = Enum.GetValues<CustomerKioskStage>().Select(CustomerKioskStageMap.ToScreen).ToArray();
        Assert.DoesNotContain(screens, screen => screen.ToString() is "Activation" or "Setup");
        Assert.Equal(Enum.GetValues<CustomerKioskStage>().Length, screens.Distinct().Count());
    }

    [Theory]
    [InlineData(CustomerKioskStage.Welcome, KioskScreenId.Welcome)]
    [InlineData(CustomerKioskStage.Payment, KioskScreenId.Payment)]
    [InlineData(CustomerKioskStage.Capture, KioskScreenId.Capture)]
    [InlineData(CustomerKioskStage.Result, KioskScreenId.Result)]
    [InlineData(CustomerKioskStage.Offline, KioskScreenId.Offline)]
    public void Customer_stage_maps_to_customer_screen(CustomerKioskStage stage, KioskScreenId expected) =>
        Assert.Equal(expected, CustomerKioskStageMap.ToScreen(stage));
}
