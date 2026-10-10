-- Profil registrasi kaya (registration enrichment):
-- whatsapp, acquisition_source, planned_devices diisi user saat daftar;
-- signup_ip & signup_user_agent diisi server (konteks admin, bukan keamanan).
-- Kolom read-only admin — tanpa index, bukan query path.
-- Validasi enum/format di app layer (docs/08 §8.19) agar mudah berkembang.
alter table users
  add column if not exists whatsapp text,
  add column if not exists acquisition_source text,
  add column if not exists planned_devices integer
    check (planned_devices is null or planned_devices >= 0),
  add column if not exists signup_ip text,
  add column if not exists signup_user_agent text;
