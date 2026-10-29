-- ---------------------------------------------------------------------------
-- 0083_security_voucher_quota_trigger_and_session_idempotency.sql
--
-- N3 (CONFIRMED lewat db/validation/validate_leads.sql): voucher usage_limit
-- hanya dicek saat apply. Dua checkout di booth berbeda bisa sama-sama
-- membawa voucher kuota 1 dan dua-duanya settle → dua baris voucher_usages.
--
-- Perbaikan: trigger pada INSERT payments. Advisory lock per voucher membuat
-- hitung-kuota + insert berjalan serial, sehingga percobaan paralel tidak bisa
-- sama-sama lolos. Kuota = pemakaian tercatat + payment yang masih
-- creating/pending (payment pending berfungsi sebagai reservasi).
--
-- N7 (CONFIRMED): dedupe cloud memakai started_at dari client_created_at,
-- sehingga dua sesi berbeda dengan waktu sama dianggap replay. Kolom
-- idempotency_key + unique index memberi identitas per-sesi yang dikirim
-- worker (photobox_slug:local_session_id).
-- ---------------------------------------------------------------------------

alter table sessions
  add column if not exists idempotency_key text
  check (idempotency_key is null or char_length(idempotency_key) between 1 and 200);

create unique index if not exists uq_sessions_idempotency_key
  on sessions (business_id, photobox_id, idempotency_key)
  where idempotency_key is not null;

create or replace function enforce_voucher_quota_before_payment()
returns trigger
language plpgsql
as $$
declare
  v_limit integer;
  v_used integer;
  v_pending integer;
begin
  if new.voucher_id is null then
    return new;
  end if;

  -- Lock per voucher sampai transaksi selesai: dua INSERT paralel antre di sini,
  -- jadi hitungan di bawah tidak bisa "sama-sama lolos".
  perform pg_advisory_xact_lock(hashtextextended(new.voucher_id::text, 0));

  select usage_limit into v_limit
    from vouchers
   where id = new.voucher_id;

  if v_limit is null then
    return new; -- tanpa batas
  end if;

  select count(*) into v_used
    from voucher_usages
   where voucher_id = new.voucher_id;

  select count(*) into v_pending
    from payments
   where voucher_id = new.voucher_id
     and status in ('creating', 'pending');

  if v_used + v_pending >= v_limit then
    raise exception 'VOUCHER_LIMIT_REACHED: kuota voucher % sudah habis (% terpakai + % menunggu)',
      new.voucher_id, v_used, v_pending
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_voucher_quota on payments;
create trigger trg_enforce_voucher_quota
  before insert on payments
  for each row execute function enforce_voucher_quota_before_payment();
