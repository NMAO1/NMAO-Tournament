# NMAO — Judge App Map (v1)

*The app the **NMAO judge pool** uses to score the monthly tournament. Focused and
fast: watch, score six criteria, submit, next. Reuses the locked per-criterion
model and feeds the existing engine unchanged. (Duels are judged by the community,
not here; in-house tournaments use the school's own judges via the portal.)*

Last updated: 2026-08-08 · Companion to `frontend-page-map.md` §(b), Tournament
Flow + Video docs, and the Conflict-of-Interest regulation.

---

## Who & auth

Invited judges — often **remote expert instructors** (a paid role, part- or
full-time). Magic-link sign-in (like the rest of the suite); only **active +
background-check-cleared** judges get assignments. Each judge carries a **school**
for conflict exclusion.

## Screens

### 1. Queue — my assignments
- Videos/pods assigned to me, sorted by **deadline**, with **progress** (scored /
  total). Empty = "You're all caught up."
- A newly-ready division arrives as **ACCEPT / RECUSE** (Tournament Flow): accept to
  take it, or recuse (declares a conflict → the engine reassigns).
- Realtime on `judge_assignments`.

### 2. Score a video  ★ (the core screen)
- **Dual-angle playback:** front + side, side-by-side (or a primary with a
  Front/Side toggle on phone), with **zoom** and **slow-motion**.
- **Anonymized entry** (e.g. "Entry 3 of 8") to reduce bias; identity isn't needed
  to score.
- **Six-criterion rubric** for the event's style (Traditional or Open weights):
  Technical, Power/Kime, Balance, Timing, Spirit, Difficulty — each scored, with a
  **live weighted total** shown as the judge goes.
- **Optional feedback** with a **random prompt** to spark useful, specific notes
  ("What stood out in their balance?").
- **Submit → next** in the carousel. Already-scored = read-only.
- Writes per-criterion rows to `submission_scores`; the app computes the video's
  single 0–100 score via `weightedJudgeScore` and stores it on
  `judge_assignments.score` — so **resolve/rating is unchanged**.

### 3. History
Past scored videos; reopened / incomplete-pod flags; can revisit read-only.

### 4. Profile & onboarding
- **Bio & credentials** (builds trust in the pool): **style(s) studied**, **years
  of training**, and **notable mentions** — free-form credentials like "Taught for
  25 years," "Former forms champion (2011)," rank/titles. Shown on the judge's
  record (and an optional public "Our Judges" page for credibility).
- **Integrity Creed** — a short code the judge **affirms and signs at onboarding**
  and can revisit anytime: impartiality, honest scoring, conflict disclosure,
  confidentiality, upholding the art. Gates judging until signed; ties to the COI
  regime + code of conduct.
- **Payout (paid role):** connect a bank via **Stripe Connect** to receive judging
  fees. Bank details go straight to Stripe's onboarding — **never entered into or
  stored by NMAO**. Shows earnings this season + next payout date.
- **Conflicts of interest** — own-school auto-excluded; declare relatives, recent
  students (24 mo), or financial ties.
- Name, school, background-check state, notification prefs.

**The NMAO Judge's Creed** (draft): *I judge with impartiality and fairness, free of
bias or favor. I score only what I see, honoring each competitor's effort. I
disclose any conflict of interest and recuse when in doubt. I hold performances and
scores in confidence. I uphold the integrity of the tournament and the spirit of the
martial arts.*

## Judging model (locked)

Six criteria per style, weighted to a single 0–100 per-judge score
(`docs/scoring-and-rating.md`; `rating.ts` `weightedJudgeScore`). Advanced videos
get a **3-judge panel**, beginner/intermediate **1 judge** (set at pod formation).
The rule book's older 3-criterion scale is superseded.

## Conflict of interest

- **Own-school excluded** automatically at assignment (already in `assignments.ts`).
- **RECUSE** on the queue declares a conflict → reassignment; supports the fuller
  COI regime (relation, coaching within 24 months, financial) via a judge
  declaration on the profile.
- Post-hoc re-evaluation of a disputed score reuses the operator **rollback/reopen**
  path (governance / protests).

## Data & realtime

Reads `judge_assignments` (my queue, realtime), `entries` (signed dual-angle video
URLs), `criteria` + `rubric_weights` (the rubric). Writes `submission_scores` +
`judge_assignments.score`. Judging progress streams to Mission Control.

New `judges` fields: `styles` (text[]), `years_training` (int), `notable_mentions`
(text), `creed_accepted_at` (timestamptz — gates judging), `stripe_connect_account_id`
(payout; NMAO never stores raw bank data). `years_experience` already exists.

## States

Loading = skeleton list/rubric. Submit error = keep entered scores, allow retry.
Deadline passed on an incomplete pod = **reopen** flow (not force-resolved).
Unauthorized/uncleared judge = a "pending clearance" screen.

## Phase

**Phase 1** — queue + score screen + ACCEPT/RECUSE + history + profile. The dual-
angle player, per-criterion rubric, and prompt bank are the polish budget here.
