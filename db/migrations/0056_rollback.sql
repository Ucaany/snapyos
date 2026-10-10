-- Rollback 0056 — hapus partial unique index single active booth POS.

drop index if exists idx_photoboxes_one_pos_active;
