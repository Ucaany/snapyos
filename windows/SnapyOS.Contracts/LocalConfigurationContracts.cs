using System.Collections;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace SnapyOS.Contracts;

public static class LocalConfigurationSchema
{
    public const int CurrentVersion = 3;
    public const string BundleFormat = "snapyos.local-config";
}

public enum LocalMonitorOrientation { Unknown, Portrait, Landscape }
public enum LocalConfigurationAssetKind { Logo, Video, Template, Font, Other }

public sealed record LocalConfigurationAsset
{
    [Required, StringLength(128)] public required string AssetId { get; init; }
    [Required, StringLength(500)] public required string RelativePath { get; init; }
    [Required, StringLength(128)] public required string ContentType { get; init; }
    [Range(1, long.MaxValue)] public long SizeBytes { get; init; }
    [Required, RegularExpression("^[0-9a-fA-F]{64}$")] public required string Sha256 { get; init; }
    [Required] public LocalConfigurationAssetKind Kind { get; init; }
    public bool Required { get; init; } = true;
}

public sealed record LocalScreenConfiguration
{
    [Required] public KioskScreenId Screen { get; init; }
    [Required] public required KioskScreenLayout Portrait { get; init; }
    [Required] public required KioskScreenLayout Landscape { get; init; }
    [Required] public IReadOnlyList<CanvasElement> Elements { get; init; } = [];
    public IReadOnlyDictionary<string, string> Text { get; init; } = new Dictionary<string, string>();
    public IReadOnlyDictionary<string, string> Font { get; init; } = new Dictionary<string, string>();
    public IReadOnlyDictionary<string, string> Colors { get; init; } = new Dictionary<string, string>();
    public IReadOnlyList<string> AssetIds { get; init; } = [];
    public IReadOnlyList<string> TemplateIds { get; init; } = [];
}

public sealed record LocalCameraProfile
{
    [Required, StringLength(128)] public required string ProfileId { get; init; }
    [Required] public CameraProfile Profile { get; init; } = new();
    [StringLength(128)] public string? HardwareId { get; init; }
}

public sealed record LocalCalibrationProfile
{
    [Required, StringLength(128)] public required string ProfileId { get; init; }
    [Required, StringLength(128)] public required string CameraId { get; init; }
    [Required] public LocalMonitorOrientation MonitorOrientation { get; init; }
    [Range(0, 1)] public double CropLeft { get; init; }
    [Range(0, 1)] public double CropTop { get; init; }
    [Range(0.01, 1)] public double CropWidth { get; init; } = 1;
    [Range(0.01, 1)] public double CropHeight { get; init; } = 1;
    [Range(0, 270)] public int RotationDegrees { get; init; }
    public bool Mirror { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
}

public sealed record LocalPrinterProfile
{
    [Required, StringLength(128)] public required string ProfileId { get; init; }
    [Required] public PrinterProfile Profile { get; init; } = new();
    [StringLength(128)] public string? HardwareId { get; init; }
}

public sealed record LocalMonitorProfile
{
    [Required, StringLength(128)] public required string MonitorId { get; init; }
    [Required, StringLength(256)] public required string Name { get; init; }
    [Required] public LocalMonitorOrientation Orientation { get; init; }
    [Range(1, int.MaxValue)] public int PixelWidth { get; init; }
    [Range(1, int.MaxValue)] public int PixelHeight { get; init; }
}

public sealed record LocalTemplateReference
{
    [Required, StringLength(128)] public required string TemplateId { get; init; }
    [StringLength(128)] public string? CatalogVersion { get; init; }
    public bool Required { get; init; } = true;
}

public sealed record LocalConfigurationSnapshot
{
    [Range(1, int.MaxValue)] public int SchemaVersion { get; init; } = LocalConfigurationSchema.CurrentVersion;
    [Required, StringLength(128)] public required string DeviceId { get; init; }
    [Required, StringLength(128)] public required string BusinessSlug { get; init; }
    [Required, StringLength(128)] public required string PhotoboxSlug { get; init; }
    [Required] public BrandTheme Branding { get; init; } = new() { BrandName = "", BackgroundColor = "#FFFDF5", TextColor = "#111111" };
    [Required] public IReadOnlyList<LocalScreenConfiguration> Screens { get; init; } = [];
    [Required] public IReadOnlyList<LocalCameraProfile> CameraProfiles { get; init; } = [];
    [Required] public IReadOnlyList<LocalCalibrationProfile> Calibrations { get; init; } = [];
    [Required] public IReadOnlyList<LocalPrinterProfile> PrinterProfiles { get; init; } = [];
    [Required] public IReadOnlyList<LocalMonitorProfile> Monitors { get; init; } = [];
    [Required] public SessionPolicy Session { get; init; } = new();
    [Required] public IReadOnlyList<LocalTemplateReference> Templates { get; init; } = [];
    [Required] public IReadOnlyList<LocalConfigurationAsset> Assets { get; init; } = [];
}

public sealed record ConfigurationBundleEntry(
    [property: Required, StringLength(500)] string Path,
    [property: Required, StringLength(32)] string Kind,
    [property: Required, StringLength(128)] string ContentType,
    [property: Range(1, long.MaxValue)] long SizeBytes,
    [property: Required, RegularExpression("^[0-9a-fA-F]{64}$")] string Sha256);

public sealed record ConfigurationBundleManifest
{
    [Required] public string Format { get; init; } = LocalConfigurationSchema.BundleFormat;
    [Range(1, int.MaxValue)] public int BundleVersion { get; init; } = 1;
    [Range(1, int.MaxValue)] public int ConfigurationSchemaVersion { get; init; } = LocalConfigurationSchema.CurrentVersion;
    [Required] public DateTimeOffset CreatedAt { get; init; }
    [Required, StringLength(128)] public required string DeviceId { get; init; }
    [Required, StringLength(128)] public required string BusinessSlug { get; init; }
    [Required, StringLength(128)] public required string PhotoboxSlug { get; init; }
    [Required] public IReadOnlyList<ConfigurationBundleEntry> Entries { get; init; } = [];
    [Required] public IReadOnlyList<string> Exclusions { get; init; } = [];
    [Required] public string ManifestSha256 { get; init; } = string.Empty;
}

public sealed record ConfigurationDiffEntry(string Path, string Change, string? BeforeSha256, string? AfterSha256);
public enum ConfigurationIssueSeverity { Required, Warning }
public sealed record ConfigurationCompatibilityIssue(string Code, string Message, ConfigurationIssueSeverity Severity);

public sealed record ConfigurationImportPreview(
    string PreviewId,
    LocalConfigurationSnapshot Snapshot,
    ConfigurationBundleManifest Manifest,
    IReadOnlyList<ConfigurationDiffEntry> Changes,
    IReadOnlyList<ConfigurationCompatibilityIssue> Issues,
    string StagingDirectory) : IDisposable
{
    public bool CanApply => Issues.All(issue => issue.Severity != ConfigurationIssueSeverity.Required);
    public void Dispose()
    {
        try { if (Directory.Exists(StagingDirectory)) Directory.Delete(StagingDirectory, true); }
        catch { /* best effort cleanup; recovery removes stale staging */ }
    }
}

public sealed record ConfigurationExportResult(ConfigurationBundleManifest Manifest);
public sealed record ConfigurationBundleApplyResult(string RevisionId, string? BackupRevisionId, bool RolledBack = false);

public static class LocalConfigurationValidator
{
    private static readonly HashSet<KioskScreenId> Screens = Enum.GetValues<KioskScreenId>().ToHashSet();
    private static readonly HashSet<string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "font/woff", "font/woff2", "font/ttf", "font/otf"
    };

    public static IReadOnlyList<ValidationResult> Validate(LocalConfigurationSnapshot snapshot)
    {
        var errors = new List<ValidationResult>();
        ValidateObjectGraph(snapshot, errors, new HashSet<object>(ReferenceEqualityComparer.Instance));
        if (snapshot.SchemaVersion > LocalConfigurationSchema.CurrentVersion)
            errors.Add(new ValidationResult("Configuration schema is newer than this application."));
        if (snapshot.Screens.Select(screen => screen.Screen).Distinct().Count() != Screens.Count || !Screens.SetEquals(snapshot.Screens.Select(screen => screen.Screen)))
            errors.Add(new ValidationResult("Configuration must contain exactly one layout for every kiosk screen."));
        foreach (var asset in snapshot.Assets)
        {
            if (!ContentTypes.Contains(asset.ContentType) || !IsSafePath(asset.RelativePath) || asset.SizeBytes <= 0)
                errors.Add(new ValidationResult($"Asset '{asset.AssetId}' is unsafe or unsupported."));
        }
        if (snapshot.Assets.GroupBy(asset => asset.AssetId, StringComparer.Ordinal).Any(group => group.Count() > 1))
            errors.Add(new ValidationResult("Asset IDs must be unique."));
        if (snapshot.Screens.SelectMany(screen => screen.AssetIds).Except(snapshot.Assets.Select(asset => asset.AssetId), StringComparer.Ordinal).Any())
            errors.Add(new ValidationResult("Screen references a missing asset."));
        return errors;
    }

    private static void ValidateObjectGraph(object? value, List<ValidationResult> errors, HashSet<object> seen)
    {
        if (value is null || value is string || value.GetType().IsValueType || !seen.Add(value)) return;
        Validator.TryValidateObject(value, new ValidationContext(value), errors, true);
        if (value is IEnumerable items)
        {
            foreach (var item in items) ValidateObjectGraph(item, errors, seen);
            return;
        }
        foreach (var property in value.GetType().GetProperties())
            ValidateObjectGraph(property.GetValue(value), errors, seen);
    }

    public static bool IsSafePath(string path) =>
        !string.IsNullOrWhiteSpace(path) && !Path.IsPathRooted(path) &&
        !path.Contains('\\') && path.Split('/').All(part => part.Length > 0 && part != "." && part != "..") &&
        path.StartsWith("assets/", StringComparison.Ordinal);

    public static bool IsAllowedContentType(string contentType) => ContentTypes.Contains(contentType);
}
