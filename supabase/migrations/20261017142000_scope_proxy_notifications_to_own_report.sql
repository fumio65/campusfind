-- ============================================================================
-- CampusFind — Scope proxy-request notification inserts to the caller's own report
-- ============================================================================
-- 0009_notifications_rls_and_function_hardening.sql turned RLS on for
-- public.notifications and added "authenticated inserts proxy request
-- notifications" so ProxyRequestForm.jsx (which writes this admin-facing
-- notice directly from the client) wouldn't be broken by that change. But
-- its with_check only verified `type = 'proxy_request'` - nothing tied the
-- inserted row's report_id to a report the caller actually owns, and
-- title/body are free text supplied by the client. That meant any
-- authenticated user could insert a notification naming ANY report_id
-- (including someone else's) with an arbitrary title/body, and it would
-- land in the admin's global notification bell indistinguishable from a
-- real "Proxy Pickup Registered" notice - a spoofing/social-engineering
-- vector against the ISSC staff reviewing it (e.g. to make a fabricated
-- pickup authorization look legitimate for someone else's lost item).
--
-- proxy_requests itself already has a proper ownership check on insert
-- ("users can insert their own proxy requests": report_id must belong to
-- reports.reporter_id = auth.uid()) - this just brings the notification
-- row in line with the same rule, since it's meant to describe exactly
-- that action. The free-text title/body still aren't content-validated by
-- RLS (not practical to do so), but the caller can now only attach them to
-- their own report, same trust boundary they already have over their own
-- report's other fields.
-- ============================================================================

drop policy if exists "authenticated inserts proxy request notifications" on public.notifications;

create policy "authenticated inserts own proxy request notifications"
on public.notifications
for insert
to authenticated
with check (
  type = 'proxy_request'
  and exists (
    select 1 from reports where id = report_id and reporter_id = auth.uid()
  )
);
