begin;

alter table business_settings
  drop column if exists output;

commit;
