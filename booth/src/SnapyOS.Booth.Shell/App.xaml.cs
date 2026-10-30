using System.Threading;
using Microsoft.UI.Xaml;

namespace SnapyOS.Booth.Shell;

/// <summary>
/// Titik masuk aplikasi kiosk. Menjalankan server bridge in-process, lalu
/// membuka jendela WebView2 yang memuat UI React lokal (<c>https://snapyos.app/</c>).
///
/// Single-instance: instance kedua tidak boleh membuka jendela baru maupun
/// mencoba bind port 17777 lagi (bind kedua gagal → kiosk tampak mati). Ia
/// memberi sinyal ke instance pertama lalu keluar.
///
/// Mutex memakai prefiks <c>Local\</c>, bukan <c>Global\</c>: mutex global
/// butuh <c>SeCreateGlobalPrivilege</c> yang tidak dimiliki user booth biasa.
/// Cakupan per-sesi sudah cukup — booth dijalankan satu user di satu sesi.
/// </summary>
public partial class App : Application
{
    private const string MutexName = @"Local\SnapyOS.Booth";
    private const string ActivateEventName = @"Local\SnapyOS.Booth.Activate";

    // Static: mutex yang di-GC bisa dilepas sebelum proses selesai, dan instance
    // kedua akan mengira dirinya yang pertama.
    private static Mutex? s_mutex;
    private static EventWaitHandle? s_activateSignal;
    private static RegisteredWaitHandle? s_activationWait;

    private MainWindow? _window;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        s_mutex = new Mutex(initiallyOwned: true, MutexName, out var isFirstInstance);
        if (!isFirstInstance)
        {
            SignalFirstInstance();
            s_mutex.Dispose();
            s_mutex = null;
            Exit();
            return;
        }

        s_activateSignal = new EventWaitHandle(
            initialState: false,
            EventResetMode.AutoReset,
            ActivateEventName);

        s_activationWait = ThreadPool.RegisterWaitForSingleObject(
            s_activateSignal,
            static (_, _) =>
            {
                if (Current is App app)
                {
                    app.RestoreWindow();
                }
            },
            state: null,
            Timeout.Infinite,
            executeOnlyOnce: false);

        _window = new MainWindow();
        _window.Activate();
    }

    private void RestoreWindow()
    {
        var window = _window;
        if (window is null)
        {
            return;
        }
        window.DispatcherQueue.TryEnqueue(window.Restore);
    }

    /// <summary>Instance kedua: minta instance pertama menampilkan jendelanya.</summary>
    private static void SignalFirstInstance()
    {
        try
        {
            if (EventWaitHandle.TryOpenExisting(ActivateEventName, out var handle))
            {
                using (handle)
                {
                    handle.Set();
                }
            }
        }
        catch (Exception)
        {
            // Instance pertama mungkin sedang mati. Tidak ada yang bisa dilakukan
            // dari sini; keluar diam-diam lebih baik daripada crash.
        }
    }
}
