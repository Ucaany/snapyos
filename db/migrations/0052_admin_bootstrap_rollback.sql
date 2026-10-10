-- 0052_admin_bootstrap_rollback.sql
-- Rollback bootstrap admin (0052). Mengembalikan role user yang dipromosikan
-- oleh seed fallback ke 'user' TIDAK dilakukan di sini (tidak aman menebak
-- siapa yang dipromosikan). Hapus hanya artefak yang dibuat migration.

drop function if exists bootstrap_admin(text);
