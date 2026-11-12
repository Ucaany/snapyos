-- 0089 — hapus katalog installer Windows.
-- Aplikasi Windows native sudah dihapus (commit 22a1598); tabel ini tidak lagi
-- dibaca kode mana pun. Artifact lama di private storage tidak disentuh.
begin;

drop table if exists installer_catalog;

commit;
