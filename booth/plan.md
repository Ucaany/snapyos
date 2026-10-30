# booth/plan.md — Rencana Eksekusi Aplikasi Booth Windows (C#/.NET + React + WinUI 3)

Status: active
Last updated: 2026-10-30
Last verified: 2026-10-30 (audit kode saja — **belum ada build di Windows**)
Source of truth: dokumen ini + `docs/22-booth-dotnet-prompts.md` + `booth/contracts/*.json`
Bukan: `plan.md` di root repo (itu rencana parity fitur kiosk PWA, topik berbeda).

Prompt siap-salin per fase: `booth/prompts.md`.

---

## 0. Cara pakai

1. Kerjakan **satu fase per sesi**. Fase berikutnya mengandaikan gate fase sebelumnya hijau.
2. Sebelum menandai fase selesai: jalankan gate verifikasi §3 dan tulis hasil nyata
   (perintah + keluaran) ke `booth/VERIFICATION.md` (dibuat pada eksekusi pertama).
3. Jangan menandai "selesai" berdasarkan kode yang ada saja. Kode tanpa build/log = **belum**.
4. Semua build .NET/WinUI wajib di **Windows x64**. Di macOS/Linux hanya boleh:
   kontrak (`node booth/contracts/generate.mjs`), UI (`npm run build`), lint/typecheck/test cloud.

---

## 1. Fakta kode hari ini (audit 2026-10-30)

### 1.1 Ringkasan fase

| Fase | Isi                                           | Status jujur                                            | Bukti                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Kontrak JSON Schema tunggal + generator       | **kode selesai**, gate CI belum                         | `booth/contracts/device-settings.schema.json`, `settings-envelope.schema.json`, `generate.mjs`, `booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs`, `src/lib/generated/device-settings.gen.ts`, `tests/device-settings-contract.test.ts` |
| 1    | Solusi .NET + WinUI 3 + WebView2 + bridge     | **kode ada, build belum dijalankan**                    | `booth/SnapyOS.Booth.Shell/*`, `booth/src/SnapyOS.Booth.Bridge/BridgeServer.cs`                                                                                                                                                               |
| 2    | Port runtime: store/settings/sync/session/PIN | **kode + 43 tes ada, `dotnet test` belum pernah jalan** | `Store.cs`, `SettingsService.cs`, `Sessions/SessionsService.cs`, `Sync/SyncWorker.cs`, `Exit/ExitService.cs`, `tests/SnapyOS.Booth.Tests/*`                                                                                                   |
| 3    | Kamera & printer native                       | **belum** — hanya mock                                  | `Core/Hardware/Adapters.cs` (86 baris: `MockCamera`, `MockPrinter`)                                                                                                                                                                           |
| 4    | Lisensi Ed25519 + fingerprint + 1:1           | **belum** — nol kode                                    | `grep -ri "ed25519\|fingerprint\|MACHINE_MISMATCH" booth/src` → kosong                                                                                                                                                                        |
| 5    | MSIX + auto-update + code signing             | **belum**                                               | `Shell.csproj` masih `WindowsPackageType=None`, `EnableMsixTooling=false`; tak ada `.appinstaller`, tak ada `signtool`                                                                                                                        |
| 6    | Hapus Tauri/Node + docs                       | **belum**                                               | `src-tauri/`, `runtime/`, `scripts/build-kiosk-runtime.mjs`, `docs/20` masih panduan Tauri                                                                                                                                                    |

### 1.2 Yang sudah berjalan di kode (fase 0–2)

Kontrak:

- Satu sumber: `booth/contracts/device-settings.schema.json` (v1, 4 grup:
  `camera_settings`, `print_settings`, `session_settings`, `appearance_settings`).
- Envelope export/import: `booth/contracts/settings-envelope.schema.json`.
- Generator deterministik → `src/lib/generated/device-settings.gen.ts` +
  `booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs`.
- `src/lib/validators.ts` mengekspor grup/kepemilikan dari schema; `npm run booth:contracts` ada di `package.json`.

Bridge (`booth/src/SnapyOS.Booth.Bridge/BridgeServer.cs`):

- Kestrel `127.0.0.1:17777`, CORS + `Access-Control-Allow-Private-Network`.
- Middleware token: semua rute kecuali `/health` wajib `X-Bridge-Token`
  (constant-time atas SHA-256, `RuntimeConfig.TokenDigest`).
- Rute: `/health`, `/v1/status`, `/v1/camera/status`, `/v1/settings` (GET/PUT),
  `/v1/settings/export`, `/v1/settings/import`, `/v1/sessions` (POST),
  `/v1/sessions/{id}` (GET), `/{id}/capture`, `/{id}/finalize`, `/{id}/abort`,
  `/v1/exit`, `/printer/health`, `/print`, `/printer/test`,
  `/camera/capture`, `/camera/preview`, fallback 404.
- Belum ada: `/v1/pair`, rute lisensi, rute update.

Core:

- `Store.cs`: SQLite WAL, schema v2, tabel `device_settings`, `sessions`,
  `captures`, `finalize_queue`, `events`, `meta`; `IsSecretKey` membuang `exit_pin_*`.
- `SettingsService.cs`: merge default+stored, PUT parsial, validasi per grup,
  kode error `FIELD_NOT_DEVICE_OWNED` / `INVALID_SETTINGS` / `SCHEMA_VERSION_TOO_NEW` /
  `PHOTOBOX_MISMATCH`, export membuang secret.
- `Sessions/SessionsService.cs`: sesi `local_*`, capture idempoten per
  `Idempotency-Key`, finalize multipart, abort, presentasi.
- `Sync/SyncWorker.cs`: interval 15 dtk, backoff `min(2^n·1s, 5m)` + jitter,
  `Idempotency-Key = {photobox_slug}:{localId}`, PATCH settings,
  410/`SESSION_EXPIRED` → karantina `data/quarantine/<id>/` **sebelum** hapus baris.
- `Exit/ExitService.cs` + `Argon2idPin.cs`: argon2id, 5 gagal → kunci 5 menit,
  meta `exit_pin_emergency_hash` / `exit_pin_failed_count` / `exit_pin_locked_until`,
  event `exit_pin_emergency_used`.
- `RuntimeConfig.cs`: satu-satunya pembaca env; token < 16 karakter → gagal start;
  mock wajib `SNAPYOS_ALLOW_MOCK=1`.

Shell/UI:

- `MainWindow.xaml.cs`: WebView2 + `SetVirtualHostNameToFolderMapping("snapyos.app", Assets/ui)`,
  token disuntik lewat `AddScriptToExecuteOnDocumentCreatedAsync` (`window.__SNAPY_BRIDGE__`).
- UI React: tab `kiosk | settings | pair | transfer` (`booth/ui/src/App.tsx`),
  panel setelan/import-export/pairing (pairing masih stub, menyatakan fase 4).
- Build: `booth/scripts/build-booth.ps1` → `booth/dist/booth/` (self-contained, unpackaged).

### 1.3 Celah yang harus ditutup (jujur)

| #   | Celah                                                                                                                           | Fase                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| G1  | `booth/` seluruhnya **untracked** di git                                                                                        | 0                      |
| G2  | Tidak ada tes paritas TS↔C# (hash/field list) — tes kontrak hanya TS↔zod↔runtime                                                | 0                      |
| G3  | `dotnet build` / `dotnet test` belum pernah dijalankan di Windows                                                               | 1, 2                   |
| G4  | Shell belum kiosk: tanpa fullscreen, tanpa blokir close/Alt+F4, tanpa single-instance, tanpa tray/autostart                     | 1                      |
| G5  | UI belum punya permukaan kiosk pelanggan (hanya panel status)                                                                   | 1 (kerangka) / 3 (isi) |
| G6  | `MainWindow` menolak semua adapter non-mock → fase 3 wajib mencabut guard ini dengan adapter nyata                              | 3                      |
| G7  | Kamera/printer hanya mock                                                                                                       | 3                      |
| G8  | Tidak ada pairing: `/v1/pair` tidak ada, `PairingPanel` stub, token device hanya dari env                                       | 4                      |
| G9  | Cloud tidak menyimpan fingerprint mesin; `activate_device_atomically` menghapus device lama per photobox tanpa verifikasi mesin | 4                      |
| G10 | Tak ada lisensi tersigning, tak ada verifikasi boot, tak ada grace offline                                                      | 4                      |
| G11 | Tak ada MSIX/signing/auto-update; `Package.appxmanifest` ada tapi belum dipakai build                                           | 5                      |
| G12 | `CameraKinds.All` masih memuat `gphoto2                                                                                         | libcamera              | v4l2 | pyav` (non-Windows) | 3   |
| G13 | `booth/README.md` menulis fase 2 "belum" (salah)                                                                                | 0                      |
| G14 | `docs/20-booth-build-windows.md` masih panduan Tauri                                                                            | 6                      |
| G15 | Tauri/Node sidecar masih ada dan masih direferensikan README root                                                               | 6                      |

---

## 2. Aturan main (invarian — tidak boleh dilanggar)

1. **Uang integer IDR**, tanpa floating point.
2. **Cloud = otoritas** harga, voucher, pembayaran, kuota sesi. Booth tidak menghitung uang.
3. **Kontrak HTTP byte-compatible**: nama rute, nama field, dan kode error tidak berubah
   tanpa migrasi kiosk. Rute baru harus aditif.
4. **Semua rute kecuali `/health` wajib `X-Bridge-Token`**; perbandingan constant-time.
5. **Kode error persis**: `FIELD_NOT_DEVICE_OWNED` (403), `INVALID_SETTINGS` (400),
   `SCHEMA_VERSION_TOO_NEW` (400), `PHOTOBOX_MISMATCH` (409), `SESSION_EXPIRED` (410),
   `LOCAL_ONLY_SETTING` (403). Fase 4 menambah: `MACHINE_MISMATCH` (403),
   `LICENSE_REVOKED` (403), `LICENSE_INVALID` (403), `SUBSCRIPTION_INACTIVE` (402).
6. **Satu sumber aturan setelan**: `booth/contracts/*.json`. Dilarang menyalin daftar
   grup/field ke C# atau TS lain.
7. **`appearance_settings` local-only** — tidak pernah naik ke cloud.
8. **Secret `exit_pin_*`** tidak pernah keluar mesin (export, present, log, crash dump).
9. **Mock hanya dengan `SNAPYOS_ALLOW_MOCK=1`** dan wajib dilabeli di UI.
10. **UI Neo-Brutalism saja** (`src/styles/tokens.css`); dilarang placeholder/`TODO`/skeleton kosong.
11. **Tidak menambah dependency** tanpa alasan yang lolos §2.1 di bawah.

### 2.1 Gerbang dependency baru

Sebelum menambah paket NuGet/npm, jawab berurutan: (a) perlu ada? (b) BCL/.NET sudah punya?
(c) API Windows native cukup? (d) paket yang sudah ada bisa? (e) hanya kalau semua tidak.
Paket yang **sudah disetujui**: `Microsoft.Data.Sqlite`, `Konscious.Security.Cryptography.Argon2`,
`Microsoft.WindowsAppSDK`, `Microsoft.Web.WebView2`, `xunit`.
Kandidat fase 3–5 yang perlu keputusan eksplisit: `QuestPDF` (lisensi komunitas), `NSec.Cryptography`
(Ed25519), `System.Security.Cryptography.ProtectedData` (DPAPI), `System.IO.Ports` (ESC/POS serial).

---

## 3. Gate verifikasi (jalankan apa adanya, laporkan keluaran)

### 3.1 Lapisan kontrak + cloud (bisa di macOS/Linux)

```bash
npm run booth:contracts
git diff --exit-code src/lib/generated/device-settings.gen.ts \
  booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs
node --experimental-strip-types --test tests/device-settings-contract.test.ts
npm run lint && npm run typecheck && npm test
```

### 3.2 Lapisan UI booth

```bash
cd booth/ui && npm ci && npm run build && npm run typecheck
```

### 3.3 Lapisan .NET (WAJIB Windows x64)

```powershell
dotnet build booth\SnapyOS.Booth.sln -c Debug
dotnet test  booth\tests\SnapyOS.Booth.Tests\SnapyOS.Booth.Tests.csproj -c Debug
```

### 3.4 Lapisan runtime (WAJIB Windows x64)

```powershell
.\booth\scripts\build-booth.ps1
$env:PHOTOBOOTH_BRIDGE_TOKEN = "0123456789abcdef"
$env:SNAPYOS_ALLOW_MOCK = "1"
& .\booth\dist\booth\SnapyOS.Booth.Shell.exe
# jendela lain:
curl.exe -i http://127.0.0.1:17777/health
curl.exe -i -H "X-Bridge-Token: 0123456789abcdef" http://127.0.0.1:17777/v1/status
curl.exe -i http://127.0.0.1:17777/v1/status   # harus 401
```

### 3.5 Gate hardware (fase 3) dan paket (fase 5)

Tidak bisa otomatis. Wajib dicatat di `booth/VERIFICATION.md`: perangkat, driver,
versi firmware, hasil, dan siapa yang menguji. "Belum diuji" adalah hasil yang sah;
"lulus" tanpa perangkat adalah klaim palsu.

---

## 4. Urutan & dependency

```
Fase 0 (kontrak)  ──► Fase 1 (kerangka) ──► Fase 2 (runtime) ──► Fase 3 (hardware)
                                                                      │
                                                                      ▼
                                                              Fase 4 (lisensi)
                                                                      │
                                                                      ▼
                                                              Fase 5 (MSIX+update)
                                                                      │
                                                                      ▼
                                                              Fase 6 (hapus legacy)
```

Aturan: fase 4 butuh fase 2 (token/sync) **dan** fase 3 (agar aplikasi benar-benar bisa
dipakai sebelum dikunci lisensi). Fase 5 tidak boleh dimulai sebelum fase 4 lulus gate,
kecuali hanya menyiapkan scaffolding MSIX tanpa menandai selesai.

---

## 5. Rencana per fase

### FASE 0 — Kontrak tunggal (status: kode selesai, gate belum)

**Tujuan:** cloud (TS) dan booth (C#) membaca satu kontrak; tidak ada aturan ganda.

**Prasyarat:** tidak ada.

**Ruang lingkup berkas:** `booth/contracts/*`, `booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs`,
`src/lib/generated/device-settings.gen.ts`, `src/lib/validators.ts`, `tests/device-settings-contract.test.ts`,
`package.json`, `.github/workflows/ci.yml`, `booth/README.md`.

**Langkah**

- [ ] 0.1 Commit seluruh `booth/`, `src/lib/generated/`, `tests/device-settings-contract.test.ts`,
      perubahan `src/lib/validators.ts`, `package.json`, `eslint.config.mjs`, `tsconfig.json`,
      `.prettierignore`, `docs/22-booth-dotnet-prompts.md`. Satu commit: `feat(booth): kerangka aplikasi booth .NET + kontrak setelan`.
- [ ] 0.2 Tambah tes determinisme: generate ke direktori temp dua kali → byte-identik, dan
      hasilnya sama dengan berkas yang di-commit.
- [ ] 0.3 Tambah tes paritas **TS↔C#**: parse nama grup/field dari `DeviceSettings.g.cs`,
      bandingkan dengan `device-settings.schema.json`. Tanpa ini, model C# bisa menyimpang diam-diam.
- [ ] 0.4 Tambah job CI: `npm run booth:contracts && git diff --exit-code` +
      `node --test tests/device-settings-contract.test.ts` pada `ubuntu-latest`.
- [ ] 0.5 Perbaiki `booth/README.md`: fase 2 = "kode selesai, verifikasi Windows tertunda";
      tambahkan tautan ke `booth/plan.md` dan `booth/prompts.md`.

**Acceptance:** generator deterministik; tes kontrak + paritas hijau; CI gagal bila
generated file basi; tidak ada daftar field yang disalin manual di luar schema.

**Verifikasi:** §3.1.

**Risiko:** `git diff --exit-code` gagal karena line ending Windows (CRLF) — paksa LF lewat
`.gitattributes` untuk `*.g.cs` dan `*.gen.ts`.

**Deliverable:** kontrak + generator + model ter-generate + 2 tes + job CI.

---

### FASE 1 — Kerangka Shell + Bridge (status: kode ada, build belum)

**Tujuan:** EXE Windows menampilkan jendela kiosk fullscreen berisi UI React lokal, dengan
bridge loopback hidup dan semua rute di balik token.

**Prasyarat:** fase 0.

**Ruang lingkup:** `booth/src/SnapyOS.Booth.Shell/*`, `booth/src/SnapyOS.Booth.Bridge/*`,
`booth/ui/*`, `booth/scripts/build-booth.ps1`.

**Langkah**

- [ ] 1.1 Build pertama di Windows: `dotnet build` + `dotnet test`; catat versi .NET SDK,
      Windows App SDK, dan WebView2 Runtime di `booth/VERIFICATION.md`.
- [ ] 1.2 Single-instance: mutex bernama; instance kedua mengaktifkan jendela yang ada lalu keluar.
- [ ] 1.3 Kiosk window: `AppWindow.SetPresenter(FullScreen)` + `OverlappedPresenter`
      (tanpa judul/border), `IsResizable=false`, `IsMaximizable=false`, `IsMinimizable=false`.
- [ ] 1.4 Kunci keluar: `AppWindow.Closing` → `args.Cancel = true` selama belum terautentikasi
      PIN; buka jalan lewat `/v1/exit` sukses (event ke Shell). Alt+F4 & Ctrl+W ikut tertahan
      karena jalur yang sama.
- [ ] 1.5 Handler WebView2: blokir navigasi keluar `snapyos.app` (`NavigationStarting`),
      blokir `NewWindowRequested`, matikan context menu & DevTools di Release,
      `AreDefaultContextMenusEnabled=false`.
- [ ] 1.6 Perbaiki guard adapter: `MainWindow` hanya menolak mock **bila** `SNAPYOS_ALLOW_MOCK != 1`;
      pilihan adapter nyata diserahkan ke fase 3 (jangan hapus pesan error, ubah kondisinya).
- [ ] 1.7 UI: pisahkan "permukaan kiosk pelanggan" dari "shell operator". Tambah tombol
      **Buka Kiosk** yang menyembunyikan topbar/tab, dan jalan keluar hanya lewat PIN.
      Tetap tanpa dependency router (state tab sudah cukup) — catat penyimpangan dari
      `docs/22` (yang menyebut HashRouter) di `booth/README.md`.
- [ ] 1.8 Token: pastikan `PHOTOBOOTH_BRIDGE_TOKEN` dibaca dari penyimpanan aman bila fase 4
      sudah ada; untuk sekarang env + peringatan UI bila token default.
- [ ] 1.9 `build-booth.ps1`: tambah `-SkipContracts` dan cek `Assets/ui/index.html` +
      cetak SHA-256 EXE.

**Acceptance:** `dotnet build` hijau; EXE jalan; `/health` 200; `/v1/status` 401 tanpa token;
jendela fullscreen; Alt+F4 tidak menutup saat terkunci; single-instance bekerja.

**Verifikasi:** §3.3 + §3.4.

**Risiko:** WinUI 3 butuh Windows App SDK runtime (self-contained sudah aktif);
`SetVirtualHostNameToFolderMapping` + `DenyCors` memblokir `fetch` lintas-origin ke
`127.0.0.1` bila header CORS salah — uji `/v1/status` dari UI, bukan hanya `curl`.

**Deliverable:** Shell kiosk + bridge + UI build + skrip build.

---

### FASE 2 — Port runtime penuh (status: kode + 43 tes ada, belum dijalankan)

**Tujuan:** perilaku `runtime/*.ts` setara di C#: store, settings, session, sync, exit PIN, config.

**Prasyarat:** fase 1.

**Ruang lingkup:** `booth/src/SnapyOS.Booth.Core/*`, `booth/tests/SnapyOS.Booth.Tests/*`.

**Langkah**

- [ ] 2.1 Jalankan `dotnet test`; perbaiki kegagalan. Target: 43 tes hijau.
- [ ] 2.2 Buat matriks tes→syarat (di `booth/VERIFICATION.md`) untuk 8 butir verifikasi
      `docs/22` fase 2: round-trip export/import (secret dibuang), 403 cloud-owned,
      400 versi terlalu baru, 409 photobox mismatch, idempotensi capture, offline→queue,
      pengiriman ulang dengan key sama, 410→karantina.
- [ ] 2.3 Tambah tes yang belum ada: (a) `Write` parsial tidak menghapus field grup lain,
      (b) `CloudSyncedSettings` membuang `appearance_settings`, (c) backoff
      `min(2^n·1s,5m)` + jitter dalam batas ±20%, (d) karantina tidak menghapus baris bila
      penyalinan gagal.
- [ ] 2.4 Samakan `present()` (bentuk respons GET) dengan runtime Node: bandingkan keluaran
      nyata runtime lama vs bridge baru untuk payload yang sama.
- [ ] 2.5 Pastikan `SyncWorker` tidak jalan saat `CloudUrl`/`DeviceToken` kosong (harus
      `skipped`, bukan error berulang) dan log-nya tidak memuat token.
- [ ] 2.6 Validasi migrasi: DB v1 (dari runtime Node) dibuka aplikasi baru → migrasi ke v2
      tanpa kehilangan setelan. Sediakan fixture DB v1 untuk tes.

**Acceptance:** `dotnet test` hijau di Windows; matriks §2.2 semua punya tes; tidak ada
perbedaan bentuk respons/kode error terhadap runtime Node pada kasus yang diuji.

**Verifikasi:** §3.3 + tabel matriks.

**Risiko:** SQLite file lama memakai `node:sqlite` (WAL) — pastikan `Microsoft.Data.Sqlite`
membuka tanpa konflik lock; uji dengan salinan DB, bukan DB asli.

**Deliverable:** Core lengkap + suite xUnit + matriks verifikasi.

---

### FASE 3 — Kamera & printer native (status: belum)

**Tujuan:** adapter nyata untuk Windows, dengan kontrak `ICamera`/`IPrinter` yang sudah ada,
plus jalur mock untuk uji tanpa hardware.

**Prasyarat:** fase 2.

**Keputusan arsitektur yang harus diambil di awal fase:**
Adapter hardware butuh TFM Windows (`net8.0-windows10.0.19041.0`) sementara `Core` netral.
Buat proyek baru **`booth/src/SnapyOS.Booth.Hardware/`** (TFM Windows) yang mereferensikan `Core`;
`Shell` mereferensikan `Hardware`; `Bridge` tetap netral dan menerima `ICamera`/`IPrinter`.
Jangan menaruh WinRT/`System.Printing` di `Core` atau `Bridge`.

**Langkah**

- [ ] 3.1 `Hardware/DigiCamControlCamera.cs`: HTTP `127.0.0.1:5513/liveview.jpg` untuk preview,
      `/?SLC=CaptureNoAf` untuk capture; fallback `CameraControlCmd.exe /capture /wait`
      dengan timeout + pesan operator yang jelas. Preview gagal **tidak** membatalkan capture.
- [ ] 3.2 `Hardware/WebcamCamera.cs`: WinRT `MediaCapture` (`LowLagPhotoCapture`) →
      JPEG; preview = frame terakhir (bukan `getUserMedia`).
- [ ] 3.3 Peran stills/stream: satu instance adapter dipakai bersama bila kind+device sama
      (DSLR menolak dua akses). Hormati `SNAPYOS_CAMERA_STREAM`.
- [ ] 3.4 `Hardware/SpoolerPrinter.cs`: enumerasi `PrintQueue` untuk `Health()`;
      `Submit()` = PDF ke printer bernama lewat `SumatraPDF` (`SUMATRA_BIN` sudah ada di config)
      atau `PDFtoPrinter`; sukses = spooler menerima, bukan kertas keluar.
- [ ] 3.5 `Hardware/EscPos/*`: port `dither`, `qr`, `raster (GS v 0)`, `receipt`,
      `photo-bitmap` dari `src/lib/print/*`; transport serial (`System.IO.Ports`) dan
      Bluetooth (WinRT RFCOMM). Batasi: desktop/Android saja.
- [ ] 3.6 Geometry: paper 4x6/A6, margin 0–20 mm, ≤8 JPEG/lembar, cap 16 MiB/gambar —
      port `runtime/print/geometry.ts`. Pakai QuestPDF **hanya** bila keputusan dependency
      dicatat; alternatif tanpa paket: render `System.Drawing` (Windows-only) → PDF/bitmap.
- [ ] 3.7 Auto-print sekali per sesi (bukan reprint) — port `src/lib/print/auto-print.ts`.
- [ ] 3.8 Factory `CameraFactory`/`PrinterFactory`: `digicamcontrol|webcam|mock`,
      `windows|escpos|mock`. Kind non-Windows (`gphoto2`, `libcamera`, `v4l2`, `pyav`)
      ditolak dengan pesan "adapter ini hanya untuk Linux/Pi" — jangan dihapus dari enum schema
      (cloud masih memvalidasi kiosk PWA).
- [ ] 3.9 Cabut guard mock di `MainWindow` (ganti dengan factory fase ini).
- [ ] 3.10 `booth/docs/hardware-matrix.md`: tabel perangkat yang benar-benar diuji.

**Acceptance:** build hijau; `/v1/status` melaporkan adapter nyata; capture JPEG valid
(guard `isJpeg`); `/print` mengirim ke spooler; `/printer/test` mencetak halaman uji;
hasil uji hardware dicatat apa adanya.

**Verifikasi:** §3.3 + uji manual per perangkat (DSLR, webcam, spooler, thermal 80 mm).

**Risiko:** digiCamControl harus sudah jalan di mesin (bukan dependency aplikasi);
Bluetooth ESC/POS pairing manual; QuestPDF lisensi; `System.Drawing` tidak didukung di
non-Windows (aman, karena proyek Hardware memang Windows-only).

**Deliverable:** proyek Hardware + adapter + tes unit geometry/dither/QR + matriks hardware.

---

### FASE 4 — Lisensi + fingerprint + 1 pairing = 1 mesin (status: belum)

**Tujuan:** aktivasi mengikat satu mesin secara kriptografis dan tetap valid offline.

**Prasyarat:** fase 2 + 3.

**Perubahan cloud (minimal, jangan bikin sistem paralel):**

- Migrasi baru `db/migrations/00XX_device_fingerprint_license.sql`:
  `devices.machine_fingerprint_hash text`, `devices.license_id uuid`,
  index unik parsial `(photobox_id, machine_fingerprint_hash)` untuk device aktif.
- `activate_device_atomically(p_code, p_device_token_hash, p_machine_fingerprint_hash)`:
  tolak bila photobox sudah punya device aktif dengan fingerprint **berbeda**
  (kecuali owner sudah revoke).
- Endpoint baru aditif: `POST /api/v1/public/devices/license` (terbitkan lisensi Ed25519
  dari server; private key di env server, publik ditanam di app) dan sertakan
  `license` + `subscription_expires_at` pada respons `verify`.
- `resolveActiveDevice`: verifikasi `machine_fingerprint_hash` pada request booth
  (`sessions`, `settings`, `report`). Kiosk PWA tanpa fingerprint tetap boleh (field null).
- Revoke device → lisensi otomatis tidak valid (`license_revoked_at` atau cek status device).

**Perubahan booth:**

- [ ] 4.1 `Core/License/MachineFingerprint.cs`: SHA-256 atas MachineGuid
      (`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`) + serial volume sistem
      (`GetVolumeInformation`) + SMBIOS UUID bila tersedia; urutan tidak sensitif.
- [ ] 4.2 `Core/License/TokenVault.cs`: `device_token` disimpan lewat DPAPI
      (`ProtectedData`, scope CurrentUser) di `data/secrets.bin`, bukan plaintext/env.
- [ ] 4.3 `Core/License/LicenseVerifier.cs`: Ed25519 (NSec), payload
      `{license_id, business_id, photobox_id, machine_fingerprint_hash, issued_at,
subscription_expires_at, entitlement}`; verifikasi saat boot + tiap 6 jam + tiap sync.
- [ ] 4.4 Gate: fingerprint beda → `403 MACHINE_MISMATCH`; tanda tangan rusak → `403 LICENSE_INVALID`;
      revoked → `403 LICENSE_REVOKED`; langganan habis (status **dan** tanggal, grace) →
      `402 SUBSCRIPTION_INACTIVE`. Penolakan hanya bila validasi tanda tangan gagal atau
      klaim memang tidak berlaku — jangan menolak karena file hilang saat offline.
- [ ] 4.5 `POST /v1/pair` di bridge: `{code}` → cloud `devices/activate` →
      simpan token (DPAPI) + fingerprint + lisensi + slug bisnis/photobox ke `meta` →
      aktifkan sync. Kode error cloud diteruskan apa adanya.
- [ ] 4.6 `/v1/status` menambah `license: { status, expires_at, machine_ok }` (aditif).
- [ ] 4.7 UI `/pair`: form kode nyata, tampilkan hasil + status lisensi di `/settings`;
      import/export setelan **tidak** membawa lisensi.
- [ ] 4.8 Tes: tanda tangan valid/rusak/kedaluwarsa; fingerprint berubah → blok;
      offline melewati `subscription_expires_at` → blok sesuai grace; lisensi disalin ke PC lain
      → `MACHINE_MISMATCH`; revoke → `LICENSE_REVOKED`.

**Acceptance:** aktivasi nyata menghasilkan token + lisensi; boot tanpa lisensi valid ditolak
dengan kode yang benar; kiosk tetap jalan offline sampai `subscription_expires_at`; dua mesin
tidak bisa aktif untuk satu lisensi.

**Verifikasi:** tes unit + uji end-to-end ke cloud staging + §3.4.

**Risiko:** kunci privat bocor = semua lisensi bisa dipalsukan → simpan di env server saja,
rotasi terdokumentasi; jam mesin dimundurkan → pakai `issued_at` + toleransi, catat batasnya;
DPAPI terikat user Windows → autostart harus user yang sama.

**Deliverable:** lisensi + fingerprint + UI aktivasi + migrasi & endpoint cloud + tes.

---

### FASE 5 — MSIX + auto-update + code signing (status: belum)

**Tujuan:** installer bertanda tangan, bisa auto-update, terdaftar di `app_releases`.

**Prasyarat:** fase 4 lulus.

**Langkah**

- [ ] 5.1 MSIX: `WindowsPackageType=MSIX`, `EnableMsixTooling=true`, `AppxPackageSigningEnabled=true`;
      lengkapi `Package.appxmanifest` (EntryPoint benar untuk WinUI 3, logo, `runFullTrust`,
      `internetClient`, `privateNetworkClientServer`). Verifikasi dengan `makeappx` + install nyata.
- [ ] 5.2 Code signing: `signtool sign /fd SHA256 /tr <timestamp> /td SHA256`.
      Pilih satu: Azure Trusted Signing (CI, butuh akun) atau PFX di secret CI.
      Build **gagal** bila artefak tidak bertanda tangan.
- [ ] 5.3 Auto-update: hasilkan `.appinstaller` (App Installer) + `PackageManager.RequestAddPackageAsync`
      sebagai fallback. Cek versi dari endpoint baru `GET /api/v1/public/apps/latest`
      (baca `app_releases`, `is_active=true`). **Jangan** pakai Google Drive untuk `.appinstaller`
      (redirect + `Content-Type` tidak stabil) — host di domain statis sendiri.
- [ ] 5.4 `booth/scripts/build-booth.ps1`: mode `-Package` → publish, buat MSIX, tanda tangani,
      tulis `dist/snapyos-booth-<versi>/` berisi `.msix`, `.appinstaller`, `SHA256SUMS`,
      `release-notes.md`; cetak SHA-256 tiap artefak.
- [ ] 5.5 Verifikasi di Windows bersih (VM): WebView2 Runtime terpasang/diperiksa,
      MSIX terpasang, aplikasi jalan, pairing berhasil, update v(N)→v(N+1) berhasil.
- [ ] 5.6 Rilis: unggah ke host statis → isi `/admin/apps` (versi, URL, nama, ukuran, sha256,
      catatan, aktif). Perbarui `docs/19` (prosedur baru) dan `docs/20` (build .NET).

**Acceptance:** MSIX terpasang di mesin bersih; `signtool verify` lulus; auto-update bekerja;
pairing setelah update tetap valid (token & lisensi tidak hilang).

**Verifikasi:** §3.3 + uji instalasi VM + `signtool verify /pa /v`.

**Risiko:** sertifikat (biaya/trust); MSIX + `runFullTrust` + loopback butuh manifest benar;
auto-update butuh HTTPS + sertifikat tepercaya; rollback = nonaktifkan rilis di `/admin/apps`
(tidak menghapus file).

**Deliverable:** skrip paket + MSIX bertanda tangan + appinstaller + dokumentasi rilis.

---

### FASE 6 — Hapus jalur lama + dokumentasi (status: belum)

**Tujuan:** hanya ada satu aplikasi booth; tidak ada sisa Tauri/Node.

**Prasyarat:** fase 1–5 lulus, MSIX terpasang di booth uji.

**Langkah**

- [ ] 6.1 Hapus `src-tauri/`, `runtime/`, `scripts/build-kiosk-runtime.mjs`,
      `scripts/build-booth.ps1` (Tauri), `prepare-standalone.mjs` bagian kiosk,
      sidecar `node.exe`, entri `tauri` di `package.json`/`Cargo.toml`.
- [ ] 6.2 Cloud: **pertahankan** `/p/**` (fallback HP). Hentikan editor branding
      (`/dashboard/branding`, `src/server/branding.ts`) — kustomisasi pindah ke
      `appearance_settings` lokal. Jangan hapus kolom DB; tandai deprecated.
- [ ] 6.3 Perbarui `docs/19`, `docs/20`, `docs/21`, `docs/status.md`, `README.md`, `AGENTS.md`
      agar merujuk build .NET + MSIX (bukan Tauri/sidecar).
- [ ] 6.4 Gate grep: `grep -ri "tauri\|node-x86_64-pc-windows-msvc\|runtime-dist" --exclude-dir=node_modules`
      → nol hasil di kode aktif.
- [ ] 6.5 CI: hapus job Tauri; tambah job `windows-latest` (build + test .NET).

**Acceptance:** build .NET hijau; `/p/**` masih melayani HP; nol referensi legacy;
dokumen tidak lagi menyebut Tauri sebagai jalur aktif.

**Verifikasi:** gate grep + §3.3 + smoke test `/p/**`.

**Risiko:** ada booth lama yang masih memakai EXE Tauri — siapkan jalur migrasi
(pasang MSIX, pairing ulang, impor setelan lewat export/import).

**Deliverable:** repo bersih + docs sinkron.

---

## 6. Lintas fase

### 6.1 Peta env

| Variabel                       | Wajib    | Default          | Catatan                                 |
| ------------------------------ | -------- | ---------------- | --------------------------------------- |
| `PHOTOBOOTH_BRIDGE_TOKEN`      | ya (≥16) | —                | fase 4 pindah ke DPAPI                  |
| `SNAPYOS_ALLOW_MOCK`           | tidak    | —                | `1` hanya untuk uji                     |
| `SNAPYOS_CAMERA`               | tidak    | `digicamcontrol` | Windows: `digicamcontrol\|webcam\|mock` |
| `SNAPYOS_CAMERA_STREAM`        | tidak    | = camera         | adapter preview terpisah                |
| `SNAPYOS_PRINTER`              | tidak    | `windows`        | `windows\|escpos\|mock`                 |
| `SNAPYOS_DATA_DIR`             | tidak    | `%LOCALAPPDATA%` | DB + media + karantina                  |
| `SNAPYOS_CLOUD_URL`            | fase 4   | —                | tanpa ini sync `skipped`                |
| `SNAPYOS_DEVICE_TOKEN`         | fase 4   | —                | diganti DPAPI                           |
| `DIGICAMCONTROL_PORT` / `_CMD` | tidak    | `5513` / auto    | adapter DSLR                            |
| `SUMATRA_BIN`                  | tidak    | auto             | cetak PDF                               |

### 6.2 Konvensi commit

Satu task = satu commit, format `feat(booth): <task-id> <ringkas>` atau `fix(booth): ...`.
Jangan gabungkan fase berbeda dalam satu commit. Jangan commit artefak build (`bin/`, `obj/`, `dist/`).

### 6.3 Dokumen yang harus ikut berubah per fase

| Fase | Dokumen                                                                     |
| ---- | --------------------------------------------------------------------------- |
| 0    | `booth/README.md`, `docs/22` (status)                                       |
| 1    | `booth/README.md` (jalankan/build), `docs/21` (peta berkas)                 |
| 2    | `booth/VERIFICATION.md` (matriks tes)                                       |
| 3    | `booth/docs/hardware-matrix.md`, `docs/17` (printing)                       |
| 4    | `docs/05`, `docs/08`, `docs/09`, `docs/21` (lisensi & fingerprint)          |
| 5    | `docs/19`, `docs/20`                                                        |
| 6    | `docs/19`, `docs/20`, `docs/21`, `docs/status.md`, `README.md`, `AGENTS.md` |

---

## 7. Risiko terbuka & keputusan yang belum diambil

| #   | Risiko / keputusan                       | Dampak                                                | Usulan                                                                                                                    |
| --- | ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R1  | Tidak ada mesin Windows di sesi ini      | semua gate 1–5 tertunda                               | jadwalkan sesi Windows / runner CI `windows-latest`                                                                       |
| R2  | `CameraKinds` memuat adapter non-Windows | config bisa menerima nilai yang mustahil              | tolak di factory (fase 3), jangan ubah enum schema                                                                        |
| R3  | QuestPDF lisensi                         | legal                                                 | putuskan sebelum 3.6; alternatif `System.Drawing`                                                                         |
| R4  | Sertifikat code signing                  | biaya + waktu                                         | putuskan sebelum 5.2 (Azure Trusted Signing vs PFX)                                                                       |
| R5  | Auto-update hosting                      | Drive tidak cocok untuk `.appinstaller`               | siapkan host statis HTTPS                                                                                                 |
| R6  | UI belum punya kiosk pelanggan           | fase 3 akan "jalan" tapi belum bisa dipakai pelanggan | putuskan: port UI kiosk PWA ke React lokal (besar) vs embed halaman `/p/` (bertentangan dengan "kiosk di dalam aplikasi") |
| R7  | Lisensi offline + jam mesin              | bisa dimundurkan                                      | catat sebagai batas jujur, bukan janji                                                                                    |
| R8  | `booth/` belum di-commit                 | kehilangan pekerjaan                                  | task 0.1                                                                                                                  |

**R6 butuh keputusan pemilik produk sebelum fase 3 selesai.** Tanpa itu, aplikasi booth
hanya punya panel status + setelan, bukan kiosk yang bisa melayani pelanggan.

---

## 8. Definition of Done global

Sebuah fase baru boleh ditandai selesai bila **semua** benar:

1. Gate verifikasi §3 untuk lapisan yang disentuh dijalankan dan hasilnya dicatat
   di `booth/VERIFICATION.md` (perintah + keluaran ringkas + tanggal + mesin).
2. Tidak ada placeholder, `TODO`, `// ...`, komponen kosong, atau stub yang menyamar.
3. Dokumen §6.3 diperbarui.
4. Invarian §2 tidak dilanggar (cek: uang integer, token di semua rute, kode error, secret).
5. Perubahan aditif pada kontrak HTTP; bila tidak, ada catatan migrasi eksplisit.
6. `git status` bersih untuk berkas yang disentuh (tidak ada generated file basi).
