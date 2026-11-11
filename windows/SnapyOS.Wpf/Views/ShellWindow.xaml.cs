using System.Windows;
using SnapyOS.Wpf.Kiosk;
using SnapyOS.Wpf.ViewModels;

namespace SnapyOS.Wpf.Views;

public partial class ShellWindow : Window
{
    private bool _allowClose;

    public ShellWindow(ShellViewModel viewModel, KioskScreenRegistry registry, IKioskScreenRenderer renderer)
    {
        InitializeComponent();
        KioskStudioHost.Content = new KioskStudioPreview(registry, renderer);
        DataContext = viewModel;
        viewModel.PinClearRequested += ClearAdminPin;
    }

    private void ClearAdminPin()
    {
        AdminPinBox.Clear();
        AdminPinBox.Focus();
    }

    private void AdminPinBox_OnPasswordChanged(object sender, System.Windows.RoutedEventArgs e)
    {
        if (DataContext is ShellViewModel viewModel && sender is System.Windows.Controls.PasswordBox passwordBox)
            viewModel.AdminPin = passwordBox.Password;
    }

    public void AllowClose() => _allowClose = true;

    private void ShellWindow_OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (!_allowClose)
        {
            e.Cancel = true;
            return;
        }
        if (DataContext is not ShellViewModel viewModel || !viewModel.HasUnsavedChanges) return;
        var result = MessageBox.Show(
            "Perubahan belum disimpan. Simpan sebelum keluar?",
            "SnapyOS Control Center",
            MessageBoxButton.YesNoCancel,
            MessageBoxImage.Warning);
        e.Cancel = result == MessageBoxResult.Cancel ||
                   (result == MessageBoxResult.Yes && !viewModel.ConfirmClose(SnapyOS.Wpf.Services.UnsavedChoice.Save));
        if (result == MessageBoxResult.No) e.Cancel = !viewModel.ConfirmClose(SnapyOS.Wpf.Services.UnsavedChoice.Discard);
    }
}
