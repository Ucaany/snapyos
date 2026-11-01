using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using SnapyOS.Agent;
using Xunit;

namespace SnapyOS.Agent.Tests;

public sealed class PairingIntegrationTests
{
    [Fact]
    public async Task Activation_verify_heartbeat_and_revoke_round_trip()
    {
        var handler = new FakePairingHandler();
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://snapyos.test") };
        var tokens = new MemoryTokenStore();
        var pairing = new PairingClient(client, tokens);

        var code = await pairing.GeneratePairCodeAsync("biz", "box");
        Assert.Equal("ABC123", code.Code);
        Assert.Contains("/api/v1/public/devices/activate", code.QrPayload);
        Assert.Contains("ABC123", code.QrPayload);
        var profile = await pairing.ActivateAsync(code.Code);
        Assert.Equal(PairingClientState.Paired, pairing.Snapshot.State);
        Assert.Equal("device-1", profile.DeviceId);
        await pairing.HeartbeatAsync();
        await pairing.RevokeAsync("biz", "device-1");
        Assert.Equal(PairingClientState.Revoked, pairing.Snapshot.State);
        Assert.Null(tokens.Read());
    }

    [Fact]
    public async Task Network_failure_becomes_offline_paired()
    {
        var handler = new FakePairingHandler { FailVerify = true };
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://snapyos.test") };
        var tokens = new MemoryTokenStore();
        tokens.Save("token");
        var pairing = new PairingClient(client, tokens);
        await Assert.ThrowsAsync<HttpRequestException>(() => pairing.VerifyAsync());
        Assert.Equal(PairingClientState.OfflinePaired, pairing.Snapshot.State);
    }

    [Fact]
    public async Task Rejected_token_becomes_needs_repair()
    {
        var handler = new FakePairingHandler { RejectVerify = true };
        using var client = new HttpClient(handler) { BaseAddress = new Uri("https://snapyos.test") };
        var tokens = new MemoryTokenStore();
        tokens.Save("token");
        var pairing = new PairingClient(client, tokens);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => pairing.VerifyAsync());
        Assert.Equal(PairingClientState.NeedsRepair, pairing.Snapshot.State);
        Assert.Null(tokens.Read());
    }

    private sealed class MemoryTokenStore : IDeviceTokenStore
    {
        private string? _value;
        public void Save(string token) => _value = token;
        public string? Read() => _value;
        public void Clear() => _value = null;
    }

    private sealed class FakePairingHandler : HttpMessageHandler
    {
        public bool FailVerify { get; init; }
        public bool RejectVerify { get; init; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.RequestUri!.AbsolutePath.Contains("activation")) return Json(new { data = new { code = "ABC123", expires_at = DateTimeOffset.UtcNow.AddMinutes(5), photobox_slug = "box" } });
            if (request.RequestUri.AbsolutePath.EndsWith("/activate")) return Json(new { data = new { device_token = "token", device_id = "device-1", photobox_id = "box-1" } });
            if (request.RequestUri.AbsolutePath.EndsWith("/verify"))
            {
                if (FailVerify) throw new HttpRequestException("offline");
                if (RejectVerify) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized));
                return Json(new { data = new { device_id = "device-1", business_slug = "biz", kiosk_locked = false, photobox = new { slug = "box", name = "Booth" } } });
            }
            if (request.Method == HttpMethod.Delete) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NoContent));
            return Json(new { data = new { ok = true } });
        }
        private static Task<HttpResponseMessage> Json(object value) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(value) });
    }
}
