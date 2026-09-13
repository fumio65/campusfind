-- ============================================================================
-- CampusFind — Automated "mark as resolved" reminders
-- ============================================================================
-- Reports that are approved but have no tracked handoff (not a walk-in item,
-- no ISSC drop-off, no proxy pickup) used to require an admin to eyeball them
-- and hit "Force resolve" without any verification. Only the reporter
-- actually knows whether they got their item back, so instead we remind them
-- to use the "Mark as resolved" flow they already have in the app
-- (ReportDetailPage.jsx), repeating every few days until they do.
--
-- Runs daily via pg_cron. Reuses the existing push-notification trigger on
-- user_notifications (see 0003_push_notifications.sql) - no extra wiring
-- needed for delivery.
-- ============================================================================

alter table reports add column if not exists resolve_reminder_sent_at timestamptz;
alter table reports add column if not exists resolve_reminder_count smallint not null default 0;

create extension if not exists pg_cron;

-- claims.reviewed_at is never populated by application code, so
-- claims.updated_at is used as the "approved at" timestamp instead - the
-- only writes to an approved claim's row happen at approve/reject/resolve
-- time (see supabase/functions/claims and reports), so it stays stable for
-- the whole window a report sits in 'approved'.
create or replace function send_resolve_reminders()
returns void
language sql
security definer
as $$
  with due as (
    select r.id as report_id, r.reporter_id, r.title
    from reports r
    join claims c on c.report_id = r.id and c.status = 'approved'
    where r.status = 'approved'
      and r.type <> 'found_walkin'
      and not exists (select 1 from proxy_requests pr where pr.report_id = r.id)
      and not exists (
        select 1 from claim_messages cm
        where cm.claim_id = c.id and cm.body like '📍%'
      )
      and (
        (r.resolve_reminder_sent_at is null and c.updated_at <= now() - interval '3 days')
        or
        (r.resolve_reminder_sent_at is not null and r.resolve_reminder_sent_at <= now() - interval '3 days')
      )
  ),
  stamped as (
    update reports
    set resolve_reminder_sent_at = now(),
        resolve_reminder_count = resolve_reminder_count + 1
    where id in (select report_id from due)
    returning id
  )
  insert into user_notifications (user_id, type, title, body, report_id)
  select
    d.reporter_id,
    'resolve_reminder',
    'Did you get your item back?',
    'If "' || d.title || '" has been returned, open it and tap "Mark as resolved" to close it out.',
    d.report_id
  from due d
  join stamped s on s.id = d.report_id;
$$;

select cron.schedule(
  'resolve-reminders-daily',
  '0 9 * * *',
  $$select send_resolve_reminders()$$
);
