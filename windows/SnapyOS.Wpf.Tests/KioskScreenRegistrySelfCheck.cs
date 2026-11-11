using SnapyOS.Contracts;
using SnapyOS.Wpf.Kiosk;

var registry = new KioskScreenRegistry();
var theme = new BrandTheme { BrandName = "Snapy", BackgroundColor = "#FFFDF5", TextColor = "#111111" };
var expected = Enum.GetValues<KioskScreenId>();
if (registry.CustomerScreens.Count != expected.Length || registry.StudioScreens.Count != expected.Length)
    throw new InvalidOperationException("Registry screen visibility is incomplete.");
foreach (var screen in expected)
{
    var portrait = registry.Resolve(screen, KioskOrientation.Portrait, theme);
    var landscape = registry.Resolve(screen, KioskOrientation.Landscape, theme);
    if (!portrait.Layout.IsPortrait || landscape.Layout.IsPortrait)
        throw new InvalidOperationException($"Orientation contract failed for {screen}.");
}
if (!registry.ResolveFallback(KioskScreenId.Error, KioskOrientation.Landscape, theme).IsFallback)
    throw new InvalidOperationException("Fallback contract failed.");
Console.WriteLine("Kiosk screen registry self-check: PASS");
