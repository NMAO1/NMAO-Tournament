# NMAO Software Suite — Comprehensive Handoff

The master orientation document for the entire NMAO product suite. **Read this first.**
_Last updated: 2026-08-05_

## 0. How to read this document

This handoff spans three products. They are at very different stages of definition, so every non-obvious claim is tagged:

- **[LOCKED]** — actually decided with Bradley in a prior session. Treat as settled.
- **[PROPOSED]** — a draft written by Claude for Bradley to confirm, edit, or replace. Do not treat as final.
- **[TO DEFINE]** — genuinely open; needs Bradley's input before building.

The Tournament App is designed in real depth (its own full spec exists). The Accreditation Platform and Member Platform have so far been described only indirectly, through the school revenue-share tiers — so most of their detail here is [PROPOSED] or [TO DEFINE]. A consolidated list of everything still needed from Bradley is in §12.

**Name note:** "NMAO" is the working project/brand name. Its full expansion is [TO DEFINE] — confirm with Bradley before putting it in any user-facing copy.

## 1. Mission & Vision (all [PROPOSED] — for Bradley to confirm or rewrite)

**Mission (proposed):** To modernize competitive martial arts by giving every school, competitor, and judge a fair, transparent, and accessible platform — connecting local dojos into one national community where skill is recognized honestly, schools thrive as businesses, and students stay motivated all year round.

**Vision (proposed):** A world where any martial arts student, from any school, can compete on a level playing field, track their own growth, and earn recognition for it — and where running a martial arts school is easier, more profitable, and more connected than it has ever been.

**Values (proposed):** Fairness · Accessibility · Community · Growth · Integrity · Child safety (a product built for kids, safe by design).

**One-line pitch (proposed):** NMAO is the operating system for competitive martial arts — compete, get accredited, and run your school, all in one connected suite.

## 2. Bird's-eye view — the suite

NMAO is three interlocking products that together form a martial-arts ecosystem. Each is valuable alone, but the real moat is how they reinforce one another.

1. **Tournament App** — the engagement and competition engine. Video-based martial arts tournaments: competitors submit event videos each round, an automated engine sorts them into fair divisions and skill-based pods, judges score the videos, results and ratings update, collectible medals ship, and the season culminates in semi-finals and a grand finale. Flagship and primary revenue driver. **[LOCKED / built in part]**
2. **Accreditation Platform** — the trust and standards layer. Schools (and possibly instructors) apply to be accredited to an NMAO standard; accreditation confers credibility, a public mark/listing, and a higher share of tournament revenue. **[PROPOSED — scope to define]**
3. **Member Platform** — the operations layer (SaaS for dojos). Tools for schools to run their business: rosters, rank/belt progression, curriculum, attendance, billing, communication. Adopting it earns the top tier of tournament revenue share and feeds clean student/rank data into the other two products. **[PROPOSED — scope to define]**

### The flywheel (why the three belong together) — [PROPOSED]

```
   Tournament draws competitors + schools in
                 │
                 ▼
   Schools seek ACCREDITATION for credibility
   + a higher tournament revenue share (10% → 20%)
                 │
                 ▼
   Schools adopt the MEMBER PLATFORM to run their dojo
   + earn the top revenue share (20% → 30%)
                 │
                 ▼
   Member-platform student/rank data seeds tournament
   rosters + ratings  →  more, better-matched competitors
                 │
                 └────────────► back to Tournament (stronger)
```

The revenue-share ladder (10% / 20% / 30%) is the deliberate incentive engine that pulls each school deeper into the suite. **[LOCKED]** (the ladder itself; the accreditation/member mechanics that gate it are [TO DEFINE]).

## 3. Shared foundations across the suite

**Identity graph — [PROPOSED].** Core entities: Schools/dojos (central org unit), Instructors, Students, Judges, Ranks. Design principle: **one person, one identity, many roles.**

**Tech stack — [LOCKED where noted].** Backend on Supabase (Postgres + Auth + Edge Functions) [LOCKED]. Engine logic as idempotent edge functions over a pure, DB-free core [LOCKED]. Client apps: [TO DEFINE].

**Auth / access model — [PROPOSED].** Supabase Auth + `profiles` table mapping `auth.uid()` to a person and role(s). RLS enabled on every table (deny-by-default); engine runs as service role and bypasses RLS. **[LOCKED: RLS-on posture; TO DEFINE: identity-to-role mapping.]**

**Compliance — kids' product. [LOCKED as a constraint].** Competitors as young as 7 → COPPA (US), Apple Kids Category, Google Play Families. Verifiable parental consent, careful data handling/retention, safe handling of children's video. Designed in from the start, centrally.

## 4. Tournament App — full detail (the designed product)

Exhaustive detail lives in `docs/engine-spec.md`. This is the self-contained summary.

### 4.1 What it is
A monthly, video-based martial arts tournament. Season: 9 qualifying rounds → semi-finals → grand finale. **[LOCKED]**

### 4.2 Architecture — hub & spoke [LOCKED]
Hub = engine + operator "mission-control" screen (single source of truth). Three spokes (competitor app, school app, judge app) each see only their slice and read/write through the hub; never talk to each other directly.

### 4.3 The engine spine [LOCKED]
`classify → collapse (thin divisions) → form pods (by rating) → assign judges → collect scores → resolve → update ratings → distribute`, wrapped in a per-round state machine: `open → collecting → closed → classified → collapsed → podded → judging → resolving → distributed → finalized`.

### 4.4 The configurable Division Scheme [LOCKED]
Divisions are age × rank × event, but categories live in a per-season "Division Scheme" config — grows more granular via a settings edit, never a code change. Events never merge; age and rank can.

### 4.5 Locked engine parameters [LOCKED]
- Pod floor: 6 (below this a division auto-collapses).
- Rank tiers: beginner, intermediate, advanced.
- Age brackets: 7-9, 10-12, 13-15, 16-17, 18+.
- Pods: cap 20, split at 22 into balanced, rating-banded pods.
- Collapse: merge nearest rank first, then nearest age; never across events; flag any division that still can't reach the floor.
- Judging: paid per video — 1 judge for beginner/intermediate, 3 for advanced.
- 3-judge score: straight average.
- Tiebreak: highest single-judge score, then earliest submission.
- Incomplete pod at deadline: never force-resolved — flag admin, notify the missing judge, reopen the pod to the eligible judge pool.
- Simulate/preview: operators run the scheme against real entries before locking a round; the preview reuses the exact engine functions.
- Overrides: move competitor, merge/split pod, reassign judge, void entry — all audited.

### 4.6 Ratings & standings [PARTIALLY LOCKED]
Rating is seeded by declared rank and updated by results; standings use best 5 of 9 qualifying rounds; top competitors advance to semis then the finale. **The exact rating-update formula and rank-seeding values are [TO DEFINE] — the single open input blocking the next build step (§11).**

### 4.7 Business model & economics [LOCKED]
- Entry fee: ~$45/event (working; final pending vendor quotes).
- Medals: everyone who competes gets one every round — a collectible metal segment that interlocks over the year into a full yin-yang. Bulk-shipped one box per school.
- No qualifying prize pools: 9 rounds run on medals + rating + advancement. Cash prize pools only at semis + grand finale, funded by an 8% per-entry set-aside plus sponsors.
- School revenue share: 10% tournament-only → 20% accredited + competing → 30% also on the member platform.
- Full unit-economics model: `docs/unit-economics.xlsx`.

### 4.8 Parked revenue idea — Sponsor Vote [PROPOSED, parked]
During semis + finale only, audience can vote for competitors; each vote requires watching one sponsored ad. Build later; add per-user rate limits + fraud checks.

## 5. Accreditation Platform — proposed scope (mostly [TO DEFINE])

Likely: schools (and possibly instructors) apply to be accredited to an NMAO standard, are reviewed, and — once approved — receive a credential, public trust mark / directory listing, and unlock the 20% tournament revenue tier.

Open questions [TO DEFINE]: who's accredited (schools/instructors/both); criteria/standards; process (application, review, renewal, revocation); what an accredited school receives; whether there's a fee; how status connects to the tournament.

## 6. Member Platform — proposed scope (mostly [TO DEFINE])

Likely: SaaS for running a martial arts school. Adopting it earns the top 30% tournament revenue tier and feeds clean student/rank data into the other products.

Likely v1 features: roster & profiles · rank/belt progression · scheduling & attendance · billing/dues · communication · curriculum library · instructor management · reporting.

Open questions [TO DEFINE]: v1 feature priority; pricing model; how rank data flows to the tournament; relationship to existing tools; reconcile "Classes 1-4" notes.

## 7. How the products connect — [PROPOSED]
- Shared identity: one account, roles across products. Schools = shared org spine.
- Data flow: member platform (rank, roster) → tournament (seeds entries, `declared_rank`, ratings). Tournament results → back as student achievements.
- Revenue ladder binds them: 10% → 20% → 30%.
- Trust flows down: accreditation status gates tournament privileges and is displayed in the member platform + public directory.

## 8. Cross-cutting technical architecture — [mixed]
- Backend: Supabase — Postgres, Auth, Edge Functions, Storage (videos). [LOCKED]
- Engine pattern: pure, DB-free, unit-tested core wrapped by idempotent edge functions keyed by `(round_id, step)`; same core powers live runs + previews. [LOCKED for tournament]
- Video handling: URL-based today; storage/hosting + moderation [TO DEFINE], sensitive given minors.
- Clients: native mobile apps (store enrollment underway); framework [TO DEFINE]. Operator web app for mission-control implied.
- RLS: enabled everywhere, deny-by-default; per-role policies TBD; engine uses service role. [LOCKED posture]

## 9. Compliance, safety & legal — [LOCKED as constraints, details TO DEFINE]
- Kids' data / COPPA / Apple Kids / Google Families: verifiable parental consent, minimal collection, careful retention, safe handling of children's video.
- Content moderation of minors' video [TO DEFINE].
- Legal entity: NMAO must be a registered business (prerequisite for D-U-N-S + app-store org accounts) [TO DEFINE — status].
- Privacy policy + terms required [TO DEFINE].
- Payments: entry fees + school payouts → processor (Stripe assumed) + payout mechanism [PROPOSED: Stripe].

## 10. Current status & roadmap

**Built & validated (tournament) — NOTE: files were lost from the repo and are being reconstructed (2026-08-05):**
- Data-model migration — `supabase/migrations/20260805120000_tournament_engine.sql`.
- Divisioning core — `supabase/functions/_shared/divisioning.ts` + `divisioning.test.ts` (24 passing assertions).

**5-step build plan (tournament engine):**
1. Lock inputs (vendor quotes + open params) — in progress (Bradley).
2. Data-model migration — done (being rebuilt).
3. Divisioning core (classify → collapse → form-pods + simulate) — done, tested (being rebuilt).
4. Round-state controller + remaining steps (assign judges, resolve, ratings, distribute) — next; blocked only on the rating rule.
5. Mission-control UI + full end-to-end dry run on seeded data.

**Not yet started:** accreditation platform, member platform, all client apps, RLS policies, payments, video pipeline.

## 11. The one immediate blocker — the rating rule [TO DEFINE]
Step 4's resolve/rating step needs: (a) how a placement or score in a pod translates into a rating change, and (b) how a brand-new competitor's rating is seeded from declared rank (beginner / intermediate / advanced). Either Bradley provides the rule, or Claude proposes a simple Elo-style version seeded by rank for approval. Nothing else blocks step 4.

## 12. Consolidated open items — needs Bradley

**Strategic / brand:** confirm/rewrite mission, vision, values (§1); confirm the "NMAO" full name.

**Tournament:** rating-update formula + rank seeding (§11) — blocks step 4; under-7 min-age question; vendor quotes → locks $45 fee.

**Accreditation platform (§5):** whole scope.

**Member platform (§6):** v1 feature priority, pricing, rank→tournament data flow, relationship to existing tools; reconcile "Classes 1-4" notes.

**Cross-cutting:** client app framework; auth identity→role mapping; video storage/moderation; payments/payout; privacy policy + terms; legal entity status.

## 13. Artifact & repo index

```
README.md                      Project overview, layout, status
docs/
  NMAO-suite-handoff.md        THIS FILE — master suite handoff
  engine-spec.md               Full tournament engine technical spec
  project-log.md               Living log: decisions, parked ideas, open items, parallel tracks
  handoff.md                   Short handoff to resume tournament build (step 4)
  unit-economics.xlsx          Pricing / margin / sponsor-vote model
supabase/
  migrations/20260805120000_tournament_engine.sql   Schema (validated)
  functions/_shared/divisioning.ts / .test.ts        Divisioning core + tests
```

**Parallel real-world tracks in progress (Bradley):** vendor quotes; app-store enrollment (D-U-N-S → Apple + Google as Organization); legal-entity + compliance groundwork.

---
_This document is the entry point for anyone — human or a new Claude session — joining the NMAO project. Start here, then follow §13 for depth. Everything tagged [PROPOSED] or [TO DEFINE] is an invitation for Bradley's direction, not a settled fact._
