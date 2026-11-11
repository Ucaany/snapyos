# SnapyOS manual Windows installer

Manual packaging target: Windows 10/11, x64. No auto-update, background download, or unattended upgrade.

## Package contract

Build a release payload on Windows with the .NET 10 SDK/Desktop workload, then fill `snapyos-install-manifest.json` with the release version and one SHA-256/size entry per payload file. `payloadRoot` must contain exactly the listed files. Missing, extra, duplicate, traversal, reparse-point, size, or checksum failures abort before mutation.

Repository contents:

| File                                     | Purpose                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `snapyos-install-manifest.template.json` | Manifest template tanpa entri file. Sumber tetap yang ikut Git.               |
| `snapyos-install-manifest.json`          | Dihasilkan skrip paket; diabaikan Git.                                        |
| `payload/`                               | Hasil publish win-x64; diabaikan Git.                                         |
| `Package-SnapyOS-Kiosk.ps1`              | Build, test, publish, lalu tulis manifest + checksum.                         |
| `Test-SnapyOS-Readiness.ps1`             | Gate otomatis: build, test, manifest, checksum, rencana installer non-mutasi. |
| `Install-SnapyOS-Kiosk.ps1`              | Installer manual dengan verifikasi checksum dan backup.                       |

`Package-SnapyOS-Kiosk.ps1` default memakai payload framework-dependent. Tambahkan `-SelfContained` untuk mesin bersih tanpa .NET runtime.

## Commands

Jalankan elevated Windows PowerShell 5.1 atau PowerShell 7 dari folder hasil ekstraksi. Script installer kompatibel dengan Windows PowerShell 5.1. Jika policy memblokir script, gunakan `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force`.

Jalankan elevated PowerShell dari folder `windows\deploy`:

```powershell
.\Package-SnapyOS-Kiosk.ps1 -SelfContained
```

```powershell
.\Test-SnapyOS-Readiness.ps1 -SelfContained
```

```powershell
.\Install-SnapyOS-Kiosk.ps1 -Action Detect -ManifestPath .\snapyos-install-manifest.json
```

```powershell
.\Install-SnapyOS-Kiosk.ps1 -Action Install -ManifestPath .\snapyos-install-manifest.json
```

```powershell
.\Install-SnapyOS-Kiosk.ps1 -Action Upgrade -ManifestPath .\snapyos-install-manifest.json
```

```powershell
.\Install-SnapyOS-Kiosk.ps1 -Action RollbackPrepare -ManifestPath .\snapyos-install-manifest.json
```

```powershell
.\Install-SnapyOS-Kiosk.ps1 -Action Uninstall -ManifestPath .\snapyos-install-manifest.json
```

Use `-WhatIf` for a non-mutating plan. `-RemoveMedia` is destructive and requires `-ConfirmRemoveMedia`; normal uninstall never removes media, SQLite, configuration, secrets, queues, quarantine, logs, or backups.

The current repository has no service-aware executable. The manifest therefore keeps `service.enabled=false`. Do not register `SnapyOS.Wpf.exe`, `SnapyOS.Launcher.exe`, Node, PowerShell, NSSM, or another wrapper as a Windows Service. The WPF kiosk is interactive and starts through one owned Scheduled Task at user logon. A future dedicated non-UI .NET Worker may set `service.enabled=true` only after SCM lifecycle support exists. The installer plan enforces this separation in `SnapyOS.Launcher/InstallerPlan.cs`.

## Commands

`Package-SnapyOS-Kiosk.ps1` also bundles the installer scripts, manifest, and payload into `windows\SnapyOS-Kiosk-win-x64-v<version>.zip` and prints its SHA-256. That ZIP is the artefact to move to a target machine; no repository copy is needed there.

Panduan build ulang lengkap: `windows\docs\BUILD-ULANG.md`.

## Data and rollback

Application files stage under `C:\Program Files\SnapyOS`. Local state remains under `%LOCALAPPDATA%\SnapyOS`, including `snapyos.db`, WAL/SHM files, `configuration`, `secrets`, `device`, and `media`. Upgrade backs up these paths before stopping the kiosk, invokes the app-owned SQLite migration through `SnapyOS.Launcher.exe --migrate`, then records a rollback marker. SQLite migrations are forward-only: rollback restores the previous application and backup data; it does not downgrade a schema automatically.

Backups and JSONL logs are under `C:\ProgramData\SnapyOS\Installer`. File-association metadata is exported as a redacted JSON artifact. Tokens, PINs, credentials, and customer/session media are not included in configuration exports. Registration changes are idempotent and only owned startup entries are removed.

## Verification

On Windows 10/11 x64:

```powershell
dotnet restore windows\SnapyOS.sln
dotnet build windows\SnapyOS.sln --configuration Release
dotnet test windows\SnapyOS.sln --configuration Release --no-build
```

Then rehearse fresh install, upgrade from an older SQLite schema, checksum failure, failed migration, rollback preparation, normal uninstall, and explicit media deletion in a disposable machine. Confirm no auto-update task/service exists.

## Status bukti

| Gate                                            | Status                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `dotnet build` Release x64 (cross-target macOS) | PASS: 15 project, 0 error, 0 warning                                   |
| Publish `win-x64` self-contained                | PASS: 501 file, `SnapyOS.Wpf.exe` + `SnapyOS.Launcher.exe`             |
| Native SQLite `2.1.12` di payload               | PASS: `e_sqlite3.dll`                                                  |
| Manifest checksum payload                       | PASS: 501 entri, tanpa file ekstra                                     |
| ZIP bundling otomatis                           | Ada di `Package-SnapyOS-Kiosk.ps1`; belum pernah dieksekusi di Windows |
| `dotnet test` Release                           | BLOCKED di macOS: testhost `net10.0-windows` tidak bisa launch         |
| Rehearsal mesin Windows 10/11                   | BLOCKED: butuh mesin disposable dan hardware                           |

Build dan checksum boleh diklaim dari checkout ini. Uji runtime kiosk, kamera, printer, QRIS, installer, upgrade, rollback, dan restart hanya sah setelah dijalankan pada Windows 10/11 x64.

## Catatan rilis 0.1.6

`App.xaml.cs` kini membuka layar **ATUR PIN AWAL** sebelum `KioskWindow` bila `IsFirstSetupRequired`. Sebelumnya tidak ada kode produksi yang memanggil `CompleteFirstSetup`, sehingga PIN tidak pernah tersimpan dan tombol Petugas menolak semua PIN — mesin bisa terkunci tanpa jalan keluar. `KioskWindow` juga memperlakukan `NotConfigured` sebagai izin masuk Control Center, bukan penolakan.
