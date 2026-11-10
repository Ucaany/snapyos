# Windows Kiosk dan Control Center: Scope

Status: paused (2026-11-08) — Windows native dibekukan; target aktif = PWA Android/web
Audience: owner, admin, operator, developer  
Last updated: 2026-11-08
Last verified: 2026-11-01

Source of truth: keputusan produk sesi ini, `AGENTS.md`, `DESIGN.md`, `docs/03-architecture.md`, `docs/05-customer-photobox.md`, `runtime/settings/index.ts`, `runtime/sync/worker.ts`

> **FREEZE 2026-11-08:** Windows WPF (Kiosk + Control Center) ditahan. Target distribusi aktif adalah PWA kiosk Android/web (Add to Home Screen, tanpa TWA/APK/Play Store). Dokumen ini disimpan sebagai status historis; kode `windows/` tidak dihapus.

## 1. Tujuan

SnapyOS Windows Kiosk menjalankan satu booth photobox pada satu PC Windows 10 atau Windows 11. Aplikasi pelanggan berjalan fullscreen. Control Center dipakai operator untuk setup, status perangkat, branding lokal, transaksi tunai, printer, kamera, serta pengambilan installer.

Keputusan utama:

- Full WPF untuk Windows Kiosk dan Control Center.
- Rewrite hardware runtime ke .NET.
- Local-first. Booth tetap dapat menyelesaikan pekerjaan lokal saat cloud tidak tersedia.
- SQLite hanya menyimpan metadata operasional dan status sinkronisasi. Media foto tetap di storage lokal sementara, lalu diproses sesuai kebijakan output.
- Cloud hanya menerima output final setelah sesi sukses.
- QRIS online melalui cloud.
- Offline hanya tunai operator. Offline tidak membuat QRIS lokal.
- Branding lokal per booth.
- Output: photo strip, GIF, QR result, dan auto-print.
- Satu PC menjalankan satu booth.
- Installer dibuat manual dan dipasang manual.
- Katalog installer dan signed download tetap dibaca untuk kompatibilitas.
- Owner melihat versi dan unduh installer dari Manajemen Perangkat.
- Mutasi katalog installer dan editor branding dashboard tidak lagi tersedia; import WPF tetap dipertahankan.
- Tidak ada auto-update.

## 2. In scope

### 2.1 Windows Kiosk

- Pairing device dengan booth.
- Welcome, package, pembayaran, template, kamera, review, edit, finalize, output, dan reset sesi.
- Capture kamera USB atau DSLR melalui adapter .NET.
- Photo strip dan GIF dari output sesi sukses.
- QR menuju result cloud.
- Auto-print melalui printer Windows.
- Mode offline untuk capture, edit, finalize lokal, dan antrean sync.
- Penguncian fullscreen serta jalur keluar operator.

### 2.2 Control Center

- Setup kamera dan printer.
- Health check kamera, printer, runtime, storage, dan koneksi cloud.
- Test capture dan test print.
- Pengaturan sesi, output, dan hardware.
- Branding lokal per booth.
- Daftar permintaan tunai yang menunggu konfirmasi operator.
- Sinkronisasi manual dan status antrean.
- Informasi versi aplikasi dan runtime.
- Unduh installer yang tersedia dari katalog admin.

### 2.3 Admin dan owner

- Admin mengunggah metadata katalog installer, paket installer, checksum, versi, dan catatan rilis.
- Owner melihat versi yang tersedia lalu mengunduh installer secara manual.
- Upgrade dijalankan oleh owner atau operator melalui prosedur manual.
- Sistem tidak menginstal, mengganti, atau menjalankan upgrade otomatis.

## 3. Out of scope

- macOS, Linux, Android, iOS, dan browser kiosk sebagai target produk Windows.
- Satu PC untuk beberapa booth.
- Auto-update, silent update, atau background installer.
- QRIS offline.
- Pembayaran online tanpa koneksi cloud.
- Penyimpanan foto final sebagai metadata SQLite.
- Transfer branding lokal booth ke booth lain secara otomatis.
- Sinkronisasi media sebelum sesi sukses.
- Payment gateway langsung dari aplikasi lokal tanpa cloud.

## 4. Batas kontrak

- Cloud menjadi source of truth untuk harga, package, payment, result token, katalog installer, dan versi rilis.
- Booth menjadi source of truth sementara untuk sesi lokal, status hardware, antrean output, dan konfigurasi lokal booth.
- Payment QRIS hanya sah setelah cloud mengonfirmasi pembayaran.
- Tunai offline harus dikonfirmasi operator berwenang. Kiosk tidak boleh mengonfirmasi tunai sendiri.
- Sesi sukses adalah sesi yang sudah memenuhi syarat finalize lokal. Hanya output final sesi tersebut yang boleh dikirim ke cloud.
- `appearance_settings` tetap lokal per booth. Field cloud tidak boleh ditimpa oleh konfigurasi mesin.

## 5. Bukti codebase yang dipakai

- `runtime/settings/index.ts` memisahkan field milik device dari field milik cloud, menyaring secret, serta mempertahankan appearance sebagai konfigurasi lokal.
- `runtime/sync/worker.ts` membuat sesi cloud secara idempoten, mengirim finalize sesudahnya, memakai retry, dan mengarantina media jika cloud menolak sesi kedaluwarsa.
- `runtime/camera/index.ts` memakai adapter peran stills dan stream.
- `runtime/print/index.ts` sudah memodelkan adapter Windows dan status `submitted` yang tidak disamakan dengan kertas selesai tercetak.
- `src/lib/device-settings-contract.ts` memisahkan grup camera, print, session, dan appearance.
- `src/server/cash-payment.ts` mewajibkan otorisasi operator untuk konfirmasi tunai.

## 6. Kriteria selesai scope

- Semua flow inti dapat dijalankan pada Windows 10 dan Windows 11 dengan satu PC satu booth.
- Booth tetap dapat capture, edit, finalize, print, dan menaruh output pada antrean lokal saat cloud mati.
- QRIS gagal tertutup dengan pesan yang jelas saat cloud tidak tersedia.
- Output final yang tersinkron tidak menggandakan sesi atau payment.
- Owner dapat melihat versi dan mengunduh installer, tetapi tidak ada auto-update.
- Konfigurasi branding satu booth tidak mengubah booth lain.
