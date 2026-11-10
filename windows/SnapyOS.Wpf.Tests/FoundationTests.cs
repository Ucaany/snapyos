using Microsoft.Extensions.DependencyInjection;
using SnapyOS.Wpf.Composition;
using SnapyOS.Wpf.Kiosk;
using SnapyOS.Wpf.Mvvm;
using SnapyOS.Wpf.Views;
using Xunit;

namespace SnapyOS.Wpf.Tests;

public sealed class FoundationTests
{
    [Fact]
    public void ServiceRegistration_adds_shell_window()
    {
        var services = new ServiceCollection();
        ServiceRegistration.AddFoundation(services);

        // Windows require an STA thread to construct, so assert the DI contract instead of instantiating UI.
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ShellWindow));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(KioskWindow));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(KioskFlowViewModel));
    }

    [Fact]
    public void ObservableObject_notifies_only_when_value_changes()
    {
        var model = new SampleModel();
        var notifications = 0;
        model.PropertyChanged += (_, _) => notifications++;

        model.Value = 1;
        model.Value = 1;
        model.Value = 2;

        Assert.Equal(2, notifications);
    }

    private sealed class SampleModel : ObservableObject
    {
        private int _value;
        public int Value
        {
            get => _value;
            set => SetProperty(ref _value, value);
        }
    }
}
