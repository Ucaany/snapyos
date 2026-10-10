-- Rollback 0062 — hapus akuntansi storage usage. Kembali ke recursive listing
-- (src/server/storage-usage.ts versi lama) bila diperlukan.

begin;

drop function if exists storage_account_add(uuid, text, text, bigint);
drop function if exists storage_account_sub(uuid, text[]);
drop table if exists storage_objects;
drop table if exists storage_usage;

commit;
