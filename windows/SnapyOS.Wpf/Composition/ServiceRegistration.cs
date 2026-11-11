using System;
using System.IO;
using System.Net.Http;
using Microsoft.Extensions.DependencyInjection;
using SnapyOS.Agent;
using SnapyOS.Core;
using SnapyOS.LocalStore;
using SnapyOS.Printing;
using SnapyOS.Security;
using SnapyOS.Wpf.Kiosk;
using SnapyOS.Wpf.Platform;
using SnapyOS.Wpf.Routes;
using SnapyOS.Wpf.Security;
using SnapyOS.Wpf.Services;
using SnapyOS.Wpf.ViewModels;
using SnapyOS.Wpf.Views;

namespace SnapyOS.Wpf.Composition;

public static class ServiceRegistration
{
    public static IServiceCollection AddFoundation(IServiceCollection services)
    {
        var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SnapyOS");
        var storeOptions = LocalStoreOptions.ForDirectory(appData);
        services.AddSingleton(storeOptions);
        services.AddSingleton<SnapyOS.LocalStore.LocalStore>();
        services.AddSingleton<ConfigurationRepository>();
        services.AddSingleton<ConfigurationBundleService>();
        services.AddSingleton<ConfigurationBundleRepository>(services => new ConfigurationBundleRepository(
            services.GetRequiredService<SnapyOS.LocalStore.LocalStore>(),
            services.GetRequiredService<ConfigurationBundleService>(),
            Path.Combine(appData, "configuration")));
        services.AddSingleton<IProtectedSecretStore>(_ => new DpapiSecretStore(Path.Combine(appData, "secrets")));
        services.AddSingleton<PinSecurityService>();
        services.AddSingleton<IAdminPinGuard, PinServiceAdminPinGuard>();
        services.AddSingleton<IKioskExitPinGuard, PinServiceKioskExitPinGuard>();
        services.AddSingleton<ILockdownCapabilityDetector, WindowsLockdownCapabilityDetector>();
        services.AddSingleton<IStartupStatusProbe, WindowsStartupStatusProbe>();
        services.AddSingleton<IWatchdogStatusProbe, WindowsWatchdogStatusProbe>();
        services.AddSingleton<IBoothInstanceGuard>(_ => PlatformServices.AcquireBooth(PlatformServices.ReadMachineId()));
        services.AddSingleton<IKioskStatusService, KioskStatusService>();
        services.AddSingleton<IDeviceTokenStore>(_ => new DpapiDeviceTokenStore(Path.Combine(appData, "device")));
        services.AddSingleton(_ => new HttpClient { BaseAddress = new Uri("http://127.0.0.1") });
        services.AddSingleton<PairingClient>();
        services.AddSingleton<IConnectionStatus, PairingConnectionStatus>();
        services.AddSingleton<ILocalPaymentStore, PaymentQueueRepository>();
        services.AddSingleton<CloudPaymentClient>();
        services.AddSingleton<LocalSessionRepository>();
        services.AddSingleton<LocalMediaPipeline>();
        services.AddSingleton<LocalGifRenderer>();
        services.AddSingleton<ResultManifestRepository>();
        services.AddSingleton<LocalOutputSyncQueue>(provider => new LocalOutputSyncQueue(
            provider.GetRequiredService<SnapyOS.LocalStore.LocalStore>(),
            provider.GetRequiredService<ResultManifestRepository>(),
            () => "unconfigured-device"));
        services.AddSingleton<IOutputSyncStore>(provider => provider.GetRequiredService<LocalOutputSyncQueue>());
        services.AddSingleton<IOutputSyncPublisher>(provider => new ResultSyncClient(new HttpClient { BaseAddress = new Uri(Environment.GetEnvironmentVariable("SNAPYOS_CLOUD_URL") ?? "http://127.0.0.1") }));
        services.AddSingleton<ResultSyncWorker>(provider => new ResultSyncWorker(
            provider.GetRequiredService<IOutputSyncStore>(),
            provider.GetRequiredService<IOutputSyncPublisher>(),
            () => provider.GetRequiredService<IDeviceTokenStore>().Read(),
            new DriveSpaceGuard(256L * 1024 * 1024)));
        services.AddHostedService<OutputSyncHostedService>();
        services.AddSingleton<IWindowsUvcBackend, NativeUvcCameraBackend>();
        services.AddSingleton<IUvcCamera>(services => new WindowsUvcCameraAdapter(
            services.GetRequiredService<IWindowsUvcBackend>(),
            new UvcDeviceDescriptor("unavailable", "Kamera Windows", "", "", "", "", [], [])));
        services.AddSingleton<IWindowsPrintSpooler, NativeWindowsPrintSpooler>();
        services.AddSingleton<WindowsPrintSpoolerAdapter>();
        services.AddSingleton<RouteRegistry>();
        services.AddSingleton<KioskScreenRegistry>();
        services.AddSingleton<IKioskScreenRenderer, KioskScreenRenderer>();
        services.AddSingleton<KioskRuntimeHost>();
        services.AddSingleton<KioskFlowViewModel>();
        services.AddSingleton<KioskWindow>();
        services.AddSingleton<ShellViewModel>();
        services.AddSingleton<ShellWindow>();
        return services;
    }
}
