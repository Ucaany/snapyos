-- 0020-template-video.sql
-- Add video_url column to templates for looping video background/content (kiosk).
-- Storage key in business-assets bucket; null = no video.

alter table templates
  add column if not exists video_url text;
