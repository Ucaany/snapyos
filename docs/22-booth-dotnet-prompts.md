# Prompts Eksekusi — Rewrite Aplikasi Booth SnapyOS ke C#/.NET + React/TS + WinUI 3

Status: active
Audience: developer, agent
Last updated: 2026-10-30
Source of truth: dokumen ini + `docs/21-skema-cloud-vs-booth.md`, `src/lib/validators.ts`, `runtime/**`

Dokumen ini berisi prompt siap-salin untuk agent. Setiap fase berdiri sendiri,
tetapi **wajib** menyertakan "Konteks Bersama" di bagian ini. Kerjakan berurutan;
fase berikutnya mengandaikan fase sebelumnya sudah lulus verifikasi.

Rencana eksekusi + gate verifikasi: [`../booth/plan.md`](../booth/plan.md).
Prompt operasional (perintah, berkas, acceptance) yang lebih rinci:
[`../booth/prompts.md`](../booth/prompts.md). Bila keduanya berbeda, `booth/plan.md`
menang untuk urutan/gate; dokumen ini menang untuk aturan produk.

---

## Cara pakai

1. Salin blok "Konteks Bersama" + satu blok "PROMPT FASE N" ke agent.
2. Kerjakan **satu fase per sesi/konteks** (satu fase = satu pengalaman bersih).
3. Jangan lanjut bila "Verifikasi" fase itu belum hijau.
4. Fase 0 adalah prasyarat teknis; kerjakan sebelum Fase 1.

---

## Konteks Bersama (tempel di setiap prompt)

> Anda mengerjakan rewrite sisi **booth** SnapyOS. Cloud (Next.js 16 + React 19 +
> TS + Supabase) **tidak disentuh** kecuali disebut eksplisit. Tujuan akhir:
> aplikasi Windows terinstal yang memuat **halaman kiosk, panel setelan booth,
> kamera, printer, dan seluruh kustomisasi di dalamnya**, terhubung ke cloud,
> dengan **1 pairing = 1 booth = 1 lisensi**, import/export setelan, dan auto-update
> MSIX bertanda tangan. Fitur fokus SnapyOS; **cara kerja** boleh merujuk dua repo
> referensi (jangan menyalin fiturnya):
> - `PhotoboothProject/photobooth` v4 (PHP/GD): command-based print, live preview,
>   abstraksi kamera shell-out, tombol GPIO/rotary.
> - `photobooth-app/photobooth-app` v9 (Python/FastAPI/Vue3): multi-peran kamera
>   (stills + livestream), plugin registry, SQLAlchemy+migrasi, live preview saat countdown.
>
> **Stack target booth** (Windows-only, no Rust, no Node sidecar):
> - Shell: **WinUI 3** (Windows App SDK ≥1.6) + **WebView2**.
> - Backend lokal: **C# / .NET 8 LTS** (`net8.0-windows10.0.19041.0`), ASP.NET Core **Kestrel** loopback.
> - UI: **React 19 + TypeScript + Vite**, di-bundle lokal, dirender di WebView2.
> - Data: **Microsoft.Data.Sqlite** (`snapyos.db`, WAL).
> - Kamera: digiCamControl (HTTP/CLI) + webcam (Media Foundation/DirectShow) + mock.
> - Printer: Windows spooler (`System.Printing`/`PrintQueue`) + **QuestPDF** + ESC/POS (Bluetooth/serial).
> - Kripto: argon2id (Konscious) + Ed25519 (BouncyCastle/NSec) untuk lisensi.
>
> **Invarian yang tidak boleh dilanggar:**
> - Uang selalu **integer IDR**; tidak ada floating-point.
> - Kontrak HTTP runtime lama dipertahankan byte-compatible:
>   `GET /health`, `POST /camera/capture`, `GET /camera/preview`, `POST /print`,
>   `POST /printer/test`, `GET /printer/health`, `GET /v1/status`,
>   `GET|PUT /v1/settings`, `GET /v1/settings/export`, `POST /v1/settings/import`,
>   `POST /v1/sessions*`, `POST /v1/exit`.
> - Semua rute kecuali `/health` wajib header **`X-Bridge-Token`** (bandingkan
>   constant-time atas SHA-256, seperti `runtime/http.ts:65`).
> - Kode error persis: `FIELD_NOT_DEVICE_OWNED` (403), `INVALID_SETTINGS` (400),
>   `SCHEMA_VERSION_TOO_NEW` (400), `PHOTOBOX_MISMATCH` (409), `SESSION_EXPIRED` (410),
>   `LOCAL_ONLY_SETTING` (403, hanya sisi cloud).
> - Aturan kepemilikan setelan berasal dari **satu** sumber: `src/lib/validators.ts`
>   (`DEVICE_SETTING_GROUPS`, `CLOUD_OWNED_SETTING_FIELDS`,
>   `CLOUD_SYNCED_DEVICE_GROUPS`, `LOCAL_ONLY_DEVICE_GROUPS`). Booth (C#) dan cloud (TS)
>   harus membaca kontrak yang sama lewat JSON Schema hasil Fase 0 — jangan menyalin aturan.
> - `appearance_settings` **local-only**, tidak pernah naik ke cloud.
> - Secret `exit_pin_*` tidak pernah keluar dari mesin (strip di export & present).
>
> **Aturan gaya (wajib dimuat sebelum menulis UI):** `industrial-brutalist-ui` +
> `design-taste-frontend` + `full-output-enforcement`. Neo-Brutalism adalah satu-satunya
> bahasa visual. Dilarang placeholder, `// ...`, `// TODO`, skeleton kosong.
>
> **Build:** target hanya **Windows x64**. `dotnet publish -r win-x64 -c Release
> --self-contained`; kemas **MSIX** dan **tanda tangani** (code signing wajib).
> Di macOS/Linux tidak bisa build WinUI 3 — jalankan build di Windows.

---

## PROMPT FASE 0 — Kontrak Tunggal (JSON Schema + generator)

```
Peran: Anda menetapkan satu sumber kebenaran kontrak setelan booth.

Tujuan: ubah tabel kepemilikan setelan di src/lib/validators.ts menjadi JSON Schema
tunggal, lalu generate model C# dan tipe TS dari schema itu. Cloud (TS) dan booth (C#)
tidak boleh lagi menyalin aturan.

Ruang lingkup:
- Buat booth/contracts/device-settings.schema.json + booth/contracts/settings-envelope.schema.json.
- Skrip generator: booth/contracts/generate.mjs → menghasilkan
  booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs dan
  src/lib/generated/device-settings.gen.ts.
- Ubah src/lib/validators.ts agar mengekspor daftar grup/kepemilikan dari schema
  (jangan hapus API publik yang sudah dipakai).

Spesifikasi (setia pada kode berjalan):
- Grup device: camera_settings, print_settings, session_settings, appearance_settings.
- CLOUD_SYNCED_DEVICE_GROUPS = camera,print,session ; LOCAL_ONLY = appearance.
- CLOUD_OWNED_SETTING_FIELDS = print_settings{ copies, layout }.
- deviceSettingsSchema .strict() → JSON Schema additionalProperties:false per grup.
- Envelope export = { schema_version:1, exported_at, photobox_slug, business_slug, settings }.
  Import menolak versi > didukung (SCHEMA_VERSION_TOO_NEW) dan photobox_slug beda (PHOTOBOX_MISMATCH).
- Petakan field kamera/printer/sesi/tampilan persis seperti src/lib/validators.ts:356-609
  dan tipe di src/lib/kiosk-types.ts (CameraSettings, AppearanceSettings) — baca dulu, jangan menebak.

Aturan: jalankan generator; jangan menaruh aturan kepemilikan di dua tempat.
Verifikasi: `node booth/contracts/generate.mjs` deterministik (byte-identik saat diulang);
`npm run typecheck` hijau; tambah tes yang memastikan schema TS ≡ schema C# (hash sama).
Output: schema + generator + model ter-generate + tes paritas.
```

---

## PROMPT FASE 1 — Solusi .NET + WinUI 3 + WebView2 host React (UI lokal)

```
Peran: Anda menyiapkan kerangka aplikasi booth Windows yang bisa di-build dan dijalankan.

Prasyarat: Fase 0 selesai (model DeviceSettings.g.cs tersedia).

Tujuan: aplikasi WinUI 3 menampilkan jendela kiosk fullscreen (tanpa dekorasi) yang
memuat UI React yang DI-BUNDLE LOKAL via WebView2, sementara server bridge loopback
sudah hidup dan menjawab kontrak /v1/*.

Ruang lingkup:
- booth/SnapyOS.Booth.sln
- src/SnapyOS.Booth.Shell/     → WinUI 3 (net8.0-windows10.0.19041.0), App.xaml, MainWindow,
                                 WebView2, single-instance, autostart, tray, updater hook.
- src/SnapyOS.Booth.Bridge/    → Kestrel minimal API di 127.0.0.1:17777; middleware X-Bridge-Token;
                                 CORS + Access-Control-Allow-Private-Network (runtime/http.ts:39-53);
                                 rute: /health, /v1/status, /v1/settings*, /v1/sessions*, /v1/exit,
                                 /camera/preview, /camera/capture, /print, /printer/test, /printer/health.
- src/SnapyOS.Booth.Core/      → config + store SQLite (bergerak, isi nyata di Fase 2) + antrean serial (createLock).
- src/SnapyOS.Booth.Contracts/ → model dari Fase 0.
- ui/                          → Vite + React 19 + TS; halaman: kiosk shell, setelan booth,
                                 aktivasi/pairing, import/export. Output build ke ui/dist, disalin
                                 ke Shell/Assets/ui, dipetakan lewat SetVirtualHostNameToFolderMapping("snapyos.app", ...).

Spesifikasi:
- Bridge harus menolak semua rute kecuali /health bila X-Bridge-Token tidak cocok (constant-time SHA-256).
- Port default 17777; konfigurasi via appsettings/env.
- Shell: fullscreen, decorations off, kiosk mode; cegah Alt+F4/close saat terkunci
  (kecuali lewat PIN darurat /v1/exit — implementasi penuh di Fase 2/4).
- UI React: struktur rute (HashRouter) /kiosk, /settings, /pair, /import-export;
  belum menyentuh hardware — pakai stub yang memanggil endpoint lokal.

Cara kerja (rujuk, jangan salin fitur): pola abstraksi kamera multi-peran ala photobooth-app
(createCameraRoles: stills + stream) dan print berbasis perintah ala PhotoboothProject.

Aturan gaya: muat industrial-brutalist-ui + design-taste-frontend + full-output-enforcement.
UI WAJIB Neo-Brutalism (tokens di src/styles/tokens.css). Dilarang placeholder/TODO.

Verifikasi:
- `dotnet build booth/SnapyOS.Booth.sln -c Debug` sukses di Windows.
- Jalankan EXE → jendela kiosk muncul memuat UI lokal; `curl -H "X-Bridge-Token: <t>" http://127.0.0.1:17777/health` → 200.
- Tanpa token → 401; /health tetap 200.
Output: solusi + Shell + Bridge + UI build + skrip `npm run build:ui` yang menyalin dist ke Assets.
```

---

## PROMPT FASE 2 — Port runtime Node → C# (store, settings, sync, session, exit PIN, config)

```
Peran: Anda memindahkan seluruh runtime Node ke C# dengan perilaku yang sama.

Prasyarat: Fase 1 selesai (bridge hidup, rute kerangka ada).

Tujuan: port runtime/*.ts ke C# tanpa mengubah kontrak maupun semantik error.

Ruang lingkup (sumber acuan, baca sebelum menulis):
- runtime/db/schema.ts + runtime/db/index.ts → Store C#: tabel device_settings, meta,
  sessions, captures, finalize_queue, events; WAL; FK on; MIGRATIONS; export/import Store
  (StoreExport = { schema_version, device_settings, meta }), buang kunci exit_pin_* saat export/import.
- runtime/settings/index.ts → GET/PUT/PUT-parsial/export/import persis: validasi foreignKeys → 403
  FIELD_NOT_DEVICE_OWNED; zod→ schema C# (Fase 0) → 400 INVALID_SETTINGS; present() stripSecrets;
  cloudSyncedSettings membuang appearance_settings; effectiveConfig; printDefaults.
- runtime/config.ts → RuntimeConfig dari env/appsettings (CAMERA_KINDS, PRINTER_KINDS, port, dataDir,
  allowedOrigins, cloudUrl, deviceToken). Mock dilarang di produksi kecuali SNAPYOS_ALLOW_MOCK=1.
- runtime/session/index.ts → siklus sesi: insertSession (id prefix local_, expires_at dihitung dari
  computeExpiresAt — port src/lib/session-timer.ts), finalize lokal, abortSession, quarantine.
- runtime/sync/worker.ts → worker 15 dtk, backoff min(2^n·1s,5m) ±20% jitter, Idempotency-Key
  `{photobox_slug}:{localId}`; POST /api/v1/public/{slug}/sessions (simpan cloud_id SEGERA),
  POST .../sessions/{id}/finalize (multipart), PATCH /api/v1/public/devices/settings;
  410/SESSION_EXPIRED → karantina media ke data/quarantine/<id>/ SEBELUM hapus baris lokal.
- runtime/exit/index.ts → PIN darurat argon2id (Konscious), PIN_FAIL_THRESHOLD=5, PIN_LOCK_MS=5mnt,
  kunci meta exit_pin_hash/exit_pin_failed/exit_pin_locked; insertEvent('exit_pin_emergency_used').
- runtime/version.ts → app_version dari assembly (dikirim ke cloud).

Aturan: token device terkirim sebagai field body `device_token` (bukan Authorization Bearer),
sama seperti worker Node. Uang integer IDR. Jangan ubah nama kolom/endpoint.

Verifikasi:
- Tes .NET: round-trip export→import setelan mempertahankan nilai & membuang exit_pin_*.
- PUT dengan print_settings.copies → 403 FIELD_NOT_DEVICE_OWNED.
- Import schema_version lebih baru → 400 SCHEMA_VERSION_TOO_NEW; photobox_slug beda → 409 PHOTOBOX_MISMATCH.
- Simulasi offline: sesi finalize lokal → masuk finalize_queue → saat cloud kembali, terkirim
  dengan Idempotency-Key sama; 410 → karantina.
Output: SnapyOS.Booth.Core lengkap + suite tes xUnit.
```

---

## PROMPT FASE 3 — Kamera & Printer native + uji hardware

```
Peran: Anda mengimplementasikan integrasi kamera dan printer Windows.

Prasyarat: Fase 2 selesai (session/settings/sync jalan).

Tujuan: adapter kamera & printer native C# dengan kontrak yang sama seperti runtime,
plus jalur mock untuk pengujian tanpa hardware.

Ruang lingkup (acuan): runtime/camera/*.ts (CameraAdapter, createCameraFor, createCameraRoles),
runtime/print/index.ts, runtime/print/geometry.ts, src/lib/print/*.

Kamera (Windows-only):
- Interface ICamera { Kind; Mock; Status(); Preview(); Capture() } — samakan dgn CameraAdapter
  (preview gagal tidak membatalkan capture; guard JPEG isJpeg).
- digicamcontrol: HTTP server 127.0.0.1:5513 (/liveview.jpg, /?SLC=CaptureNoAf) dulu, fallback
  CameraControlCmd.exe /capture /wait (timeout + pesan operator).
- webcam: Media Foundation / DirectShow (bukan browser getUserMedia — ini jalur native booth).
- mock: frame berlabel MOCK CAMERA; hanya bila SNAPYOS_ALLOW_MOCK=1.
- Peran stills/stream: satu adapter dipakai bersama bila kind+device sama (DSLR menolak 2 akses).

Printer:
- IPrinter { Kind; Submit(pdfBytes, copies); Health() } — submit = spooler menerima, BUKAN "kertas habis".
- windows: enumerasi PrintQueue (System.Printing), kirim PDF (QuestPDF) ke printer bernama.
- cups: tidak diperlukan di Windows (opsional, di balik flag).
- thermal ESC/POS: port src/lib/print/{escpos,dither,qr,receipt,photo-bitmap,print-mode}.ts ke C#
  (GS v 0 raster, Floyd–Steinberg, QR bitmap); transport Bluetooth (Windows.Devices.Bluetooth)
  dan serial (System.IO.Ports). Hormati batas platform: desktop/Android saja, bukan iOS.
- geometry: port print/geometry.ts (paper 4x6/A6, margin 0–20mm, ≤8 JPEG/lembar, cap 16 MiB/gambar) via QuestPDF.
- auto-print: port src/lib/print/auto-print.ts (klaim sekali per sesi, tidak untuk reprint).

Aturan: rute /print, /printer/test, /printer/health tetap identik; /printer/test mencetak halaman uji.
Verifikasi: uji manual di Windows dengan (a) DSLR via digiCamControl, (b) webcam, (c) printer spooler,
(d) printer thermal Bluetooth 80mm. Dokumentasikan hasil nyata (jangan klaim lulus tanpa hardware).
Output: SnapyOS.Booth.Hardware + tes unit untuk geometry/dither/QR (tanpa hardware).
```

---

## PROMPT FASE 4 — Lisensi tersigning + fingerprint mesin + UI aktivasi (1 lisensi = 1 booth)

```
Peran: Anda menegakkan "1 pairing = 1 aplikasi = 1 lisensi" tanpa ambigu.

Prasyarat: Fase 2-3 selesai. Cloud pairing SUDAH ada (activation_codes +
activate_device_atomically di db/schema.sql:285-340) — jangan bikin sistem paralel.

Tujuan: aktivasi booth mengikat satu mesin secara kriptografis dan tetap valid offline.

Ruang lingkup:
- Core: MachineFingerprint (SHA-256 atas Windows MachineGuid + serial disk + CPU id) → disimpan
  di meta; hilangkan sensitivitas urutan.
- Alur aktivasi: operator masukkan kode → POST /api/v1/public/devices/activate {code} → terima
  device_token (disimpan di DPAPI/ProtectedData, bukan plaintext) + file lisensi Ed25519 dari cloud.
- Lisensi tersigning berisi: { license_id, business_id, photobox_id, machine_fingerprint_hash,
  issued_at, subscription_expires_at, entitlement }. Public key TERTANAM di app; verifikasi saat boot + berkala.
- Penegakan: fingerprint beda → tolak kiosk (403 MACHINE_MISMATCH); license revoked → 403 LICENSE_REVOKED;
  langganan habis → 402 SUBSCRIPTION_INACTIVE setelah grace. Penolakan hanya saat validasi tanda tangan GAGAL.
- Offline: kiosk tetap jalan sampai subscription_expires_at (mirror isSubscriptionEffective: cek status + tanggal,
  bukan string saja). Refresh lisensi saat sync (PATCH settings / verify).
- UI aktivasi React (/pair) + panel status lisensi di /settings; import/export setelan TIDAK membawa lisensi.

Perubahan cloud (perlu, minimal):
- Terbitkan file lisensi Ed25519 di alur verify/activate (server memegang private key; app hanya verifikasi).
- Simpan machine_fingerprint_hash di devices; verifikasi per request; tolak dua mesin aktif untuk satu lisensi.
- Ganti mesin: owner nonaktifkan device lama → kode aktivasi baru (alur yang sudah ada).

Verifikasi: unit test verifikasi tanda tangan (valid/rusak/kedaluwarsa); uji fingerprint berubah → blok;
uji offline lintas expires_at → blok sesuai grace; uji lisensi dicuri ke PC lain → MACHINE_MISMATCH.
Output: lisensi + fingerprint + UI aktivasi + perubahan cloud + tes.
```

---

## PROMPT FASE 5 — MSIX + auto-update + code signing + pipeline rilis

```
Peran: Anda mengemas, menandatangani, dan mendistribusikan installer booth.

Prasyarat: Fase 4 selesai (app fungsional & teraktivasi).

Tujuan: menghasilkan folder build berisi EXE + paket MSIX siap jalan & di-pairing, auto-update,
bertanda tangan. Release tercatat di tabel app_releases (alur /admin/apps yang sudah ada).

Ruang lingkup:
- scripts/build-booth-dotnet.ps1 (Windows): dotnet publish -r win-x64 -c Release --self-contained →
  bangun UI (npm ci && npm run build:ui) → rakit MSIX (Windows Application Packaging Project atau MakeAppx)
  → tanda tangani dengan signtool → cetak path + SHA-256 tiap artefak.
- Auto-update: App Installer (.appinstaller XML) atau PackageManager.RequestAddPackageAsync; cek versi
  dari /api/v1/public/... atau app_releases. Tidak ada kanal perintah cloud→booth (owner pasang/otomatis).
- Code signing WAJIB: konfigurasi cert (Azure Trusted Signing atau PFX via secret). Build GAGAL bila tak bertanda tangan.
- Output folder: booth/dist/snapyos-booth-<versi>/ berisi EXE, msix, sertifikat/appinstaller, SHA256SUMS.
- Rilis: unggah ke Google Drive (link publik) → isi /admin/apps (version, download_url, file_name,
  file_size_bytes, sha256, release_notes, is_active) — jangan simpan installer di storage SnapyOS.

Verifikasi: MSIX terpasang di Windows bersih (WebView2 runtime diperiksa), tanda tangan valid
(signtool verify), auto-update dari v(N) ke v(N+1) berhasil, lalu pairing berhasil.
Output: skrip build + artefak + langkah rilis terdokumentasi.
```

---

## PROMPT FASE 6 — Pembersihan (hapus Tauri/Node) + dokumentasi

```
Peran: Anda menghapus jalur lama dan menutup pekerjaan.

Prasyarat: Fase 1-5 lulus; rilis MSIX dipasang di booth uji tanpa masalah.

Tujuan: hanya ada satu aplikasi booth (C#/.NET), tanpa sisa Tauri/Node.

Ruang lingkup:
- Hapus: src-tauri/ (Rust + runtime-dist), runtime/ (Node sidecar), sidecar node.exe,
  scripts/build-kiosk-runtime.mjs, scripts/build-booth.ps1 (Tauri), prepare-standalone terkait kiosk.
- Perbarui docs: 19-desktop-app-release.md, 20-booth-build-windows.md, 21-skema-cloud-vs-booth.md,
  dan README agar merujuk build .NET + MSIX.
- Cloud: PERTAHANKAN /p/** sebagai fallback HP; HENTIKAN editor branding cloud
  (/dashboard/branding, src/server/branding.ts) karena kustomisasi kini in-app
  (appearance_settings lokal). Jangan hapus kolom DB; tandai deprecated.
- Pastikan tidak ada referensi tersisa ke tauri/runtime/node sidecar di CI, tsconfig, gitignore.

Verifikasi: `grep -ri "tauri\|node-x86_64-pc-windows-msvc\|runtime-dist" --exclude-dir=node_modules`
nol hasil di kode aktif; build .NET hijau; /p/** masih melayani HP.
Output: repo bersih + docs diperbarui.
```

---

## Ringkasan fase

| Fase | Hasil | Gate verifikasi |
| ---- | ----- | --------------- |
| 0 | JSON Schema tunggal + model C#/TS | generator deterministik, typecheck hijau |
| 1 | Solusi .NET + WinUI 3 + WebView2 host UI lokal | build Windows; /health 200; rute lain butuh token |
| 2 | Port runtime (store/settings/sync/session/PIN) | tes error code + offline sync |
| 3 | Kamera & printer native + uji HW | uji perangkat nyata terdokumentasi |
| 4 | Lisensi Ed25519 + fingerprint + 1:1 | MACHINE_MISMATCH / LICENSE_REVOKED / offline grace |
| 5 | MSIX + auto-update + code signing | terpasang di Windows bersih, tanda tangan valid, pairing |
| 6 | Hapus Tauri/Node + docs | nol referensi legacy |
