# Rilis Aplikasi Booth

Status: active
Audience: admin (CEO), operator
Last updated: 2026-10-25
Last verified: 2026-10-25
Source of truth: `src/server/admin/apps.ts`, `db/migrations/0081_app_releases.sql`, `src/app/(admin)/admin/apps/page.tsx`

## Model

SNAPY OS **tidak menyimpan file installer**. Yang disimpan hanya tautan dan
metadata di tabel `app_releases`:

| Kolom             | Isi                                                      |
| ----------------- | -------------------------------------------------------- |
| `version`         | `1.2.3`, unik — satu baris per versi                     |
| `download_url`    | wajib `https://` dengan hostname publik                  |
| `file_name`       | nama yang disarankan saat menyimpan                      |
| `file_size_bytes` | opsional, byte, diisi manual                             |
| `sha256`          | opsional, 64 hex, diisi manual                           |
| `release_notes`   | opsional                                                 |
| `is_active`       | hanya rilis aktif yang tampil di `/dashboard/apps` owner |

Tidak ada upload, bucket baru, atau presigned PUT. Kuota storage per-business
tidak terpengaruh.

## Prosedur rilis

1. Build installer di mesin Windows: `.\scripts\build-booth.ps1` dari root repo
   (panduan lengkap `docs/20-booth-build-windows.md`). Skrip mencetak path dan
   SHA-256 setiap artefak, jadi langkah 2 tinggal disalin.
2. Hitung hash bila perlu: `Get-FileHash .\snapyos-booth-<versi>-setup.exe -Algorithm SHA256`.
3. Unggah file ke Google Drive. Set akses **"Siapa saja yang punya link"** —
   tautan "terbatas" akan gagal untuk owner.
4. Buka `/admin/apps`, isi versi, URL, nama file, ukuran byte, SHA-256, catatan
   rilis. Simpan.
5. Pastikan baris berstatus **Aktif**. Owner melihatnya di `/dashboard/apps`.

## Rollback

Nonaktifkan rilis bermasalah (tombol **Nonaktifkan**), lalu aktifkan versi
sebelumnya. Hapus hanya bila versi itu tidak akan dipakai lagi: menghapus baris
**tidak** menghapus file di Drive.

## Batas yang tidak bisa dijamin kode

- **Tautan mati atau izin berubah** hanya ketahuan saat owner mengklik. Server
  tidak melakukan HEAD/GET ke `download_url` — memeriksa URL sembarang dari
  server adalah SSRF (bisa menembak `169.254.169.254` atau host internal).
- **`sha256` dan ukuran tidak diverifikasi sistem.** Nilainya cocok dengan file
  di Drive atau tidak, tidak ada yang memeriksa. Karena itu UI admin dan owner
  menyatakan batas ini, dan owner diarahkan memeriksa sendiri dengan
  `Get-FileHash` di booth sebelum memasang.
- **Kuota Drive.** Installer ~100 MB memakai kuota akun Google (15 GB gratis).
  Bersihkan versi lama bila kuota menipis.
- **Tidak ada kanal perintah cloud → booth.** Owner mengunduh dan memasang
  manual; tidak ada tombol "kirim update".

## Versi yang terpasang di tiap booth

Runtime mengirim `app_version` (dibaca dari `package.json`) setiap kali menulis
balik setelan ke `PATCH /api/v1/public/devices/settings`. `deviceReportSchema`
juga menerimanya secara opsional, jadi booth yang melapor lewat setup wizard
bisa mengisinya. Keduanya bermuara di `photoboxes.device_status.app_version`.

`/dashboard/apps` membandingkannya dengan versi rilis aktif terbaru dan memberi
badge **Perlu update** bila lebih rendah. Booth yang belum pernah melapor
ditampilkan "Belum pernah dilaporkan", bukan dianggap mutakhir maupun
ketinggalan: keduanya tidak bisa dibedakan tanpa laporan.

## Verifikasi cepat

- `/admin/apps` menampilkan daftar rilis + peringatan host eksternal.
- Submit `download_url: "javascript:alert(1)"` → error field "URL harus
  https://", bukan baris tersimpan.
- Versi duplikat → error field `version`, bukan 500.
- Nonaktifkan rilis → hilang dari `/dashboard/apps`, tetap ada di admin.
- Hapus rilis → baris hilang; tidak ada objek storage yang tersentuh.

Tes otomatis: `tests/admin-app-releases.test.ts`.
