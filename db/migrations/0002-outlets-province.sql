-- ============================================================================
-- MIGRATION 0002 — outlets.province (wilayah API emsifa)
-- PRD sync: docs/07-database-schema.md §7.3 outlets.
-- Baseline db/schema.sql sudah termasuk kolom ini (fresh install tidak perlu
-- menjalankan file ini). Jalankan hanya untuk DB lama.
-- Idempotent — aman dijalankan berulang.
-- ============================================================================

alter table outlets
  add column if not exists province text;
