# NMAO — Product Scope Synthesis & Roadmap

*Synthesis of the 2026-08-08 document drop (Tournament Flow, Dueling Flow, School
Profile, Admin Powers, Leaderboard Stats, Conflict-of-Interest, Sponsor Layers,
Sponsorship Flyer, Video Speech/Guidelines, WKC Rule Book, Marketing). It maps
each into the product: what we already have, how to implement, how to improve, and
what to reconcile. The former name **WKC / World Kata Championships / "Kata app"**
is now **NMAO — National Martial Arts Organization (Championship Tournament)**,
open to all styles. The rule book's 3-criterion judging is **outdated** — we use
the locked 6-criterion per-style rubric.*

Last updated: 2026-08-08

---

## 0. The shape of the whole

Three audiences (the marketing pillars): **Students** compete monthly for prizes;
**Teachers** earn paid remote-judging roles; **Schools** get a new income stream.
Around the monthly tournament sit five more systems: **Dueling**, **School admin +
granular powers**, **Sponsorship**, **Leaderboards**, and **Governance (COI,
conduct, protests)**. Most of the engine core already exists; the rest is new
surface area to phase in.

## 1. Reconciliations to decide (conflicts with the current build)

These are the "pick one" items — the engine is config-driven, so most are edits, not rewrites.

| Topic | Documents say | Current build | Recommendation |
|---|---|---|---|
| **Age brackets** | 4-7, 8-12, 13-17, 18-35, 36-50, 51+ | 7-9, 10-12, 13-15, 16-17, 18+ | Adopt the doc brackets in `division_schemes.axes` (a config edit). Note 4-7 = extra COPPA care. |
| **Rank / "Class"** | By experience (Beginner ≤1yr, Int 1-3yr, Adv 3+) AND **instructor-assigned** per student | Self-declared `declared_rank`, belt→tier from member platform | Make rank **instructor-set** via the school portal (fairness), stored as system-of-record; map belt/years → class. |
| **Advanced = 2 forms / 2 rounds** | Advanced submits 2 forms: round 1, then a **final medal round**; up to 2 video angles | Engine resolves one round per pod | Add a two-stage advanced flow (qualify → final). Biggest engine change here (see §5). |
| **Points vs Rating** | Placement points (Gold 100…); keep 10% of rating at year-end | 0-100 same-rank Elo rating + placements | Keep rating as the skill/sorting number; add a **points ledger** as a season leaderboard currency; the "10% carryover" = soft season reset. |
| **Leaderboard "rating"** | avg score + consecutive-tournament bonus + category bonus | same-rank Elo | Treat as **two metrics**: `rating` (skill/matchmaking) and a `leaderboard score` (the doc's formula) for standings. |
| **Judging criteria** | Rule book: 3 criteria, 1-10 | Locked: 6 criteria per style, weighted | Keep the 6-criterion model (confirmed outdated in the doc). |
| **Video (2 angles + password)** | Up to 2 angles; spoken + on-screen **tournament password**, name/date/category; unedited; 30s-2min | Single `video_url`; no auth mechanic | Implement (see §6) — good anti-cheat, easy win. |

## 2. Dueling (new mode)

Async 1-v-1 video duels: challenge a friend or a random same-rank/category
opponent, set terms, both upload, a side-by-side duel page, then a winner by
**community vote and/or judging**, with badges/points, rematches, and seasonal
dueling leaderboards. Admin-gated per student ("choose who may duel").

- **Implement:** `duels` + `duel_entries` + `duel_votes/duel_results`; reuse the
  judging + rating cores (a duel is a 2-competitor pod). Matchmaking by rank/
  category (+ optional geo). Seasonal reset.
- **Improve / flag (minors):** public **community voting, likes, comments, social
  sharing** collide with the COPPA-safe design. For minors: no public vote/feed —
  decide duels by **judges** or a **same-division participant vote**, keep it
  guardian-gated, sharing off by default. Public voting only for adult/opt-in
  divisions. This is the single biggest safety reconciliation in the whole scope.
- **Phase:** 2. High engagement, but gated behind the safety model + the core
  tournament shipping first.

## 3. School admin portal + granular powers

Largely the **already-built Member Platform**, plus tournament-specific controls
the instructor sets per student/group (Admin Powers doc):

- **Toggles:** which **event categories** a student may enter; **dueling**
  eligibility; **class/level** assignment (the instructor-set rank from §1);
  **geo-location** rule (compete only vs others > X miles away — anti-local-bias /
  local-sponsor targeting); **merch-shop** eligibility (per-competitor storefront,
  revenue split student+school); **messaging** (reminders/feedback/encouragement).
- **School profile:** CSV student bulk-upload (already a member-platform pattern),
  in-house tournaments, merch/e-commerce, financial dashboard, calendar,
  announcements, gallery. Much overlaps the member platform — **extend it, don't
  rebuild.** Forums/gallery are social → apply the minor-safety model.
- **Design note (from doc):** faded-black / "splash" background, toggle switches
  outlined in the NMAO brand colors; outer frame also brand-outlined.
- **Phase:** 1 for the toggles that gate tournament behavior (categories, class,
  dueling, messaging); 2-3 for merch/e-commerce/analytics.

## 4. Leaderboards

A scrolling leaderboard tab with competitor **and** school stats: rating, total/
gold/silver/bronze medals (competitor + school), overall + per-event participation
streaks, win streak, participation rate, school ranking, total tournaments,
average score, school's top performer, "top pick" (competitor's-choice), and
**regional tiers** (city → state → region → national → world).

- **Implement:** most data already exists (`results`, `medals`, `rating_history`,
  streak from participation). Build read-optimized views / materialized standings;
  a leaderboard tab with selectable stats. **Regional ranking** needs competitor
  **location** (add to profile). Deliver two layouts per the doc: one data-overlaid
  (context) and one blank (template).
- **Improve:** lead with **effort/participation** leaderboards (streaks,
  participation rate, most-improved) alongside medal counts — consistent with the
  growth-first pillar (`docs/competitor-growth-and-badges.md`).
- **Phase:** 1 (core stats) → 2 (regional, school leaderboards, top-pick).

## 5. Judging & the two-round advanced flow

The judge app (Tournament Flow + Video docs): judge is **notified** a division is
ready → **RECUSE / ACCEPT** → a **carousel** of competitors with **two angles
side-by-side**, zoom / slow-motion, criteria inputs, optional feedback with
**random prompts**. Advanced divisions run **two rounds** (qualify → final medal
round) on two submitted forms.

- **Implement:** the judge surface is in `frontend-page-map §b`; add RECUSE,
  dual-angle playback, slow/zoom, prompt bank. The **two-round advanced** flow is a
  real engine addition: an advanced pod resolves a first round, a top cut advances,
  their **second form** is judged for medals. Model as two linked pod-stages or a
  `round_stage` on the pod. Reuse resolve/rating per stage.
- **Improve:** the "random feedback prompts" pair perfectly with the competitor
  **Mirror/growth** feature — structured judge feedback becomes the growth signal.

## 6. Video authenticity & submission

Concrete, buildable spec (Video Speech + Guidelines + Rule Book): unedited, 30s-2min,
full-body, good light/audio, clear area (no branding), up to **2 angles**, and an
on-screen + **spoken tournament password** plus name/date/category before the form.

- **Implement:** in Compete — guidance screens, resumable upload (2 angles), and a
  per-round **password** the platform issues (spoken + shown) so a clip can't be
  reused across rounds. Validation on `entries` (duration, angle count). Judges see
  the displayed info; mismatches → flag/void.
- **Improve:** auto-check duration/format on upload; the password is a lightweight,
  effective anti-cheat — keep it.

## 7. Conflict-of-Interest framework

Expands own-school exclusion into a full COI regime: no judge related by blood/
marriage/partnership; none who coached/trained the competitor within **24 months**;
no financial ties; **judge declarations**; competitor reporting; **recuse +
alternate**, and post-hoc **re-evaluation**.

- **Implement:** `judge_declarations` + `coi_relationships`; the judge-assignment
  core already excludes own-school — extend it to exclude declared conflicts. The
  RECUSE action (from §5) writes a conflict + triggers reassignment. Post-hoc
  re-eval = the **rollback / reopen** path (already being built) applied to a pod.
- **Phase:** 1 for the assignment-time exclusions; the appeals re-eval rides on the
  rollback work.

## 8. Governance: conduct, protests, appeals

Code of Conduct (competitors/coaches/spectators), a **zero-tolerance** policy, and
a **protest/appeal** workflow: only a designated representative may appeal, in
writing, with **mandatory video evidence**; an alternate judge re-evaluates, head
judge confirms; medals re-awarded on adjusted scores; prize ties broken by rating.

- **Implement:** consent to Code of Conduct at onboarding; a `protests` table + a
  structured appeal form (port the rule-book protest form); the re-eval reuses
  operator rollback/re-resolve. Restart-protocol deductions and tie rules become
  scoring config.
- **Phase:** 1 (conduct acceptance), 2 (protest workflow).

## 9. Sponsorship engine

A monetization layer (Sponsor Layers + Flyer): division sponsors with **thematic
reveal borders**, branded **motivational messages**, **sponsored challenges/duels**,
**division landing hubs**, branded **notifications** and **prize reveals**, polls/
quizzes, branded brackets, sponsor analytics, renewals; plus t-shirts, live booths,
photo-booth, e-commerce hub, geo-targeted small-business sponsors.

- **Implement:** `sponsors`, `sponsor_placements` (division/notification/reveal),
  and sponsor **analytics**; render branded assets in the reveal border,
  notifications, and division hub. Geo-targeting reuses the location data from §4.
- **Improve / flag:** keep sponsor content **tasteful and child-appropriate** — a
  "presented by" border and division hub, **not** behavioral ads aimed at children
  (consistent with our stance that products stay ad-free for users). Sponsorship of
  divisions ≠ targeted advertising; keep that line bright. Don't let branding
  overpower the ceremonial reveal.
- **Phase:** 2-3 (after the four apps ship — matches the earlier "sponsor-vote after
  4 apps" decision).

## 10. Brand tie-ins worth keeping

- **Belt = brand colors.** The rule book lets competitors wear **red, blue, or
  purple** belts with black/white uniforms — literally the NMAO spectrum. Reflect
  the competitor's belt color in their avatar rank-ring.
- **Reveal staggering.** Results post in waves (younger beginners → older advanced)
  over hours — build reveal times per division into the scheduler; it also paces
  server load and builds anticipation.
- **Year-end 10% carryover** = a gentle season reset that rewards returning
  veterans without letting ratings run away.

## 11. The minor-safety throughline (applies everywhere)

Many features assume public social interaction — dueling **community votes**,
comments, likes, sharing, forums, competitor-choice voting, sponsored content.
NMAO serves children. The consistent rule: **public social features are gated off
for minors** (judge- or participant-decided instead of public voting; sharing off
by default and guardian-gated; no public feeds/forums for minors). Adults/opt-in
divisions can have the fuller social layer. Every new system inherits this.

## 12. Proposed phased roadmap

**Phase 1 — the monthly tournament, end to end (in flight):** engine (done),
mission control, competitor app (home / Imprint / compete / journey-growth /
profile / badges / journal), judge app (with RECUSE + dual-angle + prompts),
school portal + tournament-gating toggles, core leaderboards, COI-at-assignment,
video authenticity, code-of-conduct acceptance, reveal (effort-first) + staggering.

**Phase 2 — depth & governance:** two-round advanced flow, protests/appeals
(on rollback), regional + school leaderboards, dueling (minor-safe model), merch
shops, points ledger + season reset.

**Phase 3 — monetization & scale:** sponsorship engine + analytics, e-commerce hub,
special/seasonal events, geo-targeted sponsors, live-event tie-ins.

## 13. Open decisions for Bradley

1. Adopt the doc's **age brackets** (4-7…51+)? And confirm **rank = instructor-set
   class** (by years/belt)?
2. Confirm the **two-round advanced** structure (qualify → final) for v1 or later?
3. **Points vs rating:** keep both (rating = skill, points = leaderboard) — yes?
4. **Dueling safety model** for minors: judge-decided vs participant-vote (no public
   voting)?
5. Anything here that's changed since these docs (like the judging update) I should
   mark outdated?
