# Windows Kiosk: Migration Map

Status: active  
Audience: developer, owner, operator, admin  
Last updated: 2026-11-01  
Last verified: 2026-11-01  
Source of truth: `docs/windows-kiosk/00-scope.md`, `docs/windows-kiosk/01-architecture.md`, `docs/windows-kiosk/04-current-state.md`, source path pada tabel

## 1. Prinsip migrasi

Migrasi memindahkan ownership dari browser plus Node.js bridge ke satu aplikasi Windows native berbasis WPF dan runtime hardware .NET. Cloud route dan database yang sudah berjalan tidak diubah sebagai bagian audit ini. Adapter cloud tetap menjadi boundary sampai kontrak WPF baru siap.

Aturan migrasi:

- Satu PC tetap satu booth.
- Satu owner queue untuk sesi dan output final.
- SQLite hanya metadata.
- Output final dikirim setelah finalize lokal sukses.
- QRIS tetap cloud-only.
- Offline hanya tunai operator.
- Branding appearance tetap lokal per booth.
- Tidak ada auto-update.
- Migrasi tidak menghapus route lama sebelum pengganti terbukti setara.

## 2. Peta komponen

| Current                                                 | Target Windows                                 | Keputusan                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Kiosk PWA dan komponen `src/components/kiosk/*`         | WPF Windows Kiosk                              | Port flow, state, copy, dan acceptance. Jangan port DOM atau browser API satu per satu.                   |
| `runtime/main.ts`                                       | .NET Worker atau Windows service lokal         | Pertahankan boundary kamera, printer, settings, session, dan sync. Implementasi Node.js diganti bertahap. |
| `runtime/camera/*`                                      | .NET camera adapter layer                      | Pertahankan kontrak stills, stream, status, connected, error.                                             |
| `runtime/print/index.ts`                                | .NET Windows print adapter                     | Pertahankan health, submit, `submitted` versus `completed`, test print.                                   |
| `runtime/db/*`                                          | SQLite repository .NET                         | Pertahankan schema intent, migration version, WAL, metadata-only.                                         |
| `runtime/settings/*`                                    | Settings service Control Center                | Pertahankan ownership validation, merge, export, import, redaction.                                       |
| `runtime/session/*`                                     | Local session service .NET                     | Pertahankan `local_*`, idempotency capture, media manifest, finalize queue.                               |
| `runtime/sync/worker.ts`                                | Background sync worker .NET                    | Pertahankan idempotency, retry, quarantine, cloud ID persistence, dan no blocking hardware.               |
| `runtime/exit/*`                                        | Local emergency exit service                   | Pertahankan Argon2id, throttle, persistence, audit event, dan fail-closed tanpa PIN.                      |
| `src/server/devices.ts`                                 | Cloud contract client + local device identity  | Pairing tetap cloud; token storage lokal diproteksi OS, bukan localStorage.                               |
| `src/server/branding.ts`                                | Cloud branding client + local appearance store | Branding global fallback dari cloud; override booth lokal tidak dipush.                                   |
| `src/server/payment/qris.ts`                            | Cloud payment client                           | QRIS tidak dipindah ke lokal. Status paid hanya dari cloud.                                               |
| `src/server/cash-payment.ts`                            | Operator cash flow di Control Center           | Offline cash menjadi local pending, lalu operator confirmation dan reconciliation cloud saat tersedia.    |
| `src/server/templates.ts` dan `src/lib/template-fit.ts` | Template cache dan renderer WPF                | Template metadata dapat di-cache; output render tetap diverifikasi terhadap cloud contract.               |
| `src/server/catalog.ts`                                 | Tetap katalog plan/add-on                      | Jangan gunakan sebagai installer catalog. Buat contract installer terpisah pada pekerjaan berikutnya.     |

## 3. Fase migrasi

### M0: Kontrak dan observability

Target:

- Kunci schema metadata SQLite Windows.
- Kunci device identity satu booth satu PC.
- Kunci jalur activation cloud ke protected token storage runtime; jangan bergantung pada `localStorage` atau environment manual untuk target WPF.
- Kunci format local session, output manifest, queue state, dan event audit.
- Kunci satu owner queue untuk IndexedDB legacy dan SQLite runtime.
- Kunci IPC lokal WPF ke runtime .NET.
- Kunci installer manifest, checksum, target Windows, dan rollback marker.

Exit criteria:

- Tidak ada field cloud secret di export.
- Hasil activation dapat disimpan ke protected runtime storage tanpa copy manual environment.
- Semua state queue dapat dipulihkan setelah restart dari satu owner queue.
- Health state dapat membedakan runtime, kamera, printer, cloud, token, dan disk.

### M1: .NET hardware runtime

Target:

- Port camera adapter contract.
- Port Windows printer adapter.
- Port settings, status, test capture, dan test print.
- Port emergency PIN.
- Jalankan satu runtime lokal untuk satu booth.

Exit criteria:

- Kamera preview gagal tidak memblokir still capture.
- Printer `submitted` tidak disebut `completed` tanpa bukti.
- Bridge token tidak keluar pada log atau UI customer.
- Existing PWA masih dapat memakai compatibility endpoint selama masa transisi.

### M2: Local session dan output

Target:

- Port local session, capture idempotency, finalize manifest, photo strip, GIF, dan auto-print.
- Pilih satu queue owner. Rekomendasi: .NET runtime menjadi owner queue untuk sesi `local_*`; WPF hanya mengirim command dan membaca status.
- Simpan media sementara di direktori aplikasi dengan policy retention lokal.

Exit criteria:

- Restart tidak menggandakan capture atau finalize.
- Disk penuh memberi error sebelum data loss.
- Final output dapat direkonstruksi dari manifest.

### M3: WPF Kiosk

Target:

- Port customer flow dari package sampai result.
- Port camera state, payment state, session timer, edit state, print state, dan sync state.
- QRIS memakai cloud client.
- Offline hanya tunai operator.

Exit criteria:

- Sesi tidak terbuka sebelum paid cloud atau cash operator confirmation.
- QRIS unavailable saat cloud unavailable.
- Output final lokal tetap dapat dicetak dan diantrekan.
- QR result hanya ditampilkan jika token result tersedia atau status queue dijelaskan jujur.

### M4: WPF Control Center

Target:

- Setup wizard kamera dan printer.
- Branding lokal per booth.
- Cash confirmation operator.
- Queue dashboard, quarantine review, device reset, export/import, dan health.
- Versi terpasang serta installer download manual.

Exit criteria:

- Operator dapat pulih dari kamera mati, printer mati, cloud mati, dan disk penuh tanpa developer.
- Control Center tidak menjadi jalur customer.
- Aksi finansial memiliki actor dan audit event.

### M5: Installer catalog dan manual release

Target:

- Admin upload artifact installer.
- Admin mengisi version, channel, target OS, runtime compatibility, checksum, size, release notes, dan availability.
- Owner melihat versi terpasang serta versi yang kompatibel.
- Owner mengunduh dan menjalankan installer manual.

Exit criteria:

- Checksum diverifikasi sebelum install.
- Backup metadata dan rollback manual dijelaskan.
- Tidak ada service auto-update atau install background.

## 4. Boundary yang dipertahankan

Cloud route yang tetap menjadi boundary:

- `POST /api/v1/public/devices/activate`
- `POST /api/v1/public/devices/verify`
- `POST /api/v1/public/devices/exit`
- `PATCH /api/v1/public/devices/settings`
- `POST /api/v1/public/:businessSlug/payments/create`
- `GET /api/v1/public/:businessSlug/payments/:paymentRef/status`
- `POST /api/v1/public/:businessSlug/payments/cash-confirm`
- `POST /api/v1/public/:businessSlug/sessions`
- `POST /api/v1/public/:businessSlug/sessions/:id/finalize`
- `GET /api/v1/public/:businessSlug/templates`

Nama route di atas adalah current cloud contract. Implementasi WPF harus membungkusnya dalam client typed dan tidak menyalin aturan bisnis harga, voucher, payment, atau result ke UI.

## 5. Migration risks

- Dua queue, IndexedDB dan SQLite, dapat menghasilkan state yang berbeda. Hilangkan salah satu owner sebelum pilot.
- Device token `localStorage` tidak cukup untuk Windows native. Gunakan proteksi credential OS atau storage terenkripsi aplikasi.
- `src/server/kiosk-sessions.ts` masih memakai session UUID cloud, sedangkan runtime memakai `local_*`. Mapping harus eksplisit.
- Template slot menentukan jumlah capture, tetapi jalur cloud masih memiliki kompatibilitas template legacy. Renderer WPF wajib menguji keduanya.
- Printer Windows saat ini mengandalkan executable eksternal SumatraPDF. Port .NET perlu keputusan apakah tetap memakai helper atau memakai Windows print API.
- Branding cloud memakai signed URL. Cache lokal Windows harus memiliki expiry dan fallback yang jelas.
- Offline cash saat reconnect harus direkonsiliasi tanpa membuat transaksi kedua.
- digiCamControl saat ini hanya terbukti sebagai konfigurasi Windows, belum melalui validasi runtime pada Windows host.
- Export/import runtime belum memiliki caller UI yang terverifikasi; Control Center perlu menjadi owner eksplisit untuk operasi ini.

## 6. Do not migrate yet

- Jangan mengubah cloud route, database, atau UI existing dalam scope audit.
- Jangan membuat installer catalog di `src/server/catalog.ts`; file tersebut sudah memiliki domain katalog berbeda.
- Jangan menyimpan binary installer dalam SQLite.
- Jangan memindahkan QRIS ke runtime lokal.
- Jangan menggabungkan branding lokal dengan branding cloud menjadi satu payload write-back.
