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

| Rute                             | Catatan                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| `POST /v1/sessions`              | `package_snapshot` wajib; `expires_at` dihitung runtime      |
| `GET /v1/sessions/:id`           | termasuk daftar capture                                      |
| `POST /v1/sessions/:id/capture`  | header `Idempotency-Key` wajib; key sama → capture yang sama |
| `POST /v1/sessions/:id/finalize` | multipart, field sama dengan `buildFinalizeForm`             |
| `POST /v1/sessions/:id/abort`    | sesi `aborted` menolak capture berikutnya (`409`)            |
| `POST /v1/exit`                  | PIN darurat (argon2id); 5 salah → kunci 5 menit              |

`GET /v1/status` kini juga memuat `business_slug` dan `photobox_slug` dari tabel
`meta`; kiosk memakainya untuk memastikan runtime di port 17777 memang milik
booth-nya. PIN darurat hanya berlaku bila hash-nya terpasang di `meta`
(`exit_pin_emergency_hash`) dan tidak pernah ikut export setelan. Pemakaiannya
dicatat sebagai event `exit_pin_emergency_used`.

### Sync ke cloud (`runtime/sync/worker.ts`)

Worker berjalan di latar belakang runtime; kamera dan printer tidak pernah
menunggu jaringan. Butuh dua env:

| Env                    | Isi                                         |
| ---------------------- | ------------------------------------------- |
| `SNAPYOS_CLOUD_URL`    | origin cloud, mis. `https://app.snapyos.id` |
| `SNAPYOS_DEVICE_TOKEN` | token dari aktivasi booth                   |

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

## Status printer dan antrean

| Rute                          | Isi                                                                 |
| ----------------------------- | ------------------------------------------------------------------- |
| `GET /v1/printer/status`      | `ok`, `adapter`, `printer`, `state`, `media`, `queue`, `output`, `job` |
| `GET /v1/printer/jobs`        | daftar job spooler (`id`, `printer`, `state`, `size`)               |
| `POST /v1/printer/enable`     | body `{ printer? }`; membuka printer `disabled`                     |
| `GET /printer/health` (lama)  | tetap `ok`/`printer`/`output`, aditif `state`/`media`/`queue`       |
| `GET /print/jobs/:id`         | aditif `attempts`, `next_retry_at`, `failure_kind`                  |

`state` = `ok | busy | disabled | offline | unknown`. `submit` tetap berarti
spooler menerima, bukan kertas keluar.

Env baru:

| Env                            | Default | Arti                                              |
| ------------------------------ | ------- | ------------------------------------------------- |
| `SNAPYOS_PRINTER_AUTO_ENABLE`  | `1`     | Buka printer `disabled` sekali sebelum submit     |
| `SNAPYOS_PRINT_RETRY_MAX`      | `3`     | Maksimum retry transien (0 = matikan)             |
| `SNAPYOS_PRINT_RETRY_BASE_MS`  | `5000`  | Backoff dasar; `min(2^n × base, 2 m)` ± jitter    |
| `CUPSENABLE_BIN`               | `cupsenable` | Binary untuk membuka printer                 |

Retry hanya untuk kegagalan transien (`disabled/offline/busy/timeout`). Job
`submitted`/`done` tidak pernah dikirim ulang; `dedupe_key` mencegah cetak ganda.

## Kontrol kamera gphoto2

| Rute                     | Isi                                                              |
| ------------------------ | ---------------------------------------------------------------- |
| `GET /v1/camera/status`  | `connected`, `model`, `port`, `last_error`                       |
| `GET /v1/camera/config`  | allowlist: `iso`, `shutterspeed`, `f-number`/`aperture`, `whitebalance`, `imagequality`, `capturetarget`, `output`, `focusmode`, `flashmode` |
| `PUT /v1/camera/config`  | body `{ settings }`; key di luar allowlist → `400 CAMERA_CONFIG_NOT_ALLOWED` |
| `POST /v1/camera/reset`  | `gphoto2 --reset`, dibatasi 1×/10 detik                          |

Nilai `RADIO`/`MENU` divalidasi terhadap `Choice`; key readonly ditolak. Jika
satu key gagal, error menyebut key dan pilihan yang tersedia (tanpa rollback).

Preview yang gagal 10× berturut-turut membuat `status().connected = false` dan
`GET /camera/preview` menjawab `503` dengan pesan actionable. Capture tetap
bisa dicoba. Di Linux, user service harus berada di grup `plugdev`/`lp`; bila
perlu nonaktifkan `gvfs-gphoto2-volume-monitor` yang mengunci USB.

## Katalog kamera

Halaman publik `/kamera` memakai snapshot `src/data/gphoto2-cameras.json`.
Perbarui manual sebelum rilis:

```bash
npm run sync:cameras
npm run sync:cameras -- --check
```

Sumber lokal `print-camera-list json|html` (fallback halaman gphoto.org).
Ringkasan ada di `docs/17-supported-cameras.md`; jangan menyalin seluruh
katalog ke dokumen. Untuk daftar mentah di mesin booth: `gphoto2 --list-cameras`
atau `print-camera-list json`.
