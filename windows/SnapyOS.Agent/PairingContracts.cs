using System.Text.Json;
using System.Text.Json.Nodes;

namespace SnapyOS.Agent;

public enum PairingClientState { Unpaired, Pairing, Paired, OfflinePaired, Revoked, NeedsRepair }

public sealed record PairCodeRequest(string BusinessId, string PhotoboxId);
public sealed record PairCodeResponse(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("expires_at")] DateTimeOffset ExpiresAt,
    [property: JsonPropertyName("photobox_slug")] string PhotoboxSlug,
    [property: JsonPropertyName("qr_payload")] string QrPayload);
public sealed record ActivateDeviceRequest([property: JsonPropertyName("code")] string Code);
public sealed record ActivateDeviceResponse(
    [property: JsonPropertyName("device_token")] string DeviceToken,
    [property: JsonPropertyName("device_id")] string DeviceId,
    [property: JsonPropertyName("photobox_id")] string PhotoboxId);
public sealed record DeviceProfile(string DeviceId, string BusinessSlug, string PhotoboxSlug, string? PhotoboxName, PairingClientState State);
public sealed record DeviceVerifyResponse(
    [property: JsonPropertyName("device_id")] string DeviceId,
    [property: JsonPropertyName("business_slug")] string BusinessSlug,
    [property: JsonPropertyName("kiosk_locked")] bool KioskLocked,
    [property: JsonPropertyName("photobox")] JsonObject Photobox,
    [property: JsonPropertyName("active_session")] JsonObject? ActiveSession,
    [property: JsonPropertyName("claimable_checkout_id")] string? ClaimableCheckoutId);
public sealed record PairingSnapshot(PairingClientState State, DeviceProfile? Profile, DateTimeOffset? LastVerifiedAt, string? LastError);

public static class PairingEndpoints
{
    public static string Activation(string businessId, string photoboxId) => $"/api/v1/business/{Uri.EscapeDataString(businessId)}/photoboxes/{Uri.EscapeDataString(photoboxId)}/activation";
    public const string Activate = "/api/v1/public/devices/activate";
    public const string Verify = "/api/v1/public/devices/verify";
    public const string Report = "/api/v1/public/devices/report";
    public const string Settings = "/api/v1/public/devices/settings";
    public static string Revoke(string businessId, string deviceId) => $"/api/v1/business/{Uri.EscapeDataString(businessId)}/devices/{Uri.EscapeDataString(deviceId)}";
    public static string PublicConfig(string businessSlug, string photoboxSlug) => $"/api/v1/public/{Uri.EscapeDataString(businessSlug)}?photobox={Uri.EscapeDataString(photoboxSlug)}";
}

public interface IDeviceTokenStore
{
    void Save(string token);
    string? Read();
    void Clear();
}
