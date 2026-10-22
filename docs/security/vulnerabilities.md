# CampusFind — Web / Backend Security Assessment

**Target:** https://c4mpusfind.netlify.app (student PWA) + Supabase backend `muigquisnrhdbvnexyzu.supabase.co`
**Scope:** Authorized assessment of the deployed web app and its Supabase Edge Functions (owner-run).
**Date:** 2026-10-20
**Assessor:** Automated review (source-informed + live non-destructive validation)
**Method:** Source review of `supabase/functions/*` + `config.toml`, then live confirmation against the deployed project using only the public anon `apikey` and **no user token** (the anonymous-internet-attacker scenario). All live probes were read-only or no-ops — no data was modified, no notifications were sent.

---

## Executive summary

The static frontend (Netlify) and the client Supabase integration are sound: no secrets are committed (`.env*` gitignored; only the public anon key ships in the bundle, which is expected), HSTS is set, and the client uses the anon key under RLS. The **Express `server/`** issues from the prior `strix-report-app.md` have largely been migrated to Edge Functions with `requireAdmin` / `requireUser` guards, and those guards **work live** (`reports`, `claims`, `accounts`, `overview`, … all return `401` unauthenticated).

**However, three Edge Functions were missed during that hardening pass.** `dropoff`, `notifications`, and `tips` run with the **`service_role` key (full RLS bypass)**, have **`verify_jwt = false`**, and perform **no caller-identity check whatsoever**. They are reachable and fully functional by **any unauthenticated person on the internet**. This is the same root-cause class the prior report identified on the Express server — these three functions are the remaining instances.

Confirmed impact, unauthenticated:
- **PII disclosure** — full name + **student ID** of every reporter and claimant with a drop-off request.
- **Trust-score manipulation** — grant trust-score points to arbitrary accounts.
- **Report/claim state tampering** — force arbitrary reports and claims to `resolved`.
- **Admin-alert tampering** — read, forge, and mass-dismiss admin notifications.

| ID | Title | Function | CVSS 3.1 | Severity |
|----|-------|----------|----------|----------|
| WEB-01 | Unauthenticated access to `dropoff` (PII read + state tampering) | `dropoff` | 9.1 | **Critical** |
| WEB-02 | Unauthenticated trust-score inflation + forced report resolution | `tips` | 7.5 | **High** |
| WEB-03 | Unauthenticated read/forge/dismiss of admin notifications | `notifications` | 7.3 | **High** |
| WEB-04 | `verify_jwt = false` on guard-protected functions (defense-in-depth) | `reports` (+others) | — | Info / Hardening |

---

## WEB-01 — Unauthenticated access to `dropoff`: PII disclosure + state tampering  (Critical, CVSS 9.1)

**CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N**
**File:** `supabase/functions/dropoff/index.ts`; `supabase/config.toml` (`[functions.dropoff] verify_jwt = false`)

The function is created with the `SUPABASE_SERVICE_ROLE_KEY` (bypasses all RLS) and has **no `requireAdmin`/`requireUser` call**. Every route is open:

- **`GET /dropoff`** returns all drop-off requests joined to `users`, exposing `claimant.first_name/last_name/student_id` and `reporter.first_name/last_name/student_id` (lines 104–133). → **Mass PII / student-ID breach.**
- **`POST /dropoff`** lets anyone forge a drop-off request for arbitrary `reportId/claimId/claimantId/reporterId` and inject an admin notification (lines 25–102). → Forgery / admin spam.
- **`PATCH /dropoff/:id/receive`** lets anyone set `status=received` and an attacker-chosen `drop_off_photo_path`, and fire a student notification (lines 135–179).
- **`PATCH /dropoff/:id/pickup`** lets anyone force `reports.status=resolved`, `claims.status=resolved`, and **+5 trust_score** to the claimant (lines 181–249). → **Report/claim state tampering + trust manipulation.**

### Live confirmation (non-destructive)
```
GET https://muigquisnrhdbvnexyzu.supabase.co/functions/v1/dropoff
    apikey: <public anon key>        (NO Authorization bearer)
→ HTTP 200   []        # function executed unauthenticated; empty only because no rows exist right now
```
A guarded function in the same project returns `401` on the identical request (see WEB-04 control). The `200` proves there is no auth gate — when drop-off rows exist, this returns reporter/claimant names and student IDs to anyone.

### Impact
Unauthenticated internet users can harvest student PII (names + IDs), silently resolve any report/claim (hiding real lost-item cases or completing fraudulent ones), inflate trust scores, and spam admins/students.

### Remediation
`GET`/`PATCH` routes are admin operations → gate with `requireAdmin`. `POST` (claimant creates a request) → gate with `requireUser` **and** verify the caller is the `claimantId` (don't trust body-supplied IDs; derive from the token). Set `verify_jwt = true` in `config.toml` for `dropoff` as a platform-level backstop.

---

## WEB-02 — Unauthenticated trust-score inflation + forced report resolution via `tips`  (High, CVSS 7.5)

**CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N**
**File:** `supabase/functions/tips/index.ts`; `config.toml` (`verify_jwt = false`)

`service_role` client, no identity check. Open routes:

- **`PATCH /tips/:id/credit`** (lines 433–483): body supplies `userId`, `reportId`, `resolveReport`. Anyone can **grant +2 trust_score to any `userId`** (via `trust_score_events` insert → trigger) and, with `resolveReport:true`, **force any report to `resolved`**. No check that the caller owns the report or the tip.
- **`POST /tips/notify`** (lines 485–566): anyone can trigger a notification fan-out to a report's reporter and all previous tippers → spam/harassment vector.

### Live confirmation (non-destructive — no state change)
```
POST https://muigquisnrhdbvnexyzu.supabase.co/functions/v1/tips/notify
     apikey: <public anon key>     (NO Authorization bearer)
     body: {"reportId":"<nonexistent-uuid>","tipAuthorId":"<nonexistent-uuid>"}
→ HTTP 404   {"error":"Report not found"}
```
The `404` comes from the function's own DB lookup — it executed its business logic with **no authentication**. A real auth gate returns `401` *before* the lookup (confirmed on guarded functions). The nonexistent UUID made it short-circuit, so nothing was created or sent.

### Remediation
Gate with `requireUser`. For `credit`, verify the caller is the report's reporter (the party entitled to credit a tip) — load the report server-side and compare to the token's user id; never trust body `userId`. Set `verify_jwt = true`.

---

## WEB-03 — Unauthenticated read / forge / mass-dismiss of admin notifications via `notifications`  (High, CVSS 7.3)

**CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L**
**File:** `supabase/functions/notifications/index.ts`; `config.toml` (`verify_jwt = false`)

`service_role` client, no identity check. Open routes (lines 284–355):

- **`GET /notifications`** → read the latest 50 admin notifications (report titles, drop-off/claim descriptions).
- **`POST /notifications`** → inject arbitrary admin notifications (phishing/spam content into the admin dashboard).
- **`PATCH /notifications/read-all`** → mark **all** admin notifications read — can **suppress a genuine alert** (e.g. a real theft/claim) so staff never see it.
- **`PATCH /notifications/:id`** → mark any single notification read.

### Live confirmation (non-destructive)
```
GET https://muigquisnrhdbvnexyzu.supabase.co/functions/v1/notifications
    apikey: <public anon key>     (NO Authorization bearer)
→ HTTP 200   []       # executed unauthenticated; empty only because no rows exist right now
```

### Remediation
All routes are admin-only → gate with `requireAdmin`. Set `verify_jwt = true`. (The underlying `notifications` table reportedly has RLS now, but this function's `service_role` client bypasses it — the function-level check is the real control here.)

---

## WEB-04 — `verify_jwt = false` on functions that rely only on in-code guards  (Info / Hardening)

`reports`, `dropoff`, `notifications`, `tips` have `verify_jwt = false` in `config.toml`. For `reports` this is currently harmless because `requireAdmin` runs in-code (confirmed: `GET /reports` → `401` unauthenticated). But it removes the platform gateway as a first line of defense: a single future regression that drops the in-code guard becomes immediately exploitable (exactly how WEB-01/02/03 happen). Set `verify_jwt = true` on every function whose only legitimate callers send a user JWT, keeping the in-code `requireAdmin`/`requireUser` check as well (the guards' own comments already recommend this). Leave `verify_jwt = false` only where a non-JWT caller is intended and separately authenticated — e.g. `send-push` (shared-secret webhook) and `og-preview` (public crawler endpoint), both of which are correctly designed.

---

## What is correctly secured (verified)

- **`send-push`** — gated by a `PUSH_WEBHOOK_SECRET` header, constant-time compared; live probe returns `401`. ✅
- **`og-preview`** — intentionally public, read-only, exposes only limited link-preview fields for social crawlers; `service_role` use is scoped and justified in-code. ✅
- **`reports` / `claims` / `accounts` / `overview` / `analytics` / `bulk-import` / `confirmation` / `proxy`** — `requireAdmin`/`requireUser` present; all return `401` unauthenticated live. ✅
- **Secrets** — no `service_role` key or other secret committed; `.env*` gitignored; cleanup scripts read keys from env only. ✅
- **Client / frontend** — only the public anon key ships in the bundle (expected); HSTS with preload set; SPA redirect is a standard `/* → /index.html 200`. ✅
- **CORS** — `_shared/cors.ts` is a proper allowlist that fails closed (no wildcard reflection). ✅

---

## Priority remediation checklist

1. **[Critical]** Add `requireAdmin` (admin routes) / `requireUser` + ownership check (claimant route) to **`dropoff`**. Derive user IDs from the token, not the request body.
2. **[High]** Add `requireUser` + reporter-ownership check to **`tips`** (`credit` especially).
3. **[High]** Add `requireAdmin` to **`notifications`** (all routes).
4. **[Hardening]** Set `verify_jwt = true` for `dropoff`, `notifications`, `tips`, `reports`.
5. **Regression test:** extend `scripts/verification/` with an unauthenticated-probe test that asserts **every** function except `send-push`/`og-preview` returns `401` with no token — so a missed guard can never ship again.

## Findings

### Unauthenticated access to `dropoff` Edge Function — student PII disclosure + report/claim state tampering

**Severity:** CRITICAL (9.1)
**CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`
**Target:** supabase/functions/dropoff/index.ts (deployed at muigquisnrhdbvnexyzu.supabase.co)
**Endpoint:** https://muigquisnrhdbvnexyzu.supabase.co/functions/v1/dropoff
**Method:** GET

#### Description
The Supabase Edge Function `dropoff` is instantiated with the SUPABASE_SERVICE_ROLE_KEY (full RLS bypass), has verify_jwt=false, and performs no requireAdmin/requireUser identity check. Every route is reachable by any unauthenticated internet user.

#### Impact
Unauthenticated attackers can: (1) read every reporter's and claimant's full name and STUDENT ID via GET /dropoff (mass PII breach); (2) forge drop-off requests and inject admin notifications via POST /dropoff; (3) set arbitrary status/photo via PATCH /dropoff/:id/receive; (4) force any report and claim to 'resolved' and grant +5 trust_score to the claimant via PATCH /dropoff/:id/pickup. This enables PII harvesting, concealment of genuine lost-item cases, completion of fraudulent recoveries, trust-score manipulation, and spam.

#### Technical Analysis
The function creates a service_role client (createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)) which bypasses all Row Level Security. config.toml sets [functions.dropoff] verify_jwt=false, so the Supabase gateway does not reject tokenless requests. The handler contains no requireAdmin/requireUser call. GET /dropoff (lines 104-133) selects dropoff_requests joined to users exposing claimant.first_name/last_name/student_id and reporter.first_name/last_name/student_id. PATCH /dropoff/:id/pickup (lines 181-249) updates reports.status='resolved', claims.status='resolved', and increments users.trust_score by 5, all keyed off attacker-supplied path/body data with no ownership check. Guarded functions in the same project (reports, claims, accounts, overview) correctly return 401 to the identical tokenless request, isolating this as a missed guard rather than a platform behavior.

#### Proof of Concept
Read-only, non-destructive confirmation: a GET with only the public anon apikey and NO user Authorization bearer returns HTTP 200 and executes the function. It returns an empty array only because no drop-off rows exist at test time; when rows exist, reporter/claimant names and student IDs are returned to the anonymous caller. A guarded endpoint returns 401 on the same request.

```
ANON="<public anon key from deployed bundle>"
BASE="https://muigquisnrhdbvnexyzu.supabase.co/functions/v1"

# PII read (non-destructive) — returns 200 unauthenticated:
curl -s -w "\n[HTTP %{http_code}]\n" "$BASE/dropoff" -H "apikey: $ANON"
#  -> [HTTP 200]   (returns claimant/reporter names + student_id when rows exist)

# Control: guarded function rejects the same tokenless request:
curl -s -o /dev/null -w "reports -> HTTP %{http_code}\n" "$BASE/reports" -H "apikey: $ANON"
#  -> reports -> HTTP 401

# State-tampering routes (DO NOT run against prod) that are also unauthenticated:
#   POST   $BASE/dropoff                      (forge request + admin notification)
#   PATCH  $BASE/dropoff/<id>/pickup          (force report+claim resolved, +5 trust_score)
```

#### Remediation
1. Gate GET and PATCH routes with requireAdmin (admin-only operations). 2. Gate POST with requireUser AND verify the authenticated caller equals claimantId — derive all user IDs from the verified token, never from the request body. 3. Set verify_jwt=true for dropoff in supabase/config.toml as a platform-level backstop. 4. Add a regression test asserting GET/PATCH/POST all return 401 without a valid token. Mirror the existing requireAdmin pattern already used by reports/accounts.

---

### Unauthenticated trust-score inflation and forced report resolution via `tips` Edge Function

**Severity:** HIGH (7.5)
**CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N`
**Target:** supabase/functions/tips/index.ts (deployed at muigquisnrhdbvnexyzu.supabase.co)
**Endpoint:** https://muigquisnrhdbvnexyzu.supabase.co/functions/v1/tips/notify
**Method:** POST

#### Description
The Supabase Edge Function `tips` runs with the service_role key (RLS bypass), has verify_jwt=false, and performs no identity check. Its state-changing routes are reachable by any unauthenticated user.

#### Impact
Unauthenticated attackers can grant +2 trust_score to any arbitrary userId (PATCH /tips/:id/credit), force any report to status 'resolved' (resolveReport:true), and trigger notification fan-out to a report's reporter and all previous tippers (POST /tips/notify) for spam/harassment. This corrupts the trust-score integrity system and lets attackers silently close out reports.

#### Technical Analysis
service_role client bypasses RLS; config.toml sets verify_jwt=false; no requireUser/requireAdmin call. PATCH /tips/:id/credit (lines 433-483) takes userId/reportId/resolveReport from the body, inserts a trust_score_events row (trigger applies +delta to users.trust_score) and, when resolveReport is truthy, updates reports.status='resolved' — with no check that the caller owns the report or tip. POST /tips/notify (lines 485-566) fans out user_notifications to the reporter and every prior tipper of an attacker-chosen reportId.

#### Proof of Concept
Non-destructive proof: POST /tips/notify with a nonexistent reportId returns HTTP 404 'Report not found' — meaning the function executed its database lookup with NO authentication (a real auth gate returns 401 before any lookup). The bogus UUID short-circuits before any notification is created or any state changes, so the probe causes no side effects.

```
ANON="<public anon key from deployed bundle>"
BASE="https://muigquisnrhdbvnexyzu.supabase.co/functions/v1"

# Non-destructive: function runs business logic unauthenticated -> 404 (not 401)
curl -s -w "\n[HTTP %{http_code}]\n" -X POST "$BASE/tips/notify" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"reportId":"00000000-0000-0000-0000-000000000000","tipAuthorId":"00000000-0000-0000-0000-000000000000"}'
#  -> {"error":"Report not found"}   [HTTP 404]   (no auth required to reach DB logic)

# Dangerous route (DO NOT run against prod): grants trust score + resolves a report
#   PATCH $BASE/tips/<tipId>/credit  body {"userId":"<victim>","reportId":"<id>","resolveReport":true}
```

#### Remediation
1. Gate all routes with requireUser. 2. For /credit, load the report server-side and verify the authenticated caller is the report's reporter (the only party entitled to credit a tip); never trust body-supplied userId. 3. Set verify_jwt=true for tips in config.toml. 4. Add an unauthenticated-probe regression test expecting 401.

---

### Unauthenticated read / forge / mass-dismiss of admin notifications via `notifications` Edge Function

**Severity:** HIGH (7.3)
**CVSS Vector:** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:L`
**Target:** supabase/functions/notifications/index.ts (deployed at muigquisnrhdbvnexyzu.supabase.co)
**Endpoint:** https://muigquisnrhdbvnexyzu.supabase.co/functions/v1/notifications
**Method:** GET

#### Description
The Supabase Edge Function `notifications` runs with the service_role key (RLS bypass), has verify_jwt=false, and has no identity check. All routes are reachable unauthenticated.

#### Impact
Unauthenticated attackers can read the latest 50 admin notifications including report titles and claim/drop-off descriptions (GET /notifications), inject arbitrary admin notifications for phishing/spam (POST /notifications), and mark all admin notifications read (PATCH /notifications/read-all) — which can suppress a genuine alert (e.g. a real theft or claim) so staff never see it. This undermines the integrity and availability of the admin alerting workflow and discloses operational data.

#### Technical Analysis
service_role client bypasses RLS; config.toml sets verify_jwt=false; no requireAdmin call. GET /notifications (lines 284-300) returns the latest 50 rows. POST /notifications (lines 338-355) inserts an attacker-controlled notification. PATCH /notifications/read-all (lines 302-317) sets read=true on all unread rows. PATCH /notifications/:id (lines 319-336) marks any single row read. The underlying table reportedly has RLS, but the service_role client bypasses it, so the absent function-level check is the real exposure.

#### Proof of Concept
Non-destructive: GET /notifications with only the public anon apikey and no user bearer returns HTTP 200 and executes (returns [] only because no rows exist at test time). The same tokenless request to a guarded function returns 401.

```
ANON="<public anon key from deployed bundle>"
BASE="https://muigquisnrhdbvnexyzu.supabase.co/functions/v1"

# Non-destructive read — 200 unauthenticated:
curl -s -w "\n[HTTP %{http_code}]\n" "$BASE/notifications" -H "apikey: $ANON"
#  -> [] [HTTP 200]   (returns admin notification rows when present)

# Destructive routes (DO NOT run against prod), also unauthenticated:
#   POST  $BASE/notifications            (inject arbitrary admin notification)
#   PATCH $BASE/notifications/read-all   (suppress all admin alerts)
```

#### Remediation
1. Gate all routes with requireAdmin. 2. Set verify_jwt=true for notifications in config.toml. 3. Add an unauthenticated-probe regression test expecting 401 on GET/POST/PATCH.

---
