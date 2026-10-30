using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using SnapyOS.Booth.Bridge;
using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Hardware;

namespace SnapyOS.Booth.Shell;

/// <summary>
/// Jendela kiosk: WebView2 fullscreen tanpa dekorasi, memuat UI React yang
/// di-bundle lokal. Server bridge berjalan in-process; WebView2 memanggilnya
/// lewat <c>http://127.0.0.1:&lt;port&gt;</c> dengan header <c>X-Bridge-Token</c>.
/// </summary>
public sealed partial class MainWindow : Window
{
    // Akar virtual WebView2 untuk UI lokal. UI tidak memuat halaman cloud:
    // kustomisasi dan kiosk hidup di dalam aplikasi (1 pairing = 1 booth).
    private const string UiHost = "snapyos.app";

    private readonly BridgeServer? _bridge;
    private readonly RuntimeConfig? _config;
    private readonly string? _startupError;
    private readonly WebView2 _webView = new();

    public MainWindow()
    {
        InitializeComponent();
        Title = "SNAPY OS Booth";
        Content = _webView;

        try
        {
            var environment = Environment.GetEnvironmentVariables()
                .Cast<System.Collections.DictionaryEntry>()
                .ToDictionary(
                    entry => (string)entry.Key,
                    entry => entry.Value?.ToString(),
                    StringComparer.Ordinal);
            _config = RuntimeConfig.Load(environment);

            // Fase 1 hanya punya adapter mock. Memakai mock untuk config nyata
            // akan diam-diam memalsukan foto pelanggan, jadi start digagalkan.
            if (_config.Camera != "mock"
                || _config.Printer != "mock"
                || _config.CameraStream is not (null or "mock"))
            {
                throw new ConfigException(
                    "Adapter perangkat keras belum tersedia (Fase 3). " +
                    "Jalankan dengan SNAPYOS_CAMERA=mock SNAPYOS_PRINTER=mock SNAPYOS_ALLOW_MOCK=1.");
            }

            var store = Store.Open(_config.DataDir);
            ICamera camera = new MockCamera();
            IPrinter printer = new MockPrinter();
            _bridge = new BridgeServer(_config, store, camera, null, printer);
            _ = _bridge.StartAsync();
        }
        catch (Exception error)
        {
            _bridge = null;
            _config = null;
            _startupError = error.Message;
        }

        _webView.Loaded += OnWebViewLoaded;
    }

    private async void OnWebViewLoaded(object sender, RoutedEventArgs e)
    {
        await _webView.EnsureCoreWebView2Async();
        var core = _webView.CoreWebView2;

        // Peta folder UI lokal ke host virtual HTTPS-nya sendiri.
        core.SetVirtualHostNameToFolderMapping(
            UiHost,
            Path.Combine(AppContext.BaseDirectory, "Assets", "ui"),
            CoreWebView2HostResourceAccessKind.DenyCors);

        if (_config is not null)
        {
            // Token bridge disuntik ke UI lewat skrip inisialisasi; UI tidak
            // pernah menyimpannya di berkas.
            var token = Environment.GetEnvironmentVariable("PHOTOBOOTH_BRIDGE_TOKEN") ?? string.Empty;
            var handle = JsonSerializer.Serialize(new
            {
                url = $"http://{_config.Host}:{_config.Port}",
                token,
            });
            await core.AddScriptToExecuteOnDocumentCreatedAsync($"window.__SNAPY_BRIDGE__ = {handle};");
        }

        core.Navigate($"https://{UiHost}/index.html");

        if (_startupError is not null)
        {
            var message = JsonSerializer.Serialize($"Gagal memuat konfigurasi booth: {_startupError}");
            await core.ExecuteScriptAsync(
                $"document.body.innerHTML = `<pre class='code'>${{{message}}}</pre>`;");
        }
    }
}
