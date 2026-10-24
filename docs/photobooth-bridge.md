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
