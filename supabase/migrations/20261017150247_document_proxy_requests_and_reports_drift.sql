-- This migration documents schema drift: the objects below already exist
-- live, added out-of-band rather than through a tracked migration (same
-- kind of gap as 20261012131913_document_tip_credited_resolved_via.sql).
-- Written idempotently so applying it is a no-op against the current
-- database, but a FRESH setup (`supabase db reset`, a new environment)
-- will now actually create them instead of silently missing a whole
-- feature (proxy pickup requests) and three reports columns the app
-- depends on.
--
-- proxy_requests - backs the proxy-pickup flow (ProxyRequestForm.jsx,
-- supabase/functions/proxy/index.ts): a reporter who can't collect their
-- own item in person names someone else (identified by student ID) who's
-- allowed to pick it up instead. Its RLS was already correctly scoped
-- (reporter manages their own report's requests; admin reads all) - this
-- was found and double-checked while fixing the notification-bell
-- spoofing issue (20261017142000 migration); it was never itself the
-- vulnerability, just undocumented.
--
-- reports.had_rejected_claim / last_rejected_claimant_id - set when a
-- claim on a report is rejected, so the UI can show a "claim rejected"
-- history note and know who the most recent rejected claimant was.
-- reports.handoff_record - jsonb snapshot of in-person handoff details
-- recorded once a report resolves via direct reporter/claimant handoff.

create table if not exists public.proxy_requests (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  reporter_id uuid not null references public.users(id),
  proxy_name text not null,
  proxy_student_id text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.proxy_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'proxy_requests' and policyname = 'admin reads all proxy requests'
  ) then
    create policy "admin reads all proxy requests"
    on public.proxy_requests
    for select
    using (
      exists (select 1 from users where users.id = auth.uid() and users.role = 'admin'::user_role)
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'proxy_requests' and policyname = 'reporter manages own proxy requests'
  ) then
    create policy "reporter manages own proxy requests"
    on public.proxy_requests
    for all
    using (reporter_id = auth.uid())
    with check (reporter_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'proxy_requests' and policyname = 'users can insert their own proxy requests'
  ) then
    create policy "users can insert their own proxy requests"
    on public.proxy_requests
    for insert
    with check (report_id in (select id from reports where reporter_id = auth.uid()));
  end if;
end $$;

alter table public.reports
  add column if not exists had_rejected_claim boolean not null default false,
  add column if not exists last_rejected_claimant_id uuid references public.users(id),
  add column if not exists handoff_record jsonb;
