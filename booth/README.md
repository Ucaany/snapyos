# SNAPY OS Booth — aplikasi kiosk Windows (C#/.NET + React + WinUI 3)

Aplikasi booth yang **diinstal di Windows**. Memuat halaman kiosk, panel setelan,
kamera, printer, dan seluruh kustomisasi di dalam aplikasi. Terhubung ke cloud
SNAPY OS untuk transaksi dan sinkronisasi sesi.

> **1 pairing = 1 aplikasi = 1 lisensi.** Satu instalasi terikat ke satu photobox
> dan satu mesin.

## Struktur

```
booth/
├── contracts/                     # SUMBER TUNGGAL kontrak setelan (JSON Schema)
│   ├── device-settings.schema.json
│   ├── settings-envelope.schema.json
│   └── generate.mjs               # → model C# + tipe TS (deterministik)
├── ui/                            # UI React + TypeScript (Vite), di-bundle lokal
│   └── src/                       # kiosk, setelan booth, pairing, import/export
├── scripts/
│   ├── build-booth.ps1            # build Windows (Debug/Release)
│   └── generate-assets.mjs        # ikon aplikasi
└── src/
    ├── SnapyOS.Booth.Contracts/   # model C# ter-generate
    ├── SnapyOS.Booth.Core/        # config, store SQLite, settings, validator schema
    ├── SnapyOS.Booth.Bridge/      # Kestrel loopback (kontrak /v1/*) + host headless
    └── SnapyOS.Booth.Shell/       # WinUI 3: jendela kiosk + WebView2 (UI lokal)
```

## Arsitektur singkat

```
WinUI 3 Shell ── host ──► WebView2 (https://snapyos.app) ── UI React lokal
      │                          │  fetch + X-Bridge-Token
      │ in-process               ▼
      └──────────────► BridgeServer (Kestrel http://127.0.0.1:17777)
                                 │
                                 ├── Store SQLite (snapyos.db, WAL)
                                 ├── SettingsService (kontrak /v1/settings*)
                                 ├── kamera / printer (Fase 3)
                                 └── sync worker → cloud (Fase 2)
```

## Build (wajib di Windows)

```powershell
.\booth\scripts\build-booth.ps1
```

Hasil: folder siap jalan `booth\dist\booth\` berisi
`SnapyOS.Booth.Shell.exe` + seluruh dependensi & UI lokal.

Prasyarat: .NET 8 SDK, Node.js ≥ 22. Windows App SDK & WebView2 dipasang lewat
NuGet saat restore. Fase 1 memakai **unpackaged + self-contained** agar EXE
langsung bisa dijalankan tanpa memasang runtime; Fase 5 menggantinya ke MSIX
bertanda tangan.

## Jalankan

Satu perintah (membangun bila belum ada):

```powershell
.\booth\scripts\run-local.ps1 -Token "0123456789abcdef" -Mock
```

Manual:

```powershell
$env:PHOTOBOOTH_BRIDGE_TOKEN = "<token minimal 16 karakter>"
$env:SNAPYOS_ALLOW_MOCK = "1"     # Fase 1: adapter mock sampai perangkat keras (Fase 3)
& "booth\dist\booth\SnapyOS.Booth.Shell.exe"
```

## Tiga cara mendapat aplikasi

| Siapa             | Alur                                              | Butuh                          |
| ----------------- | ------------------------------------------------- | ------------------------------ |
| Developer         | `git clone` → `run-local.ps1`                     | Windows + .NET 8 SDK + Node 22 |
| QA / uji internal | unduh artefak dari GitHub Actions "Booth Windows" | Windows, tanpa SDK             |
| Operator booth    | unduh ZIP dari GitHub Release (tag `v*`)          | Windows, tanpa SDK             |

Workflow `.github/workflows/booth-windows.yml` membangun di runner `windows-latest`
(build solusi, tes xUnit, publish self-contained) dan mengunggah folder
`dist/booth` sebagai artefak. Jadi repo hasil clone tidak wajib punya SDK untuk
sekadar mencoba aplikasi: unduh artefak, jalankan EXE.

## Rilis satu klik (GitHub Release)

Sekali per versi — bukan sekali per mesin.

1. Naikkan `VersionInfo.Version` di `booth/src/SnapyOS.Booth.Core/VersionInfo.cs`
   dan versi di `booth/ui/package.json`.
2. Commit, lalu buat tag: `git tag v0.1.0 && git push origin v0.1.0`.
3. Workflow "Booth Windows" jalan otomatis dan menerbitkan GitHub Release berisi:
   - `snapyos-booth-v0.1.0-win-x64.zip` — EXE self-contained + UI + `Jalankan-Booth.cmd`
   - `snapyos-booth-v0.1.0-win-x64.zip.sha256`
4. Operator cukup mengunduh ZIP, ekstrak ke folder permanen, klik dua kali
   `Jalankan-Booth.cmd`. **Tidak perlu .NET SDK, Node, atau build di mesinnya.**

`Jalankan-Booth.cmd` (Fase 1) selalu menyalakan adapter mock, membuat
`bridge-token.txt` (32 hex) pada eksekusi pertama bila `PHOTOBOOTH_BRIDGE_TOKEN`
belum di-set atau isinya kurang dari 16 karakter, lalu mencetak token itu di
jendela konsol supaya bisa dicocokkan dengan dashboard. Token tidak pernah ditulis
ke UI atau `localStorage`; Shell menyuntiknya ke WebView2 saat dokumen dibuat.

Launcher sengaja tidak memakai satu pun blok `if (...)`: ekspansi `%VAR%` di
dalamnya terjadi saat parse, bukan saat jalan, dan itu yang dulu menulis teks
`ECHO is off.` ke `bridge-token.txt` sehingga aplikasi gagal start. Pemeriksa
statisnya: `bash booth/scripts/test-launcher.sh` (jalan di macOS/Linux, tidak
butuh Windows; membuktikan bentuk berkas, bukan perilaku cmd.exe).

Prasyarat mesin operator hanya Windows 10 1809+/11 x64 dan WebView2 Runtime
(sudah ada di Windows 11 dan Windows 10 yang terbarui).

Installer untuk operator **tidak** diambil dari clone — itu fase 5 (MSIX +
code signing) dan didaftarkan di `/admin/apps`, bukan di storage SnapyOS.
ZIP rilis fase 1 belum bertanda tangan, jadi Windows menampilkan peringatan
SmartScreen; itu diharapkan sampai fase 5.

## Kontrak setelan

Kontrak hidup di **satu** berkas: `contracts/device-settings.schema.json`.
`node contracts/generate.mjs` menghasilkan:

- `src/lib/generated/device-settings.gen.ts` (dipakai cloud + runtime TS)
- `booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs` (dipakai booth C#)

Jangan menyalin aturan grup/kepemilikan di kode. Schema yang sama di-embed ke
`SnapyOS.Booth.Core` sehingga validator booth dan model C# tidak bisa menyimpang.

## Penyimpangan yang disengaja dari `docs/22`

Dicatat supaya tidak dianggap drift tak sengaja.

| # | `docs/22` menyebut                                        | Yang dipakai                                                             | Alasan                                                                                                                     |
| - | --------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1 | Rute UI lewat `HashRouter` (`/kiosk`, `/settings`, …)       | State tab (`useState<Tab>`) tanpa dependency router                      | Satu jendela kiosk, empat tab, tanpa deep-link. Menambah router berarti dependency baru tanpa manfaat (gerbang §2.1).       |
| 2 | UI build ke `ui/dist`, disalin ke `Shell/Assets/ui`        | Vite `outDir` langsung ke `booth/src/SnapyOS.Booth.Shell/Assets/ui`       | Satu langkah lebih sedikit; folder itu gitignored, jadi tetap artefak build.                                                |
| 3 | Token visual dari `src/styles/tokens.css` (light paper)    | `booth/ui/src/styles.css` — substrat gelap `#0A0A0A` + hazard red         | Kiosk dilihat dari jarak dekat di ruang gelap; palet kertas putih menyilaukan. Aturan Neo-Brutalism tetap: sudut 90°, garis 1px, tanpa gradient/shadow lembut. |
| 4 | Mutex `Global\SnapyOS.Booth`                              | `Local\SnapyOS.Booth` + event `Local\SnapyOS.Booth.Activate`              | Mutex global butuh `SeCreateGlobalPrivilege`; user booth biasa tidak punya, sehingga instance kedua akan crash alih-alih keluar rapi. |
| 5 | Presenter kiosk dari `OverlappedPresenter` saja            | `OverlappedPresenter` (border/title off, no resize/max/min) **lalu** `SetPresenter(FullScreen)` | `OverlappedPresenter` mengatur dekorasi; `FullScreen` mengisi layar. Keduanya dipakai berurutan, bukan salah satu. |
| 6 | Kiosk terkunci penuh (tanpa jalan keluar OS)              | Hanya `AppWindow.Closing` yang ditahan: **Win key, Alt+Tab, dan Task Manager tidak diblokir**. Assigned Access (kiosk mode Windows) direncanakan Fase 5 | Aplikasi unpackaged tidak bisa menolak shortcut level OS maupun menutup Task Manager; klaim sebaliknya akan menyesatkan operator. Jalur keluar resmi tetap PIN darurat `POST /v1/exit`. |

## Status fase

| Fase | Isi                                                       | Status                                                                     |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0    | Kontrak JSON Schema + generator                           | **selesai** — gate hijau 2026-10-30 (`VERIFICATION.md`)                    |
| 1–2  | Solusi .NET + WinUI 3 + WebView2, port runtime            | **kode ada, build Windows terbukti di CI run `41035205471`; gate runtime Windows belum dijalankan** |
| 3    | Kamera & printer native + uji hardware                    | belum (hanya mock)                                                         |
| 4    | Lisensi Ed25519 + fingerprint + UI aktivasi               | belum                                                                      |
| 5    | MSIX + auto-update + code signing                         | belum                                                                      |
| 6    | Hapus Tauri/Node + dokumentasi                            | belum                                                                      |

Rencana eksekusi + gate verifikasi: `booth/plan.md`.
Prompt siap-salin per fase: `booth/prompts.md`.
Konteks produk: `docs/22-booth-dotnet-prompts.md`.
Hasil verifikasi apa adanya: `booth/VERIFICATION.md`.

Build WinUI 3 hanya bisa dijalankan di Windows x64; di macOS hanya kontrak, UI, dan
tes cloud yang bisa diverifikasi.
