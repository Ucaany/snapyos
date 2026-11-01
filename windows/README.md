# SnapyOS Windows foundation

## Prerequisites

- Windows 10/11 for WPF execution.
- .NET 10 SDK.
- Windows Desktop SDK workload or Windows SDK required by the installed .NET SDK.
- NuGet access for restore.

This checkout currently has no `dotnet` executable, so build and test are not verified here. Project files target `net10.0-windows`; Windows build success is not claimed.

## Projects

- `SnapyOS.Wpf`: minimal WPF shell foundation.
- `SnapyOS.Contracts`: shared domain contracts.
- `SnapyOS.Wpf.Tests`: xUnit foundation tests.
- `SnapyOS.LocalStore`: SQLite metadata store, migrations, recovery, retention guards.
- `SnapyOS.LocalStore.Tests`: SQLite behavior tests.
- `SnapyOS.Core`: configuration models, validation, migration, and secret policy.
- `SnapyOS.Core.Tests`: configuration policy tests.
- `SnapyOS.Security`: PIN policy, lockout, audit, and DPAPI secret storage.
- `SnapyOS.Security.Tests`: security behavior tests.
- `SnapyOS.Agent`: localhost IPC server and typed operational handlers.
- `SnapyOS.Agent.Tests`: fake-agent integration tests.

Pairing client coverage lives in `SnapyOS.Agent`: activation code and QR payload, DPAPI token storage, verify/heartbeat, revoke, public endpoint constants, and explicit offline/repair states. It consumes the existing JSON `{ data: ... }` envelope and does not add routes.

## Build on Windows

```bash
dotnet restore windows/SnapyOS.sln
dotnet build windows/SnapyOS.sln --configuration Debug
dotnet test windows/SnapyOS.sln --configuration Debug --no-build
dotnet build windows/SnapyOS.sln --configuration Release
```

No camera, printer, payment, branding, or kiosk flow is implemented in this foundation.
