# Panduan SnapyOS

Status: active
Audience: owner, staff, admin, developer, operator
Last updated: 2026-10-05
Last verified: 2026-10-05
Source of truth: running code, `db/schema.sql`, [`status.md`](./status.md)

## 1. Apa Itu SnapyOS

SnapyOS adalah platform operasi bisnis untuk photobox. Sistem ini menggabungkan customer kiosk, pengelolaan booth, package, template, branding, payment, voucher, transaksi, laporan, staff, subscription, dan POS dalam satu workspace.

SnapyOS memiliki tiga area kerja:

| Area           | Pengguna                                  | Route                              |
| -------------- | ----------------------------------------- | ---------------------------------- |
| Owner Platform | Owner dan manager                         | `/dashboard/*`                     |
| Staff Platform | Staff operasional                         | `/staff/*`                         |
| Customer Kiosk | Customer booth                            | `/p/[businessSlug]/[photoboxSlug]` |
| Admin Platform | Admin SnapyOS                             | `/admin/*`                         |
| POS Terminal   | Owner, manager, staff ber-entitlement POS | `/pos/*`                           |

## 2. Prasyarat

### Untuk owner

- Akun SnapyOS aktif.
- Business sudah dibuat.
- Minimal satu outlet.
- Minimal satu photobox.
- Package aktif dengan harga integer IDR.
- Template aktif; frame ber-slot menentukan jumlah capture, sedangkan template legacy tanpa slot
  memakai `package.photo_count` sebagai fallback.
- Payment credential direct merchant, voucher, atau offline cash.
- Device kiosk sudah dipasangkan.

### Untuk developer

- Node.js sesuai `package.json`.
- Project Supabase.
- Environment variables dari `.env.example`.
- `AUTH_SECRET` untuk Auth.js.
- Credential payment hanya di server environment.
- `CRON_SECRET` untuk retention cron.

## 3. Menjalankan Project Lokal

```bash
npm install
cp .env.example .env.local
npm run dev
```

Pemeriksaan sebelum membuka pull request:

```bash
npm run typecheck
npm run test
npm run build
npm run lint
```

`npm run lint` dapat melaporkan warning dari generated output. Error tetap harus diperiksa dan tidak boleh ditutup dengan disable global.

## 4. Membuat Business

1. Buka `/register` atau jalur onboarding yang disediakan deployment.
2. Login dengan akun yang sudah aktif.
3. Buka `/welcome`.
4. Pilih atau buat business.
5. Isi nama business, slug, kontak, alamat, timezone, dan currency.
6. Pastikan slug tidak memakai prefix reserved: `p`, `r`, `dashboard`, `admin`, `pos`, `staff`, atau `api`.
7. Simpan business.
8. Buat outlet pertama.
9. Buat photobox pertama.

Business adalah tenant. Semua query operasional wajib memakai `business_id` dan membership server-side. UI bukan security boundary.

## 5. Menyiapkan Outlet dan Photobox

### Outlet

Outlet menyimpan lokasi fisik. Isi nama, alamat, kota, provinsi, dan status. Nonaktifkan outlet hanya jika seluruh operasi booth di dalamnya sudah dipindahkan atau dihentikan.

### Photobox

Photobox menyimpan:

- `slug` dan nama booth.
- Status `online`, `offline`, atau `maintenance`.
- Camera, printer, display.
- Camera, print, session, dan device settings.
- Branding override per booth.
- `pos_enabled` untuk POS.
- Exit PIN hash dan throttle kegagalan.

Public URL:

```text
/p/[businessSlug]/[photoboxSlug]
```

## 6. Menyiapkan Branding

Branding business menjadi default seluruh booth. Branding photobox dapat meng-override nilai business. Nilai `null` berarti inherit dari business.

Aturan aman:

- Gunakan pasangan foreground dan background dengan kontras WCAG AA.
- Jangan memasukkan secret ke JSON branding.
- Logo harus berasal dari storage business yang benar.
- Uji welcome, package, checkout, capture, edit, dan result setelah perubahan.
- Jangan mengandalkan preview browser sebagai validasi backend.

## 7. Membuat Package

Package menentukan harga dan jumlah pekerjaan customer.

Field penting:

| Field         | Aturan                                                   |
| ------------- | -------------------------------------------------------- |
| `name`        | Wajib, jelas untuk customer                              |
| `price`       | Integer IDR, tidak boleh floating-point                  |
| `photo_count` | Jumlah foto cadangan; hanya fallback untuk template legacy tanpa slot |
| `print_count` | Jumlah hasil cetak                                       |
| `is_active`   | Hanya package aktif tampil di kiosk                      |

Server menghitung final amount. Frontend tidak dipercaya untuk harga, diskon, atau voucher. Template tidak perlu dipilih di form paket: semua template aktif otomatis tersedia. Tombol Duplikat membuat salinan nonaktif bernama `... (salinan)`.

## 8. Membuat Template

1. Upload PNG frame transparan melalui template builder.
2. Definisikan slot foto pada canvas design.
3. Atur posisi, ukuran, rotasi, dan urutan layer.
4. Simpan layout dalam unit design yang disepakati builder.
5. Generate thumbnail preview.
6. Publish template. Semua template aktif langsung tampil di semua paket — tidak ada langkah assign.
7. Uji frame di kiosk; frame ber-slot menentukan jumlah capture saat kiosk berjalan.

Frame ber-slot menentukan capture, sedangkan template legacy memakai photo_count package.

## 9. Payment Customer

Alur resmi adalah pay-first:

```text
Package -> Checkout -> Voucher atau Payment -> PAID -> Template -> Capture -> Edit -> Finalize -> Print -> Result
```

Metode yang tersedia:

1. Direct merchant gateway: Pakasir, Midtrans, atau Tripay dengan credential business.
2. Voucher 100 persen: menghasilkan paid sintetis setelah validasi server.
3. Offline cash: pending sampai operator terautentikasi mengonfirmasi.

Pakasir platform hanya dipakai untuk invoice subscription SnapyOS. Dana kiosk tidak masuk saldo aggregator SnapyOS. Flow withdrawal kiosk sudah dihapus.

### Payment safety

- Reservation memakai state `creating`.
- Satu payment aktif per checkout dijaga partial unique index.
- Webhook memvalidasi provider, reference, nominal, credential, signature atau status provider.
- Event webhook idempotent.
- Secret provider tidak pernah dikirim ke browser.
- Status kiosk memakai polling 3 detik dan recovery saat reload.

## 10. Menjalankan Sesi Customer

1. Device memuat konfigurasi berdasarkan `device_token`.
2. Customer memilih package.
3. Server membuat checkout.
4. Customer memasukkan voucher bila ada.
5. Customer menyelesaikan payment.
6. Server menandai checkout paid.
7. Timer session dimulai.
8. Customer memilih template.
9. Customer capture sesuai jumlah slot.
10. Customer retake selama timer masih aktif.
11. Customer melakukan crop, rotate, zoom, pan, filter, sticker, atau text sesuai kemampuan editor.
12. Customer finalize.
13. Server menghasilkan result dan GIF.
14. Printer menjalankan print fallback atau provider runtime.
15. Kiosk menampilkan QR result.

Jika timer habis sebelum payment, kiosk reset ke welcome. Jika timer habis setelah payment, sistem menyelesaikan perilaku post-paid sesuai session policy.

## 11. Device Pairing dan Kiosk Lock

1. Owner membuka device activation pada photobox.
2. Server menghasilkan activation code satu kali pakai.
3. Operator membuka setup wizard di perangkat.
4. Operator memasukkan atau memindai code.
5. Device menerima token opaque.
6. Operator memberi permission kamera.
7. Operator memilih kamera jika runtime mendukungnya.
8. Operator menjalankan print test.
9. Operator mengunci kiosk.

Customer tidak melihat setup permission, device selection, atau print test. Exit memakai shortcut operator atau touch-hold sesuai runtime dan policy booth.

## 12. Staff dan RBAC

Role canonical:

- `owner`: kontrol business dan billing.
- `manager`: operasi sesuai permission.
- `staff`: operasi terbatas dan booth yang diberikan.

Owner harus memberi akses photobox secara eksplisit bila staff hanya boleh bekerja pada booth tertentu. Semua mutation memeriksa membership dan permission di server.

## 13. POS Add-on

POS adalah add-on per business dengan maksimal satu booth POS aktif berdasarkan constraint database.

Karakteristik:

- Offline-only.
- Metode: cash, bank transfer, atau other sesuai implementasi.
- Tidak memakai QRIS POS.
- Cart hanya display state.
- Total final dihitung server.
- Stock decrement memakai RPC batch `pos_decrement_stock_batch` (satu round-trip
  untuk seluruh baris order); `pos_decrement_stock` tetap ada untuk satu produk.
- Dipakai staff tanpa role baru.

## 14. Finance dan Reporting

`transactions` adalah source of truth laporan finansial. `payments` menyimpan detail settlement.

Owner dapat:

- Melihat gross, fee, net, dan status payment.
- Memfilter rentang tanggal dalam timezone business.
- Mencatat expense manual.
- Membaca estimated profit.
- Mengunduh CSV atau XLSX bila tersedia.

Jangan menyimpulkan saldo withdrawable dari tabel lama. Withdrawal kiosk sudah tidak aktif.

## 15. Storage dan Retention

Storage business memakai scope path business. Bucket utama mencakup asset business dan generated photos. Kuota dihitung server-side.

Retention cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/retention
```

Cron menolak request tanpa secret. `RETENTION_CRON_OPEN=1` hanya untuk mode development yang disengaja.

## 16. Troubleshooting

### Package tidak tampil

- Pastikan package aktif.
- Pastikan photobox dan outlet aktif.
- Pastikan plan tidak melewati limit.
- Pastikan device token mengarah ke photobox benar.

### Template tidak tampil

- Pastikan template aktif.
- Semua template aktif tampil di semua paket; tidak ada assignment yang perlu diatur.
- Frame ber-slot tetap dapat dipakai lintas paket; periksa layout dan URL frame bila tidak tampil.
- Periksa response public template dan error server.

### Payment tidak berubah menjadi paid

- Cek expiry payment.
- Cek provider reference dan order ID.
- Cek credential provider yang dipakai business.
- Cek webhook signature atau server-to-server status check.
- Reload kiosk untuk menjalankan recovery status.
- Jangan menandai paid dari client.

### Device tidak bisa masuk kiosk

- Cabut device token lama bila revoked.
- Buat activation code baru.
- Pastikan system clock perangkat benar.
- Pastikan browser memiliki permission kamera.
- Periksa `device_status` dan heartbeat.

### Storage penuh

- Buka storage usage owner.
- Hapus asset yang tidak dipakai sesuai retention policy.
- Aktifkan storage feature pada plan jika entitlement mengizinkan.
- Tambah storage add-on melalui invoice subscription.

## 17. Development Checklist

- [ ] Cek source of truth sebelum mengubah kontrak.
- [ ] Cek `db/schema.sql` dan migration terkait.
- [ ] Tambahkan validasi boundary server-side.
- [ ] Tambahkan loading, empty, dan error state.
- [ ] Pastikan tenant scope ada pada setiap query.
- [ ] Pastikan nominal integer IDR.
- [ ] Jangan mengembalikan secret ke client.
- [ ] Jalankan test yang relevan.
- [ ] Jalankan typecheck dan build.
- [ ] Verifikasi route dan interaksi utama di desktop serta mobile.
