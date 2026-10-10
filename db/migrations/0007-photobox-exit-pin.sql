-- Exit PIN kiosk (docs/05 §5.0): PIN petugas untuk keluar mode photobooth,
-- disimpan sha256 — diatur owner dari dashboard photobox.
alter table photoboxes
  add column if not exists exit_pin_hash text;
