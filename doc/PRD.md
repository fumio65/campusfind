# PRD.md — CampusFind

## Core Objective
Replace NwSSU's informal, social-media-based lost-and-found process with a centralized, verified mobile system that reduces fraud, speeds recovery, and gives ISSC (Institutional Supreme Student Council) actual data on lost-and-found patterns.

## Key Features
- **Account Management** — Admin-only creation via annual Registrar CSV (bulk, with preview/confirm step) or single manual add. Student ID format `YY-NNNNN`, Enrollment Number 6-10 digits.
- **Lost Item Reporting** — Title, description, location, optional photo (max 3). No photo required since reporters often lack one.
- **Browse/Search** — Keyword, location, category filters.
- **Claim Submission** — Finder submits claim w/ mandatory photo (max 3). One active claim per report. Reporter approves/rejects. Approved → 10-message capped thread to arrange handoff (in-person or ISSC drop-off, fallback suggested at message cap).
- **Tips** — Text-only sighting/lead, any user, max 25/report. Convertible to a claim later.
- **Admin-Created Found Report (ISSC Walk-in)** — Admin logs item handed in physically at ISSC, optional photo, simplified Open → Resolved flow, in-person ID verification logged at pickup.
- **Trust Score** — Starts at 100. ±points for claim/handoff behavior (see ARCHITECTURE.md). Visible to reporter at claim review, no auto-restrictions.
- **Analytics (Admin)** — Charts: items reported, claim rates, time-to-recovery, trust distribution. Filterable by date/location/category. Export PDF/CSV.
- **User History** — Calendar view (day/week/month/year, activity dots) of own reports/claims/tips. Filter tabs. Own trust score visible.
- **Social Sharing** — Any user shares a visual card (Open/Resolved reports only). Deep link → report if app installed, else falls back to App Library download page.
- **University App Library** — Separate Netlify-hosted distribution platform (own Supabase project, managed by university IT, not ISSC). Hosts CampusFind today, designed for future apps.

## Success Metrics
- % of reports reaching Resolved status
- Average time-to-recovery (claim approved → confirmed receipt)
- Claim approval vs. rejection rate
- Reduction in stalled/unresolved reports requiring admin override

## Constraints
- Admin-only account creation; no self-registration
- In-person ID verification for password recovery and ISSC pickups
- Offline-first; cloud features (sync, claims, messaging, notifications) require connectivity
- Distribution via App Library only, not official app stores
- Cloud-cost-driven caps: 10 messages/claim, 25 tips/report, 3 photos/report or claim
