using System.Text.Json.Nodes;
using SnapyOS.Booth.Core;

namespace SnapyOS.Booth.Tests;

/// <summary>Pabrik objek uji: store sementara + config mock.</summary>
internal static class TestFactory
{
    public static readonly byte[] TinyJpeg = Convert.FromBase64String(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
        "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
        "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==");

    public sealed class TempDir : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(),
            $"snapyos-test-{Guid.NewGuid():N}");

        public TempDir() => Directory.CreateDirectory(Path);

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
                // Uji tidak boleh gagal karena pembersihan temp.
            }
        }
    }

    public static Dictionary<string, string?> Env(string dataDir, string? cloudUrl = null, string? deviceToken = null)
    {
        var env = new Dictionary<string, string?>(StringComparer.Ordinal)
        {
            ["PHOTOBOOTH_BRIDGE_TOKEN"] = "test-token-0123456789",
            ["SNAPYOS_DATA_DIR"] = dataDir,
            ["SNAPYOS_CAMERA"] = "mock",
            ["SNAPYOS_PRINTER"] = "mock",
            ["SNAPYOS_ALLOW_MOCK"] = "1",
        };
        if (cloudUrl is not null)
        {
            env["SNAPYOS_CLOUD_URL"] = cloudUrl;
        }
        if (deviceToken is not null)
        {
            env["SNAPYOS_DEVICE_TOKEN"] = deviceToken;
        }
        return env;
    }

    public static RuntimeConfig Config(string dataDir, string? cloudUrl = null, string? deviceToken = null) =>
        RuntimeConfig.Load(Env(dataDir, cloudUrl, deviceToken));

    public static JsonObject Json(string raw) => JsonNode.Parse(raw)!.AsObject();
}
