-- ============================================================================
-- ⚠️  DEPRECATED setelah 0040_fix_settle_payment_gateway_enum.sql.
--
-- File ini TIDAK memperbaiki settle_paid_payment_atomically (RPC yang benar-
-- benar dipanggil oleh app code). Ia hanya re-emit settle_qris_payment yang
-- tidak pernah dipanggil siapa pun. Setelah menjalankan file ini, Anda WAJIB
-- menjalankan 0040 untuk menghilangkan bug CHECK constraint 'gateway'.
-- ============================================================================
--
-- APPLY SCRIPT — migrasi 0034 + 0035 + 0036 gabungan (idempotent, transactional).
--
-- Cara pakai:
--   1) Buka Supabase Dashboard → Project pyxgoqjtojmpwsgtrpiq → SQL Editor.
--   2) Klik "New query", tempel SELURUH isi file ini, jalankan (RUN).
--   3) Baca panel Notices/Results di bawah — akan mencetak status tiap tahap.
--   4) Jika muncul ROLLBACK / ERROR, tidak ada perubahan yang di-commit
--      (BEGIN/COMMIT bungkus semuanya).
--
-- Prinsip aman:
--   - Semua DDL/DML dibungkus SATU transaksi (rollback total kalau gagal).
--   - `add column IF NOT EXISTS`, `drop constraint IF EXISTS` — bisa dijalankan
--     berulang tanpa efek samping.
--   - Update payment_method 'gateway'→'qris' idempotent (baris kedua kali:
--     tidak ada yang cocok, 0 baris terupdate).
--   - Assertion di akhir: RAISE EXCEPTION bila constraint tidak persis
--     seperti yang diharapkan.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0034 — Exit-PIN photobox: kolom throttle + comment (argon2id di app).
-- ----------------------------------------------------------------------------

alter table photoboxes
  add column if not exists exit_pin_failed_count integer not null default 0;

alter table photoboxes
  add column if not exists exit_pin_locked_until timestamptz;

comment on column photoboxes.exit_pin_hash is
  'Argon2id hash exit PIN. Legacy sha256 → verifyDevicePin false; owner set ulang.';
comment on column photoboxes.exit_pin_failed_count is
  'Percobaan gagal beruntun PIN keluar (reset saat sukses / lock).';
comment on column photoboxes.exit_pin_locked_until is
  'PIN keluar terkunci sampai timestamp ini (5 gagal → +5 menit).';

do $$
begin
  raise notice '[0034] photoboxes.exit_pin_failed_count + exit_pin_locked_until OK';
end$$;

-- ----------------------------------------------------------------------------
-- 0035 — Retensi hasil foto default → 3 hari (keputusan produk #4).
-- ----------------------------------------------------------------------------

alter table business_settings
  alter column retention_days set default 3;

update business_settings
   set retention_days = 3
 where retention_days > 3;

update platform_settings
   set value = '3'::jsonb
 where key = 'default_retention_days'
   and value::text::int > 3;

do $$
declare
  n_business int;
  n_gt3 int;
begin
  select count(*) into n_business from business_settings;
  select count(*) into n_gt3 from business_settings where retention_days > 3;
  if n_gt3 > 0 then
    raise exception '[0035] ASSERT gagal: masih ada % business_settings dengan retention_days > 3', n_gt3;
  end if;
  raise notice '[0035] retention_days ≤ 3 di semua % business_settings OK', n_business;
end$$;

-- ----------------------------------------------------------------------------
-- 0036 — Hapus payment_method='gateway' + re-emit settle_qris_payment.
-- ----------------------------------------------------------------------------

update transactions
   set payment_method = 'qris'
 where payment_method = 'gateway';

alter table transactions
  drop constraint if exists transactions_payment_method_check;

alter table transactions
  add constraint transactions_payment_method_check
  check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline', 'manual'));

do $$
declare
  n_gateway int;
begin
  select count(*) into n_gateway from transactions where payment_method = 'gateway';
  if n_gateway > 0 then
    raise exception '[0036] ASSERT gagal: masih ada % transactions dengan payment_method=gateway', n_gateway;
  end if;
  raise notice '[0036] transactions bebas dari payment_method=gateway OK';
end$$;

create or replace function settle_qris_payment(
  p_payment_id uuid,
  p_transaction_number text,
  p_result_token text
)
returns table(
  transaction_id uuid,
  final_amount integer,
  business_id uuid,
  outlet_id uuid,
  package_id uuid,
  photobox_id uuid,
  voucher_id uuid,
  discount_amount integer,
  checkout_session_id uuid,
  settled_now boolean
)
language plpgsql
as $$
declare
  v_payment payments%rowtype;
  v_checkout checkout_sessions%rowtype;
  v_transaction_id uuid;
  v_settled_now boolean := false;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found'; end if;

  select * into v_checkout from checkout_sessions where id = v_payment.checkout_session_id for update;
  if not found then raise exception 'checkout not found'; end if;

  v_transaction_id := v_payment.transaction_id;
  if v_transaction_id is null then
    insert into transactions (
      business_id, outlet_id, photobox_id, package_id, payment_id, payment_method,
      gross_amount, discount_amount, final_amount, voucher_id, status, number, paid_at
    ) values (
      v_payment.business_id, v_payment.outlet_id, v_payment.photobox_id, v_payment.package_id,
      v_payment.id,
      case when v_payment.provider = 'cash' then 'cash' else 'qris' end,
      v_payment.gross_amount, v_payment.discount_amount, v_payment.final_amount,
      v_payment.voucher_id, 'paid', p_transaction_number, coalesce(v_payment.paid_at, now())
    ) returning id into v_transaction_id;
    update payments set transaction_id = v_transaction_id where id = v_payment.id;
    v_settled_now := true;
  end if;

  if v_payment.voucher_id is not null then
    insert into voucher_usages (voucher_id, business_id, transaction_id, payment_id, discount_amount)
    values (v_payment.voucher_id, v_payment.business_id, v_transaction_id, v_payment.id, v_payment.discount_amount)
    on conflict (payment_id) where payment_id is not null do nothing;
  end if;

  if v_checkout.status <> 'paid' then
    update checkout_sessions
       set status = 'paid', result_token = coalesce(v_checkout.result_token, p_result_token)
     where id = v_checkout.id;
  end if;

  return query
    select v_transaction_id,
           v_payment.final_amount,
           v_payment.business_id,
           v_payment.outlet_id,
           v_payment.package_id,
           v_payment.photobox_id,
           v_payment.voucher_id,
           v_payment.discount_amount,
           v_checkout.id,
           v_settled_now;
end;
$$;

do $$
begin
  raise notice '[0036] fungsi settle_qris_payment ter-re-emit OK';
end$$;

-- ----------------------------------------------------------------------------
-- POST-CHECK: verifikasi konstrain/kolom hasil migrasi.
-- ----------------------------------------------------------------------------

do $$
declare
  v_check text;
  v_kolom_lock timestamptz;
  v_kolom_fail int;
begin
  -- 0034 assert
  perform 1 from information_schema.columns
    where table_name = 'photoboxes' and column_name = 'exit_pin_failed_count';
  if not found then
    raise exception '[POST] kolom photoboxes.exit_pin_failed_count tidak ada';
  end if;
  perform 1 from information_schema.columns
    where table_name = 'photoboxes' and column_name = 'exit_pin_locked_until';
  if not found then
    raise exception '[POST] kolom photoboxes.exit_pin_locked_until tidak ada';
  end if;

  -- 0036 assert: constraint text harus tanpa 'gateway'
  select pg_get_constraintdef(c.oid) into v_check
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
   where t.relname = 'transactions'
     and c.conname = 'transactions_payment_method_check';
  if v_check is null then
    raise exception '[POST] transactions_payment_method_check tidak ditemukan';
  end if;
  if v_check ilike '%gateway%' then
    raise exception '[POST] transactions_payment_method_check MASIH memuat gateway: %', v_check;
  end if;
  raise notice '[POST] transactions_payment_method_check: %', v_check;

  raise notice '[POST] SEMUA ASSERT LOLOS — migrasi 0034/0035/0036 sukses.';
end$$;

commit;
