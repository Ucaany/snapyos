-- Owner dashboard query support: popular-template metrics by business/date.
create index if not exists idx_photos_business_created
  on photos (business_id, created_at);
