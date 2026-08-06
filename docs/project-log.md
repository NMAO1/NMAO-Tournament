# NMAO Tournaments — Project Log

*A living record of locked decisions, parked ideas, and open items. Updated as we go.*
Last updated: 2026-08-05

---

## Locked decisions

**The hub.** The tournament hub is the system's engine *plus* an operator mission-control screen on top of it — not a public marketing page. It's the round's state machine and the single source of truth about where every competitor is in the flow. The competitor, school, and judge apps are spokes that each see only their own slice and read/write through the hub; they never talk to each other directly.

**Formation is automatic, with manual override.** The engine sorts and forms pods on its own by default (you can't hand-place at scale). Operators keep override power for edge cases: move a competitor, merge/split a pod, reassign a judge, void a bad entry.

**Divisions = age × rank × event**, and the scheme is *fully configurable* (a "Division Scheme" you set per season and make more granular as you grow). Rating forms and orders the pods *within* a division.

**Thin divisions auto-collapse.** When a division is too small to form a viable pod, the engine merges the nearest divisions — adjacent rank first, then adjacent age band, never across events — until it hits a workable size. Minimum pod floor is a competition-quality decision now (no fiscal weight); leaning ~6, to confirm.

**Preview / simulate before locking.** Before committing a round, the operator runs the current scheme against actual entries and sees the resulting pod counts, then tunes and commits.

**No prize pools during qualifying.** The nine qualifying rounds run on medals + rating + advancement. Cash prize pools exist only at the **semi-finals and grand finale**, funded by an ~8% per-entry set-aside plus sponsors later.

**Medals: everyone gets one, every round.** A collectible metal segment that interlocks over the year into a full yin-yang — a physical reason to return all nine months. Shipped in bulk, one box per school, for the instructor to hand out.

**Judges are paid per video.** Each entry's video is scored by 1 judge (beginner/intermediate) or 3 judges (advanced). Per-video scales with entries and removes any small-pod penalty. ~$1.50/video working assumption.

**School revenue share is tiered by engagement (max 30%):** 10% tournament-only, 20% accredited + competing, 30% also on the member platform. Deeper engagement earns more — a deliberate flywheel toward accreditation and the member platform.

**Entry fee ≈ $45** (working number; pending real medal/box/shipping quotes). Comfortably profitable even worst-case (~32% margin with a top-tier 30% school and heavy advanced judging).

**Engine parameters (locked):** pod floor **6**; rank tiers **beginner / intermediate / advanced**; age brackets **7-9, 10-12, 13-15, 16-17, 18+**; 3-judge scoring = **straight average**; tiebreak = **highest single-judge score, then earliest submission**; incomplete pod at deadline = **flag admin, notify the missing judge, reopen the pod to the judge pool for completion** (never force-resolved).

**Rating rule (locked):** everyone seeds at **50**; rating moves on **placement, measured only against same-rank podmates**; **K = 8** for a competitor's first 3 rounds then **4**; clamped 0–100; used only to form pods **within** a rank bracket — never crosses ranks (that's a real dojo promotion via `declared_rank`); in a collapsed mixed pod, a competitor moves only on same-rank comparisons (lone-rank competitor doesn't move). Kept fully transparent in `docs/scoring-and-rating.md`. Built + tested in `functions/_shared/rating.ts`.

---

## Parallel tracks — in progress (Bradley, real-world lead-time items)

- **Vendor quotes** — interlocking medal, presentation box, bulk-to-school shipping. Locks the final entry fee.
- **App store enrollment** — Apple Developer Program (**Organization**, $99/yr) + Google Play Console (**Organization**, $25 one-time).
  - **Critical path = D-U-N-S number** (free from Dun & Bradstreet, up to **30 days**). Required by BOTH stores; start first. Needs a registered legal entity.
  - Register as **Organization** on both — Google org accounts are **exempt** from the 12-tester/14-day closed-test rule; Apple org publishes under the company name.
  - Also needed: org-domain email, a working website (Google verifies via Search Console), signing authority (Apple), incorporation docs (Google), and a **privacy policy URL** (both).
- **Compliance — plan early (this is a kids' app):** competitors as young as 7 → storing minors' data incl. **video** → **COPPA** (US), Apple **Kids Category**, Google Play **Families** policy. Requires verifiable **parental-consent flows** and careful data handling; must be designed in from the start, not bolted on.

## Parked ideas — build later

### ⭐ Sponsor Vote Revenue (watch-an-ad-to-vote) — HIGH POTENTIAL

**Mechanic.** During the semi-finals and grand finale only, the audience can vote for competitors. Each vote requires watching one sponsored ad first. Passionate repeat voting turns audience emotion directly into ad inventory.

**Why it matters.** At current scale (50 schools / 500 competitors) it's a modest bonus — roughly **$800–$3,000 per season** via programmatic rewarded-video rates, up to ~$12k if a final goes viral. But its real value is twofold:
1. **It's sellable inventory.** ~40,000+ guaranteed impressions of a local, family-invested audience is a package a regional sponsor pays a flat fee to own (logo on the finale + guaranteed views) — worth more as a sponsorship (~$2–5k) than as ad-network fill.
2. **It scales linearly with schools.** At 500 schools it's a **$10,000–30,000+/season** line that grows on its own, at near-zero marginal cost — the seed of a real sponsorship business.

**The two levers.** (a) Votes-per-viewer — the fun/gamified lever; each vote burns an ad, so leaderboards and "voting closes soon" drama convert straight to revenue. (b) Audience size — grows with the platform.

**Build note when we get to it:** unlimited ad-gated repeat voting invites bots / vote-buying. Add per-user rate limits and basic fraud checks so the sponsor impression numbers stay legitimate.

*Full model lives in the "Sponsor Vote Revenue" tab of NMAO_Tournaments_unit_economics.xlsx.*

---

## Open items / to confirm

- **Real vendor quotes** for the three yellow cells: the interlocking collectible medal, the custom presentation box, and bulk-to-school shipping. These lock the final entry fee.
- **Under-7 competitors** — brackets start at 7; confirm whether 7 is the minimum entry age or a 6-and-under bracket is needed.
- **Combined season P&L** — a view merging entry revenue + sponsor-vote revenue once the vote feature is on the roadmap.

---

## Step 4 orchestration + reconciliation note (2026-08-06)

Two parallel workstreams were merged. The **locked** scoring/rating rule (`docs/scoring-and-rating.md`, `functions/_shared/rating.ts`) and the judge-assignment core (`functions/_shared/assignments.ts`) are the source of truth; an earlier provisional Elo variant was removed. Built on top of these, the following orchestration is in the repo and unit-tested:

- `engine.ts` — idempotent step orchestration keyed by `(round_id, step)` over an `EngineStore` seam (assign_judges → resolve → distribute). Sync in-memory store for tests, async Supabase adapter for prod.
- `distribute.ts` — medal ship list, one shipment per school (everyone gets the participation segment; top 3 add gold/silver/bronze).
- `roundState.ts` — the §4 state machine (forward-only transitions, guardrails, rollback clear-set).
- `supabaseStore.ts` + `round-controller/index.ts` — the Deno edge layer, bridging the engine schema with 001's `skill_ratings`/`rating_history`.
- `mission-control/index.html` — operator dry-run console; its embedded engine mirrors the locked cores (seed 50, same-rank rating, 0–100 scores).

Tests: `npm test` runs divisioning (24), rating (21), assignments (11), distribute + state machine (19), and engine orchestration (18) — **93 assertions, all passing**.

**Follow-ups before a live DB run:**
- Reconcile the two migrations so they apply in order (engine schema wins conflicts; keep 001's people/COPPA/payments/medals + skill_ratings/rating_history).
- Add `judges.school_id` (or a judge↔school link) so own-school exclusion has data; until then it's a no-op in the adapter.
- Add a `medal_shipments` table (or reuse `medals`) to persist the ship list.
- `rating_history.k_factor` is `numeric(4,3)`; the locked K is 8/4 — fine as-is, but confirm precision when wiring ratings live.

## Recovery note (2026-08-05→06)

An earlier session's files were never committed and were lost from the repo; the originals were re-supplied and restored, then the parallel chat's locked cores were merged in. Everything re-verified green.

## Migration reconciliation — DONE (2026-08-06)

The forked `001` schema and the engine migration are reconciled into an ordered, clean-applying set (engine wins conflicts, per Bradley):

1. `20260804000000_base_reference_people.sql` — reference tables + people/org (schools, competitors, guardians, `guardian_competitors`, judges **with `school_id`**, staff), COPPA `consents`, and `criteria`/`rubric_weights` kept as judge-guidance reference. Seeds included.
2. `20260805120000_tournament_engine.sql` — the engine (seasons, division_schemes, rounds, divisions, pods, entries, judge_assignments, results, round_step_runs, engine_audit). Unchanged except a header note on ordering.
3. `20260806000000_ratings_finance_recognition.sql` — `skill_ratings` (seed **50**, matching the locked rule), `rating_history` (with `opponents` + `k_factor`), `season_results`, `medals`, **`medal_shipments`** (new — persists the ship list), `payments`, `school_payouts`, `content_reports`. All repointed onto the engine's `rounds`/`entries`/`divisions`. RLS enabled deny-by-default.

**Dropped from the old 001** (superseded by the engine + the locked single-score model): its own `seasons`/`tournaments`/`divisions`/`pods`, `submissions`, `submission_scores`, `deductions`, and `judge_assignments`. Per-criterion rubric *persistence* is gone; the locked model stores one 0–100 score per judge on `judge_assignments`.

Verified against real Postgres (PG16 via PGlite): all three apply clean in order, 30 tables, 44 foreign keys resolving, a full school→…→result→medal→rating_history chain inserts, and FK enforcement is live.

**Remaining before a live DB run:** per-role RLS policies (enabled but not written), a Supabase project + env for `round-controller`, and the video storage/moderation pipeline.

## RLS policies — DONE (2026-08-06)

Migration `20260807000000_rls_policies.sql` adds per-role Row-Level Security across the schema (deny-by-default; engine runs as service role and bypasses RLS).

- Helper functions in schema `nmao` (SECURITY DEFINER, to avoid recursive RLS): `is_staff()`, `competitor_ids()` (self + guardianed competitors), `judge_id()`.
- **Competitor / guardian**: read their own entries, results, ratings, medals, payments, season results; a competitor may insert their own entries and consents.
- **Judge**: reads only their own `judge_assignments` and the entries assigned to them; may update their assignment to submit a score.
- **Staff / operators**: broad read, including ops/moderation tables (`round_step_runs`, `engine_audit`, `medal_shipments`, `school_payouts`, `content_reports`).
- **Public (authenticated)**: reference tables + tournament structure (seasons, schemes, rounds, divisions, pods) are readable; writes are service-role-only.

Validated in Postgres (PGlite) with seeded users for each role — **17 isolation checks pass**: competitors see only their own rows and not each other's; guardians see their ward's; judges see only assigned videos and can submit a score; staff see all; a stranger sees nothing; service role bypasses; and a competitor cannot file an entry for someone else.

**Identity model — CONFIRM WITH BRADLEY (handoff §3 left this [TO DEFINE]):** policies assume auth users are linked via the existing `auth_user_id` columns, guardians act for their linked competitors, and staff are NMAO operators. The **school app has no school↔auth mapping yet**, so school-scoped self-service is deferred and school data is staff-only for now — this is the main identity item to close before the school spoke ships.
