# booth/prompts.md — Prompt Eksekusi per Fase

Status: active
Last updated: 2026-10-30
Pasangan wajib: `booth/plan.md` (rencana + gate). `docs/22-booth-dotnet-prompts.md` tetap
berlaku sebagai konteks produk; dokumen ini adalah versi **operasional** (perintah, berkas,
acceptance) yang lebih rinci.

## Cara pakai

1. Satu fase = satu sesi/konteks bersih.
2. Tempel **Konteks Bersama** + satu blok fase.
3. Jangan mulai fase N+1 sebelum gate fase N hijau dan tercatat di `booth/VERIFICATION.md`.
4. Fase 1–5 **wajib** dijalankan di Windows x64. Fase 0 dan 6 boleh di macOS/Linux.

---

## Konteks Bersama (tempel di setiap prompt)

```
Repo: /Users/ucaany/Downloads/PT SNAPY OS (Next.js 16 + React 19 + TS + Supabase di root).
Aplikasi booth baru ada di booth/ (C#/.NET 8 + WinUI 3 + WebView2 + React/Vite lokal).
Rencana: booth/plan.md. Prompt: booth/prompts.md. Kontrak produk: docs/21, docs/22.

Invarian (tidak boleh dilanggar):
- Uang selalu integer IDR.
- Cloud = otoritas harga/voucher/payment/kuota. Booth tidak menghitung uang.
- Kontrak HTTP dipertahankan byte-compatible: /health, /v1/status, /v1/settings*,
  /v1/sessions*, /v1/exit, /camera/{preview,capture}, /print, /printer/{test,health}.
  Rute baru hanya aditif.
- Semua rute kecuali /health wajib X-Bridge-Token; bandingkan constant-time atas SHA-256.
- Kode error persis: FIELD_NOT_DEVICE_OWNED(403), INVALID_SETTINGS(400),
  SCHEMA_VERSION_TOO_NEW(400), PHOTOBOX_MISMATCH(409), SESSION_EXPIRED(410),
  LOCAL_ONLY_SETTING(403). Fase 4 menambah MACHINE_MISMATCH(403), LICENSE_REVOKED(403),
  LICENSE_INVALID(403), SUBSCRIPTION_INACTIVE(402).
- Satu sumber aturan setelan: booth/contracts/*.json. Dilarang menyalin daftar grup/field.
- appearance_settings local-only; exit_pin_* tidak pernah keluar mesin.
- Mock hanya dengan SNAPYOS_ALLOW_MOCK=1 dan wajib dilabeli.
- UI Neo-Brutalism saja (src/styles/tokens.css). Dilarang placeholder, TODO, skeleton kosong.
- Jangan menambah dependency tanpa lolos gerbang booth/plan.md §2.1.

Aturan kerja:
- Baca berkas yang relevan sebelum menulis. Jangan menebak API.
- Satu task = satu commit, format feat(booth): <task-id> <ringkas>.
- Laporkan hasil verifikasi apa adanya. "Belum diuji" adalah jawaban sah.
- Jangan commit artefak build (bin/, obj/, dist/, Assets/ui).
```

---

## PROMPT FASE 0 — Kontrak tunggal + CI

```
Peran: Anda menutup fase 0. Kode kontrak sudah ada; yang kurang adalah commit, tes
determinisme, tes paritas TS↔C#, dan job CI.

Prasyarat: tidak ada. Boleh dikerjakan di macOS/Linux.

Baca dulu:
- booth/contracts/device-settings.schema.json, settings-envelope.schema.json, generate.mjs
- src/lib/generated/device-settings.gen.ts
- booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs
- tests/device-settings-contract.test.ts
- src/lib/validators.ts (bagian DEVICE_SETTING_GROUPS dst.)
- package.json (script booth:contracts), .github/workflows/ci.yml, booth/README.md

Tugas:
0.1 Commit: booth/ (tanpa bin, obj, node_modules, Assets/ui, dist), src/lib/generated/,
    tests/device-settings-contract.test.ts, src/lib/validators.ts, package.json,
    eslint.config.mjs, tsconfig.json, .prettierignore, docs/22-booth-dotnet-prompts.md,
    booth/plan.md, booth/prompts.md.
    Pesan: feat(booth): kerangka aplikasi booth .NET + kontrak setelan
    Sebelum commit: pastikan `git status` tidak memuat .env* dan tidak ada berkas >1 MB.

0.2 Tambah tes determinisme di tests/device-settings-contract.test.ts:
    - jalankan generator ke direktori temp dua kali (spawn `node booth/contracts/generate.mjs`
      dengan env output dir bila perlu, atau bandingkan hash berkas hasil),
    - assert byte-identik antar dua jalankan,
    - assert hasil == berkas yang di-commit (mendeteksi generated file basi).
    Bila generator belum mendukung output dir, tambahkan flag `--out-dir` (jangan ubah
    perilaku default) dan dokumentasikan di komentar kepala generator.

0.3 Tambah tes paritas TS↔C#: parse `DeviceSettings.g.cs` (nama grup + properti per grup),
    bandingkan dengan schema JSON dan dengan `DEVICE_SETTING_FIELDS`. Gagal bila C# punya
    field yang tidak ada di schema atau sebaliknya.

0.4 .github/workflows/ci.yml: tambah langkah
    - `npm run booth:contracts`
    - `git diff --exit-code src/lib/generated/device-settings.gen.ts booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs`
    - `node --experimental-strip-types --test tests/device-settings-contract.test.ts`
    Tambahkan .gitattributes agar *.g.cs dan *.gen.ts selalu LF (cegah diff palsu di Windows).

0.5 booth/README.md: perbaiki tabel status (fase 2 = "kode selesai, verifikasi Windows
    tertunda"), tautkan booth/plan.md + booth/prompts.md, dan sebut bahwa build wajib Windows.

Larangan:
- Jangan mengubah aturan kepemilikan setelan di dua tempat.
- Jangan menghapus API publik src/lib/validators.ts yang sudah dipakai kode lain.
- Jangan menyentuh src-tauri/ atau runtime/ (itu fase 6).

Verifikasi (laporkan keluaran):
  npm run booth:contracts
  git diff --exit-code src/lib/generated/device-settings.gen.ts booth/src/SnapyOS.Booth.Contracts/DeviceSettings.g.cs
  node --experimental-strip-types --test tests/device-settings-contract.test.ts
  npm run lint && npm run typecheck && npm test

Output: commit 0.1 + diff tes/CI + keluaran verifikasi.
```

---

## PROMPT FASE 1 — Shell kiosk + bridge (Windows)

```
Peran: Anda menyelesaikan fase 1: aplikasi WinUI 3 yang benar-benar berperilaku kiosk,
dengan bridge loopback yang hanya bisa dipanggil UI lokal.

Prasyarat: fase 0 hijau.

Baca dulu:
- booth/src/SnapyOS.Booth.Shell/{App.xaml.cs,MainWindow.xaml.cs,MainWindow.xaml,Package.appxmanifest}
- booth/src/SnapyOS.Booth.Bridge/{BridgeServer.cs,Program.cs}
- booth/src/SnapyOS.Booth.Core/RuntimeConfig.cs
- booth/ui/src/{App.tsx,bridge.ts,styles.css}, booth/ui/src/panels/*
- booth/scripts/build-booth.ps1
- runtime/http.ts (CORS + token, sebagai acuan perilaku)

Tugas:
1.1 Build pertama: `dotnet build booth\SnapyOS.Booth.sln -c Debug` dan
    `dotnet test booth\tests\SnapyOS.Booth.Tests -c Debug`. Catat versi .NET SDK,
    Windows App SDK, WebView2 Runtime, hasil, dan galat apa pun ke booth/VERIFICATION.md.
1.2 Single-instance: named mutex; instance kedua mengaktifkan jendela yang ada lalu keluar
    (jangan membuka bridge kedua di port yang sama).
1.3 Kiosk window: AppWindow presenter FullScreen, tanpa dekorasi, IsResizable/IsMinimizable/
    IsMaximizable=false. Jendela tetap fokus (Activate) setelah navigasi.
1.4 Kunci keluar: AppWindow.Closing -> args.Cancel = true selama "locked". Buka kunci HANYA
    bila /v1/exit mengembalikan 200 (ExitService sudah menangani PIN, lockout, dan event).
    Hubungkan hasil exit ke Shell lewat callback/event, bukan polling.
1.5 WebView2: NavigationStarting -> batalkan navigasi keluar host "snapyos.app";
    NewWindowRequested -> batalkan; AreDefaultContextMenusEnabled=false;
    AreDevToolsEnabled=false di Release; AreBrowserAcceleratorKeysEnabled=false.
1.6 Guard adapter di MainWindow: tolak hanya bila mock dipakai TANPA SNAPYOS_ALLOW_MOCK=1.
    Pesan galat tetap jelas. Jangan menambahkan adapter (itu fase 3).
1.7 UI: pisahkan permukaan kiosk pelanggan dari shell operator.
    - Tombol "Buka Kiosk" menyembunyikan topbar/tab dan menampilkan layar kiosk penuh.
    - Keluar dari kiosk hanya lewat PIN darurat (panggil /v1/exit).
    - Pertahankan navigasi tab tanpa dependency router; catat penyimpangan dari docs/22
      (yang menyebut HashRouter) di booth/README.md.
    - Semua teks Indonesia, Neo-Brutalism, tanpa placeholder.
1.8 Token: baca PHOTOBOOTH_BRIDGE_TOKEN sekali di Shell, suntik ke UI lewat
    AddScriptToExecuteOnDocumentCreatedAsync (sudah ada). Tampilkan peringatan di UI bila
    token berasal dari default/lemah. Jangan menulis token ke localStorage.
1.9 build-booth.ps1: tambah -SkipContracts, verifikasi Assets/ui/index.html ada,
    cetak SHA-256 EXE dan jumlah berkas di dist/booth.

Larangan:
- Jangan memindahkan WinRT/System.Printing ke Core atau Bridge (itu fase 3).
- Jangan mengubah nama rute/kode error.
- Jangan menonaktifkan token middleware.

Verifikasi (Windows, laporkan apa adanya):
  dotnet build booth\SnapyOS.Booth.sln -c Debug
  dotnet test  booth\tests\SnapyOS.Booth.Tests -c Debug
  .\booth\scripts\build-booth.ps1
  $env:PHOTOBOOTH_BRIDGE_TOKEN="0123456789abcdef"; $env:SNAPYOS_ALLOW_MOCK="1"
  & .\booth\dist\booth\SnapyOS.Booth.Shell.exe
  curl.exe -i http://127.0.0.1:17777/health                      # 200
  curl.exe -i http://127.0.0.1:17777/v1/status                   # 401
  curl.exe -i -H "X-Bridge-Token: 0123456789abcdef" http://127.0.0.1:17777/v1/status  # 200
Uji manual: fullscreen, Alt+F4 tertahan, instance kedua tidak membuka jendela baru,
UI bisa memanggil /v1/status (bukan hanya curl).

Output: diff + hasil verifikasi + catatan penyimpangan docs/22.
```

---

## PROMPT FASE 2 — Port runtime penuh + bukti tes (Windows)

```
Peran: Anda memverifikasi dan menutup port runtime Node -> C# dengan bukti, bukan asumsi.

Prasyarat: fase 1 hijau.

Baca dulu:
- booth/src/SnapyOS.Booth.Core/{Store.cs,SettingsService.cs,RuntimeConfig.cs,Errors.cs,SessionTimer.cs}
- booth/src/SnapyOS.Booth.Core/{Sessions/SessionsService.cs,Sync/SyncWorker.cs,Exit/ExitService.cs,Exit/Argon2idPin.cs}
- booth/tests/SnapyOS.Booth.Tests/*.cs
- runtime/{db,schema.ts,settings/index.ts,sync/worker.ts,session/index.ts,exit/index.ts,config.ts,version.ts}
- docs/22-booth-dotnet-prompts.md bagian "PROMPT FASE 2"

Tugas:
2.1 Jalankan `dotnet test` di Windows. Perbaiki kegagalan. Target 43 tes hijau
    (15+7+9+6+6). Jangan menghapus tes untuk "menghijaukan".
2.2 Buat matriks tes -> syarat di booth/VERIFICATION.md untuk 8 butir verifikasi docs/22:
    (a) round-trip export/import mempertahankan nilai & membuang exit_pin_*,
    (b) PUT print_settings.copies -> 403 FIELD_NOT_DEVICE_OWNED,
    (c) import schema_version lebih baru -> 400 SCHEMA_VERSION_TOO_NEW,
    (d) photobox_slug berbeda -> 409 PHOTOBOX_MISMATCH,
    (e) capture idempoten: key sama -> satu baris, file tidak ditulis ulang,
    (f) offline: finalize lokal -> masuk finalize_queue,
    (g) cloud kembali -> terkirim dengan Idempotency-Key sama,
    (h) 410/SESSION_EXPIRED -> media dikarantina SEBELUM baris lokal dihapus.
2.3 Tambah tes yang belum ada:
    - Write parsial tidak menghapus field lain dalam grup yang sama,
    - CloudSyncedSettings membuang appearance_settings,
    - Backoff = min(2^n * 1s, 5m) dengan jitter dalam ±20% (uji fungsi murni),
    - Karantina: bila penyalinan media gagal, baris TIDAK dihapus,
    - Migrasi DB v1 (runtime Node) -> v2 tanpa kehilangan setelan (fixture DB v1).
2.4 Bandingkan bentuk respons nyata: jalankan runtime Node lama dan bridge baru dengan
    payload setelan/sesi yang sama; catat perbedaan pada GET /v1/settings,
    /v1/settings/export, /v1/sessions/{id}. Perbaiki bila berbeda.
2.5 Pastikan SyncWorker: CloudUrl/DeviceToken kosong -> "skipped" (tanpa error berulang),
    dan tidak ada token di log/exception message.
2.6 Pastikan tidak ada jalur yang menulis secret exit_pin_* ke export, present, log, atau event.

Larangan:
- Jangan mengubah nama kolom tabel atau kode error untuk "merapikan".
- Jangan menambah dependency baru; Microsoft.Data.Sqlite + Konscious sudah cukup.

Verifikasi:
  dotnet test booth\tests\SnapyOS.Booth.Tests -c Debug
  (lampirkan ringkasan pass/fail per kelas tes)
  Uji manual: jalankan EXE, PUT /v1/settings dengan print_settings.copies -> 403,
  import schema_version:99 -> 400, lalu export dan pastikan tidak ada exit_pin_*.

Output: matriks tes + daftar tes baru + hasil dotnet test + catatan perbedaan perilaku.
```

---

## PROMPT FASE 3 — Kamera & printer native (Windows + hardware)

```
Peran: Anda mengganti mock dengan adapter perangkat keras Windows yang nyata.

Prasyarat: fase 2 hijau.

Keputusan arsitektur wajib (ambil sebelum menulis kode):
- Buat proyek baru booth/src/SnapyOS.Booth.Hardware/ dengan
  TargetFramework net8.0-windows10.0.19041.0, referensi SnapyOS.Booth.Core.
- Core dan Bridge tetap netral platform. Shell mereferensikan Hardware.
- Alasan: MediaCapture (WinRT), System.Printing, System.IO.Ports tidak boleh bocor ke Core.

Baca dulu:
- booth/src/SnapyOS.Booth.Core/Hardware/Adapters.cs (ICamera, IPrinter, mock)
- booth/src/SnapyOS.Booth.Core/RuntimeConfig.cs (kinds, DigicamPort, DigicamCmd, SumatraBin)
- runtime/camera/*.ts, runtime/print/index.ts, runtime/print/geometry.ts
- src/lib/print/{escpos,dither,qr,receipt,photo-bitmap,print-mode,auto-print}.ts
- src/lib/print/* (geometry, ukuran kertas, margin, cap 16 MiB)
- docs/17-thermal-printing.md

Tugas:
3.1 DigiCamControlCamera: preview HTTP http://127.0.0.1:5513/liveview.jpg,
    capture /?SLC=CaptureNoAf; fallback CameraControlCmd.exe /capture /wait dengan timeout
    dan pesan operator yang bisa ditindaklanjuti. Preview gagal TIDAK membatalkan capture.
    Validasi JPEG (SOI/EOI) sebelum dikembalikan.
3.2 WebcamCamera: WinRT MediaCapture + LowLagPhotoCapture -> JPEG. Preview memakai frame
    terakhir (bukan getUserMedia). Lepas resource saat Stop/Dispose.
3.3 Peran stills/stream: satu instance adapter dipakai bersama bila kind+device sama.
    Hormati SNAPYOS_CAMERA_STREAM; /camera/preview memakai stream bila ada.
3.4 SpoolerPrinter: Health() enumerasi PrintQueue (ada/tidak, offline, paper jam bila tersedia);
    Submit() kirim PDF ke printer bernama via SumatraPDF (SUMATRA_BIN) atau PDFtoPrinter.
    Sukses = spooler menerima job, BUKAN kertas keluar. Kembalikan job id bila ada.
3.5 EscPos: port dither (Floyd–Steinberg), QR bitmap, raster GS v 0, receipt, photo-bitmap.
    Transport serial (System.IO.Ports) + Bluetooth RFCOMM (WinRT). Batas platform
    didokumentasikan; jangan klaim dukungan iOS.
3.6 Geometry: paper 4x6/A6, margin 0–20 mm, <=8 JPEG/lembar, cap 16 MiB/gambar.
    Port dari runtime/print/geometry.ts. Bila memakai QuestPDF, catat keputusan lisensi di
    booth/README.md; bila menolak, render dengan System.Drawing (Windows-only).
3.7 Auto-print: klaim sekali per sesi, tidak untuk reprint. Idempoten saat retry.
3.8 Factory: CameraFactory (digicamcontrol|webcam|mock), PrinterFactory (windows|escpos|mock).
    Kind non-Windows (gphoto2|libcamera|v4l2|pyav) ditolak dengan pesan "adapter hanya untuk
    Linux/Pi". Jangan mengubah enum di schema (cloud masih memvalidasi kiosk PWA).
3.9 Cabut guard mock di MainWindow; ganti dengan factory. Mock tetap wajib SNAPYOS_ALLOW_MOCK=1.
3.10 Tes unit tanpa hardware: geometry, dither, QR, parsing respons digiCamControl (fixture),
     validasi JPEG, auto-print idempoten.
3.11 booth/docs/hardware-matrix.md: perangkat, driver, firmware, hasil, penguji, tanggal.

Larangan:
- Jangan mengubah rute /print, /printer/test, /printer/health, /camera/*.
- Jangan menaruh kode WinRT di Core/Bridge.
- Jangan menulis "lulus" untuk perangkat yang tidak Anda uji.

Verifikasi:
  dotnet build booth\SnapyOS.Booth.sln -c Debug
  dotnet test  booth\tests\SnapyOS.Booth.Tests -c Debug
  Uji manual per perangkat: (a) DSLR via digiCamControl, (b) webcam, (c) printer spooler,
  (d) thermal ESC/POS 80 mm. Lampirkan hasil nyata per perangkat.

Output: proyek Hardware + adapter + tes unit + matriks hardware + catatan keputusan dependency.
```

---

## PROMPT FASE 4 — Lisensi Ed25519 + fingerprint (Windows + cloud)

```
Peran: Anda menegakkan "1 pairing = 1 aplikasi = 1 mesin" tanpa sistem paralel.

Prasyarat: fase 2 dan 3 hijau.

Baca dulu:
- db/schema.sql: tabel devices (254-283), activation_codes (285-294),
  activate_device_atomically (296-340)
- src/server/devices.ts (activateDevice, verifyDevice, resolveActiveDevice, revokeDevice)
- src/app/api/v1/public/devices/{activate,verify,report}/route.ts
- src/lib/device-token.ts, src/lib/validators.ts (deviceActivateSchema, deviceVerifySchema)
- booth/src/SnapyOS.Booth.Core/{Store.cs,RuntimeConfig.cs,Sync/SyncWorker.cs}
- booth/ui/src/panels/PairingPanel.tsx

Bagian A — Cloud (minimal, aditif):
A1 Migrasi baru db/migrations/00XX_device_fingerprint_license.sql:
   - devices.machine_fingerprint_hash text
   - devices.license_id uuid, devices.license_revoked_at timestamptz
   - index unik parsial (photobox_id, machine_fingerprint_hash) where status='active'
A2 Perluas activate_device_atomically(p_code, p_device_token_hash, p_machine_fingerprint_hash):
   - simpan fingerprint,
   - bila photobox sudah punya device aktif dengan fingerprint BERBEDA -> kembalikan
     reason 'MACHINE_IN_USE' (jangan hapus device lama diam-diam).
A3 Endpoint baru POST /api/v1/public/devices/license: terbitkan lisensi Ed25519
   {license_id, business_id, photobox_id, machine_fingerprint_hash, issued_at,
   subscription_expires_at, entitlement}. Private key dari env server saja.
   Public key didokumentasikan untuk ditanam di aplikasi.
A4 verifyDevice: sertakan license + subscription_expires_at; resolveActiveDevice memverifikasi
   fingerprint untuk request booth. Kiosk PWA tanpa fingerprint (null) tetap boleh.
A5 revokeDevice: set license_revoked_at; request berikutnya ditolak.
A6 Rate limit endpoint license seperti activate (docs/09 §9). Jangan menambah data sensitif
   ke log.

Bagian B — Booth:
B1 Core/License/MachineFingerprint.cs: SHA-256 atas MachineGuid
   (HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid) + serial volume sistem
   (GetVolumeInformation) + SMBIOS UUID bila tersedia. Urutan tidak sensitif; stabil lintas reboot.
B2 Core/License/TokenVault.cs: device_token lewat DPAPI (ProtectedData, CurrentUser) di
   data/secrets.bin. Tidak pernah plaintext di DB, log, atau UI.
B3 Core/License/LicenseVerifier.cs: verifikasi Ed25519 (NSec.Cryptography). Verifikasi saat boot,
   tiap 6 jam, dan setiap sync. Cache hasil, jangan verifikasi per request HTTP.
B4 Gate + kode error: MACHINE_MISMATCH(403), LICENSE_INVALID(403), LICENSE_REVOKED(403),
   SUBSCRIPTION_INACTIVE(402 setelah grace, cek status DAN tanggal — bukan string saja).
   Jangan menolak hanya karena file lisensi hilang saat offline.
B5 POST /v1/pair di bridge: {code} -> cloud devices/activate -> simpan token (DPAPI) +
   fingerprint + lisensi + business_slug/photobox_slug ke meta -> aktifkan sync.
   Teruskan kode error cloud apa adanya (VALIDATION_ERROR/429 dengan retry_after).
B6 /v1/status: tambah license { status, expires_at, machine_ok } (aditif).
B7 UI /pair: form kode nyata (12 karakter, uppercase), tampilkan hasil dan status lisensi;
   panel /settings menampilkan status lisensi + tanggal berlaku. Import/export setelan
   TIDAK membawa lisensi.
B8 Tes: signature valid/rusak/kedaluwarsa; fingerprint berubah -> MACHINE_MISMATCH;
   offline melewati expires_at -> SUBSCRIPTION_INACTIVE sesuai grace; lisensi disalin ke
   PC lain -> MACHINE_MISMATCH; revoked -> LICENSE_REVOKED; token tersimpan terenkripsi.

Larangan:
- Jangan membuat tabel/sistem lisensi kedua di samping activation_codes/devices.
- Jangan menaruh private key di repo, aplikasi, atau log.
- Jangan mengubah kontrak activate/verify yang sudah dipakai kiosk PWA (hanya aditif).

Verifikasi:
  Cloud: npm run lint && npm run typecheck && npm test
         npm run verify (sebelum merge)
  Booth: dotnet build + dotnet test di Windows
  E2E: aktivasi ke staging -> token + lisensi tersimpan -> restart -> kiosk jalan;
       salin data ke mesin lain -> MACHINE_MISMATCH; revoke di dashboard -> LICENSE_REVOKED.

Output: migrasi + endpoint cloud + kode lisensi booth + UI + tes + catatan manajemen kunci.
```

---

## PROMPT FASE 5 — MSIX + auto-update + signing

```
Peran: Anda mengemas, menandatangani, dan mendistribusikan installer booth.

Prasyarat: fase 4 hijau (aplikasi fungsional & teraktivasi).

Baca dulu:
- booth/src/SnapyOS.Booth.Shell/{SnapyOS.Booth.Shell.csproj,Package.appxmanifest,app.manifest}
- booth/scripts/build-booth.ps1
- docs/19-desktop-app-release.md, docs/20-booth-build-windows.md
- db/schema.sql tabel app_releases (1114-1129), src/server/admin/apps.ts,
  src/app/(admin)/admin/apps/page.tsx

Tugas:
5.1 MSIX: WindowsPackageType=MSIX, EnableMsixTooling=true, AppxPackageSigningEnabled=true.
    Lengkapi Package.appxmanifest (EntryPoint WinUI 3 yang benar, logo, runFullTrust,
    internetClient, privateNetworkClientServer). Pertahankan WindowsAppSDKSelfContained
    bila terbukti jalan. Uji dengan makeappx + install nyata.
5.2 Code signing: signtool sign /fd SHA256 /tr <timestamp-url> /td SHA256.
    Pilih satu jalur dan catat: Azure Trusted Signing (CI) atau PFX dari secret.
    Build GAGAL bila artefak tidak bertanda tangan (jangan hanya memberi peringatan).
5.3 Auto-update: hasilkan .appinstaller (App Installer) + fallback
    PackageManager.RequestAddPackageAsync. Cek versi dari endpoint baru
    GET /api/v1/public/apps/latest (baca app_releases is_active=true).
    Jangan memakai Google Drive untuk .appinstaller (redirect/Content-Type tidak stabil);
    host di domain statis HTTPS milik sendiri.
5.4 build-booth.ps1: tambah mode -Package -> publish, buat MSIX, tanda tangani, tulis
    dist/snapyos-booth-<versi>/ berisi .msix, .appinstaller, SHA256SUMS, release-notes.md;
    cetak SHA-256 tiap artefak. Jangan commit dist/.
5.5 Verifikasi di Windows bersih (VM): WebView2 Runtime diperiksa, MSIX terpasang,
    aplikasi jalan, pairing berhasil, update v(N) -> v(N+1) berhasil, token & lisensi
    tetap ada setelah update.
5.6 Rilis: unggah ke host statis, isi /admin/apps (versi, URL, nama, ukuran, sha256,
    catatan, aktif). Perbarui docs/19 (prosedur) dan docs/20 (build .NET).

Larangan:
- Jangan menyimpan installer di storage SnapyOS.
- Jangan menonaktifkan verifikasi tanda tangan.
- Jangan menambah kanal perintah cloud->booth untuk memasang update.

Verifikasi:
  .\booth\scripts\build-booth.ps1 -Package
  signtool verify /pa /v booth\dist\snapyos-booth-<versi>\*.msix
  Install di VM bersih -> jalankan -> pairing -> cek update dari v(N) ke v(N+1)

Output: skrip paket + artefak bertanda tangan + appinstaller + endpoint versi +
langkah rilis terdokumentasi.
```

---

## PROMPT FASE 6 — Hapus Tauri/Node + sinkron dokumen

```
Peran: Anda menutup pekerjaan: satu aplikasi booth, tanpa sisa Tauri/Node.

Prasyarat: fase 1–5 lulus; MSIX terpasang dan berjalan di booth uji.

Baca dulu:
- src-tauri/ (tauri.conf.json, Cargo.toml, runtime-dist)
- runtime/ (seluruh isi), scripts/build-kiosk-runtime.mjs, scripts/build-booth.ps1,
  prepare-standalone.mjs
- README.md, AGENTS.md, docs/19, docs/20, docs/21, docs/status.md
- src/server/branding.ts, src/app/(dashboard)/dashboard/branding/**, src/app/p/**,
  src/lib/appearance-merge.ts

Tugas:
6.1 Hapus src-tauri/, runtime/, scripts/build-kiosk-runtime.mjs, scripts/build-booth.ps1
    (Tauri), bagian kiosk di prepare-standalone.mjs, sidecar node.exe, dependency
    @tauri-apps/* dan Cargo.toml terkait. Hapus juga entri di package.json/tsconfig/gitignore.
6.2 Cloud: PERTAHANKAN /p/** sebagai fallback HP. Hentikan editor branding
    (/dashboard/branding + src/server/branding.ts) karena kustomisasi pindah ke
    appearance_settings lokal. Jangan hapus kolom DB; tandai deprecated di komentar migrasi/docs.
6.3 Perbarui docs/19, docs/20, docs/21, docs/status.md, README.md, AGENTS.md agar merujuk
    build .NET + MSIX. Hapus panduan Tauri yang sudah mati.
6.4 Gate grep: grep -ri "tauri\|node-x86_64-pc-windows-msvc\|runtime-dist" --exclude-dir=node_modules
    -> nol hasil di kode aktif (dokumen historis boleh menyebut sebagai catatan).
6.5 CI: hapus job Tauri; tambah job windows-latest (dotnet build + dotnet test + build UI).

Larangan:
- Jangan menghapus /p/** atau kolom DB branding.
- Jangan menghapus riwayat migrasi.

Verifikasi:
  grep -ri "tauri\|node-x86_64-pc-windows-msvc\|runtime-dist" --exclude-dir=node_modules
  npm run lint && npm run typecheck && npm test
  dotnet build + dotnet test (Windows)
  Smoke test: buka /p/<business>/<booth> di browser HP -> kiosk PWA tetap jalan.

Output: repo bersih + docs sinkron + laporan grep nol hasil.
```

---

## Lampiran — perintah cepat

| Keperluan                 | Perintah                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| Regenerasi kontrak        | `npm run booth:contracts`                                                       |
| Tes kontrak               | `node --experimental-strip-types --test tests/device-settings-contract.test.ts` |
| Lint/typecheck/test cloud | `npm run lint && npm run typecheck && npm test`                                 |
| Build UI booth            | `cd booth/ui && npm ci && npm run build`                                        |
| Build .NET (Windows)      | `dotnet build booth\SnapyOS.Booth.sln -c Debug`                                 |
| Tes .NET (Windows)        | `dotnet test booth\tests\SnapyOS.Booth.Tests -c Debug`                          |
| Paket booth (Windows)     | `.\booth\scripts\build-booth.ps1`                                               |
| Smoke bridge              | `curl.exe -i -H "X-Bridge-Token: <t>" http://127.0.0.1:17777/v1/status`         |
