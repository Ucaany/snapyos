using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using SnapyOS.Agent;
using SnapyOS.Core;
using SnapyOS.LocalStore;
using Xunit;

namespace SnapyOS.Agent.Tests;

public sealed class AgentIntegrationTests : IAsyncLifetime, IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-agent-{Guid.NewGuid():N}");
    private SnapyOS.LocalStore.LocalStore _store = null!;
    private AgentServer _server = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _store = new SnapyOS.LocalStore.LocalStore(SnapyOS.LocalStore.LocalStoreOptions.ForDirectory(_root));
        var config = new ConfigurationRepository(_store);
        config.SaveDraft(new JsonObject { ["camera"] = new JsonObject { ["provider"] = "Bridge" } });
        await config.ApplyAsync(new HealthyCheck());
        _server = new AgentServer(new AgentServerOptions("test-token"), config, new FakeHardware(), new FakeKiosk(), new FakeSync());
        await _server.StartAsync();
        _client = new HttpClient { BaseAddress = _server.BaseAddress, Timeout = TimeSpan.FromSeconds(2) };
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "test-token");
    }

    [Fact]
    public async Task Health_returns_correlation_id()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "health");
        request.Headers.Add("X-Correlation-Id", "corr-test");
        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("corr-test", response.Headers.GetValues("X-Correlation-Id").Single());
    }

    [Fact]
    public async Task Active_config_and_status_routes_use_fake_agent()
    {
        var config = await _client.GetStringAsync("config/active");
        var camera = await _client.GetStringAsync("status/camera");
        Assert.Contains("Bridge", config);
        Assert.Contains("ready", camera);
    }

    [Fact]
    public async Task Kiosk_routes_and_diagnostics_work()
    {
        var launch = await _client.PostAsync("kiosk/launch", null);
        var restart = await _client.PostAsync("kiosk/restart", null);
        var diagnostics = await _client.GetStringAsync("diagnostics");
        Assert.Equal(HttpStatusCode.OK, launch.StatusCode);
        Assert.Equal(HttpStatusCode.OK, restart.StatusCode);
        Assert.Contains("active", diagnostics);
    }

    [Fact]
    public async Task Wrong_token_is_rejected()
    {
        using var client = new HttpClient { BaseAddress = _server.BaseAddress };
        var response = await client.GetAsync("health");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Timeout_returns_request_timeout()
    {
        await using var slow = new AgentServer(new AgentServerOptions("slow", RequestTimeout: TimeSpan.FromMilliseconds(20)), new ConfigurationRepository(_store), new SlowHardware(), new FakeKiosk(), new FakeSync());
        await slow.StartAsync();
        using var client = new HttpClient { BaseAddress = slow.BaseAddress };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "slow");
        var response = await client.GetAsync("status/camera");
        Assert.Equal(HttpStatusCode.RequestTimeout, response.StatusCode);
    }

    public async Task DisposeAsync()
    {
        _client?.Dispose();
        if (_server is not null) await _server.DisposeAsync();
        _store?.Dispose();
        try { Directory.Delete(_root, true); } catch { }
    }

    public void Dispose() => _store?.Dispose();

    private sealed class HealthyCheck : IConfigurationHealthCheck { public Task<bool> CheckAsync(ConfigurationDocument configuration, CancellationToken cancellationToken = default) => Task.FromResult(true); }
    private sealed class FakeHardware : IAgentHardwareStatus { public Task<DeviceStatus> CameraAsync(CancellationToken cancellationToken) => Task.FromResult(new DeviceStatus("ready")); public Task<DeviceStatus> PrinterAsync(CancellationToken cancellationToken) => Task.FromResult(new DeviceStatus("ready")); }
    private sealed class SlowHardware : IAgentHardwareStatus { public async Task<DeviceStatus> CameraAsync(CancellationToken cancellationToken) { await Task.Delay(1000, cancellationToken); return new("ready"); } public Task<DeviceStatus> PrinterAsync(CancellationToken cancellationToken) => Task.FromResult(new DeviceStatus("ready")); }
    private sealed class FakeKiosk : IAgentKioskController { public Task LaunchAsync(CancellationToken cancellationToken) => Task.CompletedTask; public Task RestartAsync(CancellationToken cancellationToken) => Task.CompletedTask; }
    private sealed class FakeSync : IAgentSyncStatus { public Task<SyncStatus> ReadAsync(CancellationToken cancellationToken) => Task.FromResult(new SyncStatus("active", 0, 0)); }
}
