using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using SnapyOS.Booth.Bridge;
using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Hardware;
using Xunit;

namespace SnapyOS.Booth.Tests;

/// <summary>
/// Tes lapisan HTTP in-process: Kestrel sungguhan di port acak, jadi CORS,
/// urutan middleware, dan fallback 404 diuji apa adanya (bukan lewat handler).
/// </summary>
public sealed class BridgeHttpTests : IAsyncLifetime
{
    private const string Token = "test-token-0123456789";

    private readonly TestFactory.TempDir _dir = new();
    private Store _store = null!;
    private BridgeServer _server = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _store = Store.Open(_dir.Path);
        _store.SetMeta("business_slug", "studio-uji");
        _store.SetMeta("photobox_slug", "photobox-uji");

        var config = TestFactory.Config(_dir.Path);
        _server = new BridgeServer(
            config,
            _store,
            new MockCamera(),
            null,
            new MockPrinter(),
            sync: null,
            log: _ => { },
            port: 0);
        await _server.StartAsync();

        var url = _server.Urls.Single();
        _client = new HttpClient { BaseAddress = new Uri(url) };
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _server.StopAsync();
        _store.Dispose();
        _dir.Dispose();
    }

    private HttpRequestMessage Request(HttpMethod method, string path, string? token = Token)
    {
        var request = new HttpRequestMessage(method, path);
        if (token is not null)
        {
            request.Headers.TryAddWithoutValidation("X-Bridge-Token", token);
        }
        return request;
    }

    [Fact]
    public async Task health_returns_200_without_token()
    {
        using var response = await _client.SendAsync(Request(HttpMethod.Get, "/health", token: null));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.True(body["ok"]!.GetValue<bool>());
    }

    [Fact]
    public async Task status_returns_401_without_token()
    {
        using var response = await _client.SendAsync(Request(HttpMethod.Get, "/v1/status", token: null));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal("Token bridge tidak valid.", body["message"]!.GetValue<string>());
    }

    [Fact]
    public async Task status_returns_200_with_token()
    {
        using var response = await _client.SendAsync(Request(HttpMethod.Get, "/v1/status"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal("studio-uji", body["business_slug"]!.GetValue<string>());
        Assert.True(body["printer"]!["mock"]!.GetValue<bool>());
    }

    [Fact]
    public async Task allowed_origin_is_echoed_in_cors_headers()
    {
        using var request = Request(HttpMethod.Get, "/v1/status");
        request.Headers.TryAddWithoutValidation("Origin", "http://localhost:3000");

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("http://localhost:3000", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Contains("X-Bridge-Token", response.Headers.GetValues("Access-Control-Allow-Headers").Single());
    }

    [Fact]
    public async Task preflight_options_returns_204_for_allowed_origin()
    {
        using var request = Request(HttpMethod.Options, "/v1/status", token: null);
        request.Headers.TryAddWithoutValidation("Origin", "http://127.0.0.1:3000");

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Private-Network").Single());
    }

    [Fact]
    public async Task foreign_origin_is_rejected_with_403_before_token_check()
    {
        using var request = Request(HttpMethod.Get, "/v1/status", token: null);
        request.Headers.TryAddWithoutValidation("Origin", "https://jahat.example");

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task unknown_route_falls_back_to_404_json()
    {
        using var response = await _client.SendAsync(Request(HttpMethod.Get, "/tidak-ada"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal("Endpoint tidak ditemukan.", body["message"]!.GetValue<string>());
    }

    [Fact]
    public async Task finalize_without_multipart_boundary_returns_400()
    {
        var sessionId = await CreateSessionAsync();

        using var content = new ByteArrayContent(Encoding.UTF8.GetBytes("bukan-multipart"));
        content.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
        using var request = Request(HttpMethod.Post, $"/v1/sessions/{sessionId}/finalize");
        request.Content = content;

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal("Multipart tanpa boundary.", body["message"]!.GetValue<string>());
    }

    [Fact]
    public async Task finalize_multipart_without_photo_returns_400()
    {
        var sessionId = await CreateSessionAsync();

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("0"), "retake_count");
        using var request = Request(HttpMethod.Post, $"/v1/sessions/{sessionId}/finalize");
        request.Content = form;

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        Assert.Equal("Minimal satu foto wajib diunggah.", body["message"]!.GetValue<string>());
    }

    private async Task<string> CreateSessionAsync()
    {
        var payload = new JsonObject
        {
            ["package_id"] = "pkg-uji",
            ["package_snapshot"] = new JsonObject { ["package_id"] = "pkg-uji", ["name"] = "Paket Uji" },
        };
        using var request = Request(HttpMethod.Post, "/v1/sessions");
        request.Content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");

        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        return body["id"]!.GetValue<string>();
    }
}
