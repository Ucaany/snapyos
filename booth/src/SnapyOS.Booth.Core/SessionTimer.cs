using System.Globalization;

namespace SnapyOS.Booth.Core;

/// <summary>
/// Waktu ISO-8601 UTC dengan sufiks <c>Z</c> — sama seperti
/// <c>new Date(...).toISOString()</c> di runtime Node, supaya nilai yang
/// ditulis booth identik bentuknya dengan yang diharapkan cloud.
/// </summary>
public static class IsoTime
{
    public static string From(DateTimeOffset at) =>
        at.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);

    public static string Now() => From(DateTimeOffset.UtcNow);

    /// <summary>Parse longgar; <c>null</c> bila tidak valid (bukan lempar).</summary>
    public static DateTimeOffset? Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }
        return DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
            out var parsed)
            ? parsed
            : null;
    }
}

/// <summary>
/// Timer sesi — padanan <c>src/lib/session-timer.ts</c>. Murni (tanpa I/O) agar
/// bisa di-unit-test. Server = enforcer; countdown di kiosk hanya UX.
/// </summary>
public static class SessionTimer
{
    public const int DefaultTimerSeconds = 300;
    public const int DefaultWarningSeconds = 60;

    /// <summary>
    /// Grace window finalize offline: kiosk bisa kehilangan koneksi saat
    /// pelanggan sudah menyelesaikan sesi; foto disinkronkan saat online kembali.
    /// Server tetap enforcer — finalize ditolak setelah grace ini.
    /// </summary>
    public const long OfflineFinalizeGraceMs = 10 * 60_000;

    /// <summary>ISO <c>expires_at</c> saat session dibuat.</summary>
    public static string ComputeExpiresAt(int timerSeconds, DateTimeOffset now)
    {
        var safe = timerSeconds > 0 ? timerSeconds : DefaultTimerSeconds;
        return IsoTime.From(now.AddSeconds(safe));
    }

    public static long RemainingMs(string expiresAt, DateTimeOffset now)
    {
        var parsed = IsoTime.Parse(expiresAt);
        if (parsed is null)
        {
            return 0;
        }
        return Math.Max(0, (long)(parsed.Value - now).TotalMilliseconds);
    }

    public static long RemainingSeconds(string expiresAt, DateTimeOffset now) =>
        (long)Math.Ceiling(RemainingMs(expiresAt, now) / 1000.0);

    public static bool IsExpired(string expiresAt, DateTimeOffset now) =>
        RemainingMs(expiresAt, now) <= 0;

    /// <summary>Warning aktif di sisa waktu terakhir (<c>warning_seconds</c>).</summary>
    public static bool IsWarning(string expiresAt, int warningSeconds, DateTimeOffset now)
    {
        var warning = warningSeconds >= 0 ? warningSeconds : DefaultWarningSeconds;
        var left = RemainingMs(expiresAt, now);
        return left > 0 && left <= warning * 1000L;
    }

    // --- Expiry QRIS (owner-configurable, default 3 menit) ---

    public const int DefaultQrisExpiryMinutes = 3;
    public const int MinQrisExpiryMinutes = 1;
    public const int MaxQrisExpiryMinutes = 60;

    public static int ClampQrisExpiryMinutes(int? minutes)
    {
        if (minutes is null)
        {
            return DefaultQrisExpiryMinutes;
        }
        var value = minutes.Value;
        if (value < MinQrisExpiryMinutes)
        {
            return MinQrisExpiryMinutes;
        }
        if (value > MaxQrisExpiryMinutes)
        {
            return MaxQrisExpiryMinutes;
        }
        return value;
    }

    /// <summary>Expiry QR efektif: min(provider expiry, setting owner).</summary>
    public static string ComputeQrisExpiresAt(int? minutes, string? providerExpiresAt, DateTimeOffset now)
    {
        var cap = now.AddMinutes(ClampQrisExpiryMinutes(minutes));
        var provider = IsoTime.Parse(providerExpiresAt);
        return provider is null || provider.Value > cap
            ? IsoTime.From(cap)
            : IsoTime.From(provider.Value);
    }
}
