-- Bulk import rows were only ever writing the free-text `program` column,
-- bypassing the structured programs/department_code work done for the
-- Accounts page. Add the same structured columns here so CSV-imported
-- students get a real department_code/program_code too, instead of
-- showing up as "Unspecified" everywhere else in the app.
alter table bulk_import_rows
  add column program_code text references programs(program_code),
  add column department_code text,
  add column program_matched boolean not null default true,
  add column previous_program_code text,
  add column previous_department_code text;

comment on column bulk_import_rows.program_matched is
  'false when the CSV''s free-text Program/Course value did not resolve to any row in programs - surfaced as a warning in the review UI so the admin can fix the source CSV before confirming.';
