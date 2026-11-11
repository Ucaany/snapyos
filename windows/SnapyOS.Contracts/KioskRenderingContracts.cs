using System.ComponentModel.DataAnnotations;

namespace SnapyOS.Contracts;

public sealed record KioskSafeArea(
    [property: Range(0, 10000)] int Left,
    [property: Range(0, 10000)] int Top,
    [property: Range(0, 10000)] int Right,
    [property: Range(0, 10000)] int Bottom)
{
    public static KioskSafeArea Default => new(32, 32, 32, 32);
}

public sealed record KioskScreenLayout(
    KioskLayoutKind Kind,
    [property: Range(1, 10000)] int CanvasWidth,
    [property: Range(1, 10000)] int CanvasHeight,
    KioskSafeArea SafeArea,
    [property: Range(0.8, 1.4)] double FontScale,
    bool AllowScroll = true)
{
    public bool IsPortrait => CanvasHeight > CanvasWidth;
}

public sealed record KioskScreenDescriptor(
    [property: Required] KioskScreenId Screen,
    [property: Required, StringLength(80)] string Label,
    [property: Required, StringLength(160)] string Purpose,
    KioskScreenLayout Portrait,
    KioskScreenLayout Landscape,
    bool IsCustomerVisible = true,
    bool IsStudioVisible = true)
{
    public KioskScreenLayout For(KioskOrientation orientation) =>
        orientation == KioskOrientation.Portrait ? Portrait : Landscape;
}

public sealed record KioskRenderConfig(
    [property: Range(1, int.MaxValue)] int SchemaVersion,
    [property: Required] KioskScreenId Screen,
    [property: Required] KioskOrientation Orientation,
    [property: Required] KioskScreenLayout Layout,
    [property: Range(0.8, 1.4)] double FontScale,
    CameraCalibration? CameraCalibration,
    BrandTheme Theme,
    IReadOnlyList<CanvasElement> Elements,
    bool IsFallback = false)
{
    public static KioskRenderConfig Create(
        KioskScreenDescriptor descriptor,
        KioskOrientation orientation,
        BrandTheme theme,
        CameraCalibration? calibration = null,
        IReadOnlyList<CanvasElement>? elements = null) =>
        new(
            ContractSchema.CurrentVersion,
            descriptor.Screen,
            orientation,
            descriptor.For(orientation),
            descriptor.For(orientation).FontScale,
            calibration,
            theme,
            elements ?? [],
            false);
}

public sealed record KioskRenderRequest(
    KioskRenderConfig Config,
    KioskScreenState State = KioskScreenState.Ready,
    string? Message = null,
    bool IsPreview = false);
