using SnapyOS.Wpf.ViewModels;

namespace SnapyOS.Wpf.Routes;

public sealed record RouteDescriptor(
    string Key,
    string Label,
    string Eyebrow,
    bool RequiresAdmin,
    bool IsPlaceholder,
    Func<ControlCenterPageViewModel> CreatePage);
