using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SnapyOS.Wpf.Composition;

namespace SnapyOS.Wpf;

public partial class App : Application
{
    private readonly IHost _host;

    public App()
    {
        _host = Host.CreateDefaultBuilder()
            .ConfigureLogging(logging => logging.ClearProviders())
            .ConfigureServices(services => ServiceRegistration.AddFoundation(services))
            .Build();
    }

    protected override async void OnStartup(StartupEventArgs e)
    {
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        await _host.StartAsync();
        _ = _host.Services.GetRequiredService<Platform.IBoothInstanceGuard>();

        var security = _host.Services.GetRequiredService<SnapyOS.Security.PinSecurityService>();
        if (security.IsFirstSetupRequired)
        {
            var setup = new Views.PinSetupWindow(security);
            setup.ShowDialog();
            if (!setup.Completed) { _host.StopAsync().GetAwaiter().GetResult(); Shutdown(); return; }
        }

        var window = _host.Services.GetRequiredService<Kiosk.KioskWindow>();
        MainWindow = window;
        window.Show();
        base.OnStartup(e);
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        _host.Services.GetService<Kiosk.KioskWindow>()?.AllowClose();
        _host.Services.GetService<Views.ShellWindow>()?.AllowClose();
        await _host.StopAsync();
        _host.Dispose();
        base.OnExit(e);
    }
}
