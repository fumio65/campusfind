-- ============================================================================
-- CampusFind — Allow a user to delete their own notifications
-- ============================================================================
-- user_notifications had SELECT and UPDATE policies scoped to the owning
-- user (user_id = auth.uid()) but no DELETE policy, so a direct
-- `.from('user_notifications').delete()` call from the client (see
-- deleteNotification in shared/lib/repositories/notifications.js, used by
-- the Activity page's swipe-to-delete feature) was silently filtered to
-- zero rows by RLS instead of actually deleting anything.
-- ============================================================================

create policy "users delete own notifications"
  on public.user_notifications
  for delete
  to public
  using (user_id = auth.uid());
