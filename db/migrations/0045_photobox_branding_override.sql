-- 0045 — Per-booth branding override (Branding & Kiosk full customization).
-- `branding` jsonb null = inherit global business_settings.branding.
-- Non-null = override sebagian/seluruh field (deep-merge di app layer saat render).
-- Contract field = sama dengan brandingSchema (docs/04 §4.8, docs/05 §5.2).

alter table photoboxes
  add column branding jsonb;

comment on column photoboxes.branding is
  'Branding kiosk per-booth (null = inherit business_settings.branding). Deep-merge saat render.';
