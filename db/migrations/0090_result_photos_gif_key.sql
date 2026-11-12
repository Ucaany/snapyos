-- WAJIB dijalankan sebelum deploy: kode finalize/result membaca kolom ini.
-- GIF kedua per sesi: slideshow semua capture mentah (tanpa frame).
-- Aditif & idempoten — aman dijalankan ulang.
alter table sessions add column if not exists result_photos_gif_key text;
