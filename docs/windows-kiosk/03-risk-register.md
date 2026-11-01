# Windows Kiosk dan Control Center: Risk Register

Status: active  
Audience: owner, admin, operator, developer  
Last updated: 2026-11-01  
Last verified: 2026-11-01  
Source of truth: keputusan produk sesi ini, `runtime/settings/index.ts`, `runtime/sync/worker.ts`, `runtime/print/index.ts`, `docs/05-customer-photobox.md`, `docs/06-checkout-payment.md`

Skala: kemungkinan dan dampak memakai `rendah`, `sedang`, atau `tinggi`.

| ID    | Risiko                                            | Kemungkinan | Dampak | Kontrol kontrak                                                              | Sinyal dan recovery                                                    | Pemilik    |
| ----- | ------------------------------------------------- | ----------- | ------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| WK-01 | Cloud mati saat booth beroperasi                  | tinggi      | tinggi | Local-first; capture, edit, finalize, dan antrean lokal tetap aktif          | Status offline terlihat; sync otomatis saat pulih                      | Runtime    |
| WK-02 | QRIS dianggap berhasil tanpa verifikasi cloud     | sedang      | tinggi | QRIS hanya online; status paid berasal dari cloud                            | Payment tetap pending atau gagal; jangan buka sesi                     | Payment    |
| WK-03 | Tunai dikonfirmasi customer sendiri               | sedang      | tinggi | Hanya operator berwenang di Control Center yang boleh confirm                | Audit actor; request tetap pending bila auth gagal                     | Operations |
| WK-04 | Satu sesi lokal menjadi dua sesi cloud            | sedang      | tinggi | Idempotency key; simpan cloud ID segera setelah create                       | Retry aman; rekonsiliasi berdasarkan local ID dan cloud ID             | Runtime    |
| WK-05 | Foto pelanggan hilang saat sync terlambat         | sedang      | tinggi | Salin ke karantina sebelum menghapus metadata                                | Alert karantina; recovery manual dari manifest                         | Runtime    |
| WK-06 | Disk lokal penuh                                  | sedang      | tinggi | Health check kapasitas; batas antrean; cleanup terkontrol                    | Block finalize baru; operator ekspor atau hapus sesuai retention       | Operations |
| WK-07 | Printer menerima job tetapi kertas gagal keluar   | sedang      | sedang | `submitted` bukan `completed`; print test dan konfirmasi operator            | Retry atau ganti printer; output digital tetap tersedia bila diizinkan | Hardware   |
| WK-08 | Kamera preview gagal lalu capture ikut diblokir   | sedang      | tinggi | Preview dan capture dipisah; preview gagal tidak membatalkan capture         | Capture retry; tampilkan status kamera                                 | Hardware   |
| WK-09 | Kamera atau printer dipakai dua proses            | sedang      | tinggi | Satu runtime memegang hardware; lock per adapter                             | Control Center menunjukkan busy; tunggu proses selesai                 | Runtime    |
| WK-10 | Branding booth A menimpa booth B                  | sedang      | tinggi | Appearance lokal; tidak dikirim dalam sync cloud                             | Verifikasi booth identity dan slug sebelum save                        | Product    |
| WK-11 | Payload settings menimpa field cloud              | sedang      | tinggi | Validasi field ownership; reject field asing, bukan silent drop              | Error `FIELD_NOT_DEVICE_OWNED`; operator koreksi sumber                | Runtime    |
| WK-12 | Token bridge atau secret bocor lewat UI/log       | rendah      | tinggi | Redaction; token tidak ditampilkan; log tidak menyimpan credential           | Rotate token; revoke device; audit log                                 | Security   |
| WK-13 | Installer palsu atau rusak dipasang               | rendah      | tinggi | Katalog admin, checksum, target Windows, verifikasi sebelum install          | Batalkan install; pertahankan versi aktif; laporkan admin              | Admin      |
| WK-14 | Upgrade manual membuat booth tidak bisa start     | sedang      | tinggi | Backup metadata; schema migration version; installer sebelumnya tersedia     | Rollback manual; buka Control Center recovery                          | Operations |
| WK-15 | Installer salah target Windows                    | rendah      | tinggi | Katalog menyatakan target Windows 10/11 dan kompatibilitas runtime           | Blokir sebelum install; pilih paket kompatibel                         | Admin      |
| WK-16 | PC menjalankan dua booth                          | rendah      | tinggi | Device identity satu booth; lock konfigurasi aktif; pairing mismatch ditolak | Stop launch; reset atau re-pair oleh owner                             | Product    |
| WK-17 | Media lokal tersisa setelah output sukses         | sedang      | sedang | Retention dan cleanup terukur; metadata audit dipertahankan                  | Cleanup terjadwal lokal; operator dapat melihat ruang terpakai         | Runtime    |
| WK-18 | Sync retry menghantam cloud serentak              | sedang      | sedang | Exponential backoff dengan jitter dan cap                                    | Monitor retry count; throttle bila perlu                               | Runtime    |
| WK-19 | Payment atau finalize diulang setelah reload      | sedang      | tinggi | Reference recovery, idempotency, dan state machine cloud                     | Pulihkan state terakhir; jangan membuat payment atau sesi kedua        | Payment    |
| WK-20 | Kontras branding lokal tidak terbaca              | sedang      | sedang | Validasi pasangan foreground/background sebelum save                         | Tolak settings; kembali ke nilai valid terakhir                        | Product    |
| WK-21 | Operator keluar dari fullscreen saat sesi aktif   | sedang      | sedang | Kiosk lock dan jalur keluar operator terautentikasi                          | Kembalikan fullscreen; catat event bila sesi terganggu                 | Operations |
| WK-22 | Katalog installer menampilkan versi tanpa artefak | rendah      | sedang | Publish hanya setelah paket dan checksum tersedia                            | Sembunyikan entri tidak lengkap; admin memperbaiki katalog             | Admin      |

## Prioritas mitigasi sebelum pilot

1. WK-02, WK-03, WK-04, dan WK-05, karena menyentuh uang dan foto pelanggan.
2. WK-06, WK-07, WK-08, dan WK-09, karena langsung mengganggu operasi booth.
3. WK-12, WK-13, WK-14, WK-15, dan WK-16, karena menyentuh keamanan serta pemulihan perangkat.
4. WK-10 dan WK-20, karena branding lokal adalah keputusan produk eksplisit.

## Asumsi yang harus diuji

- Printer Windows target dapat menerima format output yang dipilih tanpa dialog operator saat kiosk berjalan.
- Adapter kamera .NET dapat mempertahankan capture saat preview tidak tersedia.
- Satu PC cukup untuk beban satu booth dan antrean output lokal.
- Prosedur backup dan rollback installer dapat dilakukan operator tanpa akses developer.
- Batas retention media lokal dapat diterapkan tanpa menghapus item antrean yang belum tersinkron.

## Batas evidence

Codebase-mcp diminta untuk `list_projects`, `index_status`, pencarian simbol, trace dependency, dan `check_index_coverage`, tetapi tool MCP tersebut tidak tersedia pada sesi ini. Karena itu, dokumen ini memakai pembacaan source langsung dan tidak mengklaim status indeks, generation, atau coverage graph.
