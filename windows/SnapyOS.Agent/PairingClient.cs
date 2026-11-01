using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SnapyOS.Agent;

public sealed class DpapiDeviceTokenStore : IDeviceTokenStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SnapyOS.DeviceToken.v1");
    private readonly string _path;

    public DpapiDeviceTokenStore(string directory)
    {
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "device-token.bin");
    }

    public void Save(string token) => File.WriteAllBytes(_path, ProtectedData.Protect(Encoding.UTF8.GetBytes(token), Entropy, DataProtectionScope.LocalMachine));
    public string? Read() => File.Exists(_path) ? Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(_path), Entropy, DataProtectionScope.LocalMachine)) : null;
    public void Clear() => File.Delete(_path);
}

public sealed class PairingClient
{
    private readonly HttpClient _http;
    private readonly IDeviceTokenStore _tokens;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = null,
        PropertyNameCaseInsensitive = true
    };
    private PairingSnapshot _snapshot = new(PairingClientState.Unpaired, null, null, null);

    public PairingClient(HttpClient http, IDeviceTokenStore tokens)
    {
        _http = http;
        _tokens = tokens;
    }

    public PairingSnapshot Snapshot => _snapshot;

    public async Task<PairCodeResponse> GeneratePairCodeAsync(string businessId, string photoboxId, CancellationToken cancellationToken = default)
    {
        var envelope = await _http.GetFromJsonAsync<ApiEnvelope<PairCodeResponse>>(PairingEndpoints.Activation(businessId, photoboxId), _json, cancellationToken) ?? throw new InvalidOperationException("Activation response was empty.");
        var response = envelope.Data ?? throw new InvalidOperationException("Activation data was empty.");
        return response with { QrPayload = JsonSerializer.Serialize(new { action = PairingEndpoints.Activate, code = response.Code }) };
    }

    public async Task<DeviceProfile> ActivateAsync(string code, CancellationToken cancellationToken = default)
    {
        _snapshot = _snapshot with { State = PairingClientState.Pairing, LastError = null };
        var response = await PostAsync<ActivateDeviceRequest, ActivateDeviceResponse>(PairingEndpoints.Activate, new(code), cancellationToken);
        _tokens.Save(response.DeviceToken);
        return await VerifyAsync(response.DeviceToken, cancellationToken);
    }

    public async Task<DeviceProfile> VerifyAsync(string? token = null, CancellationToken cancellationToken = default)
    {
        var deviceToken = token ?? _tokens.Read();
        if (string.IsNullOrWhiteSpace(deviceToken))
        {
            _snapshot = _snapshot with { State = PairingClientState.Unpaired, LastError = null };
            throw new InvalidOperationException("Device is not paired.");
        }
        try
        {
            var response = await PostAsync<DeviceTokenRequest, DeviceVerifyResponse>(PairingEndpoints.Verify, new(deviceToken), cancellationToken);
            var profile = new DeviceProfile(response.DeviceId, response.BusinessSlug, response.Photobox.SlugOrEmpty("slug"), response.Photobox.StringOrNull("name"), PairingClientState.Paired);
            _snapshot = new(PairingClientState.Paired, profile, DateTimeOffset.UtcNow, null);
            return profile;
        }
        catch (HttpRequestException ex)
        {
            _snapshot = _snapshot with { State = PairingClientState.OfflinePaired, LastError = ex.Message };
            throw;
        }
        catch (UnauthorizedAccessException ex)
        {
            _tokens.Clear();
            _snapshot = _snapshot with { State = PairingClientState.NeedsRepair, LastError = ex.Message };
            throw;
        }
    }

    public async Task<JsonObject> UpdateDeviceSettingsAsync(JsonObject settings, CancellationToken cancellationToken = default)
    {
        var token = _tokens.Read() ?? throw new InvalidOperationException("Device is not paired.");
        return await PostAsync<DeviceSettingsRequest, JsonObject>(PairingEndpoints.Settings, new(token, settings), cancellationToken);
    }

    public async Task HeartbeatAsync(CancellationToken cancellationToken = default)
    {
        var token = _tokens.Read() ?? throw new InvalidOperationException("Device is not paired.");
        try
        {
            await PostAsync<DeviceTokenRequest, JsonObject>(PairingEndpoints.Report, new(token), cancellationToken);
            _snapshot = _snapshot with { State = PairingClientState.Paired, LastVerifiedAt = DateTimeOffset.UtcNow, LastError = null };
        }
        catch (HttpRequestException ex)
        {
            _snapshot = _snapshot with { State = PairingClientState.OfflinePaired, LastError = ex.Message };
            throw;
        }
    }

    public async Task RevokeAsync(string businessId, string deviceId, CancellationToken cancellationToken = default)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, PairingEndpoints.Revoke(businessId, deviceId));
        var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
            throw new UnauthorizedAccessException("Owner authentication is required for device revoke.");
        if (!response.IsSuccessStatusCode && response.StatusCode != System.Net.HttpStatusCode.NotFound)
            throw new HttpRequestException($"Device revoke failed: {(int)response.StatusCode}.");
        _tokens.Clear();
        _snapshot = new(PairingClientState.Revoked, null, null, null);
    }

    private async Task<TResponse> PostAsync<TRequest, TResponse>(string path, TRequest body, CancellationToken cancellationToken)
    {
        var response = await _http.PostAsJsonAsync(path, body, _json, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
            throw new UnauthorizedAccessException("Device token rejected.");
        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<ApiEnvelope<TResponse>>(_json, cancellationToken) ?? throw new InvalidOperationException("Device response was empty.");
        return envelope.Data ?? throw new InvalidOperationException("Device response data was empty.");
    }
}

public sealed record DeviceTokenRequest([property: JsonPropertyName("device_token")] string DeviceToken);
public sealed record DeviceSettingsRequest([property: JsonPropertyName("device_token")] string DeviceToken, [property: JsonPropertyName("settings")] JsonObject Settings);
public sealed record ApiEnvelope<T>([property: JsonPropertyName("data")] T? Data);

internal static class JsonObjectExtensions
{
    public static string SlugOrEmpty(this JsonObject obj, string key) => obj[key]?.GetValue<string>() ?? string.Empty;
    public static string? StringOrNull(this JsonObject obj, string key) => obj[key]?.GetValue<string>();
}
