# NMAO Tournament 

The competition engine of the NMAO suite — a monthly, video-based martial arts tournament. Competitors submit an event video each round; an automated engine sorts them into fair divisions and skill-based pods, routes videos to judges, scores them, updates ratings and standings, and ships collectible medals. A season runs 9 qualifying rounds → semi-finals → grand finale.

Backend is Supabase (Postgres + Auth + Edge Functions + Storage). The engine is a pure, DB-free, unit-tested core wrapped by idempotent edge functions keyed by `(round_id, step)` — the same core powers live runs and the operator preview.

## Repo layout

```
README.md                                   This file
docs/
  NMAO-suite-handoff.md                     Master orientation for the whole 3-product suite
  engine-spec.md                            Full tournament engine spec (state machine, pipeline, overrides)
  scoring-and-rating.md                     Plain-language, auditable spec of scoring + the locked rating rule
  project-log.md                            Living log: locked decisions, parked ideas, open items
supabase/
  migrations/                               Ordered, reconciled set — apply in filename order
    20260804000000_base_reference_people.sql        1/3 reference + people/org (schools, competitors,
                                                    guardians/COPPA consents, judges[+school_id], staff)
    20260805120000_tournament_engine.sql            2/3 engine (seasons, division_schemes, rounds, divisions,
                                                    pods, entries, judge_assignments, results, step-runs, audit)
    20260806000000_ratings_finance_recognition.sql  3/3 skill_ratings (seed 50), rating_history, medals +
                                                    medal_shipments, payments, payouts, content_reports, season_results
    20260807000000_rls_policies.sql                 4/4 per-role Row-Level Security: competitor/guardian/judge/
                                                    staff scoping + public reference/structure; engine via service role
  functions/
    _shared/
      divisioning.ts                        Step 3 core: classify → collapse → formPods → runDivisioning
      assignments.ts                        Step 4: per-video judge assignment (1/3, own-school exclusion)
      rating.ts                             Step 4: resolve (score→placement) + LOCKED same-rank rating
      distribute.ts                         Step 4: medal ship list (one shipment per school)
      roundState.ts                         Step 4: round state machine + §4 guardrails
      engine.ts                             Step 4: idempotent orchestration over an EngineStore seam
      supabaseStore.ts                      Supabase (Deno) EngineStore adapter — not run by npm test
      *.test.ts                             93 assertions total across the cores
    round-controller/
      index.ts                              Edge entrypoint: run a step (or the tail) for a round
mission-control/
  index.html                                Operator dry-run console (seeded data, real engine) — open in a browser
```

> **Migrations reconciled (2026-08-06):** the earlier forked `001` schema was split into the three ordered files above (base → engine → ratings/finance). The engine schema is the source of truth for competition structure; ratings/finance/recognition were repointed onto the engine's `rounds`/`entries`/`divisions`; `judges.school_id` and a `medal_shipments` table were added. Verified to apply clean in order against Postgres (PG16) with all foreign keys resolving.

## Status

- **Step 2 — data-model migration:** done (engine schema applies clean against Postgres).
- **Step 3 — divisioning core:** done. Pure, DB-free, deterministic.
- **Step 4 — round-state controller + remaining pipeline steps:** done. Assign judges, resolve (straight-average scoring + tiebreak), update ratings (the **locked** same-rank rule), distribute (ship list), plus the round state machine and idempotent orchestration keyed by `(round_id, step)`. The Supabase adapter + `round-controller` edge function wire the pure cores to the DB.
- **Step 5 — mission-control UI + end-to-end dry run on seeded data:** done (`mission-control/index.html`).

`npm test` runs **93 assertions, all passing** (divisioning 24, rating 21, assignments 11, distribute + state machine 19, engine orchestration 18).

Open before a live DB run: **confirm the identity→role model** the RLS policies assume (auth users linked via `auth_user_id`; guardians act for their competitors; the school app has no school↔auth mapping yet, so school data is staff-only for now), stand up a Supabase project + env for the `round-controller` edge function, and design the video storage/moderation pipeline. Schema reconciliation, `judges.school_id`, `medal_shipments`, and **per-role RLS policies** are **done** (RLS row-isolation validated against Postgres with test users for each role).

See `docs/engine-spec.md` for the pipeline and `docs/scoring-and-rating.md` for exactly how every score and rating is produced.

## Running the tests

Requires Node 18+ (uses `tsx` to run the TypeScript tests directly).

```
npm test
```

Expected: each suite prints `N passed, 0 failed`.

## Mission Control (dry run)

Open `mission-control/index.html` in any browser — no build step. Seed competitors/schools/judges, edit the Division Scheme, simulate, then advance a round through the full state machine (classify → … → distribute) and watch pods, judge assignments, results, rating deltas, and the per-school medal ship list. Its embedded engine mirrors the locked cores.

## Locked engine parameters (season 1)

Pod floor 6 · rank tiers beginner/intermediate/advanced · age brackets 7-9, 10-12, 13-15, 16-17, 18+ · pods cap 20, split at 22 · collapse merges nearest rank then age, never across events · judging 1 judge (beginner/intermediate) or 3 (advanced) · 3-judge score = straight average · tiebreak = highest single-judge score then earliest submission · incomplete pod = reopen to judge pool, never force-resolve.

**Rating (locked):** every competitor seeds at **50** on a 0–100 scale; rating moves on **placement, measured only against same-rank podmates**; K = **8** for a competitor's first 3 rounds then **4**; clamped 0–100; used only to form pods within a rank bracket — it never crosses ranks (that's a real dojo promotion via `declared_rank`). Full formula + worked examples in `docs/scoring-and-rating.md`.
