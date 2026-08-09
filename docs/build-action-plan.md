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

## 1. Decisions — LOCKED 2026-08-08

| # | Decision | **Locked answer** | Ripples into |
|---|---|---|---|
| D1 | Build approach | **Hybrid: a NATIVE cross-platform app for the COMPETITOR experience (recommend React Native + Expo, Reanimated/Skia + haptics for the Reveal / Imprint fill / badge ignite) + a Next.js WEB app for Mission Control, School Portal, Judge, and public results.** | whole architecture |
| D2 | Dueling voting | **Full CLOSED community vote** — verified competitors from verified schools only — gated by the rails: verified-only · explicit **guardian consent for peer voting** · **NO free-text** (A/B + preset phrases only) · anonymous tallies · no discovery/DMs · guardian off-switch. **Consent wording + optional age-tiering → legal review before it ships to minors.** | dueling (Phase 2) + consent |
| D3 | Video hosting | **Supabase Storage + signed URLs for v1** (clips are short 30s–2min, ~10–30MB → stream fine; tightest privacy + instant guardian-delete). **Mux** = later premium-streaming upgrade if scale demands (better fit than Vimeo for a kids' app). | Compete + Judge |
| D4 | Two-round advanced flow | **Phase 2** — ship the single-round seasonal flow (built) first. | engine depth |
| D5 | Rating + points | **Keep both**; add a `season_points` ledger + lifetime `total_points` in **Phase 1**. | leaderboards, profile |
| D6 | Auth | **Password + robust reset; admin-provisioned initial passwords. NOT magic-link-primary** (one-time email links get eaten by scanners + break in mobile webviews — we lived it). | all auth |
| D7 | Badge catalog | **Dedup + renumber + stable `code`s before seeding `badges`** (duplicate #63/64/66/67/68; "~90" vs "~70"). | badges |

## 2. Architecture & repo layout (Hybrid, per D1)

Two front-ends over one Supabase backend:

- **Competitor app — NATIVE, cross-platform (recommend React Native + Expo).**
  iPhone + Android from one codebase; **Reanimated + Skia + haptics** carry the
  crown-jewel moments (Reveal ceremony, 9-segment Imprint fill, badge ignite,
  particle bursts). Ships to the App Store + Play Store. This is where the premium
  feel lives — the reason we went hybrid.
- **Web app — Next.js (App Router)** for the "desk"/utility surfaces: `(control)`
  Mission Control, `(school)` School Portal, `(judge)` Judge app (mobile-first web
  PWA — judges are adults, a tool not a showcase), `(public)` SSR/SEO results.
  Tailwind + shadcn/ui, `@supabase/ssr`, TanStack Query + Realtime, Recharts;
  deploy on **Vercel**.
- **Shared across both:** brand **design tokens** (native + web match), the typed
  **Supabase client/types**, and the existing **engine cores** (plain TS).
- **Domain:** its own host (e.g. `tournament.nmao.us`), **separate** from the member
  platform's `app.nmao.us` (two products, locked).
- **Secrets:** service key only in edge functions; both clients use the anon key +
  RLS + gated EFs — never a secret in the client.

*(Sub-choice to confirm at M3: **React Native + Expo** (recommended — one codebase,
both stores, best animation libs) vs. two fully-native apps (SwiftUI + Jetpack
Compose — highest ceiling, ~2× the work). Your existing SwiftUI apps mean native
iOS is in reach either way.)*

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
**Dueling** (full closed community vote per D2 + its safety rails; needs the
guardian **peer-voting consent** clause legally reviewed before it ships to minors;
tables `duels/duel_votes/duel_ratings/voter_stats`),
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
