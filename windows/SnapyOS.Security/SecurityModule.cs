using System.Security.Cryptography;
using System.Text;
using SnapyOS.Core;
using SnapyOS.LocalStore;

namespace SnapyOS.Security;

public enum PinVerificationStatus { Success, NotConfigured, Invalid, LockedOut }

public sealed record PinPolicy(int MaxAttempts = 5, TimeSpan LockoutDuration = default)
{
    public TimeSpan EffectiveLockoutDuration => LockoutDuration == default ? TimeSpan.FromMinutes(5) : LockoutDuration;
}

public sealed record PinVerificationResult(PinVerificationStatus Status, TimeSpan? RetryAfter = null);
public sealed record SecurityAuditEvent(string EventType, PinKind? PinKind, DateTimeOffset OccurredAt);

public interface IProtectedSecretStore
{
    void Store(string name, ReadOnlySpan<byte> value);
    byte[]? Read(string name);
    void Remove(string name);
}

public sealed class DpapiSecretStore : IProtectedSecretStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SnapyOS.LocalSecret.v1");
    private readonly string _directory;

    public DpapiSecretStore(string directory)
    {
        _directory = directory;
        Directory.CreateDirectory(directory);
    }

    public void Store(string name, ReadOnlySpan<byte> value)
    {
        ValidateName(name);
        var protectedValue = ProtectedData.Protect(value.ToArray(), Entropy, DataProtectionScope.LocalMachine);
        File.WriteAllBytes(Path.Combine(_directory, name + ".secret"), protectedValue);
    }

    public byte[]? Read(string name)
    {
        ValidateName(name);
        var path = Path.Combine(_directory, name + ".secret");
        return File.Exists(path) ? ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.LocalMachine) : null;
    }

    public void Remove(string name)
    {
        ValidateName(name);
        File.Delete(Path.Combine(_directory, name + ".secret"));
    }

    private static void ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Any(c => !char.IsLetterOrDigit(c) && c != '_' && c != '-'))
            throw new ArgumentException("Invalid protected secret name.", nameof(name));
    }
}

public sealed class PinSecurityService : IDisposable
{
    private const string SetupKey = "security_setup_complete";
    private readonly SnapyOS.LocalStore.LocalStore _store;
    private readonly IProtectedSecretStore _secrets;
    private readonly PinPolicy _policy;
    private bool _disposed;

    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(_disposed, this);

    public PinSecurityService(SnapyOS.LocalStore.LocalStore store, IProtectedSecretStore secrets, PinPolicy? policy = null)
    {
        _store = store;
        _secrets = secrets;
        _policy = policy ?? new();
        EnsureSecurityTables();
    }

    public bool IsFirstSetupRequired => _secrets.Read(SecretName(PinKind.Admin)) is null ||
                                         _secrets.Read(SecretName(PinKind.KioskExit)) is null ||
                                         _secrets.Read(SecretName(PinKind.OfflineEmergency)) is null;

    public void CompleteFirstSetup(string adminPin, string kioskExitPin, string emergencyPin)
    {
        if (!IsValidPin(adminPin) || !IsValidPin(kioskExitPin) || !IsValidPin(emergencyPin))
            throw new ArgumentException("PIN must be 4-6 digits.");
        if (adminPin == kioskExitPin || adminPin == emergencyPin || kioskExitPin == emergencyPin)
            throw new ArgumentException("Admin, kiosk exit, and emergency PINs must differ.");
        SetPin(PinKind.Admin, adminPin);
        SetPin(PinKind.KioskExit, kioskExitPin);
        SetPin(PinKind.OfflineEmergency, emergencyPin);
        WriteAudit("FirstSetupCompleted", null);
    }

    public PinVerificationResult Verify(PinKind kind, string candidate, DateTimeOffset? now = null)
    {
        var at = now ?? DateTimeOffset.UtcNow;
        var lockout = ReadLockout(kind);
        if (lockout.LockedUntil > at) return new(PinVerificationStatus.LockedOut, lockout.LockedUntil - at);
        var expected = _secrets.Read(SecretName(kind));
        if (expected is null) return new(PinVerificationStatus.NotConfigured);
        var candidateBytes = Encoding.UTF8.GetBytes(candidate ?? string.Empty);
        var valid = CryptographicOperations.FixedTimeEquals(expected, HashPin(candidateBytes));
        CryptographicOperations.ZeroMemory(candidateBytes);
        if (valid)
        {
            ResetLockout(kind);
            WriteAudit("PinVerified", kind);
            return new(PinVerificationStatus.Success);
        }
        var next = lockout.FailedAttempts + 1;
        if (next >= _policy.MaxAttempts)
        {
            var until = at + _policy.EffectiveLockoutDuration;
            SaveLockout(kind, 0, until);
            WriteAudit("PinLockedOut", kind);
            return new(PinVerificationStatus.LockedOut, _policy.EffectiveLockoutDuration);
        }
        SaveLockout(kind, next, null);
        WriteAudit("PinFailed", kind);
        return new(PinVerificationStatus.Invalid);
    }

    public void SetPin(PinKind kind, string pin)
    {
        if (!IsValidPin(pin)) throw new ArgumentException("PIN must be 4-6 digits.");
        var bytes = Encoding.UTF8.GetBytes(pin);
        try { _secrets.Store(SecretName(kind), HashPin(bytes)); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
        ResetLockout(kind);
        WriteAudit("PinConfigured", kind);
    }

    public IReadOnlyList<SecurityAuditEvent> ReadAuditEvents() => _store.ReadSecurityAuditEvents()
        .Select(row => new SecurityAuditEvent(row.EventType, Enum.TryParse<PinKind>(row.PinKind, out var kind) ? kind : null, row.OccurredAt))
        .ToArray();
    public void Dispose() => _disposed = true;

    private static byte[] HashPin(ReadOnlySpan<byte> pin) => SHA256.HashData(pin);
    private static bool IsValidPin(string? pin) => pin is { Length: >= 4 and <= 6 } && pin.All(char.IsDigit);
    private static string SecretName(PinKind kind) => $"pin_{kind.ToString().ToLowerInvariant()}";
    private (int FailedAttempts, DateTimeOffset LockedUntil) ReadLockout(PinKind kind) => _store.ReadPinLockout(kind.ToString());
    private void SaveLockout(PinKind kind, int attempts, DateTimeOffset? until) => _store.SavePinLockout(kind.ToString(), attempts, until);
    private void ResetLockout(PinKind kind) => SaveLockout(kind, 0, null);

    private void EnsureSecurityTables() => _store.Execute(@"CREATE TABLE IF NOT EXISTS security_pin_lockouts(pin_kind TEXT PRIMARY KEY, failed_attempts INTEGER NOT NULL, locked_until TEXT); CREATE TABLE IF NOT EXISTS security_audit_events(event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, pin_kind TEXT, occurred_at TEXT NOT NULL);", null);
    private void WriteAudit(string eventType, PinKind? kind) => _store.WriteSecurityAudit(eventType, kind?.ToString(), DateTimeOffset.UtcNow);
}
