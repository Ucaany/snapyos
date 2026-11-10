using SnapyOS.Launcher;
using Xunit;

namespace SnapyOS.Launcher.Tests;

public sealed class ProcessSupervisorTests
{
    [Fact]
    public async Task Relaunches_crash_until_clean_exit()
    {
        var factory = new FakeFactory(1, 1, 0);
        var manifest = new KioskLaunchManifest("kiosk.exe", MaxRelaunches: 3);

        var result = await new KioskProcessSupervisor(factory).RunAsync(manifest);

        Assert.Equal(0, result);
        Assert.Equal(3, factory.Starts);
    }

    [Fact]
    public async Task Stops_after_relaunch_cap()
    {
        var factory = new FakeFactory(1, 1, 1);
        var result = await new KioskProcessSupervisor(factory).RunAsync(new("kiosk.exe", MaxRelaunches: 2));
        Assert.Equal(1, result);
        Assert.Equal(3, factory.Starts);
    }

    [Fact]
    public async Task Clean_exit_does_not_relaunch()
    {
        var factory = new FakeFactory(0);
        var result = await new KioskProcessSupervisor(factory).RunAsync(new("kiosk.exe"));
        Assert.Equal(0, result);
        Assert.Equal(1, factory.Starts);
    }

    [Fact]
    public void Manifest_rejects_unknown_policy()
    {
        Assert.Throws<InvalidDataException>(() => KioskProcessSupervisor.Validate(new("kiosk.exe", PolicyMode: "full-os-pretend")));
    }

    [Fact]
    public void Installer_plan_rejects_non_service_executable()
    {
        var plan = new InstallerPlan("1.0.0", "x64", "10.0.10240", InstallerRegistrationMode.WindowsService, false, false, false);
        Assert.Throws<InvalidDataException>(() => plan.Validate(new Version(10, 0, 19045), true));
    }

    [Fact]
    public void Installer_plan_requires_media_confirmation()
    {
        var plan = new InstallerPlan("1.0.0", "x64", "10.0.10240", InstallerRegistrationMode.InteractiveStartup, false, true, false);
        Assert.Throws<InvalidDataException>(() => plan.Validate(new Version(10, 0, 19045), true));
    }

    [Fact]
    public void Installer_plan_accepts_interactive_x64_startup()
    {
        var plan = new InstallerPlan("1.0.0", "x64", "10.0.10240", InstallerRegistrationMode.InteractiveStartup, false, false, false);
        plan.Validate(new Version(10, 0, 19045), true);
    }

    private sealed class FakeFactory(params int[] exitCodes) : IChildProcessFactory
    {
        private readonly Queue<int> _exitCodes = new(exitCodes);
        public int Starts { get; private set; }
        public IChildProcess Start(KioskLaunchManifest manifest)
        {
            Starts++;
            return new FakeProcess(_exitCodes.Count > 0 ? _exitCodes.Dequeue() : 1);
        }
    }

    private sealed class FakeProcess(int exitCode) : IChildProcess
    {
        public int? ExitCode => exitCode;
        public Task WaitForExitAsync(CancellationToken cancellationToken) => Task.CompletedTask;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
