-- Rollback 0026: session timer + POS atomicity
drop function if exists pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer);
drop index if exists idx_tx_pos_order_unique;
