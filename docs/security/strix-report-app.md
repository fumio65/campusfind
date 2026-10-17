# CampusFind — Security Assessment (Whitebox)

**Date:** 2026-10-17
**Scope:** `app/` (Vite web + Capacitor), `admin/`, `server/` (Express), `supabase/` (Edge Functions + migrations/RLS)
**Method:** Source-code review. Supabase project `muigquisnrhdbvnexyzu` (ref hard-coded in client, which is normal/public).

## Architecture & trust model
- Browser uses the **public anon key** and calls `supabase.from(...)` directly for many state changes (claims insert, reports update, tips). → **RLS is the primary authorization layer** for those.
- Sensitive workflow actions go to a backend that exists in **two identical implementations**:
  - **Supabase Edge Functions** (Deno) — confirmed deployed.
  - **Express `server/`** — same logic, uses the **service_role key (bypasses RLS)**.
- Good hardening already present: secrets are gitignored (not committed); `_shared/requireAdmin.ts` / `middleware/requireAdmin.js` are correct; several advisor-driven migrations (0008/0009/0010) lock down SECURITY DEFINER RPCs and fix mutable `search_path`.

**Root cause of most findings below:** every edge function that does *not* gate on admin has `verify_jwt = false` in `supabase/config.toml` **and** runs with the service_role key (RLS bypass) **and** performs no caller identity check. The matching Express routes are mounted **without** `requireAdmin`. So a large set of privileged, state-changing operations are reachable by **anyone on the internet, unauthenticated**.

Only `accounts`, `analytics`, `bulk-import`, `overview` call `requireAdmin` (and have `verify_jwt = true`). Everything else — `claims`, `confirmation`, `proxy`, `reports`, `tips`, `notifications`, `dropoff`, `send-push`, `og-preview` — does not.

---

## CRITICAL-1 — Unauthenticated claim approval → fraudulent item claim / physical theft
**Files:** `supabase/functions/claims/index.ts` (PATCH `/claims/:id`), `supabase/config.toml` (`[functions.claims] verify_jwt = false`), `server/src/routes/claims.js:11`, `server/src/index.js:44` (mounted without `requireAdmin`).

`PATCH /claims/:id` with `{"action":"approve"}` is unauthenticated and runs as service_role. It sets the claim to `approved` and the report to `approved` — the control that is supposed to be exercised only by the item's reporter or an admin. No check ties the caller to either.

**Attack chain (fully exploitable):**
1. Any student submits a claim on any found report — RLS `students submit claims` only enforces `claimant_id = auth.uid()`, with no check on report ownership/status (`supabase/migrations/0002_rls_policies.sql`).
2. Attacker calls `PATCH /functions/v1/claims/<claimId>` `{"action":"approve"}` with **no auth header** → claim + report become `approved`.
3. Workflow proceeds to handoff → attacker collects property they do not own.

`{"action":"reject"}` is equally open and also lets an attacker repeatedly reject a target's claims to drive their trust score down (-5, then -10 on 3+ rejections in 30 days) and delete the claimant's uploaded claim photos.

**Fix:** set `verify_jwt = true` and add an identity/authorization check (caller must be the report's reporter or an admin) inside the function; mount the Express `/claims` router behind an auth middleware that verifies the caller owns the report or is admin.

---

## CRITICAL-2 — Unauthenticated proxy-pickup confirmation → release item to attacker
**Files:** `server/src/routes/confirmation.js:68` (PATCH `/confirmation/:id`), `supabase/functions/confirmation/index.ts`, `config.toml` (`verify_jwt = false`).

`PATCH /confirmation/:id` `{"status":"approved"}` is unauthenticated. It flips a pickup confirmation to approved and emits "The owner has confirmed the proxy pickup. You may release the item." This is the authorization gate for handing a physical found item to a third-party proxy at the ISSC office.

An attacker who creates (`POST /confirmation`, also unauthenticated) or enumerates a confirmation id can self-approve release of an item to an arbitrary "proxy" name/student ID they supply. Physical-theft impact; combine with CRITICAL-1 / HIGH-3 for target selection.

**Fix:** require auth; only the report's reporter (the owner) may approve/deny their own confirmation request.

---

## HIGH-3 — Unauthenticated mass PII + private-message disclosure via `GET /reports`
**Files:** `server/src/routes/reports.js:9`, `supabase/functions/reports/index.ts:79-82`, `config.toml` (`verify_jwt = false`).

`GET /reports` (service_role, no auth) returns the entire reports table joined with:
- reporter `id, first_name, last_name, student_id`
- claimant `first_name, last_name, student_id`
- **`claim_messages` bodies** (private reporter↔claimant chat)
- proxy requests (proxy name + student ID)

Any unauthenticated caller dumps every student's name, student ID, and private messages — a mass PII/data-breach. (This directly contradicts the RLS model, where claims and claim_messages are deliberately private to the two parties; the service_role backend bypasses that.)

**Fix:** gate `GET /reports` behind admin auth; or if a non-admin listing is needed, build it with the anon/authenticated key so RLS applies and strip PII/message fields.

---

## HIGH-4 — PostgREST `.or()` filter injection in reports search
**Files:** `server/src/routes/reports.js` (search branch), `supabase/functions/reports/index.ts:98`.

```js
query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`)
```
`search` is raw user input interpolated into a PostgREST logical-filter string. Characters like `,`, `(`, `)`, and `.` let an attacker inject additional filter terms / reference arbitrary columns (e.g. break out of the intended title/location match, add `status.eq....`, nested `or(...)`), evaluated by the service_role client. Classic PostgREST operator injection.

**Fix:** reject/escape PostgREST metacharacters in `search`, or match with parameterized `.ilike()` calls / an RPC with bound parameters rather than string-built `.or()`.

---

## HIGH-5 — IDOR: `GET /proxy/:reportId` & `GET /confirmation/:reportId`
**Files:** `server/src/routes/proxy.js:72`, `server/src/routes/confirmation.js:55`, edge equivalents.

Both return the latest proxy/confirmation record — **proxy name, proxy student ID, reporter_id, status** — for any `reportId`, unauthenticated and enumerable. Leaks who is authorized to pick up which item (PII + an aid to CRITICAL-2 targeting).

**Fix:** require auth; restrict to the report's reporter/admin.

---

## MEDIUM-6 — Unauthenticated arbitrary push notifications (phishing/spam)
**File:** `supabase/functions/send-push/index.ts:46` (`verify_jwt = false`).

Accepts `{user_id, title, body, ...}` and sends FCM pushes with **fully attacker-controlled `title`/`body`** to every device registered to `user_id`. User UUIDs leak via HIGH-3 (`reporter.id` is returned). Enables targeted push phishing ("Your item is ready — tap here") and spam to any user.

**Fix:** this is an internal function (only the DB trigger / trusted backend should call it). Require a shared secret / service auth, or move the token-lookup+send into a trusted server path not exposed with `verify_jwt=false`.

---

## MEDIUM-7 — Notification-bell & in-app notification spoofing
**Files:** `supabase/migrations/0009_notifications_rls_and_function_hardening.sql` (insert policy), unauthenticated edge endpoints that write `notifications`/`user_notifications`.

- RLS policy `authenticated inserts proxy request notifications` lets **any authenticated user** insert `notifications` rows as long as `type='proxy_request'`, with arbitrary `title`/`body`/`report_id` → forged entries in the admin notification bell ("Proxy X authorized to collect item…").
- The unauthenticated edge endpoints (`proxy`, `confirmation`, `claims`, `reports/:id/announce`) write notifications with attacker-influenced text to arbitrary recipients.

Impact: social engineering of admins/users (e.g. legitimizing a fraudulent pickup).

**Fix:** have the client send proxy requests through the (authenticated) backend instead of a direct insert, then remove the client insert policy; constrain notification content/recipients server-side.

---

## MEDIUM-8 — RLS: reporter can set any column on own report (no WITH CHECK / column scope)
**File:** `supabase/migrations/0002_rls_policies.sql` — `create policy "reporter updates own report" ... for update using (reporter_id = auth.uid());`

No column restriction. Because the browser updates reports directly with the anon key (`app/src/shared/lib/operations/reports.js`, `operations/claims.js`), a user can `update` their **own** report's `status`, `resolved_via`, `had_rejected_claim`, `last_rejected_claimant_id`, `handoff_record`, etc. — bypassing the intended admin-/flow-driven status machine the comment describes. (Column-level control is only enforced in app code, not in RLS.)

**Fix:** enforce allowed transitions/columns in the DB — e.g. a trigger or a narrowly-scoped RPC that whitelists updatable columns, rather than a broad row-level UPDATE policy.

---

## MEDIUM-9 — Claim evidence readable by any authenticated user
**File:** `supabase/migrations/0002_rls_policies.sql` — `anyone authenticated reads claim photos` / `anyone authenticated reads report photos` = `auth.role() = 'authenticated'`.

The claims model is deliberately private (claims/claim_messages are scoped to the two parties). But `claim_photos` — proof-of-ownership evidence (receipts, serial numbers, personal items) — is readable by **every logged-in user**. Inconsistent with the privacy model; information disclosure. (Also confirm the `report-photos` Storage bucket's own policies — storage RLS is not in the migrations and must be checked in the dashboard; if the bucket is public, HIGH-3/og-preview image paths are directly fetchable.)

**Fix:** scope `claim_photos` SELECT to thread participants + admin, mirroring `claim_messages`. Verify Storage bucket policies.

---

## MEDIUM-10 — Student-ID enumeration oracle
**Files:** `server/src/routes/proxy.js:19`, `server/src/routes/reports.js` (`/:id/credit-finder`), edge equivalents.

These endpoints return a distinguishable "…student ID not found" vs success for a supplied `student_id`, unauthenticated. An attacker can enumerate valid student IDs (and, via other endpoints, map them to names). Privacy / account-targeting aid.

**Fix:** require auth; return a uniform response regardless of existence; rate-limit.

---

## LOW-11 — Unauthenticated notification read/modify & mass-announce (Express)
**Files:** `server/src/routes/notifications.js` (all handlers), `server/src/routes/reports.js` (`/:id/announce`), mounted without `requireAdmin` in `server/src/index.js:41,43`.

If the Express server is internet-reachable: `GET /notifications` lists all admin notifications; `PATCH /notifications/read-all` / `:id/read` and `POST /notifications` are open; `POST /reports/:id/announce` fans a notification out to **every student** (spam/abuse). (In prod via edge functions the `notifications` table now has RLS, but service_role Express bypasses it.)

**Fix:** gate all notification/announce routes behind `requireAdmin` or appropriate auth.

---

## LOW-12 — Wildcard CORS on unauthenticated functions
All edge functions send `Access-Control-Allow-Origin: *`. Harmless alone, but combined with the missing auth above it means any web page can drive these endpoints from a victim's browser. Low on its own; fold into the auth fixes.

---

## Priority remediation order
1. **CRITICAL-1, CRITICAL-2** — add auth + ownership checks to `claims` PATCH and `confirmation` PATCH (and set `verify_jwt=true`). These allow fraudulent claim approval and item release.
2. **HIGH-3, HIGH-5** — lock `GET /reports`, `GET /proxy/:id`, `GET /confirmation/:id` behind admin/owner auth; strip PII/messages.
3. **HIGH-4** — fix `.or()` search injection.
4. **MEDIUM-6..10** — send-push auth, notification-insert policy, reports UPDATE column scope, claim_photos visibility, enumeration oracles.
5. **LOW-11/12** — notification/announce auth, CORS.

## Not vulnerable / verified clean
- Secrets (`server/.env`) are gitignored and not committed; service_role key is server-only.
- `requireAdmin` (both stacks) correctly verifies JWT → user → `role='admin'` → not deactivated, using the service_role client to read the role.
- SECURITY DEFINER RPCs (`send_resolve_reminders`, `notify_push_on_new_notification`, `rls_auto_enable`) have execute revoked from anon/authenticated and pinned `search_path` (migrations 0008/0009).
- Trust score is clamped [0,200] and mutated only via the `trust_score_events` trigger; no client insert policy on `trust_score_events`.
- `users` has no student-writable UPDATE policy → no direct self-escalation to `role='admin'` via the anon key.
- `og-preview` fetches a fixed `SUPABASE_URL` storage path (DB-derived `storage_path`), not a user-supplied URL → no SSRF.
