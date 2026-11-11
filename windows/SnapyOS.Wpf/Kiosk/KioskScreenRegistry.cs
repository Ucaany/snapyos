using SnapyOS.Contracts;

namespace SnapyOS.Wpf.Kiosk;

public sealed class KioskScreenRegistry
{
    private static readonly IReadOnlyList<KioskScreenDescriptor> Definitions =
    [
        Define(KioskScreenId.Welcome, "Welcome", "Customer starts a new photo session.", KioskLayoutKind.Center),
        Define(KioskScreenId.Guide, "Guide", "Customer instructions before package selection.", KioskLayoutKind.Split),
        Define(KioskScreenId.Package, "Package", "Customer selects an available package.", KioskLayoutKind.Grid),
        Define(KioskScreenId.Payment, "Payment", "Customer completes an online or operator-authorized payment.", KioskLayoutKind.Split),
        Define(KioskScreenId.Template, "Template", "Customer selects a frame or template.", KioskLayoutKind.Grid),
        Define(KioskScreenId.Capture, "Capture", "Customer takes photos through the configured camera.", KioskLayoutKind.Camera),
        Define(KioskScreenId.Review, "Review", "Customer reviews captures and chooses retake or continue.", KioskLayoutKind.Review),
        Define(KioskScreenId.Editor, "Editor", "Customer adjusts the captured photos before finalization.", KioskLayoutKind.Editor),
        Define(KioskScreenId.Printing, "Printing", "Customer sees print submission progress and recovery options.", KioskLayoutKind.Progress),
        Define(KioskScreenId.Result, "Result", "Customer receives the final digital or printed result.", KioskLayoutKind.Result),
        Define(KioskScreenId.Offline, "Offline", "Customer sees honest local-output and synchronization status.", KioskLayoutKind.Status),
        Define(KioskScreenId.Error, "Error", "Customer receives a recoverable, actionable runtime error.", KioskLayoutKind.Status),
        Define(KioskScreenId.Maintenance, "Maintenance", "Customer sees that the booth is temporarily unavailable.", KioskLayoutKind.Status)
    ];

    private readonly IReadOnlyDictionary<KioskScreenId, KioskScreenDescriptor> _byScreen =
        Definitions.ToDictionary(item => item.Screen);

    public IReadOnlyList<KioskScreenDescriptor> Screens => Definitions;

    public IReadOnlyList<KioskScreenDescriptor> CustomerScreens =>
        Definitions.Where(item => item.IsCustomerVisible).ToArray();

    public IReadOnlyList<KioskScreenDescriptor> StudioScreens =>
        Definitions.Where(item => item.IsStudioVisible).ToArray();

    public KioskScreenDescriptor Get(KioskScreenId screen) =>
        _byScreen.TryGetValue(screen, out var descriptor)
            ? descriptor
            : throw new KeyNotFoundException($"Unknown kiosk screen: {screen}.");

    public KioskRenderConfig Resolve(
        KioskScreenId screen,
        KioskOrientation orientation,
        BrandTheme theme,
        CameraCalibration? calibration = null,
        IReadOnlyList<CanvasElement>? elements = null)
    {
        var descriptor = Get(screen);
        return KioskRenderConfig.Create(descriptor, orientation, theme, calibration, elements);
    }

    public KioskRenderConfig ResolveFallback(
        KioskScreenId screen,
        KioskOrientation orientation,
        BrandTheme theme) =>
        Resolve(screen, orientation, theme) with { IsFallback = true };

    private static KioskScreenDescriptor Define(
        KioskScreenId screen,
        string label,
        string purpose,
        KioskLayoutKind kind) =>
        new(
            screen,
            label,
            purpose,
            new(kind, 1080, 1920, KioskSafeArea.Default, 1),
            new(kind, 1920, 1080, KioskSafeArea.Default, 1),
            IsCustomerVisible: true,
            IsStudioVisible: true);
}
