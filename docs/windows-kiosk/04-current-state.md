# Windows Kiosk: Current State

Status: active  
Audience: developer, owner, operator, admin  
Last updated: 2026-11-01  
Last verified: 2026-11-01  
Source of truth: source code dan migration yang dirujuk per bagian

## 1. Ringkasan

Codebase saat ini memiliki kiosk PWA berbasis browser, cloud backend Next.js, dan runtime lokal Node.js. Sebagian besar kontrak operasional yang dibutuhkan Windows sudah ada secara parsial, tetapi belum menjadi full WPF Kiosk dan WPF Control Center. Hardware runtime juga belum menjadi rewrite .NET.

Status target yang sudah ada:

- Pairing dan device token: ada pada cloud.
- Settings lokal dan export/import: ada pada runtime Node.js.
- Kamera dan printer: adapter runtime ada, termasuk cabang Windows printer.
- Sesi lokal, media lokal, finalize queue, retry, dan sync: ada.
- Branding cloud dan override per-booth: ada, tetapi model lokal saat ini masih bridge settings.
- Payment QRIS online dan cash operator: ada pada cloud.
- Template dan frame: ada pada cloud, termasuk layout slot.
- Installer catalog Windows: tidak ditemukan pada source yang diaudit.
- Full WPF Kiosk dan Control Center: belum ada.
- .NET hardware runtime: belum ada.

## 2. Peta area

| Area                | Current state                                                                                                                                                         | Bukti                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pairing             | Cloud membuat kode aktivasi pendek, sekali pakai, lalu device aktif                                                                                                   | `src/server/devices.ts`, `src/lib/device-token.ts`, `src/app/api/v1/business/[businessId]/photoboxes/[id]/activation/route.ts`, `db/migrations/0030_atomic_device_activation.sql` |
| Pairing persistence | Belum tersambung penuh: browser menyimpan `snapyos_device_token` di `localStorage`, sedangkan runtime hanya membaca `SNAPYOS_DEVICE_TOKEN` dari environment           | `src/components/kiosk/KioskApp.tsx`, `runtime/config.ts`, `runtime/sync/worker.ts`                                                                                                |
| Device token        | Token asli diberikan ke device; cloud menyimpan hash SHA-256; request memanggil `resolveActiveDevice`                                                                 | `src/lib/device-token.ts`, `src/server/devices.ts`                                                                                                                                |
| Device identity     | Cloud mencatat heartbeat; runtime juga membawa slug booth dan business pada `/v1/status`                                                                              | `src/server/devices.ts`, `src/lib/device-online.ts`, `runtime/main.ts`                                                                                                            |
| Branding            | Branding bisnis disimpan cloud, asset private memakai signed URL, halaman kiosk dapat di-override per layar                                                           | `src/server/branding.ts`, `src/server/branding-actions.ts`, `src/lib/branding-pages.ts`, `src/lib/validators.ts`                                                                  |
| Local settings      | Runtime menyimpan `camera_settings`, `print_settings`, `session_settings`, `appearance_settings` di SQLite                                                            | `runtime/db/schema.ts`, `runtime/settings/index.ts`                                                                                                                               |
| Settings ownership  | Field cloud ditolak; appearance lokal tidak dipush; merge device dan cloud per field                                                                                  | `src/lib/device-settings-contract.ts`, `src/lib/booth-settings-payload.ts`, `runtime/settings/index.ts`, `runtime/sync/worker.ts`                                                 |
| Export/import       | Runtime dapat export settings dan meta; secret PIN emergency dibuang dan tidak boleh diimport. Caller UI export/import belum ditemukan                                | `runtime/db/index.ts`, `runtime/settings/index.ts`, `src/components/kiosk/local-runtime.ts`                                                                                       |
| PIN cloud           | Exit PIN photobox memakai Argon2id dan throttle lima gagal lalu lock lima menit                                                                                       | `src/server/devices.ts`, `src/lib/device-token.ts`, `db/migrations/0034_photobox_exit_pin_throttle.sql`                                                                           |
| PIN lokal           | Emergency PIN runtime disimpan di SQLite meta, tidak ikut export, lock bertahan restart                                                                               | `runtime/exit/index.ts`, `runtime/db/index.ts`                                                                                                                                    |
| Camera              | Factory mendukung `digicamcontrol`, `gphoto2`, `libcamera`, `v4l2`, `pyav`, dan mock; stills dan stream dapat berbagi atau dipisah                                    | `runtime/camera/index.ts`, `runtime/camera/types.ts`, `runtime/config.ts`                                                                                                         |
| Printer             | Factory mendukung Windows, CUPS, dan mock. Windows memakai PowerShell dan SumatraPDF                                                                                  | `runtime/print/index.ts`, `runtime/config.ts`                                                                                                                                     |
| Payment online      | Cloud membuat, memeriksa, dan settle payment melalui credential provider; kiosk memulihkan status melalui route status                                                | `src/server/payment/checkout-shared.ts`, `src/server/payment/qris.ts`, `src/app/api/v1/public/[businessSlug]/payments/[paymentRef]/status/route.ts`                               |
| Payment cash        | Pending cash dikonfirmasi operator dengan permission `payment:confirm`; cash tidak withdrawable                                                                       | `src/server/cash-payment.ts`, `src/server/payment/qris.ts`, `src/app/api/v1/public/[businessSlug]/payments/cash-confirm/route.ts`                                                 |
| Session cloud       | Pay-first, device auth, timer server-side, auto-finalize, result token, dan kapasitas satu sesi per booth                                                             | `src/server/kiosk-sessions.ts`, `src/app/api/v1/public/[businessSlug]/sessions/route.ts`                                                                                          |
| Session lokal       | ID `local_*`, package snapshot, capture idempotency, file path, finalize queue, dan abort                                                                             | `runtime/session/index.ts`, `runtime/db/index.ts`, `runtime/db/schema.ts`                                                                                                         |
| Media cloud         | Foto dan GIF final masuk bucket `generated-photos`; retention menghapus object dan menandai media cleaned                                                             | `src/server/kiosk-sessions.ts`, `src/lib/r2/areas.ts`, `src/app/api/cron/retention/route.ts`, `db/schema.sql`                                                                     |
| Media lokal         | Capture dan finalize ditulis ke data directory runtime; queue menyimpan path dan manifest                                                                             | `runtime/session/index.ts`, `runtime/sync/worker.ts`                                                                                                                              |
| Sync                | Worker membuat sesi cloud idempoten, menyimpan cloud ID segera, finalize, retry dengan jitter, dan quarantine                                                         | `runtime/sync/worker.ts`, `runtime/main.ts`                                                                                                                                       |
| Template            | Owner dan admin mengelola frame; layout slot menentukan capture count; signed URL dan thumbnail tersedia                                                              | `src/server/templates.ts`, `src/server/catalog-actions.ts`, `src/lib/template-fit.ts`                                                                                             |
| Installer catalog   | Tidak ada route, entity, action, atau file installer catalog yang ditemukan. `catalog.ts` hanya plans dan add-ons publik                                              | `src/server/catalog.ts`, `src/server/catalog-actions.ts`                                                                                                                          |
| Windows-specific    | Default runtime Windows memilih digiCamControl dan printer Windows; PowerShell dan SumatraPDF sudah didukung. digiCamControl path belum dibuktikan lewat test Windows | `runtime/config.ts`, `runtime/print/index.ts`, `runtime/camera/digicamcontrol.ts`                                                                                                 |
| WPF                 | Tidak ada project WPF, `.csproj`, XAML, atau C# source pada scope source yang diaudit                                                                                 | pencarian source `src`, `runtime`, `db`, dan file installer                                                                                                                       |
| .NET rewrite        | Belum ada implementasi .NET hardware runtime                                                                                                                          | pencarian source `src`, `runtime`, `db`, dan file installer                                                                                                                       |

## 3. Flow aktual

### 3.1 Online

1. Device diaktifkan melalui cloud.
2. Kiosk memanggil cloud dengan device token.
3. Customer memilih package dan payment.
4. Cloud menetapkan payment status.
5. Sesi cloud dibuat setelah paid.
6. Capture dan finalize dikirim ke cloud, atau lewat runtime lokal bila bridge aktif.
7. Cloud membuat output, GIF, result token, dan signed download URL.
8. Printer bridge dapat mengirim pekerjaan cetak.

### 3.2 Offline

1. Runtime lokal membuat sesi `local_*`.
2. Capture ditulis ke filesystem lokal dan metadata masuk SQLite.
3. Finalize membuat `finalize_queue` dan manifest JSON.
4. Worker menunggu cloud dan mengirim create session lalu finalize.
5. Saat gagal sementara, queue tetap ada dan dijadwalkan ulang.
6. Saat cloud menolak permanen, media disalin ke quarantine sebelum metadata sesi dihapus.

Batas penting: offline cloud path di `src/components/kiosk/offline-queue.ts` memakai IndexedDB untuk sebagian sesi, sedangkan sesi `local_*` diselesaikan oleh runtime worker. Ini berarti migrasi Windows harus memilih satu owner queue, bukan mempertahankan dua queue sebagai source of truth.

## 4. Temuan penting

- Runtime sudah memiliki fondasi Windows printer, tetapi runtime utama masih Node.js.
- `runtime/config.ts` mengandung default path Windows dan executable Windows, bukan aplikasi Windows native.
- Aktivasi cloud belum memiliki jalur yang terlihat untuk menulis token hasil aktivasi ke konfigurasi runtime; sync runtime bergantung pada `SNAPYOS_DEVICE_TOKEN` environment.
- Browser menyimpan token device di `localStorage`, tidak cocok sebagai persistence target WPF native.
- Branding cloud sudah kuat, tetapi appearance lokal hanya hidup pada runtime settings dan belum menjadi model Control Center WPF.
- Export/import runtime tidak membawa emergency PIN, sesuai batas keamanan. Caller UI export/import belum ditemukan. Pairing token dan cloud credential tidak boleh ditambahkan ke export tanpa kontrak baru.
- Ada dua jalur queue: IndexedDB untuk sebagian offline cloud flow dan SQLite runtime untuk `local_*`; ownership harus disatukan sebelum pilot.
- Sync worker tidak berjalan tanpa `SNAPYOS_CLOUD_URL` atau `SNAPYOS_DEVICE_TOKEN`; kondisi ini harus tampil sebagai state operasional, bukan silent gap.
- `src/server/catalog.ts` adalah katalog plan dan add-on, bukan katalog installer.
- Tidak ditemukan implementasi installer, checksum catalog, download version owner, atau manual upgrade flow.
- Tidak ditemukan implementasi WPF atau C#.

## 5. Batas audit

Codebase-mcp diminta pada verify tier. Tool MCP tersebut tidak terekspos pada sesi audit, sehingga `list_projects`, `index_status`, `search_graph`, `search_code`, `trace_path`, `detect_changes`, dan `check_index_coverage` tidak dapat dijalankan. Temuan di atas berasal dari source search, pembacaan file target, dan pencarian caller langsung. Tidak ada klaim graph coverage atau completeness di luar scope path yang dicari.
