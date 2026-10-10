-- 0038_drop_reports_table.sql
-- Audit 2026-09-16: tabel `reports` schema-only, tidak pernah di-query oleh
-- aplikasi (0 caller di src/). PRD docs/10-admin-platform.md tidak menyebutnya.
-- Fitur laporan admin ditangani ad-hoc di halaman payments/summary; scheduling
-- laporan berkala akan dibangun ulang bila kebutuhan konkret muncul.
--
-- Impact:
--   - DROP TABLE reports CASCADE → menghapus index idx_reports_business.
--   - Tidak ada FK inbound; aman.
--
-- Rollback: 0038_drop_reports_table_rollback.sql (buat ulang tabel + index).

drop index if exists idx_reports_business;
drop table if exists reports cascade;
