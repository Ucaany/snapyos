namespace SnapyOS.Booth.Shell;

/// <summary>
/// Log berkas sederhana untuk Shell. Tanpa ini, kegagalan start (config, izin
/// folder data, port terpakai) hilang tanpa jejak: EXE tetap hidup, jendela
/// kosong, dan port 17777 tidak pernah listen.
///
/// Ditulis ke <c>%LOCALAPPDATA%\SNAPYOS\booth.log</c> — selalu bisa ditulis
/// user, tidak seperti folder aplikasi di Program Files. Kegagalan menulis log
/// tidak pernah menggagalkan aplikasi.
/// </summary>
public sealed class BoothLog
{
    private const long MaxBytes = 2 * 1024 * 1024;

    private readonly object _gate = new();
    private readonly string _path;

    public BoothLog(string path)
    {
        _path = path;
        try
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
        }
        catch (Exception)
        {
            // Log adalah alat bantu, bukan syarat jalan.
        }
    }

    public static string DefaultPath() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "SNAPYOS",
        "booth.log");

    public string FilePath => _path;

    public void Write(string message)
    {
        var line = $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss.fff} {message}{Environment.NewLine}";
        lock (_gate)
        {
            try
            {
                RotateIfNeeded();
                File.AppendAllText(_path, line);
            }
            catch (Exception)
            {
                // Diabaikan dengan sengaja: log tidak boleh menjatuhkan kiosk.
            }
        }
    }

    private void RotateIfNeeded()
    {
        var info = new FileInfo(_path);
        if (!info.Exists || info.Length < MaxBytes)
        {
            return;
        }
        var previous = _path + ".1";
        if (File.Exists(previous))
        {
            File.Delete(previous);
        }
        File.Move(_path, previous);
    }
}
