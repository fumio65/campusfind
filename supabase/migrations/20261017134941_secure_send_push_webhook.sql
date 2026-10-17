-- ============================================================================
-- CampusFind — Secure the send-push webhook with a shared secret
-- ============================================================================
-- send-push has verify_jwt = false because its only legitimate caller is the
-- notify_push_on_new_notification trigger below (fired via pg_net on every
-- new user_notifications row) - a database trigger has no user session, so
-- there's no JWT it could attach. But that also meant anyone on the public
-- internet could call the function URL directly with an arbitrary
-- user_id/title/body and get a real FCM push sent to that user's device,
-- since the function had no way to tell "our own trigger" from "a random
-- request" apart.
--
-- Fix: generate a random secret and store it in Supabase Vault (Postgres
-- generates the value itself when this migration runs - the plaintext
-- secret is never written into this file or committed to git). The trigger
-- looks the secret up from Vault and sends it as a header; send-push's code
-- (see supabase/functions/send-push/index.ts) rejects any request where
-- that header doesn't match its PUSH_WEBHOOK_SECRET edge function secret.
--
-- ONE-TIME MANUAL STEP after this migration is applied:
--   1. In the Supabase SQL editor (or `supabase db` access), run:
--        select decrypted_secret from vault.decrypted_secrets
--        where name = 'push_webhook_secret';
--   2. Copy the value it returns, then run locally:
--        supabase secrets set PUSH_WEBHOOK_SECRET=<value> --project-ref muigquisnrhdbvnexyzu
--   3. Redeploy the function so it picks up the new secret:
--        supabase functions deploy send-push --project-ref muigquisnrhdbvnexyzu
-- Until step 2+3 are done, send-push will reject ALL calls (including the
-- trigger's own), so pushes temporarily stop sending rather than staying
-- open to anyone - fail closed, not fail open.
-- ============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_webhook_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'push_webhook_secret',
      'Shared secret the push-notification DB trigger sends to send-push, so the edge function can tell a real trigger call from a random internet request.'
    );
  end if;
end $$;

create or replace function notify_push_on_new_notification()
returns trigger
language plpgsql
security definer
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret';

  perform net.http_post(
    url := 'https://muigquisnrhdbvnexyzu.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
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
