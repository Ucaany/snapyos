using System.Text.Json.Nodes;

namespace SnapyOS.Booth.Core.Exit;

/// <summary>
/// PIN darurat offline (<c>POST /v1/exit</c>) — padanan <c>runtime/exit/index.ts</c>.
///
/// PIN utama tetap diverifikasi cloud. Jalur ini hanya jaring saat internet mati:
/// tanpa ini petugas terkurung di dalam booth. Karena itu PIN-nya terpisah
/// (<c>meta.exit_pin_emergency_hash</c>), tidak pernah ikut export, dan setiap
/// pemakaian dicatat sebagai <c>exit_pin_emergency_used</c>.
///
/// Rate-limit lokal meniru cloud: 5 gagal → kunci 5 menit, disimpan di meta
/// supaya bertahan setelah restart.
/// </summary>
public sealed class ExitService
{
    public const string ExitPinHashKey = "exit_pin_emergency_hash";
    public const string ExitPinFailedKey = "exit_pin_failed_count";
    public const string ExitPinLockedKey = "exit_pin_locked_until";

    public const int PinFailThreshold = 5;
    public static readonly TimeSpan PinLock = TimeSpan.FromMinutes(5);

    private readonly Store _store;
    private readonly Func<DateTimeOffset> _now;

    public ExitService(Store store, Func<DateTimeOffset>? now = null)
    {
        _store = store;
        _now = now ?? (() => DateTimeOffset.UtcNow);
    }

    /// <summary>
    /// PIN darurat dipakai HANYA bila hash-nya terpasang. Tanpa hash, booth tidak
    /// punya jalan keluar offline — lebih baik gagal jelas daripada diam-diam
    /// mengizinkan siapa pun keluar.
    /// </summary>
    public BridgeResponse Verify(string? pin)
    {
        var now = _now();
        var hash = _store.GetMeta(ExitPinHashKey);
        if (string.IsNullOrEmpty(hash))
        {
            throw new BridgeException("PIN darurat belum diatur di booth ini.", 409);
        }

        var locked = LockedUntil();
        if (locked > now)
        {
            var seconds = (long)Math.Ceiling((locked - now).TotalSeconds);
            throw new BridgeException($"PIN terkunci. Coba lagi dalam {seconds} detik.", 429);
        }

        var candidate = pin?.Trim() ?? string.Empty;
        var ok = candidate.Length > 0 && Argon2idPin.Verify(candidate, hash);

        if (!ok)
        {
            var next = FailedCount() + 1;
            if (next >= PinFailThreshold)
            {
                // Reset counter + set lock sekaligus: percobaan berikutnya harus
                // menunggu walau runtime restart di tengah jalan.
                _store.SetMeta(ExitPinFailedKey, "0");
                _store.SetMeta(ExitPinLockedKey, IsoTime.From(now + PinLock));
                throw new BridgeException($"PIN salah {PinFailThreshold}x. Terkunci 5 menit.", 429);
            }
            _store.SetMeta(ExitPinFailedKey, next.ToString());
            throw new BridgeException("PIN darurat salah.", 403);
        }

        _store.SetMeta(ExitPinFailedKey, "0");
        if (locked != default)
        {
            _store.SetMeta(ExitPinLockedKey, string.Empty);
        }
        _store.InsertEvent("exit_pin_emergency_used", null, new JsonObject
        {
            ["at"] = IsoTime.From(now),
        });
        return new BridgeResponse(200, new JsonObject
        {
            ["ok"] = true,
            ["emergency"] = true,
        });
    }

    private DateTimeOffset LockedUntil()
    {
        var raw = _store.GetMeta(ExitPinLockedKey);
        return IsoTime.Parse(raw) ?? default;
    }

    private int FailedCount()
    {
        var raw = _store.GetMeta(ExitPinFailedKey);
        return int.TryParse(raw, out var value) ? value : 0;
    }
}
