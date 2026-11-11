-- 0087 — output digital per bisnis (GIF hasil sesi) + jalur cetak bertingkat.
--
-- 1. `business_settings.output` menampung setelan output digital; untuk saat
--    ini hanya `gif` (`enabled`, `frame_delay_ms`, `max_width`). Bentuknya
--    jsonb supaya penambahan output berikutnya tidak butuh migrasi kolom.
-- 2. `photoboxes.print_settings` sudah jsonb sehingga grup `photo`/`thermal`/
--    `receipt` tidak butuh kolom baru; migrasi ini hanya memastikan nilai lama
--    yang masih datar tetap utuh (tidak ada rewrite, tidak ada backfill).
--
-- 3. `pos_orders.print_mode` menerima `cups`: struk POS boleh memakai bridge
--    lokal, bukan hanya dialog OS / Bluetooth. Tanpa ini order dengan struk
--    CUPS ditolak check constraint (23514) walau setelan booth sah.
--
-- Aditif & idempoten: baris lama tanpa `output` tetap jalan.

begin;

alter table business_settings
  add column if not exists output jsonb;

comment on column business_settings.output is
  'Output digital bisnis (jsonb): { gif: { enabled, frame_delay_ms, max_width } }.';

alter table pos_orders drop constraint if exists pos_orders_print_mode_check;
alter table pos_orders
  add constraint pos_orders_print_mode_check
  check (print_mode in ('browser', 'bluetooth', 'cups'));

commit;
