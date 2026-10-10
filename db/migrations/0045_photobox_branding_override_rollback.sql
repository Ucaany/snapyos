-- 0045 — Per-booth branding override (rollback).

alter table photoboxes
  drop column if exists branding;
