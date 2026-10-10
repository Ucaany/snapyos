-- MIGRATION 0010 — Template builder: kolom layout jsonb (docs/15 §15.2).
-- Baseline db/schema.sql sudah termasuk kolom ini (fresh install).
-- Idempotent — aman dijalankan berulang.

alter table templates
  add column if not exists layout jsonb not null default '{}';
