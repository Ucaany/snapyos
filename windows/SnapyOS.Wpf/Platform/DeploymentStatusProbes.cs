using System.Diagnostics;
using System.IO;

namespace SnapyOS.Wpf.Platform;

public interface IStartupStatusProbe
{
    bool IsRegistered(string taskName);
}

public interface IWatchdogStatusProbe
{
    bool IsRunning();
}

public sealed class WindowsStartupStatusProbe : IStartupStatusProbe
{
    public bool IsRegistered(string taskName)
    {
        if (!OperatingSystem.IsWindows() || string.IsNullOrWhiteSpace(taskName)) return false;
        var taskPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "Tasks", taskName);
        return File.Exists(taskPath);
    }
}

public sealed class WindowsWatchdogStatusProbe : IWatchdogStatusProbe
{
    public bool IsRunning() => OperatingSystem.IsWindows() && Process.GetProcessesByName("SnapyOS.Launcher").Length > 0;
}
