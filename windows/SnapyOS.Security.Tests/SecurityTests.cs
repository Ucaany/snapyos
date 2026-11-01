using SnapyOS.Core;
using SnapyOS.Core;
using SnapyOS.LocalStore;
using SnapyOS.Security;
using Xunit;

namespace SnapyOS.Security.Tests;

public sealed class SecurityTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"snapyos-security-{Guid.NewGuid():N}");
    private readonly LocalStore _store;
    private readonly PinSecurityService _security;

    public SecurityTests()
    {
        _store = new LocalStore(LocalStoreOptions.ForDirectory(_root));
        _security = new PinSecurityService(_store, new DpapiSecretStore(Path.Combine(_root, "secrets")), new PinPolicy(3, TimeSpan.FromMinutes(2)));
    }

    [Fact]
    public void First_setup_requires_all_distinct_pins()
    {
        Assert.True(_security.IsFirstSetupRequired);
        Assert.Throws<ArgumentException>(() => _security.CompleteFirstSetup("1234", "1234", "5678"));
        _security.CompleteFirstSetup("1234", "2345", "3456");
        Assert.False(_security.IsFirstSetupRequired);
    }

    [Fact]
    public void Pin_kinds_are_independent()
    {
        _security.CompleteFirstSetup("1234", "2345", "3456");
        Assert.Equal(PinVerificationStatus.Success, _security.Verify(PinKind.Admin, "1234").Status);
        Assert.Equal(PinVerificationStatus.Invalid, _security.Verify(PinKind.KioskExit, "1234").Status);
        Assert.Equal(PinVerificationStatus.Success, _security.Verify(PinKind.OfflineEmergency, "3456").Status);
    }

    [Fact]
    public void Failed_attempts_lock_and_persist_after_restart()
    {
        _security.CompleteFirstSetup("1234", "2345", "3456");
        _security.Verify(PinKind.Admin, "0000");
        _security.Verify(PinKind.Admin, "0000");
        var locked = _security.Verify(PinKind.Admin, "0000");
        Assert.Equal(PinVerificationStatus.LockedOut, locked.Status);

        using var reopened = new PinSecurityService(_store, new DpapiSecretStore(Path.Combine(_root, "secrets")), new PinPolicy(3, TimeSpan.FromMinutes(2)));
        Assert.Equal(PinVerificationStatus.LockedOut, reopened.Verify(PinKind.Admin, "1234").Status);
    }

    [Fact]
    public void Audit_does_not_contain_pin_values()
    {
        _security.CompleteFirstSetup("1234", "2345", "3456");
        _security.Verify(PinKind.Admin, "1234");
        var audit = string.Join("|", _security.ReadAuditEvents().Select(x => x.EventType + x.PinKind));
        Assert.DoesNotContain("1234", audit);
        Assert.DoesNotContain("2345", audit);
        Assert.DoesNotContain("3456", audit);
    }

    [Fact]
    public void Pin_format_is_rejected()
    {
        Assert.Throws<ArgumentException>(() => _security.CompleteFirstSetup("123", "2345", "3456"));
        Assert.Throws<ArgumentException>(() => _security.CompleteFirstSetup("1234a", "2345", "3456"));
    }

    public void Dispose()
    {
        _security.Dispose();
        _store.Dispose();
        try { Directory.Delete(_root, true); } catch { }
    }
}
