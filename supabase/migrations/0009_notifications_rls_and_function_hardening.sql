-- ============================================================================
-- CampusFind — Enable RLS on notifications, pin/lock down flagged functions
-- ============================================================================
-- Security advisor findings addressed here:
--
-- 1. public.notifications has RLS policies defined ("admin reads
--    notifications", "admin updates notifications", "service role inserts
--    notifications") but RLS itself was never enabled on the table - so
--    those policies were dead weight and the table was fully readable/
--    writable by anyone via PostgREST, leaking proxy pickup names/Student
--    IDs from notification bodies to any authenticated (or anon) caller.
--
--    Enabling RLS as-is would break ProxyRequestForm.jsx, which inserts
--    directly from the client (not through a service-role backend, unlike
--    every other writer of this table - see supabase/functions/proxy,
--    dropoff, confirmation) with only the anon/authenticated key. Add a
--    narrowly-scoped insert policy for that one legitimate case instead of
--    leaving RLS off.
--
-- 2. is_admin(), notify_push_on_new_notification(), and rls_auto_enable()
--    are SECURITY DEFINER functions in the public schema, which PostgREST
--    auto-exposes as /rest/v1/rpc/<name> to anon/authenticated by default.
--    - is_admin() is a load-bearing RLS predicate used by policies on
--      users, reports, claims, trust_score_events, bulk_import_batches,
--      dropoff_requests, and claim_messages - it must stay callable by
--      authenticated, and it only self-checks the caller's own auth.uid(),
--      so public execute is intentional and safe. Only its mutable
--      search_path is fixed here.
--    - notify_push_on_new_notification() (RETURNS trigger) and
--      rls_auto_enable() (RETURNS event_trigger) can't actually be invoked
--      via a direct RPC call regardless (Postgres rejects calling trigger/
--      event-trigger functions outside their trigger context), so this is
--      defense-in-depth cleanup, not a live exploit fix.
-- ============================================================================

alter table public.notifications enable row level security;

create policy "authenticated inserts proxy request notifications"
on public.notifications
for insert
to authenticated
with check (type = 'proxy_request');

alter function public.is_admin() set search_path = public;
alter function public.notify_push_on_new_notification() set search_path = public;

revoke execute on function public.notify_push_on_new_notification() from public;
revoke execute on function public.notify_push_on_new_notification() from anon;
revoke execute on function public.notify_push_on_new_notification() from authenticated;

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
