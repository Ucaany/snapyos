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

```powershell
$env:PHOTOBOOTH_BRIDGE_TOKEN = "<token minimal 16 karakter>"
$env:SNAPYOS_ALLOW_MOCK = "1"     # Fase 1: adapter mock sampai perangkat keras (Fase 3)
& "booth\dist\booth\SnapyOS.Booth.Shell.exe"
```

## Kontrak setelan

Kontrak hidup di **satu** berkas: `contracts/device-settings.schema.json`.
`node contracts/generate.mjs` menghasilkan:

- `src/lib/generated/device-settings.gen.ts` (dipakai cloud + runtime TS)
- `booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs` (dipakai booth C#)

Jangan menyalin aturan grup/kepemilikan di kode. Schema yang sama di-embed ke
`SnapyOS.Booth.Core` sehingga validator booth dan model C# tidak bisa menyimpang.

## Status fase

| Fase | Isi                                                       | Status                                                   |
| ---- | --------------------------------------------------------- | -------------------------------------------------------- |
| 0    | Kontrak JSON Schema + generator                           | **kode selesai** — gate CI & tes paritas TS↔C# belum     |
| 1    | Solusi .NET + WinUI 3 + WebView2 host UI lokal            | **kode ada** — belum pernah di-build di Windows          |
| 2    | Port runtime: store, settings, sync, session, PIN darurat | **kode + 43 tes ada** — `dotnet test` belum pernah jalan |
| 3    | Kamera & printer native + uji hardware                    | belum (hanya mock)                                       |
| 4    | Lisensi Ed25519 + fingerprint + UI aktivasi               | belum                                                    |
| 5    | MSIX + auto-update + code signing                         | belum                                                    |
| 6    | Hapus Tauri/Node + dokumentasi                            | belum                                                    |

Rencana eksekusi + gate verifikasi: `booth/plan.md`.
Prompt siap-salin per fase: `booth/prompts.md`.
Konteks produk: `docs/22-booth-dotnet-prompts.md`.

Build WinUI 3 hanya bisa dijalankan di Windows x64; di macOS hanya kontrak, UI, dan
tes cloud yang bisa diverifikasi.
