# SnapyOS Windows foundation

> **FROZEN (2026-11-08):** Windows native ditahan. Target aktif = PWA kiosk Android/web.
> Kode dan dokumen dipertahankan untuk referensi; tidak ada pekerjaan baru di folder ini.

## Prerequisites

- Windows 10/11 for WPF execution.
- .NET 10 SDK.
- Windows Desktop SDK workload or Windows SDK required by the installed .NET SDK.
- NuGet access for restore.

Build Release lintas target di macOS: `dotnet build windows/SnapyOS.sln -c Release -p:EnableWindowsTargeting=true` → 15 project, 0 error, 0 warning. Test runtime dan uji kiosk tetap wajib dijalankan pada Windows 10/11 x64; project menargetkan `net10.0-windows`.

## Projects

- `SnapyOS.Wpf`: minimal WPF shell foundation.
- `SnapyOS.Contracts`: shared domain contracts.
- `SnapyOS.Wpf.Tests`: xUnit foundation tests.
- `SnapyOS.LocalStore`: SQLite metadata store, migrations, recovery, retention guards.
- `SnapyOS.LocalStore.Tests`: SQLite behavior tests.
- `SnapyOS.Core`: configuration models, validation, migration, and secret policy.
- `SnapyOS.Core.Tests`: configuration policy and hardware discovery tests.

Hardware discovery uses a metadata-only catalog contract. Priority: UVC, Windows Media Foundation, DirectShow fallback, PTP, MTP, gphoto2, libgphoto2. Catalog entries carry manufacturer, model, connection, protocol, capture/preview/exposure/autofocus/reconnect/GIF capabilities, certification, Windows compatibility, and known limitations. Blocked or Windows-incompatible devices are excluded from usable results. No proprietary vendor SDK is a required dependency; `FakeHardwareDiscoveryProvider` covers deterministic tests.

`SnapyOS.Core/UvcCamera.cs` provides the Windows UVC camera contract and adapter lifecycle. A Media Foundation or DirectShow implementation can be injected later; no camera SDK is required by this project.

`SnapyOS.Core/ProtocolCamera.cs` provides capability-driven PTP, MTP, gphoto2, and libgphoto2-compatible USB discovery and session contracts. Devices are classified as certified, compatible, transfer-only, or unsupported; capture, transfer, preview, and exposure calls are capability-gated. Sessions enforce timeout, cancellation, exclusive access, reconnect, and explicit unsupported health state. No camera model is certified by this code alone; certification requires hardware evidence. No proprietary vendor SDK is required.

`SnapyOS.Core/Calibration.cs` and `SnapyOS.LocalStore/CalibrationRepository.cs` provide monitor enumeration, resolution/DPI/orientation detection, portrait and landscape profiles, normalized crop/safe-area geometry, mirror/rotation mapping, framing-grid metadata, calibration capture validation, per-camera/orientation persistence, read-all, and reset. They do not alter camera adapter behavior or provide a full editor.

`SnapyOS.Core/Printing.cs` defines a native-first Windows spooler abstraction with stable printer identity, default printer, driver/availability status, paper profiles, orientation, copies, borderless capability, queue length, job IDs, idempotency, retry, cancellation, and test print. `SnapyOS.Printing/NativeWindowsPrintSpooler.cs` enumerates the Windows spooler through `System.Printing`; document submission remains an explicit format-adapter boundary. A compatibility fallback is an explicit flag only; PowerShell and SumatraPDF are not required dependencies.

`SnapyOS.Core/LocalMediaPipeline.cs` renders local photo strips from filesystem photos and template slots. It supports crop/fit/fill, slot rotation, overlays, text, logo, JPEG/PNG output, SHA-256 metadata, atomic temporary-file replacement, and cleanup. `LocalGifRenderer` adds local multi-frame GIF output with duration/loop, memory and cancellation guards. `SnapyOS.LocalStore/LocalGifOutbox.cs` registers only filesystem metadata in SQLite; no renderer upload exists.

`ResultManifestFactory` creates local-only result manifests for final photo strip/GIF metadata. Cloud ACK transitions the manifest to `PublicQrReady`; QR payload generation throws before ACK. `ResultManifestRepository` stores manifest metadata only, never raw photo bytes or paths.

`SnapyOS.Core/PaymentClient.cs` calls the existing cloud package, checkout, voucher, payment-status, and cash-confirm routes through the `{ data: ... }` envelope. QRIS display data stays in the response; offline network failures enqueue a deduplicated local intent. Provider API keys, webhook secrets, service-role keys, and merchant credentials remain cloud-side. `PaymentClientTests` uses a fake HTTP payment server for pending, paid, expired, failed, cash confirmation, idempotency, and unauthorized cases.

- `SnapyOS.Security`: PIN policy, lockout, audit, and DPAPI secret storage.
- `SnapyOS.Security.Tests`: security behavior tests.
- `SnapyOS.Agent`: localhost IPC server and typed operational handlers.
- `SnapyOS.Agent.Tests`: fake-agent integration tests.

Pairing client coverage lives in `SnapyOS.Agent`: activation code and QR payload, DPAPI token storage, verify/heartbeat, revoke, public endpoint constants, and explicit offline/repair states. It consumes the existing JSON `{ data: ... }` envelope and does not add routes.

## Build on Windows

Cek kompilasi saja:

```bash
dotnet restore windows/SnapyOS.sln
dotnet build windows/SnapyOS.sln --configuration Debug
dotnet test windows/SnapyOS.sln --configuration Debug --no-build
dotnet build windows/SnapyOS.sln --configuration Release
```

Membuat ZIP installer siap pasang (dari `windows\deploy`, PowerShell biasa):

```powershell
.\Package-SnapyOS-Kiosk.ps1 -Version 0.1.6 -SelfContained
```

Alur lengkap, prasyarat, verifikasi, dan tabel kegagalan: [docs/BUILD-ULANG.md](docs/BUILD-ULANG.md).

No camera, printer, payment, branding, or kiosk flow is implemented in this foundation.
