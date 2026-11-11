namespace SnapyOS.Wpf.Platform;

public static class PlatformServices
{
    public static string ReadMachineId() => Environment.MachineName;

    public static IBoothInstanceGuard AcquireBooth(string deviceId) => new SingleBoothInstanceGuard(deviceId);
}
