using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.Web.WebView2.Core;
using SnapyOS.Booth.Bridge;
using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Hardware;

namespace SnapyOS.Booth.Shell;

/// <summary>
/// Jendela kiosk: WebView2 fullscreen tanpa dekorasi, memuat UI React yang
/// di-bundle lokal. Server bridge berjalan in-process; WebView2 memanggilnya
/// lewat <c>http://127.0.0.1:&lt;port&gt;</c> dengan header <c>X-Bridge-Token</c>.
///
/// Jendela terkunci selama <see cref="_locked"/>: tombol tutup, Alt+F4, dan
/// Ctrl+W semuanya lewat <c>AppWindow.Closing</c>, jadi satu penjaga menutup
/// semua jalur. Kunci hanya dibuka oleh <c>POST /v1/exit</c> yang mengembalikan
/// 200 — bukan oleh polling dan bukan oleh UI.
/// </summary>
public sealed partial class MainWindow : Window
{
    // Akar virtual WebView2 untuk UI lokal. UI tidak memuat halaman cloud:
    // kustomisasi dan kiosk hidup di dalam aplikasi (1 pairing = 1 booth).
    private const string UiHost = "snapyos.app";
    private const string UiOrigin = "https://snapyos.app";

    private readonly BoothLog _log;
    private readonly BridgeServer? _bridge;
    private readonly RuntimeConfig? _config;
    private readonly string _bridgeToken = string.Empty;
    private readonly bool _tokenWeak;

    private string? _startupError;
    private bool _locked = true;
    private bool _kioskEntered;

    public MainWindow()
    {
        InitializeComponent();
        Title = "SNAPY OS Booth";
        _log = new BoothLog(BoothLog.DefaultPath());
        _log.Write($"start v{VersionInfo.Version}");
        ConfigureWindow();

        try
        {
            var environment = Environment.GetEnvironmentVariables()
                .Cast<System.Collections.DictionaryEntry>()
                .ToDictionary(
                    entry => (string)entry.Key,
                    entry => entry.Value?.ToString(),
                    StringComparer.Ordinal);
            _config = RuntimeConfig.Load(environment);

            // UI dimuat dari https://snapyos.app, jadi origin itu harus masuk
            // allowlist CORS bridge. Tanpa ini semua fetch UI ditolak 403
            // walau curl dengan token berhasil 200.
            _config.AllowedOrigins.Add(UiOrigin);

            _bridgeToken = Environment.GetEnvironmentVariable("PHOTOBOOTH_BRIDGE_TOKEN")?.Trim() ?? string.Empty;
            _tokenWeak = IsWeakToken(_bridgeToken);

            // Mock hanya boleh dipakai bila memang dinyatakan: kamera palsu di
            // booth berarti pelanggan membayar foto yang bukan dirinya.
            var allowMock = Environment.GetEnvironmentVariable("SNAPYOS_ALLOW_MOCK");
            if (_config.Mock && !string.Equals(allowMock, "1", StringComparison.Ordinal))
            {
                throw new ConfigException(
                    "Adapter mock dipakai tanpa izin. Set SNAPYOS_ALLOW_MOCK=1 bila ini memang uji coba.");
            }
            if (!_config.Mock)
            {
                throw new ConfigException(
                    "Adapter perangkat keras nyata belum tersedia (Fase 3). " +
                    "Jalankan dengan SNAPYOS_CAMERA=mock SNAPYOS_PRINTER=mock SNAPYOS_ALLOW_MOCK=1.");
            }

            var store = Store.Open(_config.DataDir);
            ICamera camera = new MockCamera();
            IPrinter printer = new MockPrinter();
            var bridge = new BridgeServer(_config, store, camera, null, printer, sync: null, log: _log.Write);
            bridge.ExitGranted += OnExitGranted;
            _bridge = bridge;
            _log.Write(
                $"config ok: data={_config.DataDir} camera={_config.Camera} printer={_config.Printer} mock={_config.Mock}");
            _ = StartBridgeAsync();
        }
        catch (Exception error)
        {
            _bridge = null;
            _config = null;
            _startupError = error.Message;
            _log.Write($"config gagal: {error}");
        }

        WebView.Loaded += OnWebViewLoaded;
        Closed += OnClosed;
    }

    /// <summary>Dipanggil instance kedua lewat sinyal mutex.</summary>
    public void Restore()
    {
        if (AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } presenter)
        {
            presenter.Restore();
        }
        AppWindow.Show();
        Activate();
        _log.Write("instance kedua: jendela diaktifkan ulang");
    }

    private void ConfigureWindow()
    {
        var presenter = AppWindow.Presenter as OverlappedPresenter;
        if (presenter is not null)
        {
            // Tanpa judul dan border: tidak ada tombol close yang bisa diklik
            // tanpa lewat PIN darurat.
            presenter.SetBorderAndTitleBar(false, false);
            presenter.IsResizable = false;
            presenter.IsMaximizable = false;
            presenter.IsMinimizable = false;
        }
        AppWindow.Closing += OnAppWindowClosing;
    }

    private void OnAppWindowClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_locked)
        {
            args.Cancel = true;
            _log.Write("penutupan ditahan: kiosk terkunci");
        }
    }

    private async Task StartBridgeAsync()
    {
        var bridge = _bridge;
        var config = _config;
        if (bridge is null || config is null)
        {
            return;
        }
        try
        {
            await bridge.StartAsync();
            _log.Write($"bridge listen http://{config.Host}:{config.Port}");
        }
        catch (Exception error)
        {
            _log.Write($"bridge gagal start: {error}");
            _startupError = $"Bridge gagal start di port {config.Port}: {error.Message}";
            DispatcherQueue.TryEnqueue(ShowStartupError);
        }
    }

    private async void OnWebViewLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await WebView.EnsureCoreWebView2Async();
        }
        catch (Exception error)
        {
            _log.Write($"webview2 gagal: {error}");
            _startupError = $"WebView2 tidak bisa disiapkan: {error.Message}";
            ShowStartupError();
            return;
        }

        var core = WebView.CoreWebView2;
        ApplyWebViewPolicy(core);

        // Peta folder UI lokal ke host virtual HTTPS-nya sendiri.
        core.SetVirtualHostNameToFolderMapping(
            UiHost,
            Path.Combine(AppContext.BaseDirectory, "Assets", "ui"),
            CoreWebView2HostResourceAccessKind.DenyCors);

        if (_config is not null)
        {
            var config = _config;
            // Token bridge disuntik ke UI lewat skrip inisialisasi; UI tidak
            // pernah menyimpannya di berkas maupun localStorage.
            var handle = JsonSerializer.Serialize(new
            {
                url = $"http://{config.Host}:{config.Port}",
                token = _bridgeToken,
                tokenWeak = _tokenWeak,
            });
            await core.AddScriptToExecuteOnDocumentCreatedAsync($"window.__SNAPY_BRIDGE__ = {handle};");
        }

        core.NavigationCompleted += OnNavigationCompleted;
        core.WebMessageReceived += OnWebMessageReceived;
        core.Navigate($"{UiOrigin}/index.html");

        if (_startupError is not null)
        {
            ShowStartupError();
        }
    }

    private void ApplyWebViewPolicy(CoreWebView2 core)
    {
        var settings = core.Settings;
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.IsSwipeNavigationEnabled = false;
#if DEBUG
        // Debug lokal butuh DevTools; rilis tidak, supaya token bridge yang
        // disuntik ke dokumen tidak bisa dibaca dari konsol.
        settings.AreDevToolsEnabled = true;
#else
        settings.AreDevToolsEnabled = false;
#endif

        core.NavigationStarting += (_, args) =>
        {
            if (IsAllowedUri(args.Uri))
            {
                return;
            }
            args.Cancel = true;
            _log.Write($"navigasi keluar diblokir: {args.Uri}");
        };

        core.NewWindowRequested += (_, args) =>
        {
            args.Handled = true;
            _log.Write($"jendela baru diblokir: {args.Uri}");
        };

        core.ProcessFailed += (_, args) =>
            _log.Write($"proses webview gagal: {args.ProcessFailedKind} ({args.Reason})");
    }

    private static bool IsAllowedUri(string? uri)
    {
        if (string.IsNullOrEmpty(uri))
        {
            return false;
        }
        if (string.Equals(uri, "about:blank", StringComparison.Ordinal))
        {
            return true;
        }
        return Uri.TryCreate(uri, UriKind.Absolute, out var parsed)
            && string.Equals(parsed.Scheme, Uri.UriSchemeHttps, StringComparison.Ordinal)
            && string.Equals(parsed.Host, UiHost, StringComparison.OrdinalIgnoreCase);
    }

    private void OnNavigationCompleted(CoreWebView2 sender, CoreWebView2NavigationCompletedEventArgs args)
    {
        if (!args.IsSuccess)
        {
            _log.Write($"navigasi gagal: {args.WebErrorStatus}");
            return;
        }
        EnterKiosk();
    }

    /// <summary>
    /// Fullscreen + fokus. Dipanggil setelah dokumen selesai dimuat supaya
    /// transisi presenter tidak terlihat sebagai kedipan jendela kosong.
    /// </summary>
    private void EnterKiosk()
    {
        _locked = true;
        if (!_kioskEntered)
        {
            _kioskEntered = true;
            _log.Write("masuk kiosk fullscreen");
        }
        AppWindow.SetPresenter(AppWindowPresenterKind.FullScreen);
        Activate();
    }

    private void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        string? type = null;
        try
        {
            type = JsonNode.Parse(args.WebMessageAsJson)?["type"]?.GetValue<string>();
        }
        catch (Exception error)
        {
            _log.Write($"pesan web tidak valid: {error.Message}");
            return;
        }

        // UI hanya boleh MEMINTA masuk kiosk. Keluar tetap wewenang bridge:
        // satu-satunya jalan adalah PIN darurat yang diverifikasi server.
        if (string.Equals(type, "kiosk-enter", StringComparison.Ordinal))
        {
            EnterKiosk();
            _log.Write("UI meminta masuk kiosk");
        }
    }

    /// <summary>
    /// Hanya dipanggil BridgeServer setelah <c>POST /v1/exit</c> mengembalikan
    /// 200. Tidak ada polling: PIN salah, terkunci, atau belum diatur tidak
    /// pernah sampai ke sini.
    /// </summary>
    private void OnExitGranted()
    {
        _log.Write("keluar diizinkan oleh /v1/exit (200)");
        DispatcherQueue.TryEnqueue(() =>
        {
            _locked = false;
            Close();
        });
    }

    private void ShowStartupError()
    {
        ErrorText.Text = _startupError ?? "Penyebab tidak diketahui.";
        ErrorOverlay.Visibility = Visibility.Visible;
        _log.Write($"startup gagal: {_startupError}");
    }

    /// <summary>
    /// Token lemah = terlalu pendek atau variasi karakternya sedikit (mis. token
    /// uji "0123456789abcdef"). UI menampilkan peringatan, bukan memblokir.
    /// </summary>
    private static bool IsWeakToken(string token)
    {
        if (token.Length < 24)
        {
            return true;
        }
        return token.Distinct().Count() < 8;
    }

    private void OnClosed(object sender, WindowEventArgs args)
    {
        _log.Write("jendela ditutup");
        try
        {
            _bridge?.StopAsync().GetAwaiter().GetResult();
        }
        catch (Exception error)
        {
            _log.Write($"bridge stop gagal: {error.Message}");
        }
    }
}
