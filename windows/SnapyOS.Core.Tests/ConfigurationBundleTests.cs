using System.Security.Cryptography;
using System.Text.Json;
using SnapyOS.Contracts;
using SnapyOS.Core;
using Xunit;

namespace SnapyOS.Core.Tests;

public sealed class ConfigurationBundleTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-bundle-{Guid.NewGuid():N}");
    private readonly ConfigurationBundleService _service = new();

    public ConfigurationBundleTests() => Directory.CreateDirectory(_root);

    [Fact]
    public void Round_trip_preserves_manifest_and_asset_checksum()
    {
        var bytes = new byte[] { 1, 2, 3 };
        var snapshot = Snapshot(bytes);
        var source = Path.Combine(_root, "source");
        var result = _service.Export(snapshot, source, new Dictionary<string, byte[]> { ["logo"] = bytes });

        var imported = _service.Read(source, "device-1");

        Assert.Equal(result.Manifest.ManifestSha256, JsonSerializerHash(Path.Combine(source, "manifest.json")));
        Assert.Equal(snapshot.Branding.BrandName, imported.Branding.BrandName);
        Assert.Equal(snapshot.Assets[0].Sha256, imported.Assets[0].Sha256);
    }

    [Fact]
    public void Malformed_manifest_is_rejected()
    {
        var path = Path.Combine(_root, "bundle");
        Directory.CreateDirectory(path);
        File.WriteAllText(Path.Combine(path, "manifest.json"), "not-json");
        Assert.ThrowsAny<Exception>(() => _service.Read(path, "device-1"));
    }

    [Fact]
    public void Future_schema_is_rejected()
    {
        var snapshot = Snapshot([1]) with { SchemaVersion = LocalConfigurationSchema.CurrentVersion + 1 };
        var path = Path.Combine(_root, "future");
        Assert.Throws<ConfigurationException>(() => _service.Export(snapshot, path, new Dictionary<string, byte[]> { ["logo"] = [1] }));
    }

    [Fact]
    public void Missing_asset_is_rejected()
    {
        var snapshot = Snapshot([1]);
        var path = Path.Combine(_root, "missing");
        Assert.Throws<ConfigurationException>(() => _service.Export(snapshot, path, new Dictionary<string, byte[]>()));
    }

    [Fact]
    public void Wrong_device_binding_is_rejected()
    {
        var path = Path.Combine(_root, "bound");
        _service.Export(Snapshot([1]), path, new Dictionary<string, byte[]> { ["logo"] = [1] });
        Assert.Throws<ConfigurationException>(() => _service.Read(path, "device-2"));
    }

    [Fact]
    public void Failed_apply_restores_active_directory()
    {
        var active = Path.Combine(_root, "active");
        Directory.CreateDirectory(active);
        File.WriteAllText(Path.Combine(active, "marker"), "old");
        var incoming = Path.Combine(_root, "incoming");
        _service.Export(Snapshot([1]), incoming, new Dictionary<string, byte[]> { ["logo"] = [1] });

        Assert.Throws<InvalidOperationException>(() => _service.Apply(incoming, active, "device-1", beforeCommit: () => throw new InvalidOperationException("boom")));
        Assert.Equal("old", File.ReadAllText(Path.Combine(active, "marker")));
    }

    [Fact]
    public void Rollback_restores_backup()
    {
        var active = Path.Combine(_root, "active");
        _service.Export(Snapshot([1]), active, new Dictionary<string, byte[]> { ["logo"] = [1] });
        var incoming = Path.Combine(_root, "incoming");
        _service.Export(Snapshot([2]) with { DeviceId = "device-1" }, incoming, new Dictionary<string, byte[]> { ["logo"] = [2] });
        _service.Apply(incoming, active, "device-1");
        _service.Rollback(active);
        Assert.Equal("1", File.ReadAllBytes(Path.Combine(active, "assets", "logo.bin"))[0].ToString());
    }

    private LocalConfigurationSnapshot Snapshot(byte[] bytes) => new()
    {
        DeviceId = "device-1", BusinessSlug = "business", PhotoboxSlug = "booth",
        Branding = new BrandTheme { BrandName = "Snapy", BackgroundColor = "#FFFDF5", TextColor = "#111111" },
        Screens = Enum.GetValues<KioskScreenId>().Select(screen => new LocalScreenConfiguration
        {
            Screen = screen,
            Portrait = new(KioskLayoutKind.Center, 1080, 1920, KioskSafeArea.Default, 1),
            Landscape = new(KioskLayoutKind.Center, 1920, 1080, KioskSafeArea.Default, 1)
        }).ToArray(),
        Assets = [new() { AssetId = "logo", RelativePath = "assets/logo.bin", ContentType = "image/png", SizeBytes = bytes.Length, Sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), Kind = LocalConfigurationAssetKind.Logo }]
    };

    private static string JsonSerializerHash(string path)
    {
        var json = JsonDocument.Parse(File.ReadAllBytes(path)).RootElement;
        return json.GetProperty("manifestSha256").GetString()!;
    }

    public void Dispose() { try { Directory.Delete(_root, true); } catch { } }
}
