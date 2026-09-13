-- ============================================================================
-- CampusFind — Carry `type` and `tip_id` through to push payloads
-- ============================================================================
-- The push trigger from 0003_push_notifications.sql only forwarded
-- report_id, so a tapped push notification had no way to know which report
-- sub-view to land on (report detail vs. its message thread vs. a tip
-- anchor). Tapping any push just reopened the app wherever it last was.
-- Forward the full set send-push now understands so app/src/shared/lib/
-- notificationRoute.js can resolve the same target path a tap in the
-- in-app Activity list already resolves to.
-- ============================================================================

create or replace function notify_push_on_new_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://muigquisnrhdbvnexyzu.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'user_id', new.user_id,
      'title', new.title,
      'body', new.body,
      'report_id', new.report_id,
      'type', new.type,
      'tip_id', new.tip_id
    )
  );
  return new;
end;
$$;
