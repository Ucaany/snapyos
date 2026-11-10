-- Rollback 0084 — pulihkan `metadata.enabled_methods` yang dibuang migrasi forward.
--
-- PERINGATAN: rollback ini mengembalikan metode yang SECARA APLIKASI tidak
-- didukung (`PAYMENT_METHODS` pasca-perubahan). Kiosk akan kembali membuangnya
-- (`kioskSupported`), jadi credential yang hanya berisi metode tersebut tetap
-- tidak muncul sampai owner memilih ulang di /dashboard/payment. Rollback hanya
-- berguna untuk memulihkan data historis, bukan untuk mengembalikan fungsinya.
--
-- `is_active` TIDAK dipulihkan: forward menonaktifkan credential yang kehilangan
-- seluruh metode, dan rollback tidak bisa membedakannya dari penonaktifan manual
-- owner. Aktifkan ulang secara eksplisit bila memang diinginkan.
--
-- Idempoten: baris tanpa `methods_removed` tidak berubah.

begin;

with restorable as (
  select
    c.id,
    coalesce(
      array(
        select jsonb_array_elements_text(c.metadata -> 'enabled_methods')
      ),
      '{}'::text[]
    ) as kept,
    array(
      select jsonb_array_elements_text(c.metadata -> 'methods_removed')
    ) as removed
  from payment_credentials c
  where jsonb_typeof(c.metadata -> 'methods_removed') = 'array'
    and jsonb_array_length(c.metadata -> 'methods_removed') > 0
)
update payment_credentials c
set metadata = jsonb_set(
  c.metadata
    - 'methods_migrated_at'
    - 'methods_removed',
  '{enabled_methods}',
  to_jsonb(
    array(
      select distinct m.method
      from unnest(restorable.kept || restorable.removed) as m(method)
    )
  )
)
from restorable
where c.id = restorable.id;

commit;
