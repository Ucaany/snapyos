# Windows Kiosk dan Control Center: Flows

Status: active  
Audience: owner, operator, developer  
Last updated: 2026-11-01  
Last verified: 2026-11-01  
Source of truth: `docs/05-customer-photobox.md`, `docs/06-checkout-payment.md`, `runtime/sync/worker.ts`, `src/server/cash-payment.ts`

## 1. Pairing dan setup

```text
Boot PC
  -> Runtime hidup
  -> Control Center cek SQLite dan health hardware
  -> Operator memasukkan kode pairing
  -> Cloud memverifikasi kode
  -> Device aktif
  -> Setup kamera
  -> Test print
  -> Operator menyimpan hasil
  -> Kiosk masuk Welcome
```

Aturan:

- Pairing hanya sekali sampai device dicabut atau di-reset owner.
- Kode pairing berumur pendek dan sekali pakai.
- Setup kamera dan printer tidak tampil pada customer.
- Kegagalan setup menghentikan launch kiosk dan memberi tindakan pemulihan.

## 2. Customer happy path

```text
WELCOME
  -> pilih package
  -> pilih payment
  -> QRIS online atau tunai operator
  -> payment paid
  -> pilih template/frame
  -> capture countdown
  -> capture foto
  -> review dan retake
  -> edit
  -> finalize lokal
  -> generate photo strip dan GIF
  -> auto-print
  -> upload output final ke cloud
  -> tampilkan QR result
  -> reset Welcome
```

Payment harus paid sebelum sesi foto dimulai. Timer sesi mulai setelah cloud mengonfirmasi paid untuk payment online atau setelah operator mengonfirmasi tunai.

## 3. QRIS online

```text
Pilih QRIS
  -> cloud membuat payment
  -> kiosk menampilkan QR dan expiry
  -> provider mengirim event atau status dipulihkan
  -> cloud memverifikasi status dan nominal
  -> cloud menetapkan paid
  -> kiosk membuka template
```

Jika cloud tidak tersedia, kiosk tidak membuat QR palsu. Control Center menampilkan status koneksi dan operator dapat memilih tunai offline bila kebijakan booth mengizinkan.

## 4. Tunai offline operator

```text
Pilih tunai
  -> kiosk membuat pending cash request lokal
  -> Control Center menampilkan request
  -> operator login atau sudah memiliki sesi sah
  -> operator cocokkan nominal dan booth
  -> operator konfirmasi
  -> kiosk menerima paid lokal
  -> flow foto dibuka
```

Penolakan, timeout, atau request tidak cocok mengembalikan kiosk ke payment picker. Kiosk tidak memiliki tombol konfirmasi tunai untuk customer.

## 5. Offline finalize dan sync

```text
Cloud mati
  -> QRIS tidak tersedia
  -> tunai operator tetap dapat dipakai
  -> capture/edit/finalize lokal
  -> output final masuk antrean
  -> Control Center menampilkan queued

Cloud pulih
  -> worker membuat sesi cloud dengan idempotency key
  -> simpan cloud ID
  -> kirim output final
  -> cloud membuat result
  -> tandai synced
  -> tampilkan QR result bila customer masih menunggu
```

Jika sesi ditolak karena kedaluwarsa:

1. Salin media dan manifest ke karantina.
2. Pertahankan event audit.
3. Tandai sesi membutuhkan tindakan operator.
4. Jangan hapus media sebelum salinan berhasil.

## 6. Printer

### 6.1 Auto-print

Finalize yang sukses membuat pekerjaan cetak sesuai package dan setelan booth. Runtime memeriksa printer, mengirim pekerjaan, lalu mengembalikan status `submitted`. Kiosk menampilkan status itu secara jujur. Status kertas selesai memerlukan konfirmasi atau bukti printer.

### 6.2 Print test

```text
Control Center
  -> pilih printer
  -> health check
  -> kirim test pattern
  -> operator memeriksa kertas
  -> simpan confirmed atau failed
```

Jika printer gagal, customer tetap dapat menerima output digital bila package mengizinkan. Operator mendapat tindakan retry atau ganti printer.

## 7. Branding lokal

```text
Control Center
  -> pilih booth aktif
  -> ubah warna, teks, layout, logo, dan guide lokal
  -> validasi kontras dan field
  -> simpan SQLite
  -> Kiosk membaca settings lokal saat boot atau reload
```

Branding lokal hanya berlaku pada booth tersebut. Branding cloud yang bersifat identitas global dapat dipakai sebagai fallback, tetapi perubahan lokal tidak dipush untuk menimpa booth lain.

## 8. Installer manual

### Admin

```text
Admin
  -> unggah installer
  -> isi versi, target Windows, checksum, ukuran, catatan rilis
  -> validasi paket
  -> publish katalog
```

### Owner

```text
Owner membuka Control Center atau portal
  -> lihat versi terpasang
  -> lihat versi katalog yang kompatibel
  -> unduh installer
  -> verifikasi checksum
  -> tutup kiosk
  -> backup metadata lokal
  -> jalankan installer manual
  -> buka Control Center
  -> cek migrasi dan health
  -> rollback manual bila verifikasi gagal
```

Tidak ada download background, prompt upgrade otomatis, atau eksekusi installer tanpa tindakan owner/operator.

## 9. Failure states minimum

| Flow      | State gagal                          | Tindakan                                      |
| --------- | ------------------------------------ | --------------------------------------------- |
| Pairing   | kode salah atau kedaluwarsa          | minta kode baru                               |
| Kamera    | tidak terdeteksi atau sedang dipakai | retry, pilih adapter, lapor status            |
| Printer   | offline atau driver error            | print test ulang, pilih printer               |
| QRIS      | cloud atau provider gagal            | jangan buka sesi, tawarkan tunai bila offline |
| Tunai     | operator tidak berwenang             | tetap pending, minta operator sah             |
| Finalize  | storage lokal penuh                  | hentikan finalize, bebaskan storage           |
| Sync      | timeout jaringan                     | backoff, tetap queued                         |
| Sync      | sesi expired di cloud                | karantina media, eskalasi operator            |
| Installer | checksum tidak cocok                 | batalkan instalasi, pertahankan versi aktif   |
