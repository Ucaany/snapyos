using System;
using System.Windows;
using SnapyOS.Security;

namespace SnapyOS.Wpf.Views;

public partial class PinSetupWindow : Window
{
    private readonly PinSecurityService _security;
    private bool _completed;

    public PinSetupWindow(PinSecurityService security)
    {
        InitializeComponent();
        _security = security;
        Loaded += (_, _) => AdminPin.Focus();
    }

    public bool Completed => _completed;

    private void Save_OnClick(object sender, RoutedEventArgs e)
    {
        ErrorText.Text = string.Empty;
        try
        {
            _security.CompleteFirstSetup(AdminPin.Password, ExitPin.Password, EmergencyPin.Password);
        }
        catch (ArgumentException ex)
        {
            ErrorText.Text = ex.Message;
            return;
        }
        _completed = true;
        Close();
    }
}