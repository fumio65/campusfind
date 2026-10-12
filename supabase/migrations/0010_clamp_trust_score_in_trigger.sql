-- ============================================================================
-- CampusFind — Clamp trust_score in apply_trust_score_event trigger
-- ============================================================================
-- users.trust_score is adjusted solely via trust_score_events (see column
-- comment: "Adjusted only via trust_score_events; informational, no
-- auto-enforcement (SRS Section 5)"). This AFTER INSERT trigger is the sole
-- mutator of users.trust_score — edge functions only insert trust_score_events
-- rows and must never also call users.update({trust_score}) directly, or the
-- delta gets double-applied (see supabase/functions/claims|reports|tips).
--
-- This migration adds clamping to [0, 200] directly in the trigger function
-- (previously unclamped, allowing scores to drift outside the valid range)
-- and marks the function security definer with a fixed search_path to
-- resolve the function_search_path_mutable security advisory.
-- ============================================================================

create or replace function public.apply_trust_score_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update users
  set trust_score = greatest(0, least(200, trust_score + new.delta))
  where id = new.user_id;
  return new;
end;
$$;
