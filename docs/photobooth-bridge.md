# Bridge kamera dan printer SnapyOS

## Batas deployment

`gphoto2` dan CUPS harus berjalan di komputer kiosk yang terhubung USB ke DSLR
dan printer. Vercel hanya menjalankan aplikasi Next.js dan tidak mempunyai akses
ke USB atau daemon CUPS. Kiosk memanggil bridge lokal melalui
`http://127.0.0.1:17777`; URL bridge tidak boleh diarahkan ke endpoint publik.

## Instalasi kiosk

Jalankan dari root project pada komputer kiosk:

```bash
bash scripts/install-photobooth-bridge.sh
gphoto2 --auto-detect
lpstat -p -d
npm run bridge:gphoto2
```

Untuk Linux yang memakai systemd, salin
`scripts/photobooth-bridge.service.example` ke unit service, sesuaikan
`PHOTOBOOTH_BRIDGE_ORIGINS` dan path project, lalu aktifkan service.

Health check yang harus lulus:

- `GET /health` mengembalikan `ok: true` dan `camera: true` saat DSLR USB
  terdeteksi.
- `GET /printer/health` mengembalikan `ok: true` dan printer CUPS enabled.
- `POST /camera/capture` mengembalikan JPEG satu kali per shutter.
- `POST /print` membentuk PDF per sheet, mempertahankan ukuran kertas,
  orientasi, margin, dan mengirim `fit-to-page` ke CUPS.

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
JPEG lalu exit non-zero, CUPS geometry 4x6 + margin, printer health, dan blokir
origin asing. Kamera serta cetak fisik tetap wajib diuji pada perangkat kiosk
berkabel; test tiruan tidak menggantikan bukti hardware.
