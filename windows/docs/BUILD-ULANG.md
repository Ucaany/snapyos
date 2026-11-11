# Panduan build ulang installer Windows

Alur dari kode ke ZIP yang siap dipasang di mesin Windows 10/11 x64. Tidak ada auto-update; setiap rilis dibuat manual.

## Ringkas

Satu perintah di Windows menghasilkan ZIP berisi installer + manifest + payload:

```powershell
.\Package-SnapyOS-Kiosk.ps1 -Version 0.1.6 -SelfContained
```

Output:

| Artefak             | Lokasi                                         |
| ------------------- | ---------------------------------------------- |
| Payload publish     | `windows\deploy\payload\` (501 file)           |
| Manifest + checksum | `windows\deploy\snapyos-install-manifest.json` |
| ZIP siap kirim      | `windows\SnapyOS-Kiosk-win-x64-v0.1.6.zip`     |
| SHA-256 ZIP         | dicetak di akhir skrip                         |

## Prasyarat

- Windows 10/11 x64.
- .NET 10 SDK. Cek: `dotnet --version` → `10.x`.
- PowerShell elevated (Administrator) untuk langkah instalasi, bukan untuk build.
- NuGet reachable (restore).

Build dari macOS hanya untuk cek kompilasi; ZIP hasil macOS tetap sah karena publish `win-x64`, tetapi `dotnet test` untuk `net10.0-windows` tidak bisa jalan di sana.

## Langkah build

Dari root repo:

```powershell
cd windows\deploy
```

Naikkan versi. Versi masuk ke nama ZIP dan ke manifest, jadi selalu beda dari rilis sebelumnya:

```powershell
.\Package-SnapyOS-Kiosk.ps1 -Version 0.1.6 -SelfContained
```

`-SelfContained` wajib untuk mesin bersih tanpa .NET runtime. Tanpa flag itu payload framework-dependent dan gagal jalan di PC tanpa .NET 10 Desktop Runtime.

Skrip melakukan berurutan: `dotnet restore` → `build Release` → `dotnet test` → publish `SnapyOS.Wpf` + `SnapyOS.Launcher` ke `payload\` → salin `snapyos-kiosk.json` → tulis manifest 501 entri dengan SHA-256 + ukuran per file → buat ZIP. Jika `dotnet test` gagal, ZIP tidak dibuat.

## Verifikasi sebelum kirim

```powershell
.\Test-SnapyOS-Readiness.ps1 -Version 0.1.6 -SelfContained
```

Gate ini membangun ulang lalu memeriksa: manifest tidak kosong, ada `SnapyOS.Wpf.exe`, `SnapyOS.Launcher.exe`, `snapyos-kiosk.json`, `e_sqlite3.dll`, tidak ada `.pdb`, algoritma SHA-256, arsitektur x64, `service.enabled=false`, dan checksum payload cocok.

Cek manual hash ZIP:

```powershell
Get-FileHash .\windows\SnapyOS-Kiosk-win-x64-v0.1.6.zip -Algorithm SHA256
```

Bandingkan dengan baris `SHA256:` yang dicetak skrip paket.

## Build dari macOS (tanpa installer)

Hanya untuk memastikan kode dikompilasi. Tidak menghasilkan ZIP lewat skrip paket, karena skrip menolak jalan di non-Windows.

```bash
dotnet build windows/SnapyOS.sln -c Release -p:EnableWindowsTargeting=true
```

Publish manual bila perlu:

```bash
cd windows/deploy && rm -rf payload && mkdir payload
dotnet publish ../SnapyOS.Wpf/SnapyOS.Wpf.csproj -c Release -r win-x64 --self-contained true -o payload -p:EnableWindowsTargeting=true -p:DebugType=None -p:DebugSymbols=false
dotnet publish ../SnapyOS.Launcher/SnapyOS.Launcher.csproj -c Release -r win-x64 --self-contained true -o payload -p:EnableWindowsTargeting=true -p:DebugType=None -p:DebugSymbols=false
cp snapyos-kiosk.json payload/
```

Lalu regenerasi manifest dan ZIP dengan skrip Python di `windows/deploy` (lihat riwayat commit) atau jalankan `Package-SnapyOS-Kiosk.ps1` di Windows — cara kedua lebih aman.

## Memasang hasil build

Ekstrak ZIP di mesin target, buka PowerShell elevated di folder hasil ekstrak:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
```

Deteksi dulu, belum mengubah apa pun:

```powershell
.\Install-SnapyOS-Kiosk.ps1 -Action Detect
```

Instal bersih:

```powershell
.\Install-SnapyOS-Kiosk.ps1 -Action Install
```

Timpa versi lama (root sudah ada):

```powershell
.\Install-SnapyOS-Kiosk.ps1 -Action Upgrade
```

`Install` menolak jika `C:\Program Files\SnapyOS` sudah ada. Folder kosong sisa percobaan gagal dihapus otomatis.

## Setelah terpasang

Jalankan kiosk sekali dari Scheduled Task, lalu atur PIN:

```powershell
Start-ScheduledTask -TaskName "SnapyOS Kiosk"
```

Pada rilis 0.1.6 ke atas, layar **ATUR PIN AWAL** muncul sebelum kiosk. Isi tiga PIN berbeda (4-6 digit): admin, keluar kiosk, darurat offline. PIN disimpan lewat DPAPI di `%LOCALAPPDATA%\SnapyOS\secrets`, terikat ke mesin.

Keluar dari kiosk: tombol **Petugas** → masukkan PIN keluar.

Matikan autostart saat merawat:

```powershell
Disable-ScheduledTask -TaskName "SnapyOS Kiosk"
```

Nyalakan lagi:

```powershell
Enable-ScheduledTask -TaskName "SnapyOS Kiosk"
```

## Jika build gagal

| Gejala                                    | Sebab                                           | Tindakan                                          |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `Packaging must run on Windows 10/11 x64` | Dijalankan di macOS/Linux                       | Jalankan di Windows; untuk macOS pakai build saja |
| `net10.0-windows` host error saat test    | Testhost Windows di macOS                       | Wajar; tes hanya sah di Windows                   |
| `dotnet publish failed`                   | SDK atau workload kurang                        | Pasang .NET 10 SDK + Windows Desktop workload     |
| `Payload file missing: X` saat install    | ZIP diekstrak tidak lengkap atau payload diubah | Ekstrak ulang ZIP, jangan edit isi `payload\`     |
| `Payload checksum mismatch`               | File payload berubah setelah manifest dibuat    | Build ulang, jangan tambal manual                 |
| `Install root already exists`             | Folder program lama masih ada                   | Pakai `-Action Upgrade`                           |
| ZIP tidak terbentuk                       | `dotnet test` gagal lebih dulu                  | Perbaiki tes; skrip berhenti sebelum ZIP          |

## Aturan versi

- Naikkan `-Version` setiap rilis; jangan menimpa ZIP lama.
- Manifest mengunci 501 file beserta SHA-256. Menambah/menghapus file payload tanpa build ulang akan menggagalkan instalasi — itu disengaja.
- Migrasi SQLite maju saja. Rollback mengembalikan aplikasi dan data backup, bukan menurunkan skema.
