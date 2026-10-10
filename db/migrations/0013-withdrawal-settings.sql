-- 0013: konfigurasi penarikan (withdrawal) via platform_settings.
-- withdrawal_days  : hari (0=Minggu … 6=Sabtu) penarikan dibuka — default semua hari.
-- withdrawal_sla_hours: SLA proses admin (jam) — ditampilkan ke owner sebagai estimasi.

insert into platform_settings (key, value) values
  ('withdrawal_days', '[0,1,2,3,4,5,6]'::jsonb),
  ('withdrawal_sla_hours', '24'::jsonb)
on conflict (key) do nothing;
