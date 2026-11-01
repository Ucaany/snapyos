using Microsoft.Extensions.DependencyInjection;
using SnapyOS.Wpf.Views;

namespace SnapyOS.Wpf.Composition;

public static class ServiceRegistration
{
    public static IServiceCollection AddFoundation(IServiceCollection services)
    {
        services.AddSingleton<ShellWindow>();
        return services;
    }
}
