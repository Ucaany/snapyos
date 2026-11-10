using SnapyOS.Contracts;
using SnapyOS.Wpf.Kiosk;
using Xunit;

namespace SnapyOS.Wpf.Tests;

public sealed class KioskScreenRegistryTests
{
    [Fact]
    public void Registry_exposes_customer_screens_and_shared_orientation_configs()
    {
        var registry = new KioskScreenRegistry();
        var expected = Enum.GetValues<KioskScreenId>();
        var theme = new BrandTheme { BrandName = "Snapy", BackgroundColor = "#FFFDF5", TextColor = "#111111" };

        Assert.Equal(expected.Length, registry.CustomerScreens.Count);
        Assert.Equal(expected.Length, registry.StudioScreens.Count);
        Assert.True(registry.ResolveFallback(KioskScreenId.Error, KioskOrientation.Landscape, theme).IsFallback);
        Assert.All(expected, screen =>
        {
            var descriptor = registry.Get(screen);
            var portrait = registry.Resolve(screen, KioskOrientation.Portrait, theme);
            var landscape = registry.Resolve(screen, KioskOrientation.Landscape, theme);
            Assert.Equal(screen, portrait.Screen);
            Assert.True(portrait.Layout.IsPortrait);
            Assert.False(landscape.Layout.IsPortrait);
            Assert.Equal(descriptor.For(KioskOrientation.Portrait).SafeArea, portrait.Layout.SafeArea);
        });
    }

    [Fact]
    public void Technical_setup_screens_are_not_in_customer_registry()
    {
        var registry = new KioskScreenRegistry();

        Assert.DoesNotContain(registry.Screens, screen => screen.Label is "Activation" or "Setup" or "Control Center");
    }
}
