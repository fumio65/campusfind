alter table programs enable row level security;

create policy "authenticated reads programs" on programs
  for select
  to authenticated
  using (true);
