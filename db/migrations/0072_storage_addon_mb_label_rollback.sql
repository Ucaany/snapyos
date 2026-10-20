-- 0072 rollback — kembalikan label seed add-on storage ke bentuk 0053.

begin;

update add_ons
   set name = 'Tambah Storage 1 GB',
       updated_at = now()
 where code = 'extra_storage'
   and storage_mb = 1024
   and name = 'Tambah Storage 1.024 MB';

commit;
