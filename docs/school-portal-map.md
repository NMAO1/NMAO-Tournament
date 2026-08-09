# NMAO Tournament — School / Dojo Portal Map (v1)

*The instructor-facing portal for the **NMAO Championship Tournament**. Built from
`School profile functions.pdf` + `4-29 Administrator powers update.pdf`.*

> **This is a standalone product.** The Tournament School Portal is **completely
> separate** from the existing **Member Platform** (the staff/member management
> app). They are two distinct offerings — sold, marketed, priced, and deployed
> independently — that may **integrate at an optional level** for schools who use
> both. Neither depends on the other: a school can run the Tournament Portal with no
> Member Platform, and vice-versa. This portal lives in the NMAO-Tournament project
> and owns its own accounts, roster, auth, and data.

Last updated: 2026-08-08

---

## 0. Two products, one optional bridge

- **Member Platform (separate product):** day-to-day school management — membership,
  attendance, billing/POS, staff. Not required here.
- **Tournament School Portal (this product):** everything a school needs to compete
  in the monthly tournament — its **own** school account, roster, instructor auth,
  class assignment, tournament controls, entries oversight, payouts, and merch.
- **Optional integration (later, opt-in):** for schools that own both, a bridge can
  offer SSO, one-way **roster import / sync**, and **belt/rank sync** so they don't
  double-enter data. Built as a clearly separate integration layer — never a hard
  dependency, and off by default.
- **System of record:** for the tournament, **this portal** is the source of truth
  for a competitor's **class** (instructor-set). If the bridge is enabled, belt/rank
  can flow in from the Member Platform; standalone, the instructor sets it here.
- **Minor-safety throughline:** any social surface (gallery, messaging) is
  gated/curated for minors — no public discovery, guardian-visible.

## 1. Sections / pages

### A. School profile
Logo/photo, name, location, founding date, head instructor, styles taught,
description/mission, public/private toggle, payout tier, accreditation status.

### B. Roster / student database (native to this portal)
- **Bulk CSV import** of the roster + individual student profiles (name, DOB/age,
  email, **class/belt**, guardian link). No Member Platform needed.
- Search/filter (name, class, age, event eligibility); edit individually or in bulk.
- **Class assignment** is the instructor's call here — it seeds each student's
  tournament class and keeps divisions fair. (Optionally synced from the Member
  Platform when the bridge is on.)

### C. Tournament controls — the Admin Powers panel  ★
Per-student or per-group toggles the instructor sets (design: faded-black "splash"
background, toggle switches **outlined + filled in the NMAO brand colors**, outer
frame brand-outlined):

| Control | What it does |
|---|---|
| **Event categories** | Which events a student may enter (Traditional/Open × Forms/Weapons). |
| **Dueling** | Whether a student may participate in duels. |
| **Class / level** | Assign the appropriate competition class (3 levels) for a fair match. |
| **Geo-location** | Students compete only vs. others **> X miles** from the school. |
| **Merch shops** | Which students have earned a merch storefront (revenue split student + school). |
| **Reminders & messages** | Send updates, feedback, encouragement to groups or individuals. |

Stored per student (`student_tournament_settings` or `competitors.flags` jsonb),
read by the entry / divisioning / dueling flows.

### D. Entries & payments oversight
Per-round view of the school's competitors: who's entered, video status (entered →
uploaded → judging → results), entry-fee payment status. Nudge students who haven't
uploaded before the deadline.

### E. Payouts & finance
Revenue-share **payouts per round via Stripe Connect** (tiers 10 / 20 / 30%;
accreditation unlocks the 20% tier). Financial dashboard: earnings from entry-fee
share, merch, tutorials. Reconciles with `school_payouts`. This portal has its **own
Stripe Connect** onboarding, independent of the Member Platform.

### F. Merch shops / e-commerce  *(Phase 2–3)*
Per-competitor and school storefronts (branded items, **badge pins/patches** from
the badge catalog — the Gem Series + Grand-Finale pins), Stripe checkout, revenue
split.

### G. In-house tournaments  *(Phase 2–3)*
Create private tournaments (name, date, categories, prizes), register students, post
results to the **public NMAO page or school-only**.

### H. Communication & engagement
Announcements/news, event calendar, gallery — all minor-safe (no public discovery;
guardian-visible). Messaging = the reminders/feedback tool from the Admin panel.

### I. Analytics & reporting  *(Phase 2)*
Attendance/participation, entries per round, financial reports.

### J. Settings & security
Notification preferences, theme, password + **2FA**, and **this portal's own staff/
admin auth** (magic-link, mirroring the tournament suite — not shared with the
Member Platform unless the SSO bridge is enabled).

## 2. Data & RLS (self-contained)

- The portal uses **this project's** `schools`, `competitors`, `staff`, `entries`,
  `payments`, `school_payouts` tables — no Member Platform tables.
- **Isolation:** a school admin sees **only their school's** students, entries,
  payments, payouts — RLS keyed on the admin's `auth_user_id` → school membership
  (same pattern as the tournament RLS helpers). Service role bypasses.
- **New/extended:** `student_tournament_settings` (or `competitors.flags` jsonb) for
  the Admin Powers toggles; class/belt on `competitors` (instructor-editable here).
- **Integration layer (opt-in, isolated):** if enabled, a bridge service maps a
  Member-Platform school/student to the tournament records for import/sync — a
  separate, removable module, never a schema dependency.

## 3. Design

Dark "dojo-luxe" control surface: faded-black / black-**splash** background, **toggle
switches outlined and filled in the NMAO brand colors** (metallic red/purple/blue
spectrum), outer frame brand-outlined (per the Admin Powers note). Per
`brand-tokens.md`; denser/utilitarian vs. the competitor app. Visually its own
product identity, distinct from the Member Platform.

## 4. Phasing

**Phase 1** — school account + auth, roster + CSV import, **class assignment**, the
**Tournament Controls** panel, entries/payments oversight, per-round **payouts**.

**Phase 2** — merch shops, in-house tournaments, analytics, geo-location matching.

**Phase 3** — deeper e-commerce, community/gallery, sponsor tie-ins, and the
**optional Member-Platform bridge** (SSO + roster/belt sync).

## 5. Open questions

- **Geo-location** rule: hard exclusion (never match within X miles) vs. a soft
  matchmaking preference in divisioning/dueling?
- Which Admin-Powers toggles are **school-wide defaults** vs. **per-student
  overrides**?
- The optional **Member-Platform bridge**: which direction does data flow (roster
  and belt in from Member Platform → tournament), and is it one-time import or live
  sync? (Deferred to Phase 3.)
