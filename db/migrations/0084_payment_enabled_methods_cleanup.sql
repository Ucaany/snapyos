-- 0084 — Migrasi data `payment_credentials.metadata.enabled_methods`.
--
-- Latar: `PAYMENT_METHODS` (src/lib/payment-credentials.ts) dipersempit ke metode
-- yang BENAR-BENAR diimplementasikan adapter. Nilai yang dulu ditawarkan UI tapi
-- tidak pernah didukung adapter (midtrans: dana, ovo, mandiri, alfamart,
-- indomaret) kini ditolak. Tanpa langkah ini, credential lama yang hanya berisi
-- nilai tersebut menjadi tidak terpakai: kiosk membuangnya (`kioskSupported`),
-- metode online hilang diam-diam, dan owner hanya melihat "Belum dipilih".
--
-- Tindakan (deterministik, idempoten):
--   1) Buang nilai tak didukung dari `metadata.enabled_methods`; urutan hasil
--      mengikuti urutan `PAYMENT_METHODS` (bukan urutan input lama).
--   2) Bila hasilnya kosong, nonaktifkan credential (`is_active = false`) agar
--      dashboard menampilkan status Nonaktif, bukan kiosk yang kehilangan metode
--      tanpa penjelasan.
--   3) Catat jejak audit di metadata: `methods_migrated_at` + `methods_removed`.
--      Credential TIDAK dihapus — secret tetap utuh; owner cukup memilih ulang
--      metode lalu mengaktifkannya kembali.
--
-- Aman dijalankan berulang: baris yang sudah bersih tidak berubah
-- (`methods_migrated_at` hanya diisi saat ada metode yang benar-benar dibuang).

begin;

with supported(provider, method, ord) as (
  values
    ('midtrans', 'qris', 1),
    ('midtrans', 'gopay', 2),
    ('midtrans', 'shopeepay', 3),
    ('midtrans', 'bca', 4),
    ('midtrans', 'bni', 5),
    ('midtrans', 'bri', 6),
    ('midtrans', 'permata', 7),
    ('tripay', 'QRIS', 1),
    ('tripay', 'BCAVA', 2),
    ('tripay', 'BNIVA', 3),
    ('tripay', 'BRIVA', 4),
    ('tripay', 'MANDIRIVA', 5),
    ('tripay', 'PERMATAVA', 6),
    ('tripay', 'ALFAMART', 7),
    ('tripay', 'INDOMARET', 8),
    ('pakasir', 'qris', 1)
),
current_methods as (
  select
    c.id,
    c.provider,
    c.is_active,
    c.metadata,
    array(
      select jsonb_array_elements_text(c.metadata -> 'enabled_methods')
    ) as methods
  from payment_credentials c
  where jsonb_typeof(c.metadata -> 'enabled_methods') = 'array'
),
kept as (
  select
    m.id,
    m.provider,
    m.is_active,
    m.metadata,
    m.methods,
    array(
      select s.method
      from supported s
      where s.provider = m.provider
        and s.method = any (m.methods)
      order by s.ord
    ) as kept_methods
  from current_methods m
),
changed as (
  select *
  from kept
  where kept_methods is distinct from methods
)
update payment_credentials c
set
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        c.metadata,
        '{enabled_methods}',
        to_jsonb(changed.kept_methods)
      ),
      '{methods_removed}',
      to_jsonb(
        array(
          select m.method
          from unnest(changed.methods) as m(method)
          where not (m.method = any (changed.kept_methods))
        )
      )
    ),
    '{methods_migrated_at}',
    to_jsonb(now())
  ),
  is_active = case
    when array_length(changed.kept_methods, 1) is null then false
    else c.is_active
  end
from changed
where c.id = changed.id;

-- Laporan: credential yang kehilangan SELURUH metode (owner harus memilih ulang).
do $$
declare
  affected integer;
begin
  select count(*) into affected
  from payment_credentials
  where jsonb_typeof(metadata -> 'methods_removed') = 'array'
    and jsonb_array_length(metadata -> 'methods_removed') > 0
    and jsonb_typeof(metadata -> 'enabled_methods') = 'array'
    and jsonb_array_length(metadata -> 'enabled_methods') = 0;

  if affected > 0 then
    raise notice
      '0084: % payment_credentials kehilangan seluruh metode tak didukung — dinonaktifkan, owner harus memilih ulang di /dashboard/payment.',
      affected;
  end if;
end $$;

commit;
