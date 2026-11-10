using SnapyOS.Wpf.Routes;
using SnapyOS.Wpf.Security;
using SnapyOS.Wpf.Services;
using SnapyOS.Wpf.ViewModels;
using Xunit;

namespace SnapyOS.Wpf.Tests;

public sealed class ShellViewModelTests
{
    [Fact]
    public void Registry_exposes_real_and_structural_routes()
    {
        var registry = new RouteRegistry();

        Assert.Contains(registry.Routes, route => route.Key == "overview" && !route.IsPlaceholder);
        Assert.Contains(registry.Routes, route => route.Key == "setup" && route.IsPlaceholder);
        Assert.Contains(registry.Routes, route => route.Key == "setup" && route.CreatePage().IsEditor && !route.IsPlaceholder);
        Assert.Contains(registry.Routes, route => route.Key == "camera" && route.IsPlaceholder);
        Assert.Contains(registry.Routes, route => route.Key == "printer" && route.IsPlaceholder);
        Assert.Contains(registry.Routes, route => route.Key == "installer" && route.IsPlaceholder);
    }

    [Fact]
    public void Admin_route_requires_valid_pin()
    {
        var viewModel = new ShellViewModel(new RouteRegistry(), new FakePinGuard("2468"));

        viewModel.Navigation.Single(item => item.Key == "camera").Command.Execute(null);

        Assert.True(viewModel.PinPromptVisible);
        Assert.Equal("Ringkasan", viewModel.CurrentPage.Label);

        viewModel.AdminPin = "2468";
        viewModel.ConfirmPinCommand.Execute(null);

        Assert.False(viewModel.PinPromptVisible);
        Assert.Equal("Kamera", viewModel.CurrentPage.Label);
    }

    [Fact]
    public void Unsaved_route_change_requires_discard_decision()
    {
        var viewModel = new ShellViewModel(new RouteRegistry(), new FakePinGuard("2468"));
        viewModel.CurrentPage.HasUnsavedChanges = true;

        viewModel.Navigation.Single(item => item.Key == "sessions").Command.Execute(null);

        Assert.True(viewModel.UnsavedPromptVisible);
        Assert.Equal("Ringkasan", viewModel.CurrentPage.Label);

        viewModel.DiscardChangesCommand.Execute(null);

        Assert.False(viewModel.UnsavedPromptVisible);
        Assert.Equal("Sesi lokal", viewModel.CurrentPage.Label);
    }

    [Fact]
    public void Connection_status_is_exposed()
    {
        var status = new FakeConnectionStatus(new(ConnectionState.Offline, "OFFLINE", "Jaringan tidak tersedia.", null));
        var viewModel = new ShellViewModel(new RouteRegistry(), new FakePinGuard("2468"), status);

        Assert.Equal("OFFLINE", viewModel.ConnectionLabel);
        Assert.Equal("Jaringan tidak tersedia.", viewModel.ConnectionDetail);
    }

    private sealed class FakePinGuard(string pin) : IAdminPinGuard
    {
        public bool IsConfigured => true;
        public AdminPinResult Verify(string candidate, out TimeSpan? retryAfter)
        {
            retryAfter = null;
            return candidate == pin ? AdminPinResult.Success : AdminPinResult.Invalid;
        }
    }

    private sealed class FakeConnectionStatus(ConnectionSnapshot snapshot) : IConnectionStatus
    {
        public ConnectionSnapshot Read() => snapshot;
    }
}
