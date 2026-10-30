using System.Text.Json.Nodes;
using SnapyOS.Booth.Core;
using Xunit;

namespace SnapyOS.Booth.Tests;

public sealed class SettingsServiceTests : IDisposable
{
    private readonly TestFactory.TempDir _dir = new();

    public void Dispose() => _dir.Dispose();

    private (Store Store, SettingsService Service, RuntimeConfig Config) Setup()
    {
        var config = TestFactory.Config(_dir.Path);
        var store = Store.Open(_dir.Path);
        return (store, new SettingsService(store, config), config);
    }

    [Fact]
    public void write_rejects_cloud_owned_field_with_403()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            var error = Assert.Throws<BridgeException>(() =>
                service.Write(TestFactory.Json("""{"print_settings":{"copies":5}}""")));
            Assert.Equal(403, error.StatusCode);
            Assert.Equal(SettingErrorCodes.FieldNotDeviceOwned, error.Code);
        }
    }

    [Fact]
    public void write_accepts_device_owned_field()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            var response = service.Write(TestFactory.Json("""{"print_settings":{"paper_size":"A6"}}"""));
            Assert.Equal(200, response.Status);
            Assert.NotNull(store.GetSetting("print_settings"));
        }
    }

    [Fact]
    public void write_rejects_invalid_value_with_400()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            var error = Assert.Throws<BridgeException>(() =>
                service.Write(TestFactory.Json("""{"camera_settings":{"countdown_seconds":99}}""")));
            Assert.Equal(400, error.StatusCode);
            Assert.Equal(SettingErrorCodes.InvalidSettings, error.Code);
        }
    }

    [Fact]
    public void write_rejects_warning_longer_than_timer_with_400()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            var error = Assert.Throws<BridgeException>(() => service.Write(TestFactory.Json(
                """{"session_settings":{"timer_seconds":60,"warning_seconds":120}}""")));
            Assert.Equal(400, error.StatusCode);
            Assert.Equal(SettingErrorCodes.InvalidSettings, error.Code);
        }
    }

    [Fact]
    public void write_accepts_warning_shorter_than_timer()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            var response = service.Write(TestFactory.Json(
                """{"session_settings":{"timer_seconds":120,"warning_seconds":60}}"""));
            Assert.Equal(200, response.Status);
        }
    }

    /// <summary>
    /// Invarian dibaca dari schema, bukan dari daftar manual: aturan yang sama
    /// harus muncul di TS (SETTING_INVARIANTS) dan di kontrak C#.
    /// </summary>
    [Fact]
    public void invariant_comes_from_schema_contract()
    {
        var invariants = SnapyOS.Booth.Contracts.DeviceSettingsContract.Invariants["sessionSettings"];
        var rule = Assert.Single(invariants);
        Assert.Equal(("warning_seconds", "<", "timer_seconds"), (rule.Left, rule.Op, rule.Right));
    }

    [Fact]
    public void write_rejects_unknown_group_with_403()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            var error = Assert.Throws<BridgeException>(() =>
                service.Write(TestFactory.Json("""{"payment_mode":"gateway"}""")));
            Assert.Equal(403, error.StatusCode);
            Assert.Equal(SettingErrorCodes.FieldNotDeviceOwned, error.Code);
        }
    }

    [Fact]
    public void import_rejects_newer_schema_version()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            var error = Assert.Throws<BridgeException>(() =>
                service.Import(TestFactory.Json("""{"schema_version":99,"settings":{}}""")));
            Assert.Equal(400, error.StatusCode);
            Assert.Equal(SettingErrorCodes.SchemaVersionTooNew, error.Code);
        }
    }

    [Fact]
    public void import_rejects_mismatched_photobox_slug()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            store.SetMeta("photobox_slug", "booth-01");
            var error = Assert.Throws<BridgeException>(() =>
                service.Import(TestFactory.Json("""{"schema_version":1,"photobox_slug":"booth-99","settings":{}}""")));
            Assert.Equal(409, error.StatusCode);
            Assert.Equal(SettingErrorCodes.PhotoboxMismatch, error.Code);
        }
    }

    [Fact]
    public void export_import_round_trip_preserves_settings()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            store.SetMeta("photobox_slug", "booth-01");
            store.SetMeta("business_slug", "snapy-demo");
            service.Write(TestFactory.Json("""{"camera_settings":{"countdown_seconds":6},"session_settings":{"timer_seconds":180}}"""));

            var exported = service.Export();
            var envelope = exported.Body!.AsObject();
            Assert.Equal(1, envelope["schema_version"]!.GetValue<int>());
            Assert.Equal("booth-01", envelope["photobox_slug"]!.GetValue<string>());

            var second = Store.Open(_dir.Path);
            using (second)
            {
                second.SetMeta("photobox_slug", "booth-01");
                var service2 = new SettingsService(second, TestFactory.Config(_dir.Path));
                var imported = service2.Import(envelope);
                Assert.Equal(200, imported.Status);
                var camera = second.GetSetting("camera_settings")!.AsObject();
                Assert.Equal(6, camera["countdown_seconds"]!.GetValue<int>());
            }
        }
    }

    [Fact]
    public void appearance_settings_is_local_only_and_never_cloud_synced()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            service.Write(TestFactory.Json("""{"appearance_settings":{"bg_color":"#112233"}}"""));
            var active = service.ActiveSettings();
            var synced = service.CloudSyncedSettings(active);
            Assert.Null(synced["appearance_settings"]);
            Assert.NotNull(active["appearance_settings"]);
        }
    }

    [Fact]
    public void secrets_are_stripped_from_present()
    {
        var (store, service, _) = Setup();
        using (store)
        {
            store.SetMeta("photobox_slug", "booth-01");
            store.SetSetting("camera_settings", TestFactory.Json("""{"exit_pin":"1234","countdown_seconds":3}"""));
            var body = service.Read().Body!.AsObject();
            var camera = body["settings"]!["camera_settings"]!.AsObject();
            Assert.False(camera.ContainsKey("exit_pin"));
            Assert.True(camera.ContainsKey("countdown_seconds"));
        }
    }
}
