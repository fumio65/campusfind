-- ============================================================================
-- CampusFind — Correct the previous migration's SELECT revoke on users
-- ============================================================================
-- 20261017144827_lock_down_users_columns.sql tried to close the
-- enrollment_number (login password) leak with:
--   revoke select (enrollment_number) on public.users from authenticated, anon;
-- That's a COLUMN-level revoke, but there was already a pre-existing
-- TABLE-level `grant select on public.users to authenticated, anon` which
-- implicitly covers every column regardless of a narrower column-level
-- revoke - so it silently did nothing (confirmed live: enrollment_number
-- was still readable after that migration applied). The UPDATE half of
-- that same migration worked fine, because it correctly revoked at the
-- table level first before re-granting a specific column.
--
-- This applies the same correct pattern to SELECT: revoke the table-level
-- grant outright, then re-grant every column except enrollment_number.
-- ============================================================================

revoke select on public.users from authenticated, anon;
grant select (
  id, student_id, last_name, first_name, middle_name, program, year_level,
  role, status, trust_score, force_password_change, created_at, updated_at,
  department_code, program_code
) on public.users to authenticated, anon;
