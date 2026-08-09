# NMAO Championship Tournament — Comprehensive Build Action Plan

*The sequenced, milestone-by-milestone plan to build and ship the whole app. Reads
on top of `BUILD-HANDOFF.md` (what exists) and `build-analysis-and-decisions.md`
(contradictions + recommended next slice). Opinionated on purpose — every decision
has a recommendation so the build never stalls waiting on a choice.*

Last updated: 2026-08-08

---

## 0. Ground rules

- **Do NOT rebuild:** the engine (`_shared/*`), the schema (8 migrations),
  `round-controller` (now incl. tested **finalize + rollback**), Mission Control's
  working board (`mission-control/live.html`), reveal sayings, seeds, and the 173+
  `npm run validate` checks. The build is **new surface area around a proven core.**
- **Green bar is law:** `npm run validate` (typecheck + unit + PGlite) stays green;
  add tests with any new engine logic.
- **RLS on every new table; secrets server-side only;** privileged actions go
  through gated edge functions (the `authorize()` pattern).
- **COPPA is a hard gate, everywhere** (guardian consent, private video, no public
  minor social, guardian controls).

## 1. Decisions to lock before Phase 1 (recommendation baked in)

| # | Decision | Options | **Recommendation** | Blocks |
|---|---|---|---|---|
| D1 | Frontend platform | Next.js PWA (all) vs RN (competitor) | **One Next.js App-Router codebase for all surfaces.** Reveal/Imprint animations are achievable on web (Canvas/WebGL + Framer Motion). Only fork to RN post-launch if the ceremony demands native. | everything |
| D2 | Dueling voting (minors) | community vote vs participant/judge-decided | **v1 = participant/judge-decided + guardian-gated; nationwide community voting only for adult/opt-in divisions, post legal review.** Resolves the biggest cross-doc contradiction. | dueling (Phase 2) |
| D3 | Video hosting | Supabase Storage vs Vimeo | **Supabase Storage + signed URLs for v1** (one stack, RLS-native). Revisit Vimeo only if transcoding/bandwidth bites. | Compete + Judge |
| D4 | Two-round advanced | v1 vs Phase 2 | **Phase 2.** Ship the single-round seasonal flow (built) first. | judge/competitor depth |
| D5 | Points ledger | now vs later | **Phase 1** — add a `season_points` ledger + lifetime `total_points`; standings/prizes need it. | leaderboards, profile |
| D6 | **Auth method** | magic-link-primary (docs) vs password+reset | **Password-primary + robust reset (implicit flow); admin-provisioned initial passwords.** We just learned the hard way that one-time email links get eaten by scanners + break in mobile webviews. Do NOT make magic links the primary path for any role. | all auth |
| D7 | Badge catalog | as-is vs cleaned | **Dedup + renumber + assign stable `code`s before seeding `badges`.** (Duplicate #63/64/66/67/68; "~90" vs "~70".) | badges |

## 2. Architecture & repo layout

- **One Next.js (App Router) app**, route-grouped by audience: `(public)` (SSR/SEO),
  `(control)` staff, `(judge)`, `(me)` competitor/guardian, `(school)` portal.
  Tailwind + shadcn/ui, brand tokens from `brand-tokens.md`, `@supabase/ssr`,
  TanStack Query + Supabase Realtime, Recharts. Deploy on **Vercel**.
- **Shared packages:** `design-system` (tokens + Imprint/Badge/Reveal primitives),
  `supabase` (typed client + generated types), and the existing **engine cores**
  (plain TS, already shared by the edge functions).
- **Domain:** its own host (e.g. `tournament.nmao.us` / `nmao.us`), **separate**
  from the member platform's `app.nmao.us` (two products, locked).
- **Secrets:** service key only in edge functions; the browser calls gated EFs with
  the **staff/user session token**, never a secret.

## 3. The phased plan

### Phase 0 — Foundation (before any surface)
1. Lock D1–D7.
2. Scaffold Next.js + route groups + **auth** (password + reset per D6; role routing
   by `auth_user_id` → staff/judge/competitor/school).
3. **Design system**: brand tokens, the metallic spectrum, and the three signature
   primitives — **Imprint** (9-segment medallion), **Badge** (rarity finishes +
   earn reveal), **Reveal** ceremony — as reusable components (mockups exist:
   `competitor-hero-screens.html`, `badge-gallery.html`).
4. **CI/CD**: `npm run validate` + typecheck in CI; Vercel preview deploys per PR.
5. Migrations: add new tables **per surface** (below) so each ships with reviewable
   RLS, rather than one giant migration.

### Phase 1 — the monthly tournament, end to end
*Goal: a real round runs start-to-finish with real people.*

**M1 · Mission Control (finish it).** The board already works (`live.html`). Port it
into `(control)` (or keep as-is short-term) and build the remaining pages:
`/control` dashboard, `/divisions`, `/results` (Recharts), `/medals`, `/judges`,
`/entries`, `/scheme` (+ **simulate** via the divisioning core), `/finance`,
`/audit`, `/settings`. **DoD:** staff run + inspect a full round; rollback/finalize
usable. *(Backend: none new — round-controller covers it.)*

**M2 · Judge app (the unblocker — build 2nd).** Nothing lets judges score yet, so
`resolve` has no real scores. Ship: IC onboarding (application → **e-sign IC
agreement** → **Stripe Connect Express** → background check → **Integrity Creed**
gate), Queue (realtime `judge_assignments`, **ACCEPT/RECUSE**), **Score screen**
(dual-angle player, zoom/slow-mo, 6-criterion rubric → `submission_scores` +
weighted `judge_assignments.score`), History, Profile. **Backend:** `judge-signup`
+ `judge-connect-onboarding` EFs, judge fields (`styles, years_training,
notable_mentions, creed_accepted_at, ic_agreement_accepted_at,
stripe_connect_account_id`), COI exclusion (already in `assignments.ts`), RLS.
**DoD:** real judges score a real round → `resolve` uses real scores. *(Mockup:
`judge-app-screens.html`.)*

**M3 · Competitor app core (build 3rd).** Onboarding/consent (**COPPA gate**) → Home
bento → **Compete** (enter + pay Stripe; **2-angle resumable video upload**;
per-round **spoken password**) → **Reveal** (effort-first) → **Imprint** → Journey/
Growth (Recharts + the Mirror) → Profile. **Backend:** `create-entry` +
`create-entry-checkout` (Stripe), `sign-video-upload` (Storage signed URLs),
`issue-round-password`, new tables `round_virtues`, `mastery_path`+`mastery_events`,
`journal_entries`; reveal sayings (done). **DoD:** a competitor enters → uploads →
is judged → reveals → Imprint fills. *(Mockups: `competitor-app-screens.html`,
`competitor-hero-screens.html`, `competitor-growth-lifetime.html`.)*

**M4 · School Portal Phase 1.** School account + auth, roster + **CSV import**,
**class assignment**, **Tournament Controls** panel (per-student toggles →
`student_tournament_settings`), entries/payments oversight, per-round **payouts**
(Stripe Connect, 10/20/30% tiers). **DoD:** a school runs its students through a
round and gets paid. *(Mockup: `school-portal-screens.html`.)*

**M5 · Public + recognition.** Public **results** (`/results/[roundId]`, SSR/SEO),
**standings**/`/school/[slug]`/`/division/[id]`, core **Leaderboards** (effort-first),
**Badges** (award engine + grid + earn reveal), **Journal**. **DoD:** public pages
live, badges award, journal works.

> **Phase-1 exit:** the full monthly loop is real — Mission Control divides →
> judges score in the judge app → resolve/distribute → competitors reveal → schools
> get paid → public results + badges. Everything else is depth on top.

### Phase 2 — depth & governance
Two-round advanced flow (**engine addition**: `round_stage` on pods, qualify→final),
**Dueling** (minor-safe per D2: `duels/duel_votes/duel_ratings/voter_stats`),
**In-house tournaments** (`school_tournaments/*`), **protests/appeals** (ride the
rollback path + a `protests` table), regional + school leaderboards, **points
ledger + season reset**, merch shops.

### Phase 3 — monetization & scale
Sponsorship engine + analytics (`sponsors/sponsor_placements`), e-commerce/pins
(badge SKUs), championship-bracket polish, geo-targeted sponsors, and the **optional
opt-in member-platform bridge** (SSO + roster/belt sync).

## 4. Backend build list (Phase 1)

| Edge function | Purpose | Gate |
|---|---|---|
| `create-entry` / `create-entry-checkout` | enter events + Stripe fee | competitor session |
| `sign-video-upload` | signed Storage upload URL (2 angles) | competitor session, own entry |
| `issue-round-password` | per-round spoken password (anti-reuse) | system/cron |
| `judge-signup` / `judge-connect-onboarding` | IC onboarding + Stripe Connect | public → gated |
| `school-payout` | per-round revenue-share payout | school owner |
| *(reuse)* `round-controller` | engine steps + finalize/rollback | staff/service |

**New tables (each with RLS):** `round_virtues`, `mastery_path`+`mastery_events`,
`journal_entries`, `badges`+`badge_awards`, `season_points`(+`total_points`),
`student_tournament_settings`, judge fields (above). Phase 2+ adds dueling / in-house
/ sponsor tables.

## 5. Cross-cutting (non-negotiable)
COPPA gate on every surface; RLS keyed on `auth_user_id`→role; idempotent engine
steps; **Stripe Connect** for judges + schools (never store raw bank/tax); tests
with new engine logic. **Legal review before public launch:** judge IC agreement +
classification, video consent/waiver + privacy policy, youth sweepstakes (if a
dueling raffle is ever enabled).

## 6. Deploy & infra
- **Supabase:** apply migrations (`reset_and_apply.sql` on a fresh project, or
  incremental); deploy EFs via CLI (`supabase functions deploy <fn> --project-ref
  oxzuavpyoetchwebdejp`, keeping `authorize()` gates; CLI-only for anything using
  `_shared`). Secrets in Supabase env.
- **Vercel:** the Next.js app, env = anon key + Supabase URL; preview per PR;
  production on the tournament domain.
- **Observability:** `round_step_runs` + `engine_audit` already give an operator
  timeline; surface them in `/control/audit`.

## 7. Recommended first two weeks (concrete)
1. Lock D1–D7 (a 30-min call with the recommendations above).
2. Phase 0: scaffold + auth (password/reset) + design-system primitives + CI.
3. **M2 Judge app v1** — highest leverage: it makes a real round runnable end-to-end
   with the least new surface, on top of the already-working Mission Control board.

## 8. Risks & long poles
- **Video** is the long pole (Storage, mobile 2-angle resumable upload, dual-angle
  player, signed URLs). Start it early in M3; don't discover it late.
- **The Reveal** is the brand moment — budget real craft time (it's the emotional
  core of the growth-first pillar).
- **Auth** — resist magic-link-primary (D6); we have the scars.
- **Legal** — the IC agreement + video consent gate public launch; start counsel now.
