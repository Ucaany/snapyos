using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Contracts;
using Xunit;

namespace SnapyOS.Booth.Tests;

public sealed class StoreTests : IDisposable
{
    private readonly TempDirHolder _holder = new();

    public void Dispose() => _holder.Dispose();

    [Fact]
    public void migrate_sets_schema_version_and_is_idempotent()
    {
        using var dir = new TestFactory.TempDir();
        using var store = Store.Open(dir.Path);
        Assert.Equal(Store.SchemaVersion, store.CurrentSchemaVersion());

        // Buka ulang: tidak boleh error maupun menurunkan versi.
        store.Dispose();
        using var reopened = Store.Open(dir.Path);
        Assert.Equal(Store.SchemaVersion, reopened.CurrentSchemaVersion());
    }

    [Fact]
    public void export_strips_exit_pin_secrets()
    {
        using var dir = new TestFactory.TempDir();
        using var store = Store.Open(dir.Path);
        store.SetMeta("photobox_slug", "booth-01");
        store.SetMeta(Store.SecretKeyPrefix + "emergency_hash", "$argon2id$secret");
        store.SetMeta(Store.SecretKeyPrefix + "failed_count", "3");
        store.SetSetting("camera_settings", TestFactory.Json("""{"countdown_seconds":4}"""));

        var exported = store.ExportStore();

        Assert.Equal("booth-01", exported.Meta["photobox_slug"]);
        Assert.DoesNotContain(Store.SecretKeyPrefix + "emergency_hash", exported.Meta.Keys);
        Assert.DoesNotContain(Store.SecretKeyPrefix + "failed_count", exported.Meta.Keys);
        Assert.True(exported.DeviceSettings.ContainsKey("camera_settings"));
    }

    [Fact]
    public void import_ignores_exit_pin_keys_in_payload()
    {
        using var dir = new TestFactory.TempDir();
        using var store = Store.Open(dir.Path);
        var payload = new StoreExport(
            Store.SchemaVersion,
            new Dictionary<string, System.Text.Json.Nodes.JsonNode?>
            {
                ["print_settings"] = TestFactory.Json("""{"paper_size":"A6"}"""),
            },
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["photobox_slug"] = "booth-02",
                [Store.SecretKeyPrefix + "emergency_hash"] = "$argon2id$evil",
            });

        store.ImportStore(payload);

        Assert.Equal("booth-02", store.GetMeta("photobox_slug"));
        // PIN darurat booth A tidak boleh masuk ke booth B.
        Assert.Null(store.GetMeta(Store.SecretKeyPrefix + "emergency_hash"));
        Assert.NotNull(store.GetSetting("print_settings"));
    }

    [Fact]
    public void secret_key_predicate_matches_prefix()
    {
        Assert.True(Store.IsSecretKey("exit_pin_emergency_hash"));
        Assert.False(Store.IsSecretKey("photobox_slug"));
    }

    private sealed class TempDirHolder : IDisposable
    {
        private readonly TestFactory.TempDir _dir = new();

        public void Dispose() => _dir.Dispose();
    }
}

public sealed class SettingsContractTests
{
    [Fact]
    public void embedded_schema_matches_displayed_groups()
    {
        Assert.Equal(1, SettingsContractSchema.SchemaVersion);
        Assert.Equal(
            new[] { "camera_settings", "print_settings", "session_settings", "appearance_settings" },
            SettingsContractSchema.Groups);
        Assert.Equal(
            new[] { "camera_settings", "print_settings", "session_settings" },
            SettingsContractSchema.CloudSyncedGroups);
        Assert.Equal(new[] { "appearance_settings" }, SettingsContractSchema.LocalOnlyGroups);
    }

    [Fact]
    public void cloud_owned_fields_and_device_writable_fields()
    {
        Assert.Equal(new[] { "copies", "layout" }, SettingsContractSchema.CloudOwnedFields("print_settings"));
        var writable = SettingsContractSchema.DeviceWritableFields("print_settings");
        Assert.DoesNotContain("copies", writable);
        Assert.DoesNotContain("layout", writable);
        Assert.Contains("paper_size", writable);
    }
}
