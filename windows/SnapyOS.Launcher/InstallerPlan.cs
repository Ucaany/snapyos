namespace SnapyOS.Launcher;

public enum InstallerRegistrationMode
{
    InteractiveStartup,
    WindowsService
}

public sealed record InstallerPlan(
    string Version,
    string Architecture,
    string MinimumWindowsVersion,
    InstallerRegistrationMode RegistrationMode,
    bool ServiceAwareExecutable,
    bool RemoveMedia,
    bool ConfirmRemoveMedia)
{
    public void Validate(Version hostWindowsVersion, bool is64BitOperatingSystem)
    {
        if (string.IsNullOrWhiteSpace(Version)) throw new InvalidDataException("Installer version is required.");
        if (!string.Equals(Architecture, "x64", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Only x64 installers are supported.");
        if (!is64BitOperatingSystem) throw new InvalidDataException("A 64-bit Windows host is required.");
        if (!System.Version.TryParse(MinimumWindowsVersion, out var minimum) || hostWindowsVersion < minimum)
            throw new InvalidDataException("Windows version is below the installer minimum.");
        if (RegistrationMode == InstallerRegistrationMode.WindowsService && !ServiceAwareExecutable)
            throw new InvalidDataException("A Windows Service must use a service-aware executable.");
        if (RemoveMedia && !ConfirmRemoveMedia)
            throw new InvalidDataException("Media deletion requires explicit confirmation.");
    }
}
