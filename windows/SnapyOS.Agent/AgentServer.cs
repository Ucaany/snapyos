using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using SnapyOS.Core;
using SnapyOS.LocalStore;

namespace SnapyOS.Agent;

public sealed record AgentServerOptions(string BearerToken, int Port = 0, TimeSpan? RequestTimeout = null)
{
    public TimeSpan EffectiveTimeout => RequestTimeout ?? TimeSpan.FromSeconds(5);
}

public sealed class AgentServer : IAsyncDisposable
{
    private readonly HttpListener _listener = new();
    private readonly AgentServerOptions _options;
    private readonly ConfigurationRepository _config;
    private readonly IAgentHardwareStatus _hardware;
    private readonly IAgentKioskController _kiosk;
    private readonly IAgentSyncStatus _sync;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);
    private CancellationTokenSource? _stop;
    private Task? _acceptLoop;

    public AgentServer(AgentServerOptions options, ConfigurationRepository config, IAgentHardwareStatus hardware, IAgentKioskController kiosk, IAgentSyncStatus sync)
    {
        if (string.IsNullOrWhiteSpace(options.BearerToken)) throw new ArgumentException("Bearer token is required.");
        _options = options;
        _config = config;
        _hardware = hardware;
        _kiosk = kiosk;
        _sync = sync;
        var port = options.Port == 0 ? GetFreePort() : options.Port;
        // `localhost` gets the default HTTP.sys reservation on Windows; a literal 127.0.0.1 prefix needs an explicit URLACL.
        BaseAddress = new Uri($"http://localhost:{port}/");
        _listener.Prefixes.Add(BaseAddress.ToString());
    }

    public Uri BaseAddress { get; }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        _listener.Start();
        _stop = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _acceptLoop = Task.Run(() => AcceptLoopAsync(_stop.Token), _stop.Token);
        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        _stop?.Cancel();
        if (_listener.IsListening) _listener.Stop();
        _listener.Close();
        if (_acceptLoop is not null)
        {
            try { await _acceptLoop.ConfigureAwait(false); } catch (OperationCanceledException) { }
        }
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            HttpListenerContext context;
            try { context = await _listener.GetContextAsync().WaitAsync(cancellationToken); }
            catch (OperationCanceledException) { break; }
            catch (HttpListenerException) { break; }
            _ = Task.Run(() => HandleAsync(context, cancellationToken), cancellationToken);
        }
    }

    private async Task HandleAsync(HttpListenerContext context, CancellationToken serverCancellation)
    {
        var correlationId = context.Request.Headers["X-Correlation-Id"]?.Trim();
        if (string.IsNullOrWhiteSpace(correlationId)) correlationId = $"corr_{Guid.NewGuid():N}";
        context.Response.Headers["X-Correlation-Id"] = correlationId;
        try
        {
            if (!IsLocalhost(context.Request) || !Authenticated(context.Request))
            {
                await WriteAsync(context, new IpcResponse(correlationId, false, Error: "Unauthorized"), 401, serverCancellation);
                return;
            }
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(serverCancellation);
            timeout.CancelAfter(_options.EffectiveTimeout);
            var data = await RouteAsync(context.Request, timeout.Token);
            await WriteAsync(context, new IpcResponse(correlationId, true, data), 200, timeout.Token);
        }
        catch (OperationCanceledException)
        {
            await WriteAsync(context, new IpcResponse(correlationId, false, Error: "Request cancelled or timed out"), 408, CancellationToken.None);
        }
        catch (Exception ex)
        {
            await WriteAsync(context, new IpcResponse(correlationId, false, Error: ex.Message), 500, CancellationToken.None);
        }
    }

    private async Task<object> RouteAsync(HttpListenerRequest request, CancellationToken cancellationToken)
    {
        return request.Url?.AbsolutePath switch
        {
            "/health" when request.HttpMethod == "GET" => new AgentHealth("ok", "0.1.0", DateTimeOffset.UtcNow),
            "/config/active" when request.HttpMethod == "GET" => _config.Active ?? throw new ConfigurationException("No active configuration."),
            "/status/camera" when request.HttpMethod == "GET" => await _hardware.CameraAsync(cancellationToken),
            "/status/printer" when request.HttpMethod == "GET" => await _hardware.PrinterAsync(cancellationToken),
            "/status/sync" when request.HttpMethod == "GET" => await _sync.ReadAsync(cancellationToken),
            "/kiosk/launch" when request.HttpMethod == "POST" => await RunKioskAsync(false, cancellationToken),
            "/kiosk/restart" when request.HttpMethod == "POST" => await RunKioskAsync(true, cancellationToken),
            "/diagnostics" when request.HttpMethod == "GET" => await DiagnosticsAsync(cancellationToken),
            _ => throw new HttpListenerException(404, "Endpoint not found")
        };
    }

    private async Task<object> RunKioskAsync(bool restart, CancellationToken cancellationToken)
    {
        if (restart) await _kiosk.RestartAsync(cancellationToken); else await _kiosk.LaunchAsync(cancellationToken);
        return new { status = restart ? "restarted" : "launched" };
    }

    private async Task<DiagnosticsReport> DiagnosticsAsync(CancellationToken cancellationToken) => new(
        "0.1.0",
        _config.Active?.RevisionId ?? "none",
        await _hardware.CameraAsync(cancellationToken),
        await _hardware.PrinterAsync(cancellationToken),
        await _sync.ReadAsync(cancellationToken));

    private bool Authenticated(HttpListenerRequest request)
    {
        var value = request.Headers["Authorization"];
        var expected = Encoding.UTF8.GetBytes("Bearer " + _options.BearerToken);
        var actual = Encoding.UTF8.GetBytes(value ?? string.Empty);
        return CryptographicOperations.FixedTimeEquals(expected, actual);
    }

    private static bool IsLocalhost(HttpListenerRequest request) => request.RemoteEndPoint?.Address is { } address && (IPAddress.IsLoopback(address) || address.Equals(IPAddress.IPv6Loopback));

    private async Task WriteAsync(HttpListenerContext context, IpcResponse response, int status, CancellationToken cancellationToken)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(response, _json);
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        context.Response.ContentLength64 = bytes.Length;
        await context.Response.OutputStream.WriteAsync(bytes, cancellationToken);
        context.Response.Close();
    }

    private static int GetFreePort()
    {
        using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        socket.Bind(new IPEndPoint(IPAddress.Loopback, 0));
        return ((IPEndPoint)socket.LocalEndPoint!).Port;
    }
}
