-- ============================================================================
-- CampusFind — Scope claim-photo visibility to the claim's own participants
-- ============================================================================
-- "anyone authenticated reads claim photos" (0002_rls_policies.sql) let any
-- logged-in user view ANY claimant's evidence photos for ANY claim on ANY
-- report, by reading the claim_photos table directly or guessing/listing
-- storage paths. That's inconsistent with the claims table itself, whose
-- own policies ("claimant reads own claims" / "reporter reads claims on own
-- reports" / "admin reads all claims") and comment explicitly say claim
-- review is "reporter-private per FR-4, not public browse data" - the
-- proof-of-ownership photos a claimant uploads are exactly the kind of
-- private claim data that comment is talking about, so they should follow
-- the same visibility rule as the claim they belong to and the messages on
-- its thread (see "thread participants read messages" on claim_messages,
-- same join pattern below), not the "report_photos are public browse data"
-- rule they were accidentally grouped with.
--
-- report_photos itself is intentionally left untouched - those genuinely
-- are meant to be visible to any authenticated user, since browsing lost/
-- found item photos to help identify them is the whole point of FR-3.
-- ============================================================================

drop policy if exists "anyone authenticated reads claim photos" on claim_photos;

create policy "claim participants read claim photos" on claim_photos
  for select using (
    exists (
      select 1 from claims c join reports r on r.id = c.report_id
      where c.id = claim_photos.claim_id
        and (c.claimant_id = auth.uid() or r.reporter_id = auth.uid())
    ) or is_admin()
  );
