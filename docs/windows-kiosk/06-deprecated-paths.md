# Windows Kiosk: Deprecated Paths

Status: active  
Audience: developer, operator, admin  
Last updated: 2026-11-01  
Last verified: 2026-11-01  
Source of truth: `docs/windows-kiosk/00-scope.md`, `docs/windows-kiosk/04-current-state.md`, `docs/windows-kiosk/05-migration-map.md`, source path pada tabel

Dokumen ini membedakan jalur yang benar-benar legacy dari jalur yang masih aktif tetapi tidak cocok menjadi target Windows native. Tidak ada source code yang dihapus pada audit ini.

## 1. Jalur yang tidak boleh menjadi target baru

| Path atau pola                                                         | Status                                | Alasan                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Browser kiosk PWA sebagai produk Windows utama                         | deprecated for Windows target         | Scope baru menetapkan full WPF Kiosk. PWA tetap compatibility surface selama transisi, bukan target akhir.                            |
| `localStorage` sebagai penyimpanan device token native                 | deprecated for Windows target         | Token bearer jangka panjang harus memakai protected storage Windows; current activation flow belum terlihat menulis token ke runtime. |
| IndexedDB `finalize-queue` sebagai owner queue sesi lokal              | deprecated for Windows local sessions | Runtime SQLite sudah memiliki `local_*`, capture, finalize queue, dan sync worker. Dua owner queue berisiko split-brain.              |
| `src/components/kiosk/offline-queue.ts` untuk sesi `local_*`           | compatibility only                    | File sendiri menyatakan sesi `local_*` diselesaikan runtime. WPF harus memakai satu service queue.                                    |
| Browser `getUserMedia` sebagai adapter kamera Windows native           | deprecated for Windows target         | Hardware rewrite .NET mengambil ownership kamera. Browser path dipertahankan hanya untuk compatibility.                               |
| Browser `window.print()` sebagai jalur auto-print utama Windows        | deprecated for Windows target         | WPF/runtime harus mengendalikan printer Windows dan status submit secara eksplisit.                                                   |
| CUPS sebagai default printer Windows                                   | not target                            | `runtime/config.ts` sudah memilih Windows printer pada Windows; CUPS tetap jalur Linux compatibility.                                 |
| `gphoto2`, `libcamera`, `v4l2`, `pyav` sebagai default Windows adapter | not target                            | Adapter dipertahankan untuk platform lain atau compatibility, bukan default Windows.                                                  |
| `src/server/catalog.ts` sebagai installer catalog                      | forbidden reuse                       | Domainnya plans dan add-ons publik. Reuse akan mencampur katalog bisnis dengan artifact release.                                      |
| Payment gateway langsung dari runtime lokal                            | forbidden                             | QRIS online wajib cloud-only; credential dan settlement tidak boleh pindah ke booth.                                                  |
| Customer self-confirm cash                                             | forbidden                             | Cash memerlukan operator berwenang dan audit actor.                                                                                   |
| Auto-update service                                                    | forbidden by product decision         | Installer manual adalah kontrak eksplisit.                                                                                            |
| Manual `SNAPYOS_DEVICE_TOKEN` environment setup sebagai pairing flow   | migration gap                         | Runtime sync bergantung pada environment, tetapi activation cloud belum terlihat mengisi persistence runtime.                         |
| Export/import tanpa caller Control Center                              | incomplete path                       | `exportStore` dan `importStore` tersedia, tetapi UI owner/operator yang menjalankannya belum ditemukan.                               |

## 2. Jalur yang deprecated secara historis di cloud

### 2.1 Aggregator Pakasir untuk transaksi kiosk

Jalur aggregator platform untuk dana transaksi kiosk sudah dihapus dari alur resmi. Payment kiosk aktif memakai direct merchant credential owner bila online. Env `PAKASIR_*` tersisa untuk invoice subscription dan bukan target integrasi Windows kiosk.

Bukti:

- `docs/06-checkout-payment.md` menyatakan direct merchant owner-first.
- `src/server/payment/qris.ts` memperlakukan cabang aggregator sebagai legacy in-flight.
- `src/server/payment/checkout-shared.ts` memuat credential per business.

### 2.2 Hash SHA-256 lama untuk exit PIN

Hash exit PIN lama tidak direhash otomatis. `verifyDevicePin` menolak format non-Argon2id. Owner harus mengatur ulang PIN melalui jalur settings.

Bukti:

- `src/lib/device-token.ts`
- `db/migrations/0034_photobox_exit_pin_throttle.sql`

### 2.3 Pengaturan kiosk yang hanya dikirim dari cloud

Appearance booth lokal tidak boleh dikirim sebagai settings cloud bersama camera, print, dan session. `appearance_settings` adalah local-only. Jalur lama yang mencoba menggabungkannya ke write-back cloud harus dianggap deprecated.

Bukti:

- `src/lib/device-settings-contract.ts`
- `runtime/settings/index.ts`
- `runtime/sync/worker.ts`

## 3. Jalur aktif, jangan deprecated-kan sebelum replacement

| Jalur                                                                      | Kenapa masih aktif                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /api/v1/public/devices/activate` dan verify                          | Cloud tetap authority pairing dan device status.                                                    |
| `resolveActiveDevice`                                                      | Memastikan token, business, photobox, status, dan heartbeat.                                        |
| `runtime/settings/index.ts`                                                | Menjadi referensi ownership dan merge saat port ke .NET.                                            |
| `runtime/session/index.ts`                                                 | Menjadi referensi local session dan media manifest.                                                 |
| `runtime/sync/worker.ts`                                                   | Menjadi referensi idempotency, retry, dan quarantine.                                               |
| `runtime/print/index.ts` Windows adapter                                   | Menjadi bukti kebutuhan printer Windows, meski implementasinya nanti .NET.                          |
| `src/server/templates.ts` dan `src/lib/template-fit.ts`                    | Menjadi referensi template legacy dan slot layout.                                                  |
| `src/server/payment/qris.ts`                                               | Menjadi authority cloud untuk status payment dan recovery.                                          |
| `src/server/cash-payment.ts`                                               | Menjadi authority permission operator untuk cash confirmation.                                      |
| `business_settings.branding`, `photoboxes.branding`, `appearance_settings` | Read/import compatibility sampai WPF migration selesai; dashboard editor tidak menjadi jalur tulis. |
| `devices.diagnostics`, `device_status`, `app_version`                      | Sumber status/versi yang sudah ada; tidak ada cloud diagnostics/version endpoint baru.              |
| `runtime/exit/index.ts`                                                    | Emergency exit offline diperlukan agar operator tidak terkunci.                                     |
| `runtime/camera/digicamcontrol.ts`                                         | Windows adapter tetap compatibility sampai test host tersedia.                                      |

## 4. Replacement rule

Jalur deprecated hanya boleh dihapus setelah semua syarat berikut terpenuhi:

1. WPF Kiosk sudah menjalankan flow customer pada Windows 10 dan Windows 11.
2. WPF Control Center sudah menjalankan setup, health, branding lokal, cash confirmation, export/import, dan recovery.
3. .NET runtime sudah memiliki parity kamera, printer, SQLite, session, sync, dan emergency exit.
4. Migrasi queue sudah satu owner dan tidak kehilangan sesi atau media.
5. Payment QRIS tetap diverifikasi cloud dan offline cash tetap diaudit operator.
6. Activation cloud mengisi protected runtime token storage dan restart/revoke sudah teruji.
7. Installer manual dan rollback sudah teruji.
8. Compatibility traffic menunjukkan tidak ada kiosk aktif yang masih bergantung pada path lama.

## 5. Batas evidence

Tidak ditemukan project WPF, source C#, manifest installer, entity installer catalog, route installer upload/download, checksum release, atau auto-update service pada path source yang diaudit. Codebase-mcp tidak tersedia pada sesi ini, sehingga pernyataan tersebut dibatasi pada pencarian source `src`, `runtime`, `db`, migration, dan file installer yang terlihat di repository, bukan klaim graph repository-wide.
