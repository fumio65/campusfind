-- ============================================================================
-- report_photos: thumbnail_path
--
-- Storage path of a small, client-generated JPEG the app uploads alongside
-- the full-resolution photo, so list/strip views (homepage, report detail)
-- fetch a few KB instead of the original multi-MB camera file just to show
-- a 64-128px thumbnail. Nullable and optional: existing rows (and any future
-- upload where thumbnail generation fails) simply have no thumbnail_path,
-- and the client falls back to storage_path for them - no backfill needed.
-- ============================================================================

alter table report_photos add column thumbnail_path text;
