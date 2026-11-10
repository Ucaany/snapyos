using System.Windows;
using System.Windows.Controls;
using System.Windows.Automation;
using SnapyOS.Contracts;

namespace SnapyOS.Wpf.Kiosk;

public sealed class KioskRuntimeHost : ContentControl
{
    private readonly KioskScreenRegistry _registry;
    private readonly IKioskScreenRenderer _renderer;

    public KioskRuntimeHost(KioskScreenRegistry registry, IKioskScreenRenderer renderer)
    {
        _registry = registry;
        _renderer = renderer;
        Focusable = true;
        AutomationProperties.SetName(this, "Runtime kiosk customer");
    }

    public void Show(
        KioskScreenId screen,
        KioskOrientation orientation,
        BrandTheme theme,
        KioskScreenState state = KioskScreenState.Ready,
        string? message = null,
        CameraCalibration? calibration = null,
        IReadOnlyList<CanvasElement>? elements = null)
    {
        var config = _registry.Resolve(screen, orientation, theme, calibration, elements);
        Content = _renderer.Render(new KioskRenderRequest(config, state, message));
    }
}
