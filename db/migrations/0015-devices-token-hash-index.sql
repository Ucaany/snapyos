-- FIX perf: resolveActiveDevice (src/server/devices.ts) melakukan exact-match
-- lookup devices.device_token_hash pada SETIAP request kiosk — tanpa index ini
-- full scan. Konsisten dengan db/schema.sql (idx_devices_token_hash).
create index if not exists idx_devices_token_hash on devices (device_token_hash);
