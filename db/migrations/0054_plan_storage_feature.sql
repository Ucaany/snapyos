-- 0054 — Feature flag `storage` per plan.
--
-- Plan kini punya toggle "Storage" di /admin/plans (features.storage). Saat
-- nonaktif, kuota storage efektif = 0 (upload/finalize di-block STORAGE_FULL
-- oleh assertStorageAvailable).
--
-- Data migration: semua plan existing dinyalakan storage-nya (preserve
-- perilaku lama — storage_limit_mb selalu aktif). Admin bisa mematikan
-- per plan lewat UI. Idempotent (|| tidak menduplikasi key).

update plans set features = features || '{"storage": true}'::jsonb;
