using SnapyOS.Launcher;
using SnapyOS.LocalStore;

if (args.FirstOrDefault() is "--migrate")
{
    // Zero extra arguments: default to %LOCALAPPDATA%\SnapyOS, matching the installer's DataRoot.
    var databasePath = args.Length > 1
        ? args[1]
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SnapyOS", "snapyos.db");
    var mediaRoot = args.Length > 2
        ? args[2]
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SnapyOS", "media");
    using var store = new LocalStore(new LocalStoreOptions(databasePath, mediaRoot));
    Console.WriteLine($"SQLite schema migrated to {store.SchemaVersion}.");
    return 0;
}

var manifestPath = args.FirstOrDefault() ?? Path.Combine(AppContext.BaseDirectory, "snapyos-kiosk.json");
var manifest = KioskProcessSupervisor.LoadManifest(await File.ReadAllTextAsync(manifestPath));
return await new KioskProcessSupervisor(new ProcessChildFactory()).RunAsync(manifest);
