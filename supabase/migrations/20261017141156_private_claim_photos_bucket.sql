-- ============================================================================
-- CampusFind — Move claim evidence photos to their own private bucket
-- ============================================================================
-- Claim evidence photos were stored in `report-photos`, which is a PUBLIC
-- bucket - any object in it is servable via its public URL with NO auth
-- check at all, completely bypassing the claim_photos table's RLS (see the
-- scope_claim_photos_to_participants migration). report_photos genuinely
-- are meant to be public (FR-3 browse/identify), but claim evidence photos
-- are reporter/claimant-private, same as the claim itself - they never
-- should have shared a public bucket.
--
-- Fix: a dedicated private bucket, with storage.objects RLS mirroring the
-- claim_photos table policy (claim participants + admin only). Path format
-- stays `claims/<claim_id>/<photo_id>.<ext>` (unchanged from
-- operations/claims.js), so (storage.foldername(name))[2] recovers the
-- claim_id to check against.
--
-- No data migration needed - confirmed zero existing rows in claim_photos
-- and zero objects under claims/ in report-photos at the time this was
-- written, so there is nothing to move.
--
-- Client code must switch from getPublicUrl (won't work - bucket is
-- private) to createSignedUrl for displaying these photos; see
-- app/src/shared/lib/operations/claims.js (upload),
-- app/src/features/reports/ReportDetailPage.jsx (reporter's claim-review
-- view + report-delete cleanup), and
-- app/src/features/admin/reports/ReportsPage.jsx (admin's claim-review
-- view + report-delete cleanup).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('claim-photos', 'claim-photos', false)
on conflict (id) do nothing;

create policy "claim participants read claim photo files"
  on storage.objects for select
  using (
    bucket_id = 'claim-photos'
    and (
      exists (
        select 1 from claims c join reports r on r.id = c.report_id
        where c.id::text = (storage.foldername(name))[2]
          and (c.claimant_id = auth.uid() or r.reporter_id = auth.uid())
      )
      or is_admin()
    )
  );

create policy "claimant uploads own claim photo files"
  on storage.objects for insert
  with check (
    bucket_id = 'claim-photos'
    and exists (
      select 1 from claims c
      where c.id::text = (storage.foldername(name))[2]
        and c.claimant_id = auth.uid()
    )
  );

create policy "claim participants delete claim photo files"
  on storage.objects for delete
  using (
    bucket_id = 'claim-photos'
    and (
      exists (
        select 1 from claims c join reports r on r.id = c.report_id
        where c.id::text = (storage.foldername(name))[2]
          and (c.claimant_id = auth.uid() or r.reporter_id = auth.uid())
      )
      or is_admin()
    )
  );
