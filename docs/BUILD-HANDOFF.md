# NMAO Championship Tournament — Build Handoff (START HERE)

*Master handoff for building the app. Read this first, then the per-surface specs it
links. It separates **what's already built & tested** from **what's left to build**,
lists every design doc + mockup, and records the locked decisions.*

Last updated: 2026-08-08 · Repo: `NMAO-Tournament`

---

## TL;DR

- **What:** NMAO — a monthly, video-based martial-arts **Championship Tournament**
  platform (all styles), plus **dueling** and **school-run in-house tournaments**.
  Four app surfaces: **Competitor**, **Judge**, **Mission Control** (operator), and
  **School Portal** — plus public results pages.
- **Already built & validated (do NOT rebuild):** the tournament **engine** (pure
  cores + orchestration), the **database schema** (8 migrations), the
  **`round-controller`** edge function (gated), the **motivational-sayings** table +
  reveal wiring, demo seeds, and **173 automated checks** (`npm run validate`).
- **What's left:** the **front-end** for all four surfaces (per the mockups + maps),
  the **remaining backend** (competitor/judge/school edge functions + RLS for new
  tables), and Phase-2/3 features (dueling, in-house tournaments, merch, sponsors).
- **Two separate products:** this Tournament app is **standalone**, marketed/sold
  **separately** from the existing **Member Platform** (a different repo). Optional
  opt-in bridge only.

## 1. Tech stack & conventions

Authoritative stack: `frontend-handoff.md` / `frontend-build-handoff.md`.
Summary: **Next.js (App Router) + React + TypeScript**, **Tailwind + shadcn/ui**,
**@supabase/ssr**, **TanStack Query + Supabase Realtime**, **Recharts**, deploy on
**Vercel**; one web codebase **route-grouped by audience**. Backend = **Supabase**
(Postgres, Auth, Edge Functions/Deno, Storage, Realtime, RLS). Engine cores are
plain TypeScript shared by the edge functions.

Conventions (respect these):
- **RLS everywhere**, keyed on `auth_user_id` → role mapping; the service role
  bypasses RLS by design (engine/EF only). New tables ship with policies.
- **Idempotency:** engine steps are claim-guarded (`claim_step`) and safe to re-run.
- **Secrets:** never ship a secret/service key to the client. Privileged actions go
  through gated edge functions (see `authorize()` in `round-controller/index.ts`).
- **Minor-safety (COPPA) is a hard requirement** — see §7.
- **Tests:** `npm run validate` must stay green (typecheck + unit + PGlite
  integration). Add tests with new engine logic.

## 2. What's already built & validated

**Engine (pure, tested) — `supabase/functions/_shared/`:**
`divisioning.ts` (classify → collapse → form pods), `assignments.ts` (judge
assignment, own-school exclusion), `rating.ts` (`resolvePod`, `updateRatings`
same-rank 0–100, `weightedJudgeScore` per-criterion), `distribute.ts` (medal ship
list), `engine.ts` (idempotent orchestration: `divide`, `assign_judges`, `resolve`,
`distribute`), `supabaseStore.ts` (Supabase adapter incl. `saveDivisioning`, reveal
sayings, finalize/rollback). Spec: `engine-spec.md`, `scoring-and-rating.md`.

**Edge function — `supabase/functions/round-controller/`:** one gated entrypoint;
`POST {roundId, step}` where step ∈ `divide|assign_judges|resolve|distribute|tail|
all`. Auth via `authorize()` (service key **or** signed-in `nmao.is_staff()`).
Runbook: `run-a-round.md`.

**Database — `supabase/migrations/` (8, ordered):** base reference/people →
tournament engine → ratings/finance/recognition → RLS policies → per-criterion
scoring → idempotency hardening → motivational_sayings → reveal_sayings. Combined:
`reset_and_apply.sql` (one-shot) / `apply_all.sql`. Verify with `verify_schema.sql`.

**Seeds:** `seed_demo.sql` (a full demo round), `seed_demo_scores.sql`,
`seed_sayings.sql` (111 sayings). **Validated live:** a complete demo round ran
end-to-end on the production project (divide → … → distribute).

**Tests:** `npm run validate` = typecheck + 137 unit assertions (incl. 53 edge-case
scenarios) + PGlite schema/idempotency/rollback integration. All green.

## 3. Locked decisions

- **Two separate products** (Tournament vs. Member Platform); optional bridge only.
- **Age brackets:** 7-9, 10-12, 13-15, 16-17, 18+ (ours, not the doc's 4-7…51+).
- **Rank/class:** belt→tier, **instructor-set**; NMAO is system of record.
- **Rating + Points are two metrics** (rating = skill/same-rank 0–100; season points
  = placement standings) **+ Total points earned** (lifetime, grows every event).
- **Judging:** locked **6-criterion per-style** weighted rubric (rule book's
  3-criterion is superseded).
- **Two tournament flows:** monthly **seasonal** (built) + a **championship bracket**
  (Grand Finale / sponsor tournaments): top-5 advance → regroup → top-3 → final pod.
- **Reveal is effort-first**; non-placers get a **motivational saying** (wired);
  **Imprint completes by showing up** (100%).
- **Mastery Path** (lifetime, never-plateau) + **season colors** (10-year gemstone
  rotation, `brand-tokens.md`) mirrored to the physical medal.
- **Dueling:** standalone/async, school-gated + school-set geo area, **community
  (nationwide competitor) voting**, min 3 votes → majority → sudden-death →
  **deadlock draw**; durations set (`dueling.md`).
- **Badges:** ~90 unique, rarity = finish, sold as **pins/patches**
  (`badge-catalog.md`).
- **Judges are 1099 independent contractors** (not employees); sign-up onboarding +
  Integrity Creed + Stripe Connect payout.
- **In-house tournaments:** schools host free, self-judged, own prizes, local-only.
- Brand: dark "dojo-luxe" black + gold + metallic red/purple/blue spectrum
  (`brand-tokens.md`).

## 4. Surfaces to build (each: spec + mockup)

| Surface | Audience | Spec / map | Mockups |
|---|---|---|---|
| **Competitor app** | competitors / guardians (mobile-first) | `competitor-app-map.md`, `competitor-app.md`, `competitor-growth-and-badges.md`, `physical-medal.md` | `mockups/competitor-app-screens.html`, `mockups/competitor-growth-lifetime.html` |
| **Badges** | competitors | `badge-catalog.md` | `mockups/badge-gallery.html` |
| **Dueling** | competitors | `dueling.md` | `mockups/dueling-screens.html` |
| **Judge app** | judges (1099) | `judge-app-map.md` | `mockups/judge-app-screens.html` |
| **Mission Control** | NMAO staff (desktop) | `mission-control-spec.md` | `mockups/…`, `mission-control-mockup.html` |
| **School Portal** | instructors (desktop) | `school-portal-map.md`, `in-house-tournaments.md` | `mockups/school-portal-screens.html`, `mockups/in-house-tournaments.html` |
| **Public results** | anyone (SSR/SEO) | `frontend-page-map.md` §(d) | — |

Full page/route map + states: `frontend-page-map.md`. Product scope + roadmap:
`product-scope-synthesis.md`. Plain-language glossary: `glossary.md`.

## 5. Data model

**Existing tables** (see migrations): `seasons, division_schemes, rounds, divisions,
pods, entries, judge_assignments, results, round_step_runs, engine_audit,
competitors, guardians, guardian_competitors, judges, staff, schools, consents,
event_types, age_brackets, criteria, rubric_weights, app_settings, skill_ratings,
rating_history, season_results, medals, medal_shipments, payments, school_payouts,
content_reports, submission_scores, motivational_sayings` (+ `results.saying_id`).
Helpers in `nmao` schema: `is_staff()`, `competitor_ids()`, `judge_id()`;
`claim_step()`, `assign_reveal_sayings()`.

**New tables to add** (per specs): competitor `round_virtues`, `mastery_path` +
`mastery_events`, `journal_entries`, `badges` + `badge_awards`,
`student_tournament_settings` (or `competitors.flags`); dueling `duels`,
`duel_votes`, `duel_ratings`, `voter_stats`; in-house `school_tournaments`,
`sh_tournament_entries/judges/prizes`; judge fields `styles, years_training,
notable_mentions, creed_accepted_at, ic_agreement_accepted_at,
stripe_connect_account_id`. Each ships with RLS.

## 6. Build sequence (recommended)

**Phase 1 — the monthly tournament, end to end:**
1. Auth + role routing (magic-link) for all four groups.
2. **Mission Control** pipeline board (calls `round-controller`, realtime on
   `round_step_runs`) — smallest surface, exercises the whole engine.
3. **Judge app** (queue + score screen + RECUSE + creed/onboarding).
4. **Competitor app** core: onboarding/consent → Home → Compete → Reveal
   (effort-first) → Imprint → Journey/Growth → Profile.
5. **School Portal** Phase-1: roster + class, Tournament Controls, entries/payments,
   payouts.
6. **Public results** pages. **Badges** + **Journal** + **Leaderboards**.

**Phase 2:** two-round advanced flow, dueling, in-house tournaments, protests/
appeals (on rollback), regional leaderboards, merch.

**Phase 3:** sponsorship engine, e-commerce/pins, championship bracket polish,
optional Member-Platform bridge.

## 7. Security & compliance (non-negotiable)

- **COPPA / minor-safety:** guardian consent gate before a minor competes; private
  video (no public discovery); sharing off by default + guardian-gated; **no
  free-text comments** in dueling/voting for minors; anonymous vote tallies; guardian
  delete controls. Applies to every surface.
- **Secrets:** service/secret keys server-side only; the browser calls gated EFs with
  a **staff/user session token**, never a secret key. (Note: the deployed
  `round-controller` checks the project's **`sb_secret_…`** secret key for the
  service path — see `run-a-round.md`.)
- **Payments/banking:** Stripe only; **never store raw bank/card/tax data** — use
  Stripe Connect onboarding (schools + judges).
- **Legal flags (need counsel):** judge **IC agreement + worker classification**;
  the **video consent/waiver + privacy policy** (`legal/`); youth **sweepstakes** if
  the dueling voter-raffle is enabled.

## 8. How to run & validate

- `npm install` → `npm run validate` (typecheck + tests + PGlite integration).
- Apply schema: run `supabase/reset_and_apply.sql` on the project (fresh) → confirm
  with `verify_schema.sql`.
- Deploy engine EF: `supabase functions deploy round-controller --project-ref
  <ref>`. Run a round per `run-a-round.md` (`divide → assign_judges →` scores `→
  resolve → distribute`).

## 9. Open decisions (still to settle)

- Competitor app **web (Next.js PWA) vs. React Native** — the animation-heavy Imprint
  / reveal may favor RN; the rest is Next.js web. (Reconcile against
  `frontend-handoff.md`.)
- **Video hosting:** Supabase Storage vs. Vimeo (private/unlisted).
- Dueling **voting-window / overtime** exact lengths; **min-voters** = 3 (set).
- Geo-location rule: **hard exclusion vs. soft matchmaking** preference.
- Fill the `legal/` placeholders + counsel review.

## 10. Suggested first task

Scaffold the Next.js app (route groups `(public)`, `(control)`, `(judge)`, `(me)`),
wire Supabase auth + the brand tokens, then build **Mission Control's pipeline board**
against the live `round-controller` and demo round — it proves the end-to-end loop and
unblocks everything else.
