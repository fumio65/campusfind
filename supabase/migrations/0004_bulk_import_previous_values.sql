-- ============================================================================
-- bulk_import_rows: previous_* snapshot columns
--
-- Captured once at upload time (from the existing student's current record)
-- so the admin preview can show a before/after diff on "update" rows instead
-- of just the new CSV values.
-- ============================================================================

alter table bulk_import_rows
  add column previous_enrollment_number text,
  add column previous_last_name text,
  add column previous_first_name text,
  add column previous_middle_name text,
  add column previous_program text,
  add column previous_year_level text;
