using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Exit;
using SnapyOS.Booth.Core.Hardware;
using SnapyOS.Booth.Core.Sessions;
using SnapyOS.Booth.Core.Sync;

namespace SnapyOS.Booth.Bridge;

/// <summary>
/// Server bridge loopback — padanan <c>runtime/main.ts</c>.
///
/// Rute lama dipertahankan agar kiosk yang sudah terpasang tidak perlu diubah.
/// Semua rute selain <c>/health</c> wajib header <c>X-Bridge-Token</c>;
/// origin di luar allowlist ditolak sebelum routing.
/// </summary>
public sealed class BridgeServer
{
    private readonly RuntimeConfig _config;
    private readonly Store _store;
    private readonly SettingsService _settings;
    private readonly SessionsService _sessions;
    private readonly ExitService _exit;
    private readonly SyncWorker _sync;
    private readonly ICamera _camera;
    private readonly ICamera? _streamCamera;
    private readonly IPrinter _printer;
    private readonly SerialQueue _captureLock = new();
    private readonly SerialQueue _printLock = new();
    private readonly Action<string>? _log;
    private readonly int _port;
    private WebApplication? _app;

    /// <summary>
    /// Dipicu HANYA setelah <c>POST /v1/exit</c> mengembalikan 200 (PIN darurat
    /// benar, tidak terkunci). Shell memakainya untuk membuka kunci jendela —
    /// event, bukan polling, supaya tidak ada jendela waktu di mana kiosk
    /// menanyakan status ke dirinya sendiri.
    /// </summary>
    public event Action? ExitGranted;

    public BridgeServer(
        RuntimeConfig config,
        Store store,
        ICamera camera,
        ICamera? streamCamera,
        IPrinter printer,
        SyncWorker? sync = null,
        Action<string>? log = null,
        int? port = null)
    {
        // Port 0 = biarkan OS memilih; hanya untuk uji in-process. Kiosk
        // selalu memakai port tetap supaya URL WebView2 tidak berubah.
        if (port is < 0 or > 65535)
        {
            throw new ArgumentOutOfRangeException(nameof(port));
        }
        _port = port ?? config.Port;
        _config = config;
        _store = store;
        _settings = new SettingsService(store, config);
        _sessions = new SessionsService(
            store,
            Path.Combine(config.DataDir, "media"),
            camera.CaptureAsync);
        _exit = new ExitService(store);
        _sync = sync ?? new SyncWorker(store, config, log: log);
        _camera = camera;
        _streamCamera = streamCamera;
        _printer = printer;
        _log = log;
    }

    /// <summary>Alamat yang benar-benar di-bind. Berguna saat <c>port: 0</c> di uji.</summary>
    public IReadOnlyList<string> Urls => _app is null ? [] : [.. _app.Urls];

    public WebApplication Build()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel((context, options) =>
        {
            options.Listen(IPAddress.Parse(_config.Host), _port);
        });

        var app = builder.Build();

        app.Use(async (context, next) =>
        {
            var handled = await HandleCorsAsync(context).ConfigureAwait(false);
            if (handled)
            {
                return;
            }
            await next().ConfigureAwait(false);
        });

        app.Use(async (context, next) =>
        {
            var path = context.Request.Path.Value ?? "/";
            if (path != "/health")
            {
                var token = context.Request.Headers["X-Bridge-Token"].ToString();
                if (!TokenMatches(token, _config.TokenDigest))
                {
                    await WriteJsonAsync(context, 401, new JsonObject { ["message"] = "Token bridge tidak valid." })
                        .ConfigureAwait(false);
                    return;
                }
            }
            await next().ConfigureAwait(false);
        });

        app.Use(async (context, next) =>
        {
            try
            {
                await next().ConfigureAwait(false);
            }
            catch (BridgeException error)
            {
                var body = new JsonObject { ["message"] = error.Message };
                if (error.Code is not null)
                {
                    body["error"] = error.Code;
                }
                await WriteJsonAsync(context, error.StatusCode, body).ConfigureAwait(false);
            }
            catch (Exception error)
            {
                _log?.Invoke($"[snapyos-bridge] error: {error}");
                await WriteJsonAsync(context, 502, new JsonObject { ["message"] = error.Message })
                    .ConfigureAwait(false);
            }
        });

        MapRoutes(app);
        _app = app;
        return app;
    }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        var app = _app ?? Build();
        await app.StartAsync(cancellationToken).ConfigureAwait(false);
        _sync.Start();
    }

    public async Task StopAsync(CancellationToken cancellationToken = default)
    {
        _sync.Stop();
        if (_app is not null)
        {
            await _app.StopAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private void MapRoutes(WebApplication app)
    {
        app.MapGet("/health", async (HttpContext context) =>
        {
            try
            {
                var status = await _camera.StatusAsync(context.RequestAborted).ConfigureAwait(false);
                await WriteJsonAsync(context, 200, new JsonObject
                {
                    ["ok"] = true,
                    ["camera"] = status.Connected,
                    ["message"] = status.Connected ? null : status.LastError,
                }).ConfigureAwait(false);
            }
            catch (Exception error)
            {
                await WriteJsonAsync(context, 200, new JsonObject
                {
                    ["ok"] = false,
                    ["camera"] = false,
                    ["message"] = error.Message,
                }).ConfigureAwait(false);
            }
        });

        app.MapGet("/v1/status", async (HttpContext context) =>
        {
            var cameraStatus = await SafeCameraStatusAsync(_camera, _config.Camera, context.RequestAborted)
                .ConfigureAwait(false);
            var streamStatus = _streamCamera is null || ReferenceEquals(_streamCamera, _camera)
                ? null
                : await SafeCameraStatusAsync(_streamCamera, _config.CameraStream ?? _config.Camera, context.RequestAborted)
                    .ConfigureAwait(false);

            JsonNode printerStatus;
            try
            {
                var health = await _printer.HealthAsync(null, context.RequestAborted).ConfigureAwait(false);
                printerStatus = new JsonObject
                {
                    ["adapter"] = _config.Printer,
                    ["ok"] = health.Ok,
                    ["mock"] = _printer.Mock,
                };
            }
            catch (Exception error)
            {
                printerStatus = new JsonObject
                {
                    ["adapter"] = _config.Printer,
                    ["ok"] = false,
                    ["mock"] = _printer.Mock,
                    ["last_error"] = error.Message,
                };
            }

            await WriteJsonAsync(context, 200, new JsonObject
            {
                ["ok"] = true,
                ["version"] = VersionInfo.Version,
                ["camera"] = cameraStatus,
                ["camera_stream"] = streamStatus,
                ["printer"] = printerStatus,
                ["data_dir"] = _config.DataDir,
                ["db_version"] = _store.CurrentSchemaVersion(),
                ["cloud"] = _config.CloudUrl.Length > 0,
                ["business_slug"] = _store.GetMeta("business_slug"),
                ["photobox_slug"] = _store.GetMeta("photobox_slug"),
            }).ConfigureAwait(false);
        });

        app.MapGet("/v1/camera/status", async (HttpContext context) =>
        {
            var status = await _camera.StatusAsync(context.RequestAborted).ConfigureAwait(false);
            await WriteJsonAsync(context, 200, CameraStatusToJson(status)).ConfigureAwait(false);
        });

        // --- setelan ---

        app.MapGet("/v1/settings", async (HttpContext context) =>
        {
            var response = _settings.Read();
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        app.MapPut("/v1/settings", async (HttpContext context) =>
        {
            var payload = await ReadJsonAsync(context).ConfigureAwait(false);
            var response = _settings.Write(payload);
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        app.MapGet("/v1/settings/export", async (HttpContext context) =>
        {
            var response = _settings.Export();
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        app.MapPost("/v1/settings/import", async (HttpContext context) =>
        {
            var payload = await ReadJsonAsync(context).ConfigureAwait(false);
            var response = _settings.Import(payload);
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        // --- sesi ---

        app.MapPost("/v1/sessions", async (HttpContext context) =>
        {
            var payload = await ReadJsonAsync(context).ConfigureAwait(false);
            var response = _sessions.CreateSession(payload);
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        app.MapGet("/v1/sessions/{id}", async (HttpContext context, string id) =>
        {
            var response = _sessions.ReadSession(id);
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        app.MapPost("/v1/sessions/{id}/capture", async (HttpContext context, string id) =>
        {
            var idempotencyKey = context.Request.Headers["Idempotency-Key"].ToString();
            var payload = await ReadJsonAsync(context).ConfigureAwait(false);
            var response = await _captureLock.RunAsync(
                () => _sessions.CaptureSlotAsync(id, idempotencyKey, payload, context.RequestAborted))
                .ConfigureAwait(false);
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        app.MapPost("/v1/sessions/{id}/finalize", async (HttpContext context, string id) =>
        {
            var raw = await ReadRawAsync(context).ConfigureAwait(false);
            var parts = MultipartParser.Parse(raw, context.Request.ContentType ?? string.Empty);
            var response = _sessions.FinalizeSession(id, parts);
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        app.MapPost("/v1/sessions/{id}/abort", async (HttpContext context, string id) =>
        {
            var response = _sessions.AbortSession(id);
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);
        });

        // --- keluar (PIN darurat) ---

        app.MapPost("/v1/exit", async (HttpContext context) =>
        {
            var payload = await ReadJsonAsync(context).ConfigureAwait(false);
            var pin = payload is JsonObject obj && obj["pin"] is JsonValue value
                && value.TryGetValue(out string? text)
                ? text
                : null;
            var response = _exit.Verify(pin);
            await WriteJsonAsync(context, response.Status, response.Body).ConfigureAwait(false);

            // Sinyal keluar dikirim setelah respons tertulis: Shell baru boleh
            // membuka kunci bila klien sudah menerima 200.
            if (response.Status == 200)
            {
                try
                {
                    ExitGranted?.Invoke();
                }
                catch (Exception error)
                {
                    _log?.Invoke($"[snapyos-bridge] handler ExitGranted gagal: {error.Message}");
                }
            }
        });

        // --- printer lama ---

        app.MapGet("/printer/health", async (HttpContext context) =>
        {
            var stored = _settings.PrintDefaults(_settings.ActiveSettings())["printer_name"];
            var query = context.Request.Query["printer"].ToString().Trim();
            var printerName = query.Length > 0 ? query : stored?.GetValue<string>();
            var health = await _printer.HealthAsync(
                string.IsNullOrWhiteSpace(printerName) ? null : printerName,
                context.RequestAborted).ConfigureAwait(false);
            await WriteJsonAsync(context, 200, new JsonObject
            {
                ["ok"] = health.Ok,
                ["printer"] = printerName,
                ["adapter"] = health.Adapter,
                ["mock"] = health.Mock,
                ["last_error"] = health.LastError,
            }).ConfigureAwait(false);
        });

        app.MapPost("/print", async (HttpContext context) =>
        {
            var payload = await ReadJsonAsync(context).ConfigureAwait(false);
            var result = await SubmitPrintAsync(payload, test: false, context.RequestAborted).ConfigureAwait(false);
            await WriteJsonAsync(context, 200, new JsonObject
            {
                ["ok"] = true,
                ["job_id"] = result.JobId,
                ["message"] = result.Message,
            }).ConfigureAwait(false);
        });

        app.MapPost("/printer/test", async (HttpContext context) =>
        {
            var payload = await ReadJsonAsync(context).ConfigureAwait(false);
            var result = await SubmitPrintAsync(payload, test: true, context.RequestAborted).ConfigureAwait(false);
            await WriteJsonAsync(context, 200, new JsonObject
            {
                ["ok"] = true,
                ["job_id"] = result.JobId,
                ["message"] = result.Message,
            }).ConfigureAwait(false);
        });

        // --- kamera lama ---

        app.MapPost("/camera/capture", CaptureAsync);
        app.MapGet("/camera/preview", PreviewAsync);

        app.MapFallback(async (HttpContext context) =>
        {
            await WriteJsonAsync(context, 404, new JsonObject { ["message"] = "Endpoint tidak ditemukan." })
                .ConfigureAwait(false);
        });
    }

    private async Task CaptureAsync(HttpContext context)
    {
        var bytes = await _captureLock.RunAsync(() => _camera.CaptureAsync(context.RequestAborted))
            .ConfigureAwait(false);
        context.Response.StatusCode = 200;
        context.Response.ContentType = "image/jpeg";
        context.Response.Headers["Cache-Control"] = "no-store";
        await context.Response.Body.WriteAsync(bytes, context.RequestAborted).ConfigureAwait(false);
    }

    private async Task PreviewAsync(HttpContext context)
    {
        var camera = _streamCamera ?? _camera;
        var bytes = await camera.PreviewAsync(context.RequestAborted).ConfigureAwait(false);
        context.Response.StatusCode = 200;
        context.Response.ContentType = "image/jpeg";
        context.Response.Headers["Cache-Control"] = "no-store";
        await context.Response.Body.WriteAsync(bytes, context.RequestAborted).ConfigureAwait(false);
    }

    private async Task<SubmitResult> SubmitPrintAsync(JsonNode? payload, bool test, CancellationToken cancellationToken)
    {
        var merged = _settings.PrintDefaults(_settings.ActiveSettings());
        if (payload is JsonObject input)
        {
            foreach (var (key, value) in input)
            {
                if (value is not null)
                {
                    merged[key] = value.DeepClone();
                }
            }
        }

        return await _printLock.RunAsync(async () =>
        {
            var printerName = merged["printer_name"]?.GetValue<string>();
            await _printer.HealthAsync(string.IsNullOrWhiteSpace(printerName) ? null : printerName, cancellationToken)
                .ConfigureAwait(false);
            return await _printer.SubmitAsync(merged, test, cancellationToken).ConfigureAwait(false);
        }).ConfigureAwait(false);
    }

    private static async Task<JsonObject> SafeCameraStatusAsync(ICamera camera, string adapter, CancellationToken cancellationToken)
    {
        try
        {
            var status = await camera.StatusAsync(cancellationToken).ConfigureAwait(false);
            return CameraStatusToJson(status);
        }
        catch (Exception error)
        {
            return new JsonObject
            {
                ["adapter"] = adapter,
                ["connected"] = false,
                ["mock"] = camera.Mock,
                ["last_error"] = error.Message,
            };
        }
    }

    private static JsonObject CameraStatusToJson(CameraStatus status) => new()
    {
        ["adapter"] = status.Adapter,
        ["connected"] = status.Connected,
        ["mock"] = status.Mock,
        ["last_error"] = status.LastError,
    };

    /// <summary>
    /// Terapkan header CORS. Mengembalikan true bila permintaan sudah
    /// diselesaikan di sini (origin ditolak, atau preflight OPTIONS).
    /// </summary>
    private async Task<bool> HandleCorsAsync(HttpContext context)
    {
        var origin = context.Request.Headers.Origin.ToString();
        var allowed = !string.IsNullOrEmpty(origin) && _config.AllowedOrigins.Contains(origin);

        if (!string.IsNullOrEmpty(origin) && !allowed)
        {
            await WriteJsonAsync(context, 403, new JsonObject { ["message"] = "Origin tidak diizinkan." })
                .ConfigureAwait(false);
            return true;
        }

        if (allowed)
        {
            context.Response.Headers["Access-Control-Allow-Origin"] = origin;
            context.Response.Headers["Vary"] = "Origin";
        }
        context.Response.Headers["Access-Control-Allow-Methods"] = "GET, PUT, POST, OPTIONS";
        context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Bridge-Token, Idempotency-Key";
        context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
        context.Response.Headers["Access-Control-Max-Age"] = "600";

        if (HttpMethods.IsOptions(context.Request.Method))
        {
            context.Response.StatusCode = 204;
            return true;
        }
        return false;
    }

    private async Task<JsonNode?> ReadJsonAsync(HttpContext context)
    {
        using var reader = new StreamReader(context.Request.Body, Encoding.UTF8);
        var text = await reader.ReadToEndAsync(context.RequestAborted).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }
        try
        {
            return JsonNode.Parse(text);
        }
        catch (System.Text.Json.JsonException)
        {
            throw new BridgeException("Payload JSON tidak valid.", 400);
        }
    }

    private async Task<byte[]> ReadRawAsync(HttpContext context)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81_920];
        long total = 0;
        int read;
        while ((read = await context.Request.Body.ReadAsync(chunk, context.RequestAborted).ConfigureAwait(false)) > 0)
        {
            total += read;
            if (total > _config.MaxBodyBytes)
            {
                throw new BridgeException("Payload terlalu besar.", 413);
            }
            buffer.Write(chunk, 0, read);
        }
        return buffer.ToArray();
    }

    private async Task WriteJsonAsync(HttpContext context, int status, JsonNode? body)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json; charset=utf-8";
        var origin = context.Request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin) && _config.AllowedOrigins.Contains(origin))
        {
            context.Response.Headers["Access-Control-Allow-Origin"] = origin;
        }
        await context.Response.WriteAsync(body?.ToJsonString() ?? "null").ConfigureAwait(false);
    }

    /// <summary>
    /// Perbandingan constant-time; panjang berbeda tetap aman karena kedua sisi
    /// di-hash lebih dulu. Padanan <c>tokenMatches</c> di <c>runtime/http.ts</c>.
    /// </summary>
    internal static bool TokenMatches(string? received, byte[] tokenDigest)
    {
        if (string.IsNullOrEmpty(received))
        {
            return false;
        }
        var computed = SHA256.HashData(Encoding.UTF8.GetBytes(received));
        return CryptographicOperations.FixedTimeEquals(computed, tokenDigest);
    }
}
