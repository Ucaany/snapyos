using Microsoft.UI.Xaml;

namespace SnapyOS.Booth.Shell;

/// <summary>
/// Titik masuk aplikasi kiosk. Menjalankan server bridge in-process, lalu
/// membuka jendela WebView2 yang memuat UI React lokal (<c>https://snapyos.app/</c>).
/// </summary>
public partial class App : Application
{
    private MainWindow? _window;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
    }
}
