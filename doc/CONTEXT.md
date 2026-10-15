# CONTEXT.md — CampusFind

## Terminology / Acronyms
- **ISSC** — Institutional Supreme Student Council; acts as the system's admin authority.
- **NwSSU** — Northwest Samar State University.
- **Reporter** — User who filed a lost item report.
- **Finder / Claimant** — User submitting a claim against a report.
- **Walk-in report** — Found item physically handed to ISSC; admin creates the report on the finder's behalf (no app interaction by finder).
- **Trust Score** — Reputation indicator (starts at 100), visible to reporters at claim review only.
- **App Library** — Separate Netlify-hosted distribution platform (own Supabase project, managed by university IT), not part of CampusFind's data scope.
- **Drop-off Request** — When a claimant chooses ISSC drop-off, a `dropoff_requests` record is created. Admin manages it through the Drop-off Requests page.

## Conventions
- Status fields are the single source of truth — do not infer report state from related records.
- Photo caps: 3 photos per report, 3 per claim. Hard limits enforced client- and server-side.
- Messaging caps: 10 messages per claim thread, 25 tips per report.
- Student ID format: `YY-NNNNN` (e.g. `15-00160`). Enrollment Number: numeric, 6-10 digits.
- CSV bulk import is all-or-nothing: any row-level validation error rejects the entire file.
- Use Framer Motion for animation/gesture work.
- All realtime-triggered fetchAll() calls use fetchAll(true) (silent mode) to prevent scroll jumps.
- Edge Function calls require `apikey` header with `VITE_SUPABASE_ANON_KEY`.

## Current Project Status
**Implementation complete (Part 11).** The app is fully functional with:
- React + Capacitor mobile app (Android APK buildable)
- React admin dashboard
- Supabase Edge Functions (all 10 deployed, replacing Express.js)
- Drop-off request system (new in Part 11)

## Credentials & IDs
- Supabase project: `muigquisnrhdbvnexyzu`
- Edge Functions base URL: `https://muigquisnrhdbvnexyzu.supabase.co/functions/v1`
- Admin: `00-00001` / `Admin@1234`, UUID `4e66603b-3157-439e-b256-8563fb5b057d`
- Juan (reporter): `24-00301`, UUID `a804b793-66e1-4fff-9d83-6233187683de`
- Maria: `22-00150`, UUID `c0c38fc4-90ec-491e-9fe8-207c840d3bb9`
- Pedro: `18-00045`, UUID `8d11002a-9ee1-41ee-8bcf-96aa5b0ffb5f`
- App ID (Capacitor): `com.nwssu.campusfind`
- NwSSU brand color: `#06433C`

## Dev Servers
- Admin: http://localhost:5173
- App: http://localhost:5174
- Repo: `fumio65/campusfind` (GitHub), branch `main`

## Key File Paths
- `app/src/features/reports/ReportDetailPage.jsx` — main app report detail
- `app/src/features/claims/MessageThread.jsx` — message thread component
- `app/src/features/activity/ActivityPage.jsx` — activity/notifications page
- `app/src/shared/components/AppShell.jsx` — app shell with overflow-y-auto on main
- `admin/src/features/reports/ReportsPage.jsx` — admin reports table
- `admin/src/features/dropoff/DropoffRequestsPage.jsx` — drop-off management page
- `admin/src/features/overview/OverviewPage.jsx` — admin overview/dashboard
- `admin/src/App.jsx` — admin routes
- `admin/src/shared/components/Sidebar.jsx` — admin sidebar nav
- `supabase/functions/dropoff/index.ts` — drop-off Edge Function
- `supabase/functions/tips/index.ts` — tips Edge Function

## Drop-off Flow (New in Part 11)
1. Claimant clicks "Choose ISSC drop-off" in MessageThread
2. Creates dropoff_requests record (status: pending), notifies admin
3. Claimant physically brings item to ISSC office
4. Admin uploads photo → status: received → notifies reporter
5. Reporter/proxy picks up item in person
6. Admin clicks "Confirm pickup" → status: resolved → report resolved → +5 trust to claimant

## Known Issues / Open Items
- Deferred deep linking (auto-resume shared report after install) is unimplemented by design.
- Trust score thresholds are informational-only; no enforcement logic.
- Found-item walk-in reports bypass Claimed/Approved states — shorter lifecycle.
- AppShell main uses overflow-y-auto as scroll container; all scroll operations target document.querySelector('main') not window.
- MessageThread uses messagesContainerRef.scrollTop not scrollIntoView to avoid page scroll.

## External References
- Capacitor docs: https://capacitorjs.com/
- Supabase docs: https://supabase.com/docs
- Full SRS: CampusFind_SRS.docx
