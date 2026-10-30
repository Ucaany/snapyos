namespace SnapyOS.Booth.Core;

/// <summary>
/// Kesalahan yang diterjemahkan bridge menjadi respons HTTP. Bentuknya sepadan
/// dengan <c>HttpError</c> runtime Node (<c>runtime/http.ts</c>): status + kode
/// mesin untuk kiosk (mis. <c>FIELD_NOT_DEVICE_OWNED</c>).
/// </summary>
public sealed class BridgeException : Exception
{
    public int StatusCode { get; }

    public string? Code { get; }

    public BridgeException(string message, int statusCode = 400, string? code = null)
        : base(message)
    {
        StatusCode = statusCode;
        Code = code;
    }
}

/// <summary>Kode kesalahan setelan — sama persis dengan runtime Node.</summary>
public static class SettingErrorCodes
{
    public const string FieldNotDeviceOwned = "FIELD_NOT_DEVICE_OWNED";
    public const string InvalidSettings = "INVALID_SETTINGS";
    public const string SchemaVersionTooNew = "SCHEMA_VERSION_TOO_NEW";
    public const string PhotoboxMismatch = "PHOTOBOX_MISMATCH";
    public const string LocalOnlySetting = "LOCAL_ONLY_SETTING";
    public const string SessionExpired = "SESSION_EXPIRED";
}
