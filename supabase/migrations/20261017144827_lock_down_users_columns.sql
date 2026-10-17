-- ============================================================================
-- CampusFind — Close two column-level holes on public.users
-- ============================================================================
-- Found while scoping the Strix "student-ID enumeration" finding: the real
-- exposure here is much worse than just name-by-ID lookup.
--
-- 1. SELECT - every column of public.users, including enrollment_number,
--    was grantable to `authenticated` (and even `anon`). Per CONTEXT.md,
--    enrollment_number IS the student's login password. Two blanket
--    "qual: true" RLS policies ("anyone authenticated reads basic user
--    info for tips", "authenticated reads all user basic info") meant ANY
--    signed-in student could read EVERY other student's password,
--    admin-or-not role flag, trust score, and status straight off the
--    table - e.g. GET /rest/v1/users?select=student_id,enrollment_number.
--    No legitimate client code anywhere reads enrollment_number back for
--    any user (not even their own - nothing displays "your enrollment
--    number"), so dropping it from the re-granted column list below is a
--    pure, safe fix with zero functional impact.
--
--    A column-level REVOKE alone does not work here: there's a
--    pre-existing TABLE-level `grant select on public.users` that
--    implicitly covers every column no matter what a narrower column-level
--    revoke says, so the table-level grant has to be revoked outright and
--    replaced with an explicit column list - same pattern as the UPDATE
--    fix below (and the same pattern already used for public.reports
--    earlier in this pass).
--
-- 2. UPDATE - every column was similarly grantable, and the only row-level
--    UPDATE policy available to a non-admin ("users update own password
--    flag", qual/with_check: id = auth.uid()) only restricts WHICH ROW can
--    be updated, not which columns. Column grants aren't row-scoped, so
--    this let any signed-in student PATCH their *own* row's role to
--    'admin', trust_score to anything, status back to 'active', or even
--    their own enrollment_number - a full self-service privilege
--    escalation. The only legitimate client-side update to a user's own
--    row is clearing force_password_change after a password change (see
--    app/src/features/auth/ChangePasswordPage.jsx), so that's the only
--    column re-granted.
--
-- NOT changed here (left for a follow-up, see conversation): `role` keeps
-- its SELECT grant, because AuthContext.jsx currently reads a user's own
-- `role` column client-side to decide whether to show the admin UI, and a
-- column grant can't be scoped to "only your own row" the way RLS scopes
-- rows - revoking it here would break that check for real admins too.
-- Narrowing that safely means moving the check to a SECURITY DEFINER RPC
-- (the project already has an is_admin() function RLS policies call) so
-- the client asks "am I admin?" instead of reading the raw column.
-- ============================================================================

revoke select on public.users from authenticated, anon;
grant select (
  id, student_id, last_name, first_name, middle_name, program, year_level,
  role, status, trust_score, force_password_change, created_at, updated_at,
  department_code, program_code
) on public.users to authenticated, anon;

revoke update on public.users from authenticated, anon;
grant update (force_password_change) on public.users to authenticated;
