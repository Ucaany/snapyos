-- 0043 — Staff login PIN per (member × photobox).
--
-- Konteks:
--   Staff (role 'staff') login shell /staff tanpa password akun — cukup
--   email + PIN yang di-set owner per booth (member_photoboxes). PIN
--   di-hash argon2id (pattern sama exit_pin, 0034). Owner/manager tetap
--   login email + password.
--
--   Kolom `pin_hash` nullable: booth tanpa PIN = staff tidak bisa login
--   lewat booth itu. Hash legacy (sha256) ditolak → owner set ulang.

alter table member_photoboxes
  add column if not exists pin_hash text;

comment on column member_photoboxes.pin_hash is
  'Argon2id hash PIN login staff untuk booth ini. Null = booth tanpa PIN.';
