using System.Security.Cryptography;
using System.Text;

namespace SnapyOS.Booth.Core;

/// <summary>Kesalahan konfigurasi — start harus gagal, bukan jalan setengah.</summary>
public sealed class ConfigException : Exception
{
    public ConfigException(string message)
        : base(message)
    {
    }
}

public static class CameraKinds
{
    public static readonly string[] All = ["digicamcontrol", "gphoto2", "libcamera", "v4l2", "pyav", "mock"];
}

public static class PrinterKinds
{
    public static readonly string[] All = ["windows", "cups", "mock"];
}

/// <summary>
/// Konfigurasi runtime lokal — padanan <c>runtime/config.ts</c>. Satu-satunya
/// tempat env dibaca. Aplikasi booth hanya Windows x64, jadi default adapter
/// mengikuti platform: digiCamControl + print spooler.
/// </summary>
public sealed record RuntimeConfig
{
    public required string Host { get; init; }

    public required int Port { get; init; }

    /// <summary>SHA-256 token bridge — perbandingan constant-time memakai digest ini.</summary>
    public required byte[] TokenDigest { get; init; }

    public required HashSet<string> AllowedOrigins { get; init; }

    /// <summary>DB + media + karantina. Terpisah dari kode agar update tidak menyentuh data.</summary>
    public required string DataDir { get; init; }

    public required string Camera { get; init; }

    /// <summary>Adapter preview terpisah (opsional). <c>null</c> = pakai adapter stills.</summary>
    public required string? CameraStream { get; init; }

    public required string Printer { get; init; }

    /// <summary>True bila salah satu adapter mock dipakai (UI wajib melabelinya).</summary>
    public required bool Mock { get; init; }

    public required string CameraBin { get; init; }

    public required string CaptureTarget { get; init; }

    public required int TimeoutMs { get; init; }

    public required int DigicamPort { get; init; }

    public required string DigicamCmd { get; init; }

    public required string SumatraBin { get; init; }

    public required string PowershellBin { get; init; }

    public required string CupsBin { get; init; }

    public required string LpstatBin { get; init; }

    public required long MaxBodyBytes { get; init; }

    /// <summary>
    /// Tujuan sinkronisasi. Kosong = booth berjalan tanpa cloud: sesi tetap
    /// tersimpan lokal, hanya tidak pernah terkirim. Bukan error — runtime harus
    /// tetap melayani kamera dan printer walau internet mati.
    /// </summary>
    public required string CloudUrl { get; init; }

    /// <summary>Token device dari aktivasi; dipakai sync sesi + tulis balik setelan.</summary>
    public required string DeviceToken { get; init; }

    /// <summary>True bila SEMUA adapter yang dipakai adalah mock.</summary>
    public bool AllMock =>
        Camera == "mock" && CameraStream is null or "mock" && Printer == "mock";

    /// <summary>
    /// Adapter perangkat keras nyata baru ada di Fase 3. Sampai itu, config nyata
    /// dan config campuran sama-sama ditolak: menjalankannya dengan mock berarti
    /// pelanggan membayar foto yang bukan dirinya, dan mencampur nyata+mock
    /// membuat satu booth berperilaku dua cara tanpa terlihat operator.
    ///
    /// Dipakai Shell (in-process) dan host bridge headless, supaya keduanya tidak
    /// bisa menyimpang. <c>SNAPYOS_ALLOW_MOCK</c> sudah ditegakkan di
    /// <see cref="Load"/>, jadi tidak diulang di sini.
    /// </summary>
    public void EnsurePhase1Adapters()
    {
        if (AllMock)
        {
            return;
        }

        throw new ConfigException(Mock
            ? "Config campuran: sebagian adapter mock, sebagian perangkat keras nyata. " +
              "Adapter nyata belum tersedia (Fase 3); pakai mock untuk ketiganya " +
              "(SNAPYOS_CAMERA=mock SNAPYOS_PRINTER=mock SNAPYOS_CAMERA_STREAM=mock)."
            : "Adapter perangkat keras nyata belum tersedia (Fase 3). " +
              "Jalankan dengan SNAPYOS_CAMERA=mock SNAPYOS_PRINTER=mock SNAPYOS_ALLOW_MOCK=1.");
    }

    private static string PickOne(string? raw, string[] allowed, string fallback, string name)
    {
        var value = raw?.Trim();
        if (string.IsNullOrEmpty(value))
        {
            return fallback;
        }
        if (allowed.Contains(value, StringComparer.Ordinal))
        {
            return value;
        }
        throw new ConfigException($"{name} harus salah satu dari: {string.Join(", ", allowed)}.");
    }

    /// <summary>
    /// Port 0 ditolak: kiosk memakai URL tetap <c>http://127.0.0.1:&lt;port&gt;</c>
    /// dan tidak bisa membaca port acak hasil bind.
    /// </summary>
    private static int ReadPort(string? raw, string name, int fallback)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return fallback;
        }
        if (!int.TryParse(raw, out var value) || value < 1 || value > 65535)
        {
            throw new ConfigException($"{name} harus bilangan bulat 1-65535.");
        }
        return value;
    }

    private static string DefaultDataDir()
    {
        var baseDir = Environment.GetEnvironmentVariable("ProgramData")?.Trim();
        if (string.IsNullOrEmpty(baseDir))
        {
            baseDir = "C:\\ProgramData";
        }
        return Path.Combine(baseDir, "SNAPYOS", "data");
    }

    public static RuntimeConfig Load(IReadOnlyDictionary<string, string?> env)
    {
        string? Get(string key) => env.TryGetValue(key, out var value) ? value : null;

        var token = Get("PHOTOBOOTH_BRIDGE_TOKEN")?.Trim() ?? string.Empty;
        if (token.Length < 16)
        {
            throw new ConfigException(
                "PHOTOBOOTH_BRIDGE_TOKEN wajib diisi (minimal 16 karakter).\n" +
                "Simpan nilai yang sama di perangkat kiosk (Setup Perangkat → Bridge token).");
        }

        var camera = PickOne(Get("SNAPYOS_CAMERA"), CameraKinds.All, "digicamcontrol", "SNAPYOS_CAMERA");
        var printer = PickOne(Get("SNAPYOS_PRINTER"), PrinterKinds.All, "windows", "SNAPYOS_PRINTER");

        var streamRaw = Get("SNAPYOS_CAMERA_STREAM")?.Trim();
        string? cameraStream = string.IsNullOrEmpty(streamRaw)
            ? null
            : PickOne(streamRaw, CameraKinds.All, camera, "SNAPYOS_CAMERA_STREAM");

        var mock = camera == "mock" || printer == "mock" || cameraStream == "mock";
        if (mock && Get("SNAPYOS_ALLOW_MOCK") != "1")
        {
            // Mock tidak boleh diam-diam jadi produksi: kamera palsu di booth
            // berarti pelanggan membayar foto yang bukan dirinya.
            throw new ConfigException(
                "Adapter mock dipakai. Set SNAPYOS_ALLOW_MOCK=1 bila ini memang uji coba.");
        }

        var origins = (Get("PHOTOBOOTH_BRIDGE_ORIGINS") ?? "http://localhost:3000,http://127.0.0.1:3000")
            .Split(',')
            .Select((value) => value.Trim())
            .Where((value) => value.Length > 0);

        var timeoutRaw = long.TryParse(Get("GPHOTO2_TIMEOUT_MS"), out var parsed) ? parsed : -1;
        var timeoutMs = (int)(timeoutRaw >= 0 ? Math.Clamp(timeoutRaw, 5_000, 120_000) : 45_000);

        return new RuntimeConfig
        {
            Host = Get("PHOTOBOOTH_BRIDGE_HOST")?.Trim() is { Length: > 0 } host ? host : "127.0.0.1",
            Port = ReadPort(Get("PHOTOBOOTH_BRIDGE_PORT"), "PHOTOBOOTH_BRIDGE_PORT", 17777),
            TokenDigest = SHA256.HashData(Encoding.UTF8.GetBytes(token)),
            AllowedOrigins = new HashSet<string>(origins, StringComparer.Ordinal),
            DataDir = Get("SNAPYOS_DATA_DIR")?.Trim() is { Length: > 0 } dir ? dir : DefaultDataDir(),
            Camera = camera,
            CameraStream = cameraStream,
            Printer = printer,
            Mock = mock,
            CameraBin = Get("GPHOTO2_BIN")?.Trim() is { Length: > 0 } gphoto ? gphoto : "gphoto2",
            CaptureTarget = Get("GPHOTO2_CAPTURE_TARGET")?.Trim() ?? string.Empty,
            TimeoutMs = timeoutMs,
            DigicamPort = ReadPort(Get("DIGICAMCONTROL_PORT"), "DIGICAMCONTROL_PORT", 5513),
            DigicamCmd = Get("DIGICAMCONTROL_CMD")?.Trim() is { Length: > 0 } digicam
                ? digicam
                : "C:\\Program Files\\digiCamControl\\CameraControlCmd.exe",
            SumatraBin = Get("SUMATRA_BIN")?.Trim() is { Length: > 0 } sumatra
                ? sumatra
                : "C:\\Program Files\\SumatraPDF\\SumatraPDF.exe",
            PowershellBin = Get("POWERSHELL_BIN")?.Trim() is { Length: > 0 } powershell ? powershell : "powershell",
            CupsBin = Get("LP_BIN")?.Trim() is { Length: > 0 } lp ? lp : "lp",
            LpstatBin = Get("LPSTAT_BIN")?.Trim() is { Length: > 0 } lpstat ? lpstat : "lpstat",
            // Cap body PDF/base64: 50 lembar × 8 foto tetap jauh di bawah ini.
            MaxBodyBytes = 60L * 1024 * 1024,
            CloudUrl = (Get("SNAPYOS_CLOUD_URL")?.Trim() ?? string.Empty).TrimEnd('/'),
            DeviceToken = Get("SNAPYOS_DEVICE_TOKEN")?.Trim() ?? string.Empty,
        };
    }
}
