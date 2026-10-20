-- A student could insert a claim on their OWN report (the app even showed
-- "I can prove this" on the reporter's own tip replies), or on a report that
-- already has an active claim or is resolved, by calling the REST API
-- directly. Claims are now only accepted on an open report that belongs to
-- someone else and has no pending/approved claim. The check lives in a
-- SECURITY DEFINER function because a claimant cannot SELECT other
-- students' claims under RLS, so an inline subquery would not see them.
create or replace function public.report_accepts_claim(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from reports r
    where r.id = p_report_id
      and r.status = 'open'
      and r.reporter_id <> auth.uid()
  )
  and not exists (
    select 1 from claims c
    where c.report_id = p_report_id
      and c.status in ('pending', 'approved')
  );
$$;

revoke execute on function public.report_accepts_claim(uuid) from public, anon;
grant execute on function public.report_accepts_claim(uuid) to authenticated;

alter policy "students submit claims" on public.claims
  with check (claimant_id = auth.uid() and public.report_accepts_claim(report_id));
