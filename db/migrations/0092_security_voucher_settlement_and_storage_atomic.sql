-- ---------------------------------------------------------------------------
-- 0092_security_voucher_settlement_and_storage_atomic.sql
--
-- Dua temuan Low dari audit Strix (24 Nov 2026) yang harus ditutup di database:
--
-- 1) voucher usage_limit tidak ditegakkan saat settlement (vuln-0010).
--    Trigger 0083 hanya menjaga INSERT payments dan hanya menghitung payment
--    berstatus creating/pending. Bila QR lokal kedaluwarsa lalu provider
--    "recover" expired -> paid, slot reservasi hilang lebih dulu, sehingga
--    voucher kuota-1 bisa menghasilkan dua baris voucher_usages (dua booth).
--    Perbaikan: guard pada voucher_usages itu sendiri — lock per voucher,
--    hitung pemakaian yang sudah tercatat (kecuali payment/transaksi yang
--    sedang ditulis, supaya retry/webhook replay tetap idempotent), tolak bila
--    kuota habis. Ini menutup SEMUA jalur yang menulis redemption.
--
-- 2) Storage quota check-then-act (vuln-0014). assertStorageAvailable() membaca
--    counter lalu upload menaikkannya tanpa predikat limit, jadi N upload
--    paralel bisa overshoot. Perbaikan: storage_account_add_limited() melakukan
--    cek-kuota dan increment dalam SATU statement (conditional UPDATE).
--    Rollback objek otomatis bila limit tercapai → tidak ada baris ledger yatim.
--
-- Sifat: idempotent (create or replace / drop trigger if exists). Aman diulang.
-- ---------------------------------------------------------------------------

-- 1) Voucher: kuota ditegakkan saat redemption benar-benar dicatat.
create or replace function enforce_voucher_usage_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_used integer;
begin
  if new.voucher_id is null then
    return new;
  end if;

  -- Serialisasi per voucher: dua settlement paralel antre di sini.
  perform pg_advisory_xact_lock(hashtextextended(new.voucher_id::text, 0));

  select usage_limit into v_limit from vouchers where id = new.voucher_id;
  if v_limit is null then
    return new; -- tanpa batas
  end if;

  -- Kecualikan baris yang sedang ditulis (retry idempotent untuk payment yang sama).
  select count(*) into v_used
    from voucher_usages
   where voucher_id = new.voucher_id
     and (new.payment_id is null or payment_id is distinct from new.payment_id)
     and (new.transaction_id is null or transaction_id is distinct from new.transaction_id);

  if v_used >= v_limit then
    raise exception 'VOUCHER_LIMIT_REACHED: kuota voucher % sudah habis (% terpakai)', v_limit, v_used
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_voucher_usage_limit on voucher_usages;
create trigger trg_enforce_voucher_usage_limit
  before insert on voucher_usages
  for each row execute function enforce_voucher_usage_limit();

-- 2) Storage: cek kuota + increment atomik dalam satu UPDATE bersyarat.
create or replace function storage_account_add_limited(
  p_business uuid, p_key text, p_bucket text, p_bytes bigint, p_limit_bytes bigint
)
returns bigint
language plpgsql
as $$
declare
  inserted int;
  current_bytes bigint;
begin
  if p_bytes is null or p_bytes < 0 then
    p_bytes := 0;
  end if;

  insert into storage_usage (business_id, used_bytes, updated_at)
  values (p_business, 0, now())
  on conflict (business_id) do nothing;

  insert into storage_objects (object_key, business_id, bucket, bytes)
  values (p_key, p_business, p_bucket, p_bytes)
  on conflict (object_key) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 and p_bytes > 0 then
    update storage_usage
       set used_bytes = used_bytes + p_bytes,
           updated_at = now()
     where business_id = p_business
       and (p_limit_bytes is null or used_bytes + p_bytes <= p_limit_bytes)
     returning used_bytes into current_bytes;

    -- Limit tercapai: buang baris ledger yang baru dibuat supaya tidak yatim,
    -- lalu beri sinyal ke aplikasi.
    if current_bytes is null then
      delete from storage_objects
       where object_key = p_key and business_id = p_business;
      raise exception 'STORAGE_FULL: kuota storage business % terlampaui', p_business
        using errcode = 'P0001';
    end if;
  else
    select used_bytes into current_bytes
      from storage_usage where business_id = p_business;
  end if;

  return coalesce(current_bytes, 0);
end;
$$;

-- Hanya service_role yang memakai fungsi ini (dipanggil dari server).
revoke all on function storage_account_add_limited(uuid, text, text, bigint, bigint) from public;
grant execute on function storage_account_add_limited(uuid, text, text, bigint, bigint) to service_role;
