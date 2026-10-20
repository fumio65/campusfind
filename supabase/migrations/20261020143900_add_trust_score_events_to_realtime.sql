-- The app's notifications channel also listens for trust_score_events
-- INSERTs. That table was never in the realtime publication, so the whole
-- channel failed to join: Activity, the unread badge and the trust-score
-- toast never updated live (only on refresh/navigation).
alter publication supabase_realtime add table public.trust_score_events;
