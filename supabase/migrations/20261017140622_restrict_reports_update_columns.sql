-- ============================================================================
-- CampusFind — Restrict which report columns a reporter can update directly
-- ============================================================================
-- "reporter updates own report" (0002_rls_policies.sql) correctly restricts
-- WHICH ROW a reporter can update (reporter_id = auth.uid()), but Postgres
-- RLS only ever filters rows - it does not restrict which COLUMNS can be
-- set in that row, and the default Supabase grant gives `authenticated`
-- UPDATE on every column of the table. Combined, that meant a reporter
-- could PATCH their own report directly via PostgREST and set ANY column,
-- including ones that are only supposed to be mutated by backend business
-- logic: status, resolved_via/resolved_at, had_rejected_claim,
-- last_rejected_claimant_id, handoff_record, walkin_pickup_verified_*, and
-- the resolve-reminder bookkeeping columns. For example, a reporter could
-- set status: 'resolved' directly, skipping the claim-approval/handoff flow
-- entirely and marking their own item "recovered" with no claimant involved
-- (and no trust-score/notification side effects that the real flow has).
--
-- The app's own "edit report" feature (EditReportPage.jsx ->
-- updateReport()) only ever sends {title, description, location, category}
-- - everything else is set server-side by the edge functions below, all of
-- which use the service-role client and so are unaffected by this change:
--   claims/index.ts (approve/reject -> status, resolved_via, resolved_at,
--     had_rejected_claim, last_rejected_claimant_id)
--   reports/index.ts (/resolve, /walkin, /credit-finder -> status,
--     resolved_via, resolved_at, handoff_record, walkin_pickup_verified_*)
--   the resolve-reminder cron job (resolve_reminder_sent_at/_count)
--
-- Fix: narrow the column-level grant to exactly the four fields a reporter
-- is meant to edit themselves. The row-level policy (reporter_id =
-- auth.uid()) still applies on top of this.
-- ============================================================================

revoke update on public.reports from authenticated;
revoke update on public.reports from anon;

grant update (title, description, location, category) on public.reports to authenticated;
