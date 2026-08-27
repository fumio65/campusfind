-- ============================================================================
-- CampusFind — Push notification device tokens + FCM delivery trigger
-- ============================================================================
-- push_tokens stores each device's FCM registration token so the send-push
-- edge function can deliver a system notification when the app isn't running.
-- The in-app Activity feed's own realtime subscription already covers the
-- foreground case with a local notification; this covers backgrounded/closed.
-- ============================================================================

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table push_tokens enable row level security;

create policy "push_tokens_select_own"
  on push_tokens for select
  using (user_id = auth.uid());

create policy "push_tokens_insert_own"
  on push_tokens for insert
  with check (user_id = auth.uid());

create policy "push_tokens_update_own"
  on push_tokens for update
  using (user_id = auth.uid());

create policy "push_tokens_delete_own"
  on push_tokens for delete
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Fire the send-push edge function whenever a new user_notifications row is
-- created. send-push has verify_jwt disabled (matches every other function
-- in this project), so no auth header needs to be attached here.
-- ----------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

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
      'report_id', new.report_id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_push_on_new_notification on user_notifications;

create trigger trg_notify_push_on_new_notification
  after insert on user_notifications
  for each row
  execute function notify_push_on_new_notification();
