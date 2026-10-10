-- 0034 — Exit-PIN photobox: argon2id + throttle brute-force.
--
-- Konteks:
--   Sebelumnya `photoboxes.exit_pin_hash` menyimpan sha256(pin) langsung.
--   PIN 4–6 digit + sha256 → mudah di-brute bila hash bocor. Sekarang PIN
--   di-hash argon2id (kode aplikasi di src/lib/device-token.ts). Kolom
--   `exit_pin_hash` tetap TEXT (encoded argon2 lebih panjang) — kompatibel.
--
-- Migrasi hash lama:
--   Tidak ada re-hash otomatis karena kita tidak menyimpan PIN plaintext.
--   `verifyDevicePin` menolak hash non-argon2 → owner harus set ulang PIN
--   dari halaman photobox settings (banner one-time di UI mengingatkan).
--
-- Throttle:
--   Kolom `exit_pin_failed_count` melacak percobaan gagal beruntun; setelah
--   5 gagal, `exit_pin_locked_until` diisi (now + 5 menit) dan counter
--   direset. Sukses → keduanya kembali ke 0/NULL.

alter table photoboxes
  add column if not exists exit_pin_failed_count integer not null default 0;

alter table photoboxes
  add column if not exists exit_pin_locked_until timestamptz;

comment on column photoboxes.exit_pin_hash is
  'Argon2id hash exit PIN. Legacy sha256 → verifyDevicePin false; owner set ulang.';
comment on column photoboxes.exit_pin_failed_count is
  'Percobaan gagal beruntun PIN keluar (reset saat sukses / lock).';
comment on column photoboxes.exit_pin_locked_until is
  'PIN keluar terkunci sampai timestamp ini (5 gagal → +5 menit).';
