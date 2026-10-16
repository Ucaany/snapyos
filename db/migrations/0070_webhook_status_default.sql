-- 0070: default `payment_webhooks.status` diselaraskan dengan claim path.
--
-- Latar: migrasi 0066 menambahkan nilai `received` untuk idempotency state-aware
-- (klaim non-authoritative SEBELUM re-verify provider, promosi ke `processed`
-- hanya setelah settlement sukses). Namun default kolom masih `'processed'`
-- (nilai pra-0066). Kode selalu mengirim status eksplisit, jadi default ini
-- adalah nilai mati yang menyesatkan: baris yang disisipkan tanpa status
-- eksplisit langsung tampak "sudah ditangani" dan memblokir redelivery.
-- Diselaraskan ke `'received'` supaya default = non-authoritative (fail-open
-- untuk redelivery, bukan fail-closed).

begin;

alter table payment_webhooks alter column status set default 'received';

commit;
