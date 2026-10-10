-- FIX data lama: sebelum enforce single-active, activateDevice lama
-- mengizinkan banyak device aktif per photobox. Owner mencabut satu,
-- device lama lain mengisi slot daftar — tampak "tidak ada perubahan".
--
-- Idempotent — aman dijalankan ulang. Jalankan di Supabase Dashboard
-- → SQL Editor, ATAU psql.
-- (Bila SQL Editor menampilkan "Load failed (api.supabase.com)": itu
-- gangguan jaringan browser ke dashboard, bukan error SQL — refresh
-- halaman dan coba lagi.)

begin;

-- 1) Hapus permanen semua device non-aktif (riwayat dihapus permanen).
delete from devices
where status <> 'active';

-- 2) Per photobox: sisakan HANYA device aktif terbaru, hapus sisanya
--    (tidak ada sesi dalam sesi).
delete from devices
where id in (
  select id from (
    select id,
           row_number() over (partition by photobox_id order by created_at desc) as rn
    from devices
    where status = 'active'
  ) ranked
  where ranked.rn > 1
);

commit;
