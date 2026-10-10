-- 0056 — POS: satu booth aktif per business (1 add-on = 1 booth).
-- Partial unique index menjamin maksimal satu photobox dengan pos_enabled=true
-- per business. Idempotent: index dibuat bila belum ada.

-- Data fix: business yang sudah punya >1 booth aktif (data lama), pertahankan
-- booth yang paling baru di-update, nonaktifkan sisanya.
update photoboxes p
set pos_enabled = false
where p.pos_enabled = true
  and p.id <> (
    select p2.id
    from photoboxes p2
    where p2.business_id = p.business_id
      and p2.pos_enabled = true
    order by p2.updated_at desc, p2.id desc
    limit 1
  );

create unique index if not exists idx_photoboxes_one_pos_active
  on photoboxes (business_id)
  where pos_enabled = true;

comment on index idx_photoboxes_one_pos_active is
  'Maksimal satu booth POS aktif per business (1 add-on = 1 booth).';
