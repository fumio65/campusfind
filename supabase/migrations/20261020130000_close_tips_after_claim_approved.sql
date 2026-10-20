-- Tips are only accepted while the item is still being looked for
-- (open, or a claim is under review). Once a claim is approved or the
-- report is resolved, new tips and replies are refused.
alter policy "any user leaves tips" on public.tips
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.reports r where r.id = tips.report_id and r.status in ('open', 'claimed'))
  );
