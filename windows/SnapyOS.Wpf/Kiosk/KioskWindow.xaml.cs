using System.Windows;
using SnapyOS.Wpf.Security;
using SnapyOS.Wpf.Views;

namespace SnapyOS.Wpf.Kiosk;

public partial class KioskWindow : Window
{
    private readonly KioskFlowViewModel _viewModel;
    private readonly IKioskExitPinGuard _pinGuard;
    private readonly ShellWindow _shell;
    private bool _allowClose;

    public KioskWindow(KioskFlowViewModel viewModel, KioskRuntimeHost runtime, IKioskExitPinGuard pinGuard, ShellWindow shell)
    {
        InitializeComponent();
        _viewModel = viewModel;
        _pinGuard = pinGuard;
        _shell = shell;
        RuntimeHost.Content = runtime;
        DataContext = viewModel;
        Loaded += (_, _) => Focus();
        Activated += (_, _) => RestoreKioskFocus();
        Deactivated += (_, _) => Dispatcher.BeginInvoke(RestoreKioskFocus);
        Closing += (_, e) => e.Cancel = !_allowClose;
    }

    private void Operator_OnClick(object sender, RoutedEventArgs e)
    {
        OperatorError.Text = string.Empty;
        OperatorPin.Clear();
        OperatorPrompt.Visibility = Visibility.Visible;
        OperatorPin.Focus();
    }

    private void CancelOperator_OnClick(object sender, RoutedEventArgs e) => OperatorPrompt.Visibility = Visibility.Collapsed;

    private void VerifyOperator_OnClick(object sender, RoutedEventArgs e)
    {
        var result = _pinGuard.Verify(OperatorPin.Password, out var retryAfter);
        // No PIN has ever been set: there is no lock to enforce, so never trap the operator.
        if (result is AdminPinResult.Success or AdminPinResult.NotConfigured)
        {
            OpenMaintenance();
            return;
        }
        OperatorError.Text = result switch
        {
            AdminPinResult.LockedOut => $"PIN terkunci. Coba lagi dalam {retryAfter?.Minutes ?? 0} menit.",
            _ => "PIN petugas tidak valid."
        };
    }

    private void OpenMaintenance()
    {
        _shell.Show();
        Application.Current.MainWindow = _shell;
        Hide();
    }

    public void AllowClose() => _allowClose = true;

    private void RestoreKioskFocus()
    {
        if (!IsVisible) return;
        Topmost = false;
        Topmost = true;
        Activate();
        Focus();
    }

    protected override async void OnClosed(EventArgs e)
    {
        if (Application.Current.ShutdownMode == ShutdownMode.OnExplicitShutdown)
            await _viewModel.DisposeAsync();
        base.OnClosed(e);
    }
}
