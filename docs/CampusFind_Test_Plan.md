# CampusFind — End-to-End Test Plan

Follow the steps **in order**. Each scenario builds on the previous one.
Tick the box when the result matches **Should happen**. If it doesn't, write what you saw in the **Notes** column.

---

## Testers

| Person | Student ID | Role in the test |
|---|---|---|
| **Lhester** | 23-02185 | Loses items (reporter) |
| **Emerson** | 23-01155 | Finds items (claimant) |
| **Revin** | 23-01066 | Leaves tips, hands an item to ISSC |
| **Viece** | 23-01165 | Makes a wrong claim, owns a walk-in item |
| **Admin** | 00-00001 | ISSC office, on the laptop (https://c4mpusfind.netlify.app) |

## Before you start

- [ ] Every student has the **new APK** installed (built 20 Oct 2026, 5:13 PM).
- [ ] Four phones is ideal. One phone also works — log out and switch accounts between steps.
- [ ] Start **every report title with `TEST -`** so the test data can be cleaned up afterward.
- [ ] Write down each person's **starting trust score** (shown in History):

| Person | Starting trust score | Expected change | Final score |
|---|---|---|---|
| Lhester | | 0 | |
| Emerson | | +10 | |
| Revin | | +7 | |
| Viece | | −5 per rejected claim (extra −5 at 3 rejections in 30 days) | |

---

## Scenario 1 — Lost wallet, returned in person

*Covers: reporting, notifications, search, tips, claims (reject and approve), messaging, tip credit.*

| ✓ | # | Who | Do | Should happen | Notes |
|---|---|---|---|---|---|
| [ ] | 1 | Lhester | File report **"TEST - Black wallet"**, location "Library", category Wallet, add 2 photos | Report appears in Lhester's list | |
| [ ] | 2 | Emerson, Revin, Viece | Check Notifications | "New lost item" notification; push notification if the app is closed | |
| [ ] | 3 | Emerson | Search "wallet", then filter by category Wallet | The report shows up | |
| [ ] | 4 | Revin | Open the report, leave tip: "Saw a black wallet near the canteen" | Lhester gets a "New tip" notification | |
| [ ] | 5 | Lhester | Reply to Revin's tip | Revin gets a "New reply" notification | |
| [ ] | 6 | Viece | Submit a claim with 1 photo (any photo — this is the wrong claim) | Lhester gets "Someone found your item!" | |
| [ ] | 7 | Emerson | Open the report | Banner says it's already being claimed; claim button blocked | |
| [ ] | 8 | Lhester | Open Viece's claim, check the photo and trust score, **Reject** | Viece is notified; the report reopens | |
| [ ] | 9 | Emerson | Submit a claim with 2 photos | Lhester is notified | |
| [ ] | 10 | Lhester | **Approve** Emerson's claim | Emerson is notified; a message thread opens | |
| [ ] | 11 | Lhester ↔ Emerson | Exchange 3–4 messages to arrange the meetup | Each gets a "New message" notification | |
| [ ] | 12 | Lhester | Mark the item received and resolve, **crediting Revin's tip** | Report Resolved; **Emerson +5, Revin +2**; both notified | |
| [ ] | 13 | Any student | Open the report | Shows Resolved; share card says "Reunited!" | |

---

## Scenario 2 — Lost ID, returned through the ISSC drop-off

*Covers: drop-off request, admin receive and pickup, no double reward.*

| ✓ | # | Who | Do | Should happen | Notes |
|---|---|---|---|---|---|
| [ ] | 14 | Lhester | File **"TEST - School ID"** | Others notified | |
| [ ] | 15 | Emerson | Claim it with a photo; Lhester approves | Message thread opens | |
| [ ] | 16 | Emerson | In the thread, suggest **ISSC drop-off**; Lhester declines once, Emerson suggests again, Lhester accepts | Lhester gets "ISSC drop-off suggested", Emerson gets "ISSC drop-off declined" (not "New message"); on accept, Emerson gets "ISSC drop-off confirmed" and the admin bell shows "New drop-off request" | |
| [ ] | 17 | Admin | ISSC Handoffs → **Incoming** → **Mark as received** with a photo | Lhester gets "Your item is at the ISSC office" | |
| [ ] | 18 | Admin | **Confirm pickup** | Report Resolved; **Emerson +5**; Lhester and Emerson notified | |
| [ ] | 19 | Admin | Click Confirm pickup again (if the button is still there) | Refused — no second +5 | |

---

## Scenario 3 — Walk-in found item

*Covers: walk-in intake, finder credit, in-person pickup verification.*

| ✓ | # | Who | Do | Should happen | Notes |
|---|---|---|---|---|---|
| [ ] | 20 | Admin | Walk-in Intake → register **"TEST - Umbrella"** with a photo, finder ID **23-01066** (Revin) | Revin gets "Thank you… +5"; students get the found-item notification | |
| [ ] | 21 | Viece | Find the umbrella in the feed | Shows as found at the ISSC office | |
| [ ] | 22 | Admin | ISSC Handoffs → **Ready for pickup** → umbrella (Walk-in) → **Verify & confirm pickup** → enter Viece's ID **23-01165** → **Release item** | Umbrella moves to **Completed** and the report is Resolved; Viece gets "Item collected from ISSC", Revin gets "The item you turned in was returned" | |

---

## Scenario 4 — Accounts and bulk import (admin only)

*Use made-up students, **not** your real accounts.*

| ✓ | # | Who | Do | Should happen | Notes |
|---|---|---|---|---|---|
| [ ] | 23 | Admin | Accounts → Create Single Account: ID **99-00001**, enrollment **9900000001**, last name **TEST** | Account created | |
| [ ] | 24 | Admin | Try creating ID **9900001** (wrong format) | Rejected | |
| [ ] | 25 | Phone | Log in as 99-00001 with 9900000001 | Forced to change password | |
| [ ] | 26 | Admin | Deactivate 99-00001 | That account can't log in | |
| [ ] | 27 | Admin | Reactivate it, then **Reset password** | Can log in again; forced to change password | |
| [ ] | 28 | Admin | Bulk Import → upload a CSV with 3 rows: **99-00002**, **99-00003**, and **99-00001** again | Preview shows 2 new and 1 duplicate/update | |
| [ ] | 29 | Admin | Edit one row in the preview, then **Confirm** | 2 accounts created | |
| [ ] | 30 | Admin | Upload again, then **Cancel** | Nothing changes | |

Sample CSV for step 28 (save as `test-import.csv`):

```csv
Student ID,Enrollment Number,Last Name,First Name,Middle Name,Program/Course,Year Level,Status
99-00002,9900000002,TEST,Two,,BSINFOT,1,New
99-00003,9900000003,TEST,Three,,BSIS,1,New
99-00001,9900000001,TEST,One,,BSINFOT,1,Continuing
```

---

## Scenario 5 — Dashboard, notifications, history, offline

| ✓ | # | Who | Do | Should happen | Notes |
|---|---|---|---|---|---|
| [ ] | 31 | Admin | Overview | Totals include the TEST reports; pending drop-offs load | |
| [ ] | 32 | Admin | Bell → click one notification, then **Mark all read** | Unread count goes to 0 | |
| [ ] | 33 | Admin | Analytics → **Export** | PDF report opens and saves | |
| [ ] | 34 | Admin | Reload `/admin/reports` directly in the browser | Page loads (no "Page not found") | |
| [ ] | 35 | Lhester | Log in on the website and try opening `/admin` | Blocked | |
| [ ] | 36 | Each student | History → tap today on the calendar; check All / Reports / Claims / Tips | Today's activity is listed | |
| [ ] | 37 | Each student | Compare trust scores with the table at the top | **Emerson +10, Revin +7, Viece −5, Lhester unchanged** | |
| [ ] | 38 | Any student | Notifications → swipe a notification to delete, tap **Undo** | Notification comes back | |
| [ ] | 39 | Emerson | Airplane mode → browse the feed | Loaded reports still show | |
| [ ] | 40 | Emerson | Still offline: file **"TEST - Offline bag"**, then turn airplane mode off | It uploads by itself; others notified | |
| [ ] | 41 | Any | Browser tab on the website | Title is **CampusFind** with the green logo | |

---

## Results

| Scenario | Passed | Failed | Notes |
|---|---|---|---|
| 1. Lost wallet | /13 | | |
| 2. ISSC drop-off | /6 | | |
| 3. Walk-in | /3 | | |
| 4. Accounts & bulk import | /8 | | |
| 5. Dashboard & offline | /11 | | |
| **Total** | **/41** | | |

## After testing

- Send any failed step (with a screenshot or error message) so it can be fixed.
- Ask for the cleanup SQL: it deletes every `TEST -` report, the `99-xxxxx` accounts, and the trust-score changes from this test, so your real accounts go back to how they were.
