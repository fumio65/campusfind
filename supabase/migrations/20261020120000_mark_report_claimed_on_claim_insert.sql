-- Mark a report 'claimed' as soon as a pending claim is filed.
-- Students have no UPDATE grant on reports.status, so the client-side update
-- in claims.js silently did nothing and the "already claimed" banner never showed.
create or replace function public.mark_report_claimed_on_claim()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'pending' then
    update reports set status = 'claimed' where id = new.report_id and status = 'open';
  end if;
  return new;
end;
$$;
revoke execute on function public.mark_report_claimed_on_claim() from public, anon, authenticated;

drop trigger if exists trg_claims_mark_report_claimed on public.claims;
create trigger trg_claims_mark_report_claimed
after insert on public.claims
for each row execute function public.mark_report_claimed_on_claim();

-- No longer needed, and it let a claimant edit the reporter's title/description.
alter policy "claimant updates report status to claimed" on public.reports using (false) with check (false);

-- Repair reports that already have a pending claim but stayed open.
update public.reports r set status = 'claimed'
where r.status = 'open'
  and exists (select 1 from public.claims c where c.report_id = r.id and c.status = 'pending');
