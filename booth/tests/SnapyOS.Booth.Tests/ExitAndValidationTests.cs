using SnapyOS.Booth.Bridge;
using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Contracts;
using SnapyOS.Booth.Core.Exit;
using SnapyOS.Booth.Core.Sync;
using Xunit;

namespace SnapyOS.Booth.Tests;

public sealed class ExitPinTests : IDisposable
{
    private readonly TestFactory.TempDir _dir = new();
    private DateTimeOffset _now = DateTimeOffset.Parse("2026-01-01T00:00:00Z");

    public void Dispose() => _dir.Dispose();

    /// <summary>Hash argon2id asli dari @node-rs/argon2 (PIN 123456) — interop lintas bahasa.</summary>
    private const string NodeHash =
        "$argon2id$v=19$m=19456,t=2,p=1$wn1a4aVnCqzHHH5rPcdLXw$NlVkHw1niObrv7GKRGtJA5ce0UtCJyJe6FUzsKKWShg";

    private (Store Store, ExitService Service) Setup()
    {
        var store = Store.Open(_dir.Path);
        return (store, new ExitService(store, () => _now));
    }

    [Fact]
    public void verifies_argon2id_hash_generated_by_node()
    {
        // Bukti interoperabilitas: hash dibuat @node-rs/argon2, diverifikasi Konscious.
        Assert.True(Argon2idPin.Verify("123456", NodeHash));
        Assert.False(Argon2idPin.Verify("000000", NodeHash));
    }

    [Fact]
    public void rejects_non_argon2_hash()
    {
        Assert.False(Argon2idPin.Verify("123456", "sha256:deadbeef"));
    }

    [Fact]
    public void exit_fails_clearly_when_pin_not_configured()
    {
        var (store, service) = Setup();
        using (store)
        {
            var error = Assert.Throws<BridgeException>(() => service.Verify("123456"));
            Assert.Equal(409, error.StatusCode);
        }
    }

    [Fact]
    public void correct_pin_succeeds_and_records_event()
    {
        var (store, service) = Setup();
        using (store)
        {
            store.SetMeta(ExitService.ExitPinHashKey, NodeHash);
            var response = service.Verify("123456");
            Assert.Equal(200, response.Status);
            Assert.True(response.Body!["emergency"]!.GetValue<bool>());
        }
    }

    [Fact]
    public void wrong_pin_locks_after_threshold_and_persists()
    {
        var (store, service) = Setup();
        using (store)
        {
            store.SetMeta(ExitService.ExitPinHashKey, NodeHash);

            for (var attempt = 1; attempt < ExitService.PinFailThreshold; attempt += 1)
            {
                var error = Assert.Throws<BridgeException>(() => service.Verify("999999"));
                Assert.Equal(403, error.StatusCode);
            }

            // Percobaan ke-5 mengunci.
            var lockError = Assert.Throws<BridgeException>(() => service.Verify("999999"));
            Assert.Equal(429, lockError.StatusCode);

            // Bahkan PIN benar ditolak selama terkunci.
            var locked = Assert.Throws<BridgeException>(() => service.Verify("123456"));
            Assert.Equal(429, locked.StatusCode);

            // Setelah 5 menit, PIN benar diterima lagi (setelah restart pun, dari meta).
            _now = _now.AddMinutes(6);
            Assert.Equal(200, service.Verify("123456").Status);
        }
    }
}

public sealed class BridgeTokenTests
{
    [Fact]
    public void token_matches_uses_digest_and_rejects_others()
    {
        var config = RuntimeConfig.Load(new Dictionary<string, string?>
        {
            ["PHOTOBOOTH_BRIDGE_TOKEN"] = "test-token-0123456789",
            ["SNAPYOS_DATA_DIR"] = ":memory:",
            ["SNAPYOS_CAMERA"] = "mock",
            ["SNAPYOS_PRINTER"] = "mock",
            ["SNAPYOS_ALLOW_MOCK"] = "1",
        });

        Assert.True(BridgeServer.TokenMatches("test-token-0123456789", config.TokenDigest));
        Assert.False(BridgeServer.TokenMatches("wrong-token", config.TokenDigest));
        Assert.False(BridgeServer.TokenMatches("", config.TokenDigest));
        Assert.False(BridgeServer.TokenMatches(null, config.TokenDigest));
    }
}

public sealed class SessionTimerTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-01-01T00:00:00Z");

    [Fact]
    public void compute_expires_at_uses_timer_seconds()
    {
        var expires = SessionTimer.ComputeExpiresAt(120, Now);
        Assert.Equal("2026-01-01T00:02:00.000Z", expires);
    }

    [Fact]
    public void compute_expires_at_falls_back_to_default_when_non_positive()
    {
        var expires = SessionTimer.ComputeExpiresAt(0, Now);
        Assert.Equal(300, SessionTimer.RemainingSeconds(expires, Now));
    }

    [Fact]
    public void expiry_and_warning_flags()
    {
        var expires = SessionTimer.ComputeExpiresAt(120, Now);
        Assert.False(SessionTimer.IsExpired(expires, Now));
        Assert.False(SessionTimer.IsWarning(expires, 60, Now));
        Assert.True(SessionTimer.IsWarning(expires, 60, Now.AddSeconds(70)));
        Assert.True(SessionTimer.IsExpired(expires, Now.AddSeconds(121)));
    }

    [Fact]
    public void qris_expiry_is_capped_by_owner_setting()
    {
        var capped = SessionTimer.ComputeQrisExpiresAt(3, Now.AddMinutes(30).ToString("o"), Now);
        Assert.Equal("2026-01-01T00:03:00.000Z", capped);

        var provider = SessionTimer.ComputeQrisExpiresAt(10, Now.AddMinutes(1).ToString("o"), Now);
        Assert.Equal("2026-01-01T00:01:00.000Z", provider);
    }

    [Fact]
    public void qris_expiry_clamps_out_of_range_minutes()
    {
        Assert.Equal(1, SessionTimer.ClampQrisExpiryMinutes(0));
        Assert.Equal(60, SessionTimer.ClampQrisExpiryMinutes(999));
        Assert.Equal(3, SessionTimer.ClampQrisExpiryMinutes(null));
    }
}

public sealed class SettingsSchemaValidatorTests
{
    [Fact]
    public void valid_payload_has_no_issues()
    {
        var issues = SettingsSchemaValidator.Validate(
            TestFactory.Json("""{"camera_settings":{"countdown_seconds":4,"provider":"digicamcontrol"}}"""),
            SettingsContractSchema.Schema);
        Assert.Empty(issues);
    }

    [Fact]
    public void unknown_field_is_rejected_when_additionalProperties_false()
    {
        var issues = SettingsSchemaValidator.Validate(
            TestFactory.Json("""{"camera_settings":{"nope":1}}"""),
            SettingsContractSchema.Schema);
        Assert.Contains(issues, issue => issue.Path == "camera_settings.nope");
    }

    [Fact]
    public void out_of_range_number_is_rejected()
    {
        var issues = SettingsSchemaValidator.Validate(
            TestFactory.Json("""{"camera_settings":{"countdown_seconds":99}}"""),
            SettingsContractSchema.Schema);
        Assert.Contains(issues, issue => issue.Path == "camera_settings.countdown_seconds");
    }

    [Fact]
    public void nested_pages_object_is_validated()
    {
        var good = SettingsSchemaValidator.Validate(
            TestFactory.Json("""{"appearance_settings":{"pages":{"welcome":{"bg_color":"#010203"}}}}"""),
            SettingsContractSchema.Schema);
        Assert.Empty(good);

        var bad = SettingsSchemaValidator.Validate(
            TestFactory.Json("""{"appearance_settings":{"pages":{"welcome":{"bg_color":"nothex"}}}}"""),
            SettingsContractSchema.Schema);
        Assert.Contains(bad, issue => issue.Path == "appearance_settings.pages.welcome.bg_color");
    }
}
