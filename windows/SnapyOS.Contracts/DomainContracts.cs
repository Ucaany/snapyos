using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SnapyOS.Contracts;

public static class ContractSchema
{
    public const int CurrentVersion = 1;
}

public enum DataOwner { Local, Cloud, Shared }
public enum SyncDirection { None, ToCloud, FromCloud, Bidirectional }
public enum PairingStatus { Unpaired, Pending, Paired, Revoked, Failed }
public enum DeviceStatus { Active, Disabled, Revoked }
public enum KioskScreenId { Welcome, Guide, Package, Payment, Template, Capture, Review, Editor, Printing, Result, Offline, Error, Maintenance }
public enum KioskOrientation { Portrait, Landscape }
public enum KioskScreenState { Loading, Empty, Ready, Error, Offline, Maintenance, Fallback }
public enum KioskLayoutKind { Center, Split, Grid, Camera, Review, Editor, Progress, Result, Status }
public enum ElementKind { Text, Image, Shape, Frame, QrCode }
public enum CameraProvider { Browser, Bridge, GPhoto2, DigiCamControl, Libcamera, V4L2, PyAv }
public enum CameraFacingMode { User, Environment }
public enum PrinterKind { Windows, Cups, Bluetooth, Browser }
public enum PrinterStatus { Unknown, Ready, Offline, Error, Submitted }
public enum SessionMode { Online, OfflineCash }
public enum LocalSessionState { SessionStart, PaidUnlock, Capture, Review, Edit, Finalize, Print, OutputManifest, PendingSync, Synced, TimedOut, Failed, Quarantined }
public enum LocalSessionTransitionReason { Started, Paid, Captured, Reviewed, Edited, Finalized, PrintSubmitted, ManifestWritten, SyncQueued, SyncAcknowledged, Failure, Quarantined, Timeout, AutoFinalizeTimeout, RestartRecovery }
public enum PaymentMethod { Qris, Gateway, Cash, Voucher }
public enum PaymentStatus { Creating, Pending, Paid, Failed, Expired, Cancelled, Refunded }
public enum LocalMediaState { Pending, Finalized, Synced, Quarantined, Deleted }
public enum SyncQueueState { Pending, Running, Retrying, Synced, Quarantined, Failed }
public enum InstallerArtifactType { Msi, Msix, Zip }
public enum ReleaseChannel { Stable, Beta, Internal }
public enum RetentionUnit { Days }

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Property | AttributeTargets.Field)]
public sealed class ContractFieldAttribute(DataOwner owner, SyncDirection sync = SyncDirection.None) : Attribute
{
    public DataOwner Owner { get; } = owner;
    public SyncDirection Sync { get; } = sync;
}

[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field)]
public sealed class SecretExcludedAttribute : Attribute
{
}

public abstract record ContractDocument
{
    [Required, Range(1, int.MaxValue)]
    public int SchemaVersion { get; init; } = ContractSchema.CurrentVersion;
}

[ContractField(DataOwner.Shared, SyncDirection.Bidirectional)]
public sealed record DeviceIdentity : ContractDocument
{
    [Required, StringLength(128)] public required string DeviceId { get; init; }
    [Required, StringLength(128)] public required string BusinessSlug { get; init; }
    [Required, StringLength(128)] public required string PhotoboxSlug { get; init; }
    [Required] public DeviceStatus Status { get; init; }
    [Required] public DateTimeOffset LastSeenAt { get; init; }
    [ContractField(DataOwner.Local), Required, StringLength(128)] public required string HostId { get; init; }
    [SecretExcluded, JsonIgnore, ContractField(DataOwner.Local)] public string? DeviceToken { get; init; }
}

[ContractField(DataOwner.Shared, SyncDirection.Bidirectional)]
public sealed record PairingState : ContractDocument
{
    [Required] public PairingStatus Status { get; init; }
    [StringLength(6, MinimumLength = 6)] public string? ActivationCode { get; init; }
    public DateTimeOffset? ExpiresAt { get; init; }
    [ContractField(DataOwner.Cloud, SyncDirection.FromCloud)] public string? CloudDeviceId { get; init; }
    [SecretExcluded, JsonIgnore] public string? DeviceToken { get; init; }
}

[ContractField(DataOwner.Shared, SyncDirection.Bidirectional)]
public sealed record BrandTheme : ContractDocument
{
    [Required, StringLength(128)] public required string BrandName { get; init; }
    [StringLength(500)] public string? LogoAssetKey { get; init; }
    [StringLength(500)] public string? VideoAssetKey { get; init; }
    [Required, RegularExpression("^#[0-9A-Fa-f]{6}$")] public required string BackgroundColor { get; init; }
    [Required, RegularExpression("^#[0-9A-Fa-f]{6}$")] public required string TextColor { get; init; }
    [Range(0.8, 1.4)] public double FontScale { get; init; } = 1;
    [ContractField(DataOwner.Local)] public bool IsBoothOverride { get; init; }
}

[ContractField(DataOwner.Shared, SyncDirection.Bidirectional)]
public sealed record KioskScreen : ContractDocument
{
    [Required] public KioskScreenId Screen { get; init; }
    [Required] public BrandTheme Theme { get; init; } = new() { BrandName = "", BackgroundColor = "#FFFFFF", TextColor = "#000000" };
    [Range(0, 96)] public int Padding { get; init; }
    [Range(0, 24)] public int ButtonRadius { get; init; }
    public bool ShowLogo { get; init; } = true;
    [StringLength(80)] public string? Title { get; init; }
    [StringLength(160)] public string? Hint { get; init; }
}

[ContractField(DataOwner.Cloud, SyncDirection.FromCloud)]
public sealed record CanvasElement : ContractDocument
{
    [Required, StringLength(128)] public required string ElementId { get; init; }
    [Required] public ElementKind Kind { get; init; }
    [Range(0, 100000)] public int X { get; init; }
    [Range(0, 100000)] public int Y { get; init; }
    [Range(1, 100000)] public int Width { get; init; }
    [Range(1, 100000)] public int Height { get; init; }
    [Range(0, 360)] public int RotationDegrees { get; init; }
    [Range(-100000, 100000)] public int ZIndex { get; init; }
    public bool IsVisible { get; init; } = true;
    public bool IsLocked { get; init; }
    [StringLength(500)] public string? AssetKey { get; init; }
    [StringLength(2000)] public string? Text { get; init; }
    [StringLength(160)] public string? Purpose { get; init; }
    [StringLength(128)] public string? GroupId { get; init; }
    [StringLength(64)] public string? OrientationProfile { get; init; }
    public IReadOnlyDictionary<string, string> Style { get; init; } = new Dictionary<string, string>();
    public IReadOnlyDictionary<string, string> Bindings { get; init; } = new Dictionary<string, string>();
}

[ContractField(DataOwner.Cloud, SyncDirection.FromCloud)]
public sealed record AssetManifest : ContractDocument
{
    [Required, StringLength(128)] public required string AssetId { get; init; }
    [Required, StringLength(500)] public required string ObjectKey { get; init; }
    [Required, StringLength(128)] public required string ContentType { get; init; }
    [Range(1, long.MaxValue)] public long SizeBytes { get; init; }
    [Required, RegularExpression("^[0-9a-fA-F]{64}$")] public required string Sha256 { get; init; }
    [ContractField(DataOwner.Cloud, SyncDirection.FromCloud)] public string? SignedUrl { get; init; }
    [SecretExcluded, JsonIgnore] public string? AccessCredential { get; init; }
}

public enum TemplateCatalogState { Active, Revoked }

[ContractField(DataOwner.Cloud, SyncDirection.FromCloud)]
public sealed record TemplateCatalogDocument : ContractDocument
{
    [Required, StringLength(128)] public required string CatalogVersion { get; init; }
    [StringLength(128)] public string? PackageId { get; init; }
    [Required] public IReadOnlyList<TemplateCatalogItem> Templates { get; init; } = [];
    [Required] public IReadOnlyList<string> RevokedTemplateIds { get; init; } = [];
}

[ContractField(DataOwner.Local, SyncDirection.ToCloud)]
public sealed record CameraProfile : ContractDocument
{
    [Required] public CameraProvider Provider { get; init; }
    [StringLength(500)] public string? DeviceName { get; init; }
    [Range(1, 10000)] public int CaptureWidth { get; init; } = 1920;
    [Range(1, 10000)] public int CaptureHeight { get; init; } = 1080;
    [Range(0.1, 1)] public double JpegQuality { get; init; } = 0.92;
    [Required] public CameraFacingMode FacingMode { get; init; }
    public bool MirrorPreview { get; init; } = true;
    [ContractField(DataOwner.Local)] public bool ChromaKeyEnabled { get; init; }
}

[ContractField(DataOwner.Local, SyncDirection.ToCloud)]
public sealed record CameraCalibration : ContractDocument
{
    [Range(0, 270)] public int RotationDegrees { get; init; }
    [Range(1, 5)] public double Zoom { get; init; } = 1;
    [Range(-1, 1)] public double HorizontalOffset { get; init; }
    [Range(-1, 1)] public double VerticalOffset { get; init; }
    [ContractField(DataOwner.Local)] public DateTimeOffset CalibratedAt { get; init; }
}

[ContractField(DataOwner.Shared, SyncDirection.Bidirectional)]
public sealed record PrinterProfile : ContractDocument
{
    [Required] public PrinterKind Kind { get; init; }
    [StringLength(256)] public string? PrinterName { get; init; }
    [Required] public PrinterStatus Status { get; init; }
    [Range(1, 1000)] public int PaperWidthMm { get; init; } = 101;
    [Range(1, 1000)] public int PaperHeightMm { get; init; } = 152;
    public bool AutoPrint { get; init; } = true;
    [ContractField(DataOwner.Local)] public DateTimeOffset? LastTestedAt { get; init; }
}

[ContractField(DataOwner.Shared, SyncDirection.Bidirectional)]
public sealed record SessionPolicy : ContractDocument
{
    [Range(30, 86400)] public int TimerSeconds { get; init; } = 300;
    public bool AutoFinalizeOnTimeout { get; init; }
    [Range(1, 86400)] public int WarningSeconds { get; init; } = 60;
    [Range(0, 100)] public int? MaxRetakes { get; init; }
    public bool AllowOfflineCash { get; init; }
    [ContractField(DataOwner.Cloud, SyncDirection.FromCloud)] public int MaxConcurrentSessions { get; init; } = 1;
}

[ContractField(DataOwner.Cloud, SyncDirection.FromCloud)]
public sealed record PaymentSession : ContractDocument
{
    [Required, StringLength(128)] public required string PaymentReference { get; init; }
    [Required, StringLength(128)] public required string CheckoutSessionId { get; init; }
    [Required] public PaymentMethod Method { get; init; }
    [Required] public PaymentStatus Status { get; init; }
    [Range(0, long.MaxValue)] public long FinalAmountIdr { get; init; }
    public DateTimeOffset? ExpiresAt { get; init; }
    [ContractField(DataOwner.Cloud, SyncDirection.FromCloud)] public string? ResultToken { get; init; }
    [SecretExcluded, JsonIgnore] public string? ProviderCredential { get; init; }
    [SecretExcluded, JsonIgnore] public string? WebhookSecret { get; init; }
    [SecretExcluded, JsonIgnore] public string? ApiKey { get; init; }
}

[ContractField(DataOwner.Local, SyncDirection.ToCloud)]
public sealed record LocalMediaRecord : ContractDocument
{
    [Required, StringLength(128)] public required string MediaId { get; init; }
    [Required, StringLength(128)] public required string LocalSessionId { get; init; }
    [Required, StringLength(500)] public required string RelativePath { get; init; }
    [Required] public LocalMediaState State { get; init; }
    [Required, StringLength(128)] public required string Sha256 { get; init; }
    [Range(1, long.MaxValue)] public long SizeBytes { get; init; }
    [ContractField(DataOwner.Local)] public DateTimeOffset CreatedAt { get; init; }
}

[ContractField(DataOwner.Local, SyncDirection.ToCloud)]
public sealed record SyncQueueItem : ContractDocument
{
    [Required, StringLength(128)] public required string QueueItemId { get; init; }
    [Required, StringLength(128)] public required string LocalSessionId { get; init; }
    [Required] public SyncQueueState State { get; init; }
    [Range(0, 1000)] public int Attempts { get; init; }
    public DateTimeOffset NextAttemptAt { get; init; }
    [StringLength(500)] public string? LastError { get; init; }
    [ContractField(DataOwner.Local)] public DateTimeOffset CreatedAt { get; init; }
}

[ContractField(DataOwner.Cloud, SyncDirection.FromCloud)]
public sealed record InstallerCatalogItem : ContractDocument
{
    [Required, StringLength(128)] public required string ItemId { get; init; }
    [Required, StringLength(64)] public required string Version { get; init; }
    [Required] public ReleaseChannel Channel { get; init; }
    [Required] public InstallerArtifactType ArtifactType { get; init; }
    [Required, StringLength(32)] public required string TargetWindows { get; init; }
    [Required, StringLength(128)] public required string Sha256 { get; init; }
    [Range(1, long.MaxValue)] public long SizeBytes { get; init; }
    [Required, StringLength(500)] public required string DownloadUrl { get; init; }
    [StringLength(2000)] public string? ReleaseNotes { get; init; }
    public bool IsAvailable { get; init; }
}

[ContractField(DataOwner.Cloud, SyncDirection.FromCloud)]
public sealed record TemplateCatalogItem : ContractDocument
{
    [Required, StringLength(128)] public required string TemplateId { get; init; }
    [Required, StringLength(160)] public required string Name { get; init; }
    [Required, StringLength(80)] public required string Category { get; init; }
    [Range(0, 100)] public int SlotCount { get; init; }
    [Required] public IReadOnlyList<CanvasElement> Elements { get; init; } = [];
    [JsonPropertyName("layout")] public JsonElement? Layout { get; init; }
    [Required] public IReadOnlyList<AssetManifest> Assets { get; init; } = [];
    [ContractField(DataOwner.Cloud, SyncDirection.FromCloud)] public bool IsActive { get; init; }
    [ContractField(DataOwner.Cloud, SyncDirection.FromCloud)] public TemplateCatalogState State { get; init; } = TemplateCatalogState.Active;
    [ContractField(DataOwner.Cloud, SyncDirection.FromCloud)] public IReadOnlyList<string> EligiblePackageIds { get; init; } = [];
}

[ContractField(DataOwner.Shared, SyncDirection.Bidirectional)]
public sealed record RetentionPolicy : ContractDocument
{
    [Required] public RetentionUnit Unit { get; init; } = RetentionUnit.Days;
    [Range(1, 3650)] public int ResultDays { get; init; } = 3;
    [Range(1, 3650)] public int LocalMediaDays { get; init; } = 3;
    [ContractField(DataOwner.Cloud, SyncDirection.FromCloud)] public bool CloudAuthoritative { get; init; } = true;
}

public static class ContractValidator
{
    public static void ThrowIfInvalid<T>(T model)
    {
        var errors = Validate(model);
        if (errors.Count > 0) throw new ValidationException(string.Join(" ", errors.Select(error => error.ErrorMessage)));
    }

    public static IReadOnlyList<ValidationResult> Validate<T>(T model)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(model!, new ValidationContext(model!), results, validateAllProperties: true);
        foreach (var property in model?.GetType().GetProperties() ?? [])
        {
            if (property.GetValue(model) is not IEnumerable<object> children) continue;
            foreach (var child in children.OfType<ContractDocument>())
                results.AddRange(Validate(child));
        }

        switch (model)
        {
            case BrandTheme theme when !ContrastRatioPasses(theme.TextColor, theme.BackgroundColor):
                results.Add(new ValidationResult("TextColor and BackgroundColor must meet WCAG AA contrast."));
                break;
            case SessionPolicy policy when policy.WarningSeconds >= policy.TimerSeconds:
                results.Add(new ValidationResult("WarningSeconds must be less than TimerSeconds."));
                break;
            case RetentionPolicy retention when retention.LocalMediaDays < retention.ResultDays:
                results.Add(new ValidationResult("LocalMediaDays must cover ResultDays."));
                break;
            case AssetManifest asset when !IsSafeAsset(asset):
                results.Add(new ValidationResult("Asset manifest contains an unsafe key, content type, or checksum."));
                break;
        }
        return results;
    }

    private static bool IsSafeAsset(AssetManifest asset) =>
        asset.SizeBytes > 0 &&
        asset.Sha256 is not null && asset.Sha256.Length == 64 && asset.Sha256.All(Uri.IsHexDigit) &&
        asset.ContentType is "image/png" or "image/jpeg" or "image/webp" or "video/mp4" or "video/webm" or "font/woff" or "font/woff2" or "font/ttf" or "font/otf" &&
        asset.ObjectKey is not null &&
        !asset.ObjectKey.Contains("..", StringComparison.Ordinal) &&
        !asset.ObjectKey.Contains('\\') &&
        !asset.ObjectKey.StartsWith('/');

    private static bool ContrastRatioPasses(string foreground, string background)
    {
        static double L(string hex)
        {
            var c = new[] { Convert.ToInt32(hex[1..3], 16), Convert.ToInt32(hex[3..5], 16), Convert.ToInt32(hex[5..7], 16) }
                .Select(v => v / 255d)
                .Select(v => v <= 0.03928 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4))
                .ToArray();
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        }
        var ratio = (Math.Max(L(foreground), L(background)) + 0.05) / (Math.Min(L(foreground), L(background)) + 0.05);
        return ratio >= 4.5;
    }
}

public static class ContractJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() }
    };

    public static string Serialize<T>(T model) => JsonSerializer.Serialize(model, Options);
}
