# NMAO School / Dojo Portal — Map (v1)

*The instructor-facing portal. Built from `School profile functions.pdf` +
`4-29 Administrator powers update.pdf`, reconciled with the **already-built Member
Platform** and the tournament engine. Principle: **extend the Member Platform,
don't rebuild it** — the school portal is the Member Platform plus a Tournament
section. NMAO is the **system of record for rank/class** (instructor-set via belt).*

Last updated: 2026-08-08

---

## 0. Relationship to what exists

- **Member Platform (built)** already handles: school profile, student roster,
  billing/POS (Stripe), staff auth. The portal reuses these — the tournament adds a
  **Tournament** area, not a second app.
- **NMAO = source of truth for rank/class.** The instructor sets each student's
  belt in the Member Platform; belt → tournament **class** (Beginner/Intermediate/
  Advanced). Self-declaration is never used for placement — this is the fairness win
  from the Admin Powers doc.
- **Minor-safety throughline:** any social surface (gallery, forums, messaging) is
  gated/curated for minors — no public discovery, guardian-visible.

## 1. Sections / pages

### A. School profile
Logo/photo, name, location, founding date, head instructor, styles taught,
description/mission, public/private toggle. (Member Platform — extend with tournament
fields: payout tier, accreditation status.)

### B. Roster / student database
- **Bulk CSV import** of the roster (existing member pattern) + individual student
  profiles (name, DOB/age, email, **belt → class**, guardian link).
- Search/filter (name, class, age, event eligibility), edit individually or in bulk.
- **Class assignment** is the instructor's call — this is what seeds each student's
  tournament class and keeps divisions fair.

### C. Tournament controls — the Admin Powers panel  ★
Per-student or per-group toggles the instructor sets (design: faded-black "splash"
background, toggle switches **outlined in the NMAO brand colors**, outer frame
brand-outlined):

| Control | What it does |
|---|---|
| **Event categories** | Which events a student may enter (Traditional/Open × Forms/Weapons). |
| **Dueling** | Whether a student may participate in duels. |
| **Class / level** | Assign the appropriate competition class (3 levels) for a fair match. |
| **Geo-location** | Students compete only vs. others **> X miles** from the school (reduces local rivalry / enables local-sponsor targeting). |
| **Merch shops** | Which students have earned a merch storefront (revenue split student + school). |
| **Reminders & messages** | Send updates, feedback, encouragement to groups or individuals. |

Stored per student (e.g., a `student_tournament_settings` row or `competitors.flags`
jsonb), read by the entry/divisioning/dueling flows.

### D. Entries & payments oversight
A per-round view of the school's competitors: who's entered, video status
(entered → uploaded → judging → results), and entry-fee payment status. Instructors
can nudge students who haven't uploaded before the deadline.

### E. Payouts & finance
Revenue-share **payouts per round via Stripe Connect** (tiers 10 / 20 / 30%;
accreditation unlocks the 20% tier). Financial dashboard: earnings from entry-fee
share, merch, and (later) tutorials. Reconciles with `school_payouts`.

### F. Merch shops / e-commerce  *(Phase 2–3)*
Per-competitor and school storefronts (branded items, **badge pins/patches** from
the badge catalog), Stripe checkout, revenue split. The badge Gem Series + Grand-
Finale pins live here.

### G. In-house tournaments  *(Phase 2–3)*
Create private tournaments (name, date, categories, prizes), register students,
post results either to the **public NMAO page or school-only**.

### H. Communication & engagement
Announcements/news to the team, event calendar, gallery (photos/videos) — all
minor-safe (no public discovery; guardian-visible). Messaging = the reminders/
feedback tool from the Admin Powers panel.

### I. Analytics & reporting  *(Phase 2)*
Attendance/participation, entries per round, financial reports.

### J. Settings & security
Notification preferences, profile customization/theme, password + **2FA**, staff
management (reuse Member Platform staff auth).

## 2. Data & RLS

- **Isolation:** every school admin sees **only their school's** students, entries,
  payments, payouts — enforced by RLS keyed on the staff/admin's `auth_user_id` →
  school membership (mirrors the tournament RLS helpers). Service role bypasses.
- **New/extended tables:** `student_tournament_settings` (or `competitors.flags`
  jsonb) for the Admin Powers toggles; `school_payouts` (exists); merch/e-commerce
  tables (Phase 2–3). Rank/class lives on `competitors` (belt → class), instructor-
  editable in the Member Platform.

## 3. Design

Dark "dojo-luxe" control surface: faded-black / black-**splash** background, **toggle
switches outlined and filled in the NMAO brand colors** (the metallic red/purple/
blue spectrum), the outer frame also brand-outlined (per the Admin Powers note).
Consistent with `brand-tokens.md`; denser and more utilitarian than the competitor
app.

## 4. Phasing

**Phase 1** — roster sync + **class assignment**, the **Tournament Controls** panel
(categories, dueling, class, geo, messaging), entries/payments oversight, per-round
**payouts**. These gate and support the monthly tournament.

**Phase 2** — merch shops, in-house tournaments, analytics/reporting, geo-location
matching.

**Phase 3** — deeper e-commerce (tutorials, storefronts), community/gallery,
sponsor tie-ins.

## 5. Open questions

- Is the school portal a **section inside the existing Member Platform** app, or a
  sibling that shares its auth + data? (Recommendation: same app, new Tournament
  area.)
- **Geo-location** exact rule: hard exclusion (never match within X miles) vs. a
  soft preference in divisioning/dueling matchmaking?
- Which Admin-Powers toggles are **school-wide defaults** vs. **per-student
  overrides**?
