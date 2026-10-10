-- Provider default pembayaran disamakan dengan provider aktif: Pakasir.
-- Nilai provider lama pada baris historis TIDAK diubah (data tetap apa adanya),
-- hanya default kolom untuk baris baru yang diselaraskan.
alter table payments
  alter column provider set default 'pakasir';

alter table invoice_payments
  alter column provider set default 'pakasir';
