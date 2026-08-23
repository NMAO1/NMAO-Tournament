# NMAO Tournaments — Decisions & Open Items

*Answers captured 2026-08-06. "DECISION" = settled; "OPEN" = still needs input; "BUILD" = settled and now a build task. Durable locks also live in `project-log.md`.*

Last updated: 2026-08-06

---

## A. Tournament

**A1. School ↔ auth mapping / School app.** DECISION + BUILD. Build a dedicated **School app**. Use a `school_members(school_id, auth_user_id, role)` join table (owner + assistant instructors). School app features: stats dashboard (total gold/silver/bronze, total submissions, revenue/earnings, engagement tier), team roster, add team member, send deadline reminders, check/track video submissions, message the team. (I'll expand this feature list when we design the app.)

**A2. Multi-role + judge conflicts.** DECISION. Separate apps (competitor, judge, school, viewer) keep information siloed by design. Judge conflict rule remains own-school exclusion for now; revisit relative/coach exclusions later if needed.

**A3. Onboarding / provisioning.** DECISION. **Self sign-up** for school, guardian, competitor. **Judges are invited** by a tournament admin (from the tournament hub) after enrollment/background-check. Sets `auth_user_id` on the matching row at signup/invite-accept.

**A4. Event list (Season 1).** DECISION. `traditional_forms`, `open_forms`, `traditional_weapons`, `open_weapons`. Add more events as competitor numbers grow (config edit, no code change).

**A5. Age brackets.** DECISION. Keep 7-9, 10-12, 13-15, 16-17, 18+. Minimum age 7 (no under-7 to start). Nuance later as participation grows.

**A6. Judge score entry — CHANGED (supersedes the single-score lock).** DECISION + BUILD. Judges enter **one field per criterion**, weighted per the style profile (Traditional vs Open) already in `rubric_weights`. The video's per-judge score becomes the **weighted sum of its criterion scores**; the rest of the pipeline (average across judges, placement, rating) is unchanged. Requires: re-add per-criterion capture (`submission_scores`), compute the judge score from criteria × weights, and expose the criteria in the judge app. See callout at the bottom.

**A7. Video pipeline.** DECISION. **Vimeo** (no ads). Streamlined submission flow; follow all appropriate minor-safety protocols (unlisted/private videos, no public discovery, controlled access). Exact upload-vs-link mechanics to finalize during competitor-app design.

**A8. Incomplete-pod notifications.** DECISION. "Admin" = anyone with tournament-hub access (can rearrange pods, add judges, full flow control). Notify hub admins + the missing/eligible judges. Channel(s) to finalize (email + in-app at minimum).

---

## B. Deployment & infrastructure

**B1. Supabase project.** DECISION. Owned by the **NMAO account**; region **US East** (schools are nationwide, single region is fine); **two instances — staging (to trial rounds) + production**.

**B2. Client app framework.** DECISION. **React Native + Expo** for all four apps (school, competitor, judge, viewer) + a **React web app** for the operator mission-control.

**B3. Operator mission-control.** DECISION + BUILD. Build as a real **multi-user web app** (like the member-platform dashboard), not the single-file prototype. Multiple admins with hub access.

---

## C. Payments & economics

**C1. Processor + flow.** DECISION. **Stripe.** Entry fee **captured at sign-up** for the round; you can sign up/pay anytime, but the video submission must be in before the deadline.

**C2. School payouts.** DECISION + BUILD. **Per round via Stripe (Connect).** Tiers 10/20/30% applied automatically at payout. 30% = tournament **+ accreditation + member platform**. Must be fully automated.

**C3. Entry fee.** DECISION. **$45.**

**C4. Standings & advancement.** DECISION. Calendar: submission deadline the **15th of each month starting January**; **7 days** judging; medals shipped **within 1 week** after. Season = **9 qualifying rounds** + **1 month semi-finals** + **1 month grand finale** + **1 month off** (12 months). Standings = **best 5 of 9**. Advancement (per division): **top 25%** to semis (min 3, max 8), **top 3** to the finale — counts stored in config so they're tunable once real signup numbers are known.

---

## D. Compliance & legal

**D1. Legal entity.** DECISION. Incorporated. ✅ (unblocks D-U-N-S, app-store org accounts, Stripe.)

**D2. Parental consent.** DECISION. **Signed waiver** (e-signature) at guardian onboarding — simplest COPPA-grade path. (Recommendation confirmed.)

**D3. Privacy policy + terms.** DECISION. Draft here; reuse/adapt the member-platform policy. Need a public privacy-policy URL for both app stores.

**D4. Data retention.** DECISION. The **waiver states videos are stored indefinitely and used only for promotional material** (no other purpose). Videos stay private (Vimeo); guardian deletion requests honored; purge data for users who never complete consent.

---

## E. Accreditation platform (schools only)

**E1. Who.** DECISION. **Schools only.**

**E2. Standards (from nmao.us).** DECISION. Nine standards; a school must complete **≥7 of 9** (all *required* items mandatory):
1. Business Identity & Legitimacy (incorporation docs, mission, logo, financial viability)
2. Lineage & Credentials
3. Insurance, Instructor Info & Safety (liability insurance, owners, background-check consent, CPR, first-aid)
4. Facility Safety & Monitoring (video monitoring, fire extinguishers)
5. Instructional Staff & Junior-Instructor Program
6. Digital Presence & Public Transparency (socials, website, Google Business)
7. Program Standards & Operations (data protection, belt promotion, disciplinary policies, records)
8. Health, Hygiene & Allergy Awareness
9. Compliance (good standing, revocation acknowledgement)

**E3. Process (from nmao.us).** DECISION. Online application with document uploads; **six-month compliance grace period** to close gaps; **annual renewal**; revocation for false info / unethical practice / falling out of good standing.

**E4. What accredited schools receive.** DECISION. Framed certificate, badge/seal (usable on marketing), **two window decals**, public **directory listing**, **+20% tournament revenue tier**. **No** ranking privileges.

**E5. Fee.** DECISION. **No fee currently.** Future: paid accreditation bundled with monthly local **social-media promotion** for the school (marketing flow TBD).

**E6. How accreditation gates the tournament.** DECISION. Accreditation → the **20% payout tier only** (applied automatically). Judges do **not** need to belong to an accredited school (e.g. a retired instructor may judge). No ranking privileges.

---

## F. Member platform (already built)

**F1. Feature priority.** DECISION. The member app already exists.

**F2. Pricing.** DECISION. **$99/mo subscription** (waived with accreditation) **+ 1% transaction fee, capped at $200/mo**.

**F3. Rank → tournament.** DECISION + BUILD (great idea). Member-platform rank auto-seeds `declared_rank`. Because styles have different belt systems, add a **school-configurable belt→tier mapping**: each school assigns its belts to beginner / intermediate / advanced (/ black belt). Design in chat.

**F4. Relationship to existing tools.** DECISION. The Member Platform **replaces** existing tools; NMAO is the **system of record for rank** (so it can auto-seed the tournament). Provide a **CSV roster import** to ease onboarding.

**F5. "Classes 1-4" reconciliation.** SKIPPED — meaning unknown; dropped.

---

## G. Brand & strategic

**G1. Name.** DECISION. **National Martial Arts Organization (NMAO).**

**G2. Mission / vision / values.** DECISION. Confirmed as proposed (suite handoff §1). Accreditation mission (from site): schools develop and keep NMAO standards for quality training, transparency, accountability, professionalism, and care for all stakeholders.

---

## H. Business / real-world tracks

**H1. Vendor quotes.** IN PROGRESS (locks the entry fee; $45 holds for now).

**H2. App-store enrollment.** IN PROGRESS. D-U-N-S meeting scheduled **Aug 24, 12:30**; then Apple + Google as Organization.

**H3. Sponsor-vote.** DECISION. Build **after** the four apps ship (school, competitor, judge, viewer).

---

## ⚑ Scoring-model change (A6) — needs a small build + confirm

The earlier lock stored a single 0–100 score per judge. Your A6 answer changes that to **per-criterion** scoring driven by the Traditional/Open weight profiles. Concrete plan (please confirm the two ★ points):

1. Judge app shows the criteria for the entry's style (Traditional or Open) — the 6 in `criteria`, weighted by `rubric_weights`.
2. Each judge enters a score per criterion. ★ **Per-criterion scale**: 0–100 each, or 0–10 each? (I'd suggest 0–100 to match the final scale.)
3. The video's per-judge score = Σ(criterion_score × weight%). With weights summing to 100 and 0–100 inputs, that yields a 0–100 score — so `resolvePod`, placement, and the rating rule are **unchanged**.
4. Persist per-criterion scores (re-add `submission_scores`, keyed to entry + judge + criterion) so every score is fully auditable back to the rubric.
5. ★ **Advanced pods (3 judges)**: average the three judges' *final* weighted scores (current behavior), correct?
