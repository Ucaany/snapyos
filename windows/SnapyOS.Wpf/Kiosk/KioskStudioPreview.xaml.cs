using System.Windows;
using System.Windows.Controls;
using SnapyOS.Contracts;

namespace SnapyOS.Wpf.Kiosk;

public partial class KioskStudioPreview : UserControl
{
    private readonly KioskScreenRegistry _registry;
    private readonly IKioskScreenRenderer _renderer;
    private KioskOrientation _orientation = KioskOrientation.Landscape;
    private readonly BrandTheme _theme = new()
    {
        BrandName = "SNAPYOS",
        BackgroundColor = "#FFFDF5",
        TextColor = "#111111",
        FontScale = 1
    };

    public KioskStudioPreview(KioskScreenRegistry registry, IKioskScreenRenderer renderer)
    {
        _registry = registry;
        _renderer = renderer;
        InitializeComponent();
        ScreenList.ItemsSource = registry.StudioScreens;
        StateSelector.ItemsSource = Enum.GetValues<KioskScreenState>();
        StateSelector.SelectedItem = KioskScreenState.Ready;
        ScreenList.SelectedIndex = 0;
    }

    private void Portrait_OnClick(object sender, RoutedEventArgs e)
    {
        _orientation = KioskOrientation.Portrait;
        RenderSelected();
    }

    private void Landscape_OnClick(object sender, RoutedEventArgs e)
    {
        _orientation = KioskOrientation.Landscape;
        RenderSelected();
    }

    private void ScreenList_OnSelectionChanged(object sender, SelectionChangedEventArgs e) => RenderSelected();

    private void StateSelector_OnSelectionChanged(object sender, SelectionChangedEventArgs e) => RenderSelected();

    private void RenderSelected()
    {
        if (ScreenList.SelectedItem is not KioskScreenDescriptor descriptor) return;
        var config = _registry.Resolve(descriptor.Screen, _orientation, _theme, new CameraCalibration
        {
            RotationDegrees = 0,
            Zoom = 1,
            HorizontalOffset = 0,
            VerticalOffset = 0,
            CalibratedAt = DateTimeOffset.UtcNow
        });
        var state = StateSelector.SelectedItem is KioskScreenState selected
            ? selected
            : KioskScreenState.Ready;
        PreviewHost.Content = _renderer.Render(new KioskRenderRequest(config, state, IsPreview: true));
    }
}
