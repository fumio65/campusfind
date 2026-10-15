# TASKS.md — CampusFind

## Current Phase: User Design (per Schedule of Activities, March–May)

### In Progress
- [x] Database schema design (User, Report, Claim, Tip, TrustScoreEvent tables) — Supabase/Postgres
- [x] UI/UX wireframes for mobile app (report, browse, claim, tip, history calendar)
- [x] Admin dashboard wireframes (bulk import preview, analytics, walk-in report creation)

### Not Started
- [x] Auth setup via Supabase Auth (admin-restricted account creation)
- [x] CSV bulk import: parser + validation rules (Student ID `YY-NNNNN`, Enrollment Number 6-10 digits) + preview/confirm UI
- [x] Lost item report flow (FR-2)
- [x] Browse/search (FR-3)
- [x] Claim submission + reporter review flow (FR-4)
- [x] Messaging thread (10-message cap) + ISSC drop-off fallback
- [x] Tips feature (FR-9) + tip-to-claim conversion
- [x] Admin walk-in found report flow (FR-11)
- [x] Trust score calculation engine + display logic
- [x] Analytics dashboard (charts, filters, PDF/CSV export)
- [x] User History screen (calendar view, filter tabs, activity dots)
- [x] Social sharing card generator + deep link/fallback logic
- [x] Framer Motion integration for micro-interactions/gestures
- [x] Reduce-motion accessibility toggle
- [ ] University App Library landing page (separate Supabase project, separate repo/deploy)

### Archived (Completed)
- [x] Requirements gathering / capstone document
- [x] SRS finalized (functional, nonfunctional, engineering standards)

## Git Branch Convention
- `feature/<short-name>` per task above (e.g. `feature/bulk-import-csv`, `feature/trust-score`)
- Commit messages reference the relevant FR (e.g. `FR-4: add claim approval flow`)
