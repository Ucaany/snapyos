using SnapyOS.Booth.Bridge;
using SnapyOS.Booth.Core;
using SnapyOS.Booth.Core.Hardware;

// Host mandiri server bridge untuk pengujian/headless. Aplikasi Shell WinUI 3
// menjalankan BridgeServer yang sama secara in-process; entry point ini dipakai
// saat bridge perlu dijalankan tanpa UI (mis. smoke test di CI).
var environment = Environment.GetEnvironmentVariables()
    .Cast<System.Collections.DictionaryEntry>()
    .ToDictionary(
        entry => (string)entry.Key,
        entry => entry.Value?.ToString(),
        StringComparer.Ordinal);

RuntimeConfig config;
try
{
    config = RuntimeConfig.Load(environment);
}
catch (ConfigException error)
{
    Console.Error.WriteLine($"[snapyos-bridge] {error.Message}");
    return 1;
}

using var store = Store.Open(config.DataDir);

// Adapter perangkat keras nyata (digiCamControl/WIA + printer spooler)
// diimplementasikan pada Fase 3. Sampai itu, hanya adapter mock yang tersedia:
// memakai mock untuk config nyata akan diam-diam memalsukan foto pelanggan, jadi
// start digagalkan, bukan disubstitusi.
if (config.Camera != "mock" || config.Printer != "mock" || config.CameraStream is not (null or "mock"))
{
    Console.Error.WriteLine(
        "[snapyos-bridge] Adapter perangkat keras belum tersedia (Fase 3). " +
        "Jalankan dengan SNAPYOS_CAMERA=mock SNAPYOS_PRINTER=mock SNAPYOS_ALLOW_MOCK=1.");
    return 1;
}

ICamera camera = new MockCamera();
ICamera? streamCamera = config.CameraStream == "mock" ? new MockCamera() : null;
IPrinter printer = new MockPrinter();

Console.Error.WriteLine("[snapyos-bridge] MODE MOCK AKTIF — tidak ada kamera/printer fisik yang dipakai.");

var server = new BridgeServer(config, store, camera, streamCamera, printer, sync: null, Console.Error.WriteLine);
var app = server.Build();

Console.Error.WriteLine(
    $"[snapyos-bridge] v{VersionInfo.Version} http://{config.Host}:{config.Port} " +
    $"(kamera={config.Camera}, printer={config.Printer}, MOCK)");

await server.StartAsync();
await app.WaitForShutdownAsync();
return 0;
