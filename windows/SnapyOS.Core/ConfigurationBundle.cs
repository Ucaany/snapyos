using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SnapyOS.Contracts;

namespace SnapyOS.Core;

public sealed record ConfigurationBundleOptions(
    string ConfigurationRoot,
    string DeviceId,
    string BusinessSlug,
    string PhotoboxSlug,
    string? AppVersion = null);

public interface IConfigurationBundleRendererValidator
{
    IReadOnlyList<ConfigurationCompatibilityIssue> Validate(LocalConfigurationSnapshot snapshot);
}

public interface IConfigurationBundleHardwareValidator
{
    IReadOnlyList<ConfigurationCompatibilityIssue> Validate(LocalConfigurationSnapshot snapshot);
}

public sealed class ConfigurationBundleService(
    IConfigurationBundleRendererValidator? renderer = null,
    IConfigurationBundleHardwareValidator? hardware = null)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    public ConfigurationExportResult Export(
        LocalConfigurationSnapshot snapshot,
        string outputPath,
        IReadOnlyDictionary<string, byte[]> assets)
    {
        ValidateSnapshot(snapshot);
        var staging = outputPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        Directory.CreateDirectory(staging);
        try
        {
            var assetRoot = Path.Combine(staging, "assets");
            Directory.CreateDirectory(assetRoot);
            var entries = new List<ConfigurationBundleEntry>();
            var configurationBytes = CanonicalJson(snapshot);
            WriteFile(staging, "configuration.json", configurationBytes, "configuration", "application/json", entries);
            foreach (var asset in snapshot.Assets)
            {
                if (!assets.TryGetValue(asset.AssetId, out var bytes))
                    throw new ConfigurationException($"Missing asset bytes: {asset.AssetId}.");
                if (bytes.LongLength != asset.SizeBytes || !Hash(bytes).Equals(asset.Sha256, StringComparison.OrdinalIgnoreCase))
                    throw new ConfigurationException($"Asset checksum mismatch: {asset.AssetId}.");
                WriteFile(staging, asset.RelativePath, bytes, "asset", asset.ContentType, entries);
            }
            var manifest = new ConfigurationBundleManifest
            {
                CreatedAt = DateTimeOffset.UtcNow,
                DeviceId = snapshot.DeviceId,
                BusinessSlug = snapshot.BusinessSlug,
                PhotoboxSlug = snapshot.PhotoboxSlug,
                ConfigurationSchemaVersion = snapshot.SchemaVersion,
                Entries = entries.OrderBy(entry => entry.Path, StringComparer.Ordinal).ToArray(),
                Exclusions = Exclusions
            };
            manifest = manifest with { ManifestSha256 = Hash(CanonicalManifest(manifest)) };
            WriteFile(staging, "manifest.json", CanonicalJson(manifest), "manifest", "application/json", entries);
            ReplaceDirectory(staging, outputPath);
            return new ConfigurationExportResult(manifest);
        }
        catch
        {
            TryDelete(staging);
            throw;
        }
    }

    public LocalConfigurationSnapshot Read(string bundlePath, string expectedDeviceId)
    {
        if (!Directory.Exists(bundlePath)) throw new ConfigurationException("Configuration bundle directory not found.");
        var manifest = Deserialize<ConfigurationBundleManifest>(ReadBytes(bundlePath, "manifest.json"));
        if (manifest.Format != LocalConfigurationSchema.BundleFormat || manifest.BundleVersion != 1)
            throw new ConfigurationException("Unsupported configuration bundle format.");
        if (manifest.DeviceId != expectedDeviceId) throw new ConfigurationException("Configuration belongs to another device.");
        if (!manifest.ManifestSha256.Equals(Hash(CanonicalManifest(manifest)), StringComparison.OrdinalIgnoreCase))
            throw new ConfigurationException("Configuration manifest checksum is invalid.");
        foreach (var entry in manifest.Entries)
        {
            if (entry.Path == "manifest.json" || !LocalConfigurationValidator.IsSafePath(entry.Path) && entry.Path != "configuration.json")
                throw new ConfigurationException($"Unsafe bundle path: {entry.Path}.");
            var bytes = ReadBytes(bundlePath, entry.Path);
            if (bytes.LongLength != entry.SizeBytes || !Hash(bytes).Equals(entry.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new ConfigurationException($"Bundle entry checksum mismatch: {entry.Path}.");
        }
        var snapshot = Deserialize<LocalConfigurationSnapshot>(ReadBytes(bundlePath, "configuration.json"));
        ValidateSnapshot(snapshot);
        foreach (var asset in snapshot.Assets)
        {
            var entry = manifest.Entries.SingleOrDefault(candidate => candidate.Path == asset.RelativePath && candidate.Kind == "asset");
            if (entry is null)
                throw new ConfigurationException($"Referenced asset is missing from manifest: {asset.AssetId}.");
            if (entry.SizeBytes != asset.SizeBytes || !entry.Sha256.Equals(asset.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new ConfigurationException($"Referenced asset manifest mismatch: {asset.AssetId}.");
            if (!File.Exists(Path.Combine(bundlePath, asset.RelativePath.Replace('/', Path.DirectorySeparatorChar))))
                throw new ConfigurationException($"Referenced asset is missing: {asset.AssetId}.");
        }
        return snapshot;
    }

    public IReadOnlyList<ConfigurationCompatibilityIssue> Validate(LocalConfigurationSnapshot snapshot)
    {
        var issues = LocalConfigurationValidator.Validate(snapshot)
            .Select(error => new ConfigurationCompatibilityIssue("INVALID_CONFIGURATION", error.ErrorMessage ?? "Invalid configuration.", ConfigurationIssueSeverity.Required))
            .ToList();
        if (renderer is not null) issues.AddRange(renderer.Validate(snapshot));
        if (hardware is not null) issues.AddRange(hardware.Validate(snapshot));
        return issues;
    }

    public ConfigurationImportPreview Preview(string bundlePath, string expectedDeviceId, LocalConfigurationSnapshot? active = null)
    {
        var snapshot = Read(bundlePath, expectedDeviceId);
        var issues = Validate(snapshot);
        var changes = active is null
            ? [new ConfigurationDiffEntry("configuration.json", "added", null, Hash(CanonicalJson(snapshot)))]
            : Diff(active, snapshot);
        return new($"preview_{Guid.NewGuid():N}", snapshot,
            Deserialize<ConfigurationBundleManifest>(ReadBytes(bundlePath, "manifest.json")), changes, issues, bundlePath);
    }

    public ConfigurationBundleApplyResult Apply(
        string bundlePath,
        string activePath,
        string expectedDeviceId,
        LocalConfigurationSnapshot? active = null,
        Action? beforeCommit = null)
    {
        var preview = Preview(bundlePath, expectedDeviceId, active);
        if (!preview.CanApply) throw new ConfigurationException(string.Join(" ", preview.Issues.Select(issue => issue.Message)));
        var backupPath = activePath + ".backup";
        try
        {
            beforeCommit?.Invoke();
            if (Directory.Exists(backupPath)) Directory.Delete(backupPath, true);
            if (Directory.Exists(activePath)) Directory.Move(activePath, backupPath);
            Directory.Move(bundlePath, activePath);
            return new ConfigurationBundleApplyResult(preview.PreviewId, Directory.Exists(backupPath) ? backupPath : null);
        }
        catch
        {
            if (Directory.Exists(activePath)) Directory.Delete(activePath, true);
            if (Directory.Exists(backupPath)) Directory.Move(backupPath, activePath);
            throw;
        }
    }

    public ConfigurationBundleApplyResult Rollback(string activePath)
    {
        var backupPath = activePath + ".backup";
        if (!Directory.Exists(backupPath)) throw new ConfigurationException("Configuration backup not found.");
        var failedPath = activePath + ".failed";
        if (Directory.Exists(failedPath)) Directory.Delete(failedPath, true);
        if (Directory.Exists(activePath)) Directory.Move(activePath, failedPath);
        Directory.Move(backupPath, activePath);
        if (Directory.Exists(failedPath)) Directory.Move(failedPath, backupPath);
        return new ConfigurationBundleApplyResult($"rollback_{Guid.NewGuid():N}", backupPath, true);
    }

    private static IReadOnlyList<ConfigurationDiffEntry> Diff(LocalConfigurationSnapshot before, LocalConfigurationSnapshot after)
    {
        var beforeJson = CanonicalJson(before);
        var afterJson = CanonicalJson(after);
        return beforeJson.AsSpan().SequenceEqual(afterJson)
            ? []
            : [new ConfigurationDiffEntry("configuration.json", "changed", Hash(beforeJson), Hash(afterJson))];
    }

    public static byte[] CanonicalJson<T>(T value) => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, Json));

    private static byte[] CanonicalManifest(ConfigurationBundleManifest manifest) =>
        CanonicalJson(manifest with { ManifestSha256 = string.Empty });

    private static void ValidateSnapshot(LocalConfigurationSnapshot snapshot)
    {
        var errors = LocalConfigurationValidator.Validate(snapshot);
        if (errors.Count > 0) throw new ConfigurationException(string.Join(" ", errors.Select(error => error.ErrorMessage)));
    }

    private static void WriteFile(string root, string relative, byte[] bytes, string kind, string contentType, List<ConfigurationBundleEntry> entries)
    {
        if (relative != "configuration.json" && !LocalConfigurationValidator.IsSafePath(relative)) throw new ConfigurationException($"Unsafe bundle path: {relative}.");
        var full = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllBytes(full, bytes);
        entries.Add(new(relative, kind, contentType, bytes.LongLength, Hash(bytes)));
    }

    private static byte[] ReadBytes(string root, string relative)
    {
        if (relative != "configuration.json" && relative != "manifest.json" && !LocalConfigurationValidator.IsSafePath(relative)) throw new ConfigurationException($"Unsafe bundle path: {relative}.");
        return File.ReadAllBytes(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
    }

    private static T Deserialize<T>(byte[] bytes) => JsonSerializer.Deserialize<T>(bytes, Json) ?? throw new ConfigurationException("Configuration JSON is invalid.");
    private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    private static void ReplaceDirectory(string staging, string target)
    {
        var backup = target + ".backup";
        if (Directory.Exists(backup)) Directory.Delete(backup, true);
        if (Directory.Exists(target)) Directory.Move(target, backup);
        try
        {
            Directory.Move(staging, target);
        }
        catch
        {
            if (Directory.Exists(backup) && !Directory.Exists(target)) Directory.Move(backup, target);
            throw;
        }
    }
    private static void TryDelete(string path) { try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch { } }
    private static readonly IReadOnlyList<string> Exclusions =
    ["admin_pin", "exit_pin", "device_token", "payment_credentials", "cloud_secrets", "customer_photos", "session_media"];
}
