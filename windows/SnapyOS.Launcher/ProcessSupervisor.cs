using System.Diagnostics;
using System.Text.Json;

namespace SnapyOS.Launcher;

public sealed record KioskLaunchManifest(
    string ExecutablePath,
    string? LauncherPath = null,
    string? Arguments = null,
    string StartupTaskName = "SnapyOS Kiosk",
    int MaxRelaunches = 5,
    int RelaunchDelaySeconds = 2,
    string PolicyMode = "detect");

public interface IChildProcess : IAsyncDisposable
{
    int? ExitCode { get; }
    Task WaitForExitAsync(CancellationToken cancellationToken);
}

public interface IChildProcessFactory
{
    IChildProcess Start(KioskLaunchManifest manifest);
}

public sealed class ProcessChildFactory : IChildProcessFactory
{
    public IChildProcess Start(KioskLaunchManifest manifest)
    {
        var process = Process.Start(new ProcessStartInfo
        {
            FileName = manifest.ExecutablePath,
            Arguments = manifest.Arguments ?? string.Empty,
            UseShellExecute = false,
            WorkingDirectory = Path.GetDirectoryName(manifest.ExecutablePath) ?? Environment.CurrentDirectory
        }) ?? throw new InvalidOperationException("Kiosk process could not be started.");
        return new ProcessChild(process);
    }

    private sealed class ProcessChild(Process process) : IChildProcess
    {
        public int? ExitCode => process.HasExited ? process.ExitCode : null;
        public Task WaitForExitAsync(CancellationToken cancellationToken) => process.WaitForExitAsync(cancellationToken);
        public ValueTask DisposeAsync()
        {
            process.Dispose();
            return ValueTask.CompletedTask;
        }
    }
}

public sealed class KioskProcessSupervisor(IChildProcessFactory factory)
{
    public async Task<int> RunAsync(KioskLaunchManifest manifest, CancellationToken cancellationToken = default)
    {
        Validate(manifest);
        var relaunches = 0;
        while (true)
        {
            await using var child = factory.Start(manifest);
            await child.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            var exitCode = child.ExitCode ?? -1;
            if (exitCode == 0 || relaunches >= manifest.MaxRelaunches) return exitCode;
            relaunches++;
            await Task.Delay(TimeSpan.FromSeconds(manifest.RelaunchDelaySeconds), cancellationToken).ConfigureAwait(false);
        }
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static KioskLaunchManifest LoadManifest(string json)
    {
        var manifest = JsonSerializer.Deserialize<KioskLaunchManifest>(json, Json)
                       ?? throw new InvalidDataException("Kiosk deployment manifest is empty.");
        Validate(manifest);
        return manifest;
    }

    public static void Validate(KioskLaunchManifest manifest)
    {
        if (string.IsNullOrWhiteSpace(manifest.ExecutablePath)) throw new InvalidDataException("Kiosk executable path is required.");
        if (Path.IsPathRooted(manifest.ExecutablePath) && !OperatingSystem.IsWindows()) throw new InvalidDataException("Windows kiosk executable paths are only valid on Windows.");
        if (manifest.MaxRelaunches < 0 || manifest.MaxRelaunches > 20) throw new InvalidDataException("Max relaunches must be between 0 and 20.");
        if (manifest.RelaunchDelaySeconds is < 0 or > 300) throw new InvalidDataException("Relaunch delay must be between 0 and 300 seconds.");
        if (manifest.PolicyMode is not ("detect" or "application-fallback" or "full-os")) throw new InvalidDataException("Unknown kiosk policy mode.");
    }
}
