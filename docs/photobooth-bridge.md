# Bridge kamera dan printer SnapyOS

## Batas deployment

`gphoto2` dan CUPS harus berjalan di komputer kiosk yang terhubung USB ke DSLR
dan printer. Vercel hanya menjalankan aplikasi Next.js dan tidak mempunyai akses
ke USB atau daemon CUPS. Kiosk memanggil bridge lokal melalui
`http://127.0.0.1:17777`; URL bridge tidak boleh diarahkan ke endpoint publik.

## Token bridge

Bridge menguasai kamera dan printer fisik, jadi setiap rute selain `/health`
mewajibkan header `X-Bridge-Token`. Bridge **menolak start** tanpa
`PHOTOBOOTH_BRIDGE_TOKEN` (minimal 16 karakter) — tidak ada deployment yang
diam-diam berjalan terbuka.

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Simpan nilai yang sama di dua tempat:

- variabel `PHOTOBOOTH_BRIDGE_TOKEN` pada service bridge;
- Setup Perangkat kiosk (layar kamera mode GPhoto2 atau uji cetak mode CUPS),
  yang menyimpannya di `localStorage` perangkat ini saja. Token tidak masuk
  database karena `camera_settings`/`print_settings` dibaca browser siapa pun
  yang membuka halaman booth.

`/health` sengaja dibiarkan terbuka: Setup Perangkat memakainya untuk mendeteksi
kamera sebelum token diisi.

## Instalasi kiosk

Jalankan dari root project pada komputer kiosk:

```bash
bash scripts/install-photobooth-bridge.sh
gphoto2 --auto-detect
lpstat -p -d
PHOTOBOOTH_BRIDGE_TOKEN=<token> npm run bridge:gphoto2
```

Untuk Linux yang memakai systemd, salin
`scripts/photobooth-bridge.service.example` ke unit service, sesuaikan
`PHOTOBOOTH_BRIDGE_ORIGINS` dan path project, isi `/etc/snapyos/bridge.env`
(mode 0600) dengan `PHOTOBOOTH_BRIDGE_TOKEN`, lalu aktifkan service.

Health check yang harus lulus:

- `GET /health` mengembalikan `ok: true` dan `camera: true` saat DSLR USB
  terdeteksi.
- `GET /printer/health` dengan header token mengembalikan `ok: true` dan
  printer CUPS enabled.
- `POST /camera/capture` dengan header token mengembalikan JPEG satu kali per
  shutter; tanpa token → `401`.
- `POST /print` dengan header token membentuk PDF per sheet, mempertahankan
  ukuran kertas, orientasi, margin, dan mengirim `fit-to-page` ke CUPS.

### Rute sesi lokal (`/v1/sessions*`)

Runtime menyimpan sesi sendiri saat internet mati. ID sesi lokal berprefix
`local_` supaya tidak pernah tertukar dengan UUID cloud.

| Rute | Catatan |
|---|---|
| `POST /v1/sessions` | `package_snapshot` wajib; `expires_at` dihitung runtime |
| `GET /v1/sessions/:id` | termasuk daftar capture |
| `POST /v1/sessions/:id/capture` | header `Idempotency-Key` wajib; key sama → capture yang sama |
| `POST /v1/sessions/:id/finalize` | multipart, field sama dengan `buildFinalizeForm` |
| `POST /v1/sessions/:id/abort` | sesi `aborted` menolak capture berikutnya (`409`) |
| `POST /v1/exit` | PIN darurat (argon2id); 5 salah → kunci 5 menit |

`GET /v1/status` kini juga memuat `business_slug` dan `photobox_slug` dari tabel
`meta`; kiosk memakainya untuk memastikan runtime di port 17777 memang milik
booth-nya. PIN darurat hanya berlaku bila hash-nya terpasang di `meta`
(`exit_pin_emergency_hash`) dan tidak pernah ikut export setelan. Pemakaiannya
dicatat sebagai event `exit_pin_emergency_used`.

### Sync ke cloud (`runtime/sync/worker.ts`)

Worker berjalan di latar belakang runtime; kamera dan printer tidak pernah
menunggu jaringan. Butuh dua env:

| Env | Isi |
|---|---|
| `SNAPYOS_CLOUD_URL` | origin cloud, mis. `https://app.snapyos.id` |
| `SNAPYOS_DEVICE_TOKEN` | token dari aktivasi booth |

Keduanya kosong → worker tidak start; sesi tetap tersimpan lokal dan tidak
pernah dikirim. Bukan error.

Urutan per sesi yang sudah difinalisasi lokal:

1. `POST /api/v1/public/:businessSlug/sessions` dengan `package_id` +
   `client_created_at`. `cloud_id` disimpan segera setelah sukses, jadi crash
   berikutnya tidak menghasilkan sesi cloud kedua.
2. `POST .../sessions/:cloud_id/finalize` dengan foto dari disk.
3. `synced_at` ditandai.

Kunci idempotensi = `photobox_slug:local_session_id`. Backoff
`min(2^n × 1 s, 5 m)` ± 20 % (jitter supaya semua booth tidak menghantam cloud
serentak saat internet pulih).

`410` / `SESSION_EXPIRED` dari cloud berarti sesi tidak akan pernah diterima.
Media (foto + `finalize.json`) **disalin lebih dulu** ke
`<dataDir>/quarantine/<local_session_id>/`, baru baris lokal dihapus, dan
`events` mencatat `session_quarantined`. Foto pelanggan yang sudah dibayar tidak
boleh hilang hanya karena sync terlambat.

Setelah putaran sync, setelan device aktif dikirim ke
`PATCH /api/v1/public/devices/settings`. Hanya field device yang diterima;
field cloud dijawab `403 FIELD_NOT_DEVICE_OWNED`, dan cloud menggabungkan
per-key sehingga `print_settings.copies` tidak hilang saat booth melaporkan
`paper_size`.

## Aplikasi booth (EXE Windows)

`src-tauri/` membungkus halaman kiosk yang sama ke satu EXE Tauri v2: jendela
fullscreen memuat `SNAPYOS_KIOSK_URL`, dan runtime lokal dijalankan sebagai
sidecar Node. Tidak ada komponen kiosk yang ditulis ulang — UI, `ui.tsx`, dan
semua alur tetap milik halaman web.

| Berkas | Isi |
|---|---|
| `src-tauri/tauri.conf.json` | jendela fullscreen, `resizable: false`, `minWidth`/`minHeight` 1024×768, updater |
| `src-tauri/src/main.rs` | izin kamera, ukuran jendela per orientasi, sidecar hidup-mati |
| `src-tauri/capabilities/default.json` | tanpa izin invoke; halaman kiosk tidak memanggil `invoke` |
| `src-tauri/tauri.windows.conf.json` | `externalBin` sidecar (hanya Windows, supaya `cargo check` di macOS tidak gagal) |
| `scripts/build-kiosk-runtime.mjs` | bundel `runtime/` jadi `src-tauri/runtime-dist/` |

### Pemasangan di Windows

```powershell
.\scripts\install-snapyos.ps1 -AppDir "C:\Program Files\SNAPY OS Kiosk" `
  -CloudUrl https://snapyos.example -KioskUrl https://snapyos.example/p/toko-a/booth-1
```

Skrip memeriksa Node.js ≥ 22 (termasuk `node:sqlite` tanpa flag) dan WebView2,
mendeteksi digiCamControl + SumatraPDF, meminta PIN darurat, lalu menulis
`bridge.env` dan mendaftarkan tugas `SnapyOSRuntime` (`schtasks`, boot, SYSTEM).

- **Token bridge dibuat di mesin booth**, tidak ada di dalam skrip. Token satu
  booth tidak boleh dipakai booth lain.
- `bridge.env` hanya bisa dibaca SYSTEM + Administrators — di situlah tokennya.
  Folder data tetap bisa ditulis user kiosk, karena sidecar EXE berjalan sebagai
  user itu.
- Slug booth diambil dari `/p/<business>/<booth>` pada `-KioskUrl` dan ditulis ke
  `meta` store; tanpa slug, sesi offline ditolak.
- PIN darurat disimpan sebagai hash argon2id di `meta.exit_pin_emergency_hash`,
  dengan parameter yang sama seperti `hashDevicePin`.

`.\scripts\uninstall-snapyos.ps1` menghapus tugas dan `bridge.env` saja. Folder
data — sesi, foto, hash PIN — **tidak** disentuh.

`bridge.env` (`%ProgramData%\SNAPYOS\bridge.env`) dibaca EXE lalu diteruskan
apa adanya ke sidecar. Kunci tambahan khusus EXE:

| Kunci | Isi |
|---|---|
| `SNAPYOS_KIOSK_URL` | halaman kiosk booth ini, mis. `https://test.snapyos.biz.id/p/toko-a/booth-1` |
| `SNAPYOS_KIOSK_ORIENTATION` | `portrait` → jendela 1080×1920; selain itu 1920×1080 |
| `SNAPYOS_UPDATE_ENDPOINT` | opsional; URL manifest update. Kosong = updater tidak memeriksa apa pun |

Updater memakai `pubkey` di `tauri.conf.json`; private key-nya **tidak** masuk
repo. Buat sekali dengan `npx tauri signer generate`, simpan private key di
mesin rilis, dan tanda tangani setiap build dengan
`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Manifest
rilis belum punya rumah, jadi endpoint sengaja tidak ditulis di config.

Tiga hal yang berbeda dari kiosk browser:

1. **Izin kamera.** WebView2 menolak `getUserMedia` tanpa handler eksplisit.
   `main.rs` mengizinkan `COREWEBVIEW2_PERMISSION_KIND_CAMERA` hanya untuk host
   halaman kiosk. Kalau Windows tetap menolak (Privacy → Camera), layar setup
   menampilkan "Izin kamera ditolak. Buka Windows Settings → Privacy → Camera"
   dengan tombol "COBA LAGI".
2. **Orientasi.** `screen.orientation.lock()` tidak berefek di Windows desktop.
   `src/lib/kiosk-shell.ts` mendeteksi EXE (`window.__SNAPYOS_EXE__`, ditulis
   Rust lewat initialization script) dan melewati pemanggilan lock; orientasi
   ditegakkan ukuran jendela + layout responsif yang sudah ada.
3. **Ukuran jendela.** `resizable: false` + min 1024×768 supaya layout tidak
   pecah bila operator mencoba mengubah ukuran.

WebView2 **tidak punya Web Bluetooth**. Printer thermal Bluetooth hanya ada di
POS; di EXE cetak lewat spooler Windows / CUPS bridge.

Build `.exe`/`.msi` hanya bisa di Windows: taruh `node.exe` sebagai
`src-tauri/binaries/node-x86_64-pc-windows-msvc.exe`, lalu `npx tauri build`.
Statusnya **NOT TESTED** — belum pernah dibangun atau dijalankan di Windows.

## Keputusan dari upstream

Implementasi ini mengambil pola yang relevan dari
[PhotoboothProject/photobooth](https://github.com/PhotoboothProject/photobooth)
dan [photobooth-app/photobooth-app](https://github.com/photobooth-app/photobooth-app):
preview dan capture dipisahkan, kamera dikunci agar tidak menerima shutter
bersamaan, dan perangkat lokal menjadi service yang bisa direstart. Kode PHP,
Vue, serta mode deployment upstream tidak dicampur ke Next.js SnapyOS karena
kontrak sesi, storage, pembayaran, dan UI SnapyOS sudah berbeda.

## Verifikasi

`npm test` menjalankan integration test bridge dengan binary kamera dan printer
tiruan. Test itu membuktikan fallback capture saat gphoto2 menghasilkan file
JPEG lalu exit non-zero, CUPS geometry 4x6 + margin, printer health, blokir
origin asing, penolakan tanpa token (`401`), dan penolakan start tanpa
`PHOTOBOOTH_BRIDGE_TOKEN`. Kamera serta cetak fisik tetap wajib diuji pada
perangkat kiosk berkabel; test tiruan tidak menggantikan bukti hardware.
