namespace SnapyOS.Booth.Core;

/// <summary>
/// Versi aplikasi booth. Dipakai pada <c>/v1/status</c> dan laporan ke cloud
/// (<c>app_version</c>) supaya <c>/dashboard/apps</c> bisa menandai booth yang
/// ketinggalan. Sumber tunggal ada di <c>booth/src/SnapyOS.Booth.Core/VersionInfo.cs</c>.
/// </summary>
public static class VersionInfo
{
    /// <summary>Versi semantik aplikasi booth. Naikkan bersamaan dengan tag rilis.</summary>
    public const string Version = "0.1.0";
}
