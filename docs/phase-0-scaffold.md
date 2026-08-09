# Phase 0 — Scaffold guide (foundation)

*How the two front-ends drop in around the existing Supabase backend. Follows the
locked decisions (Hybrid: Next.js web + Expo native competitor; password auth;
shared tokens). Run the commands below to stand up the skeletons.*

## Status
- ✅ **Backend foundation** — Phase-1 migration `20260810000000_phase1_growth_journal_badges_points.sql`
  (round_virtues, mastery_path/events, journal, badges/awards, season_points,
  student_tournament_settings + judge fields + competitors.total_points), all with
  RLS, **verified applying cleanly on PGlite**.
- ✅ **Shared design tokens** — `packages/design-tokens/tokens.ts` (metallic hues,
  tier map, neutrals, spectrum) — one source of truth for web + native.
- ✅ **App skeletons** — `web/` (Next.js, **builds clean**) + `app/` (Expo RN,
  **typechecks clean**); both wired with Supabase clients (password + implicit auth)
  and the shared `@nmao/design-tokens` package; branded starter screens in each.
- ✅ **CI** — `.github/workflows/ci.yml` (backend `validate` + web `build` + app typecheck).
- ⬜ **Your turn:** add the anon key to `web/.env.local` + `app/.env`; apply the
  Phase-1 migration to the live project (or regenerate `reset_and_apply.sql`).

## Target repo layout (light monorepo)
```
NMAO-Tournament/
  supabase/        # existing — engine, migrations, functions (unchanged)
  scripts/         # existing — pglite validators
  docs/  legal/    # existing
  packages/
    design-tokens/ # tokens.ts (done) — shared by web + app
  web/             # NEW — Next.js (App Router): (control)(school)(judge)(public)
  app/             # NEW — Expo React Native: the competitor app
```

## 1. Web app (Next.js — Mission Control, School, Judge, Public)
```bash
cd NMAO-Tournament
npx create-next-app@latest web --ts --tailwind --app --eslint --import-alias "@/*" --no-src-dir --use-npm --yes
cd web
npm i @supabase/supabase-js @supabase/ssr @tanstack/react-query recharts
```
- **Route groups:** `app/(control)`, `app/(school)`, `app/(judge)`, `app/(public)`.
- **Supabase:** a server client (`@supabase/ssr`, cookies) + a browser client.
  `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Tailwind:** import `packages/design-tokens/tokens.ts` into `tailwind.config` to
  generate the palette/spectrum utilities (metallic gradients via CSS vars).
- **Auth (D6):** email + password (`signInWithPassword`) + `resetPasswordForEmail`
  reset flow. **Set the client `flowType:'implicit'`** and handle the reset-return +
  `PASSWORD_RECOVERY` → set-password screen (mirror the pattern we just built into
  the member `staff.html`). **No magic-link-primary.**

## 2. Competitor app (Expo — React Native, the crown jewel)
```bash
cd NMAO-Tournament
npx create-expo-app@latest app -t expo-template-blank-typescript
cd app
npx expo install @supabase/supabase-js react-native-url-polyfill \
  expo-linear-gradient react-native-reanimated @shopify/react-native-skia \
  expo-haptics expo-secure-store expo-router
```
- **Animation stack:** **Reanimated + Skia + expo-haptics** — the Reveal ceremony,
  9-segment Imprint fill, badge ignite, particle bursts (see
  `docs/mockups/competitor-hero-screens.html` for the target).
- **Supabase:** `@supabase/supabase-js` with `react-native-url-polyfill` +
  `expo-secure-store` for the session; **auth = password + reset** (same policy).
- **Tokens:** import `packages/design-tokens/tokens.ts`; use `metalStops()` with
  `<LinearGradient>` for the metal, `glow()` for the lit look.
- Tabs (expo-router): `Home · Imprint · Compete · Journey · Profile` (+ contextual
  Reveal / Badges / Journal / Leaderboards / Dueling / Championship).

## 3. Shared tokens wiring
Both apps import from `../packages/design-tokens/tokens.ts`. Keep it dependency-free
(plain TS) so it works in Next.js and RN without a build step. (If you later add a
workspace tool, publish it as `@nmao/design-tokens`.)

## 4. CI
A GitHub Action that keeps the engine green + typechecks both apps:
```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  backend: { runs-on: ubuntu-latest, steps: [ {uses: actions/checkout@v4},
    {uses: actions/setup-node@v4, with: {node-version: 20}},
    {run: npm ci}, {run: npm run validate} ] }   # engine + pglite (incl. new migration)
  # add web + app typecheck jobs once scaffolded
```

## 5. Deploy targets
- **Web** → Vercel (env = Supabase URL + anon key); preview per PR; prod on the
  tournament domain.
- **App** → Expo EAS build → App Store + Play Store.
- **Backend** → migrations on the Supabase project; EFs via CLI (`--project-ref
  oxzuavpyoetchwebdejp`, keep `authorize()` gates).

## Next after Phase 0
**M2 — Judge app v1** (queue + ACCEPT/RECUSE + 6-criterion score → `submission_scores`
+ `judge_assignments.score`; IC/creed/Stripe-Connect onboarding). It makes a real
round runnable end-to-end on top of the working Mission Control board.
