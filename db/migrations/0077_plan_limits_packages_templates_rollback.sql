begin;
alter table plans drop column if exists max_packages;
alter table plans drop column if exists max_templates;
commit;
