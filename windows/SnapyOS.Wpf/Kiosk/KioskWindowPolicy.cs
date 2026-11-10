namespace SnapyOS.Wpf.Kiosk;

public sealed record KioskWindowPolicy(
    bool Fullscreen = true,
    bool Topmost = true,
    bool NoResize = true,
    bool HideFromTaskbar = true,
    bool BlockNormalClose = true)
{
    public static KioskWindowPolicy ApplicationFallback => new();
}

public enum KioskInputAction
{
    Ignore,
    RestoreFocus,
    OpenMaintenance
}

public static class KioskInputPolicy
{
    public static KioskInputAction OnCloseAttempt(bool validExitPin) =>
        validExitPin ? KioskInputAction.OpenMaintenance : KioskInputAction.Ignore;

    public static KioskInputAction OnDeactivated() => KioskInputAction.RestoreFocus;
}
