using SnapyOS.Agent;
using SnapyOS.Wpf.Mvvm;

namespace SnapyOS.Wpf.Services;

public enum ConnectionState
{
    Online,
    Offline,
    SetupRequired,
    Error
}

public interface IConnectionStatus
{
    ConnectionSnapshot Read();
}

public sealed record ConnectionSnapshot(ConnectionState State, string Label, string Detail, DateTimeOffset? LastVerifiedAt);

public sealed class PairingConnectionStatus(PairingClient pairing) : IConnectionStatus
{
    public ConnectionSnapshot Read() => pairing.Snapshot.State switch
    {
        PairingClientState.Paired => new(ConnectionState.Online, "ONLINE", "Pairing aktif.", pairing.Snapshot.LastVerifiedAt),
        PairingClientState.OfflinePaired => new(ConnectionState.Offline, "OFFLINE", pairing.Snapshot.LastError ?? "Pairing tersimpan, jaringan tidak tersedia.", pairing.Snapshot.LastVerifiedAt),
        PairingClientState.NeedsRepair => new(ConnectionState.Error, "PERLU PERBAIKAN", pairing.Snapshot.LastError ?? "Token pairing ditolak.", pairing.Snapshot.LastVerifiedAt),
        PairingClientState.Pairing => new(ConnectionState.SetupRequired, "MEMASANGKAN", "Pairing sedang berlangsung.", pairing.Snapshot.LastVerifiedAt),
        _ => new(ConnectionState.SetupRequired, "BELUM DIPASANGKAN", "Pasangkan booth untuk mengaktifkan sinkronisasi.", pairing.Snapshot.LastVerifiedAt)
    };
}
