-- ============================================================================
-- CampusFind — Lock down send_resolve_reminders() from public API access
-- ============================================================================
-- send_resolve_reminders() is SECURITY DEFINER so pg_cron can write reminder
-- notifications on its own schedule. Every function in the public schema is
-- auto-exposed by PostgREST as /rest/v1/rpc/<name>, though, so as introduced
-- it was callable by anon/authenticated - anyone could trigger the reminder
-- blast on demand, bypassing both the 3-day schedule and RLS. Restrict
-- execution to postgres (what pg_cron runs jobs as) only, and pin
-- search_path so it can't be hijacked via a role-local search_path change
-- (see the Function Search Path Mutable advisory).
-- ============================================================================

alter function public.send_resolve_reminders() set search_path = public;

revoke execute on function public.send_resolve_reminders() from public;
revoke execute on function public.send_resolve_reminders() from anon;
revoke execute on function public.send_resolve_reminders() from authenticated;
