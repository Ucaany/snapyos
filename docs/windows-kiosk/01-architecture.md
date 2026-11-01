# Windows Kiosk dan Control Center: Architecture

Status: active  
Audience: developer, operator, admin  
Last updated: 2026-11-01  
Last verified: 2026-11-01  
Source of truth: `docs/windows-kiosk/00-scope.md`, `runtime/main.ts`, `runtime/settings/index.ts`, `runtime/sync/worker.ts`, `runtime/camera/`, `runtime/print/`, `src/lib/device-settings-contract.ts`

## 1. Bentuk sistem

```text
+----------------------- PC Windows 10/11 ------------------------+
|                                                                  |
|  WPF Windows Kiosk       WPF Control Center       .NET Runtime   |
|  customer flow            operator flow             hardware IPC   |
|       |                         |                    |           |
|       +------------ local authenticated IPC ----------+           |
|                              |                                   |
|                       SQLite metadata                            |
|                              |                                   |
|                 local media and finalize queue                   |
+------------------------------|-----------------------------------+
                               |
                         HTTPS to cloud
                               |
              payment, catalog, result, final output
```

Satu PC hanya memiliki satu konfigurasi booth aktif. Kiosk dan Control Center tidak mengakses hardware secara paralel tanpa arbitrasi runtime. Runtime .NET memegang kamera, printer, antrean lokal, dan health state.

## 2. Komponen

### 2.1 WPF Windows Kiosk

Tanggung jawab:

- Menampilkan flow pelanggan fullscreen.
- Meminta package dan payment dari cloud.
- Menjalankan capture dan edit lokal.
- Menghasilkan photo strip dan GIF lokal.
- Meminta runtime melakukan print.
- Menampilkan QR result setelah finalize cloud berhasil, atau status antrean lokal bila jaringan terputus.
- Tidak menyimpan secret cloud permanen di UI.

### 2.2 WPF Control Center

Tanggung jawab:

- Setup dan diagnosis perangkat.
- Mengelola konfigurasi milik booth.
- Menampilkan status sinkronisasi dan output.
- Mengonfirmasi tunai dengan identitas operator.
- Menampilkan branding lokal.
- Menampilkan versi terpasang dan katalog installer.
- Memulai upgrade manual setelah operator memilih installer.

### 2.3 .NET hardware runtime

Tanggung jawab:

- Adapter kamera stills dan preview.
- Adapter printer Windows.
- Health check perangkat.
- Penyimpanan metadata SQLite.
- Local IPC dengan token dan allowlist origin atau client.
- Finalize queue, retry, idempotency, dan karantina media.

Kontrak runtime mengikuti prinsip yang sudah terlihat pada runtime saat ini:

- Kegagalan preview tidak membatalkan capture.
- `submitted` berarti spooler menerima pekerjaan, bukan kertas sudah keluar.
- Setelan device tidak boleh menimpa field cloud.
- PIN operator dan secret tidak keluar lewat endpoint settings.
- Worker jaringan tidak menghalangi kamera dan printer.

## 3. Penyimpanan lokal

### 3.1 SQLite metadata only

SQLite menyimpan:

- Identitas booth dan device.
- Status pairing dan token yang telah diproteksi.
- Versi schema lokal.
- Setelan kamera, printer, sesi, dan appearance.
- Metadata sesi: ID lokal, cloud ID, package, template, state, timestamp.
- Metadata antrean finalize: attempts, next attempt, last error.
- Status print dan health perangkat.
- Event audit lokal yang diperlukan untuk recovery.

SQLite tidak menjadi penyimpanan foto final. File media sementara dan karantina memakai direktori data aplikasi dengan izin filesystem terbatas.

### 3.2 Kelompok settings

| Grup                  | Pemilik                                | Sinkronisasi                   |
| --------------------- | -------------------------------------- | ------------------------------ |
| `camera_settings`     | device, dengan field cloud tertentu    | boleh ke cloud sesuai kontrak  |
| `print_settings`      | device dan cloud berbagi field berbeda | merge per field                |
| `session_settings`    | device atau cloud sesuai kontrak       | boleh ke cloud                 |
| `appearance_settings` | booth lokal                            | tidak disinkronkan antar booth |

`copies` dan `layout` yang menjadi keputusan produk tidak boleh tertimpa oleh payload lokal bila kontrak cloud menetapkannya sebagai field cloud.

## 4. Local-first dan sync

1. Kiosk membuat sesi lokal.
2. Payment QRIS meminta cloud. Jika tidak ada cloud, QRIS tidak tersedia.
3. Tunai offline membuat permintaan pending lokal untuk operator.
4. Setelah operator mengonfirmasi, sesi dapat berjalan.
5. Capture, edit, finalize, photo strip, dan GIF diproses lokal.
6. Output final ditempatkan pada antrean lokal.
7. Saat cloud tersedia, worker membuat sesi cloud dengan idempotency key.
8. Worker menyimpan cloud ID segera setelah create sukses.
9. Worker mengirim finalize dan output final.
10. Worker menandai `synced_at` hanya setelah finalize cloud berhasil.
11. Penolakan permanen memindahkan media ke karantina sebelum metadata sesi dihapus.

Backoff retry memakai batas atas tetap dan jitter. Worker tidak boleh membuat sesi cloud kedua untuk satu sesi lokal.

## 5. Payment boundary

- QRIS online: WPF meminta cloud membuat payment, menampilkan QR dari response aman, lalu memulihkan status melalui cloud.
- QRIS settlement: cloud memvalidasi provider, amount, reference, dan idempotency. WPF tidak boleh menetapkan `paid` sendiri.
- Tunai offline: WPF mencatat pending. Control Center operator berwenang mengonfirmasi. Status tidak menjadi saldo owner melalui jalur offline.
- Voucher 100 persen: jika cloud mengizinkan, cloud menerbitkan status paid sintetis. Booth tetap tidak menghitung harga sebagai source of truth.
- Saat offline, hanya tunai operator yang tersedia.

## 6. Hardware boundary

Runtime menyediakan kontrak kamera dan printer yang stabil untuk WPF. Implementasi adapter dapat berubah tanpa mengubah flow kiosk.

Kamera:

- Preview dan still capture memiliki status terpisah.
- Provider bridge .NET dapat membungkus webcam, DSLR, atau adapter vendor.
- Device yang tidak tersedia menghasilkan state error dan retry, bukan foto kosong.

Printer:

- Health check dilakukan sebelum submit.
- Auto-print hanya dipanggil untuk output final.
- Status fisik kertas memerlukan konfirmasi operator atau bukti adapter yang sah.
- Print test tersedia dari Control Center.

## 7. Security boundary

- IPC hanya loopback atau channel lokal yang diautentikasi.
- Token bridge tidak ditampilkan pada layar pelanggan.
- Control Center memerlukan jalur operator yang terautentikasi untuk konfirmasi tunai dan tindakan berisiko.
- File installer dikatalogkan dengan versi dan checksum. Verifikasi dilakukan sebelum instalasi manual.
- Cloud credential tidak disimpan sebagai plain text di SQLite.
- Media karantina dipisahkan dari output aktif dan memiliki prosedur recovery.

## 8. Versioning

- Aplikasi memiliki versi produk.
- Runtime memiliki versi kompatibilitas.
- Schema SQLite memiliki versi migrasi.
- Katalog admin menyimpan versi, target Windows, checksum, ukuran, dan catatan rilis.
- Owner melihat versi terpasang dan versi katalog.
- Upgrade manual harus menampilkan rencana rollback atau installer sebelumnya.
- Tidak ada service auto-update.
