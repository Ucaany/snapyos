-- 0039_template_categories_fk_rollback.sql
-- Revert migration 0039.

drop index if exists idx_templates_category_id;

alter table templates
  drop column if exists category_id;

alter table templates
  add constraint templates_category_check
  check (category in ('minimal', 'cute', 'retro', 'y2k', 'wedding', 'birthday', 'graduation', 'event', 'custom'));
