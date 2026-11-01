using System.Text.Json.Nodes;

namespace SnapyOS.Agent;

public sealed record IpcRequest(string CorrelationId, JsonObject? Payload = null);
public sealed record IpcResponse(string CorrelationId, bool Ok, object? Data = null, string? Error = null);
public sealed record AgentHealth(string Status, string Version, DateTimeOffset At);
public sealed record DeviceStatus(string Status, string? Detail = null);
public sealed record SyncStatus(string State, int Pending, int Retrying, string? LastError = null);
public sealed record DiagnosticsReport(string AgentVersion, string ConfigRevisionId, DeviceStatus Camera, DeviceStatus Printer, SyncStatus Sync);

public interface IAgentHardwareStatus
{
    Task<DeviceStatus> CameraAsync(CancellationToken cancellationToken);
    Task<DeviceStatus> PrinterAsync(CancellationToken cancellationToken);
}

public interface IAgentKioskController
{
    Task LaunchAsync(CancellationToken cancellationToken);
    Task RestartAsync(CancellationToken cancellationToken);
}

public interface IAgentSyncStatus
{
    Task<SyncStatus> ReadAsync(CancellationToken cancellationToken);
}
