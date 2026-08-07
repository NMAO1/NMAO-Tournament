# NMAO Tournament — Frontend Build Handoff (v1)

**Purpose:** one source of truth so every chat/contributor builds the tournament
front end on the same stack, design system, and backend contracts. Read this
before mapping pages or writing UI.

---

## 1. Recommended stack (chosen for a high-quality, real-time UX)

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + React + TypeScript** | Best-supported Supabase integration, SSR for fast/shareable public pages, mature ecosystem, TS shares types with the engine. |
| UI/styling | **Tailwind CSS + shadcn/ui** (Radix primitives) | Accessible, themeable components; fast to build a consistent, premium look. |
| Data / auth / realtime / storage | **Supabase** (`@supabase/ssr`) | Same project as the engine. Auth, RLS, **Realtime** (live scoring/brackets), Storage (competitor videos). |
| Server-state | **TanStack Query** + Supabase Realtime | Cache + optimistic updates; live channels for judge submissions, pipeline status, results. |
| Charts / brackets | Recharts (rating trends) + custom SVG for brackets/pods | Rating history is a headline UX moment. |
| Hosting | **Vercel** (preview deploy per PR) | Zero-config Next.js; shareable preview links per branch. |

**Why not vanilla HTML** (like the membership `dashboard.html`): those single-file
pages work for simple forms, but the tournament UI is deeply stateful and
real-time (judge scoring queues, live brackets, mission-control pipeline,
competitor dashboards). A component framework is the right call here.

**Viable alternative:** SvelteKit (lighter, great DX). React/Next is recommended
only because it has the largest ecosystem + the most battle-tested Supabase
patterns, which matters across multiple chats.

**One app, route-grouped by audience** (Next.js route groups / a light monorepo).
Keep the judge & competitor views mobile-first; mission control desktop-first.

---

## 2. Surfaces (four audiences, one codebase)

### (a) Mission Control — NMAO staff (owner/admin/organizer)
Desktop-first, data-dense. Runs the season.
- Pipeline board per round: classify → collapse → form_pods → **assign_judges → resolve → distribute** (each step's status from `round_step_runs`; buttons call the `round-controller` EF).
- Divisions/pods view, entries validation, judge pool + assignments, overrides/rollback (`engine_audit`).
- Results, ratings, medal ship list, finance.

### (b) Judge app — mobile-first
- "My queue" of assigned videos; video player; **per-criterion scoring** (Traditional vs Open rubric); submit.
- Progress + deadline; conflict-of-interest handled server-side (never own-school).

### (c) Competitor / Guardian — mobile-first
- Register, upload performance video (Storage), consent/waiver (COPPA).
- See placements, medals, and **skill-rating journey** (this is the emotional hook — mirror the member app's Progress tab tone: milestones + journey, not just a number).

### (d) Public results / leaderboards — fast, shareable, SEO
- Season standings, per-division brackets/pods, medal counts by school, shareable competitor cards.

---

## 3. Design system / brand tokens (match NMAO house style)

Dark, premium, "dojo-luxe." Same palette as the NMAO emails + `charge.html`.

```
--bg:            #080808   (page)      --surface: #141414 (cards)
--border:        #222222
--gold (accent): #C9A84C   --gold-ink (on gold): #080808
--text:          #F5F0E8   --muted:   #B8B0A4   --muted-2: #7A7060
success:#5A9A6A  danger:#E07070  info:#7DAAD4
```
- **Type:** serif **display** (Georgia / a refined serif) for headings; clean sans (system/Inter) for body/UI.
- **Tone:** calm, high-trust, ceremonial. Generous spacing, subtle gold accents, no neon.
- Light/dark: ship **dark-first** (brand identity); a light mode is optional later.
- Accessibility: WCAG AA contrast, full keyboard nav, mobile tap targets ≥44px.

---

## 4. Backend it builds against (already live)

- **Supabase project:** `oxzuavpyoetchwebdejp` → `https://oxzuavpyoetchwebdejp.supabase.co`
  (grab the **anon key** from Dashboard → Settings → API; it's public and RLS-guarded.)
- **Auth model:** one Supabase Auth user maps to a row via `auth_user_id` in one of
  `staff` / `judges` / `competitors` / `guardians`. RLS is the security boundary.
  Helper: `nmao.is_staff()` (owner/admin/organizer). Judges/competitors/guardians see only their own data.
- **The engine (server):** the pipeline runs in the **`round-controller`** edge function
  (`POST { roundId, step }`, `step ∈ assign_judges|resolve|distribute|tail`). It is **gated** —
  callable only with the **service-role key** (cron) or a **signed-in staff JWT**. Mission
  Control calls it with the staff user's session token. Never expose the service key to the client.
- **Core tables:** `seasons, rounds, divisions, pods, entries, competitors, guardians, judges,
  schools, staff, judge_assignments, submission_scores, rubric_weights, results, skill_ratings,
  rating_history, round_step_runs, engine_audit, medals/shipments, consents`.
- **Scoring & rating model:** `docs/scoring-and-rating.md` — 0–100 rating seeded at 50,
  placement vs same-rank podmates, K=8 (first 3 events) then 4. Per-criterion weighted judge score.
- **Realtime:** subscribe to `round_step_runs` (pipeline status), `judge_assignments`/`submission_scores`
  (judging progress), `results` (live standings) for live UI.

---

## 5. Guardrails (non-negotiable)
- **RLS is the boundary** — the client only ever uses the anon key + the user's session. No service key in the browser.
- **Privileged actions** (run pipeline, overrides, payouts) go through **gated edge functions** with a staff JWT — never direct client writes.
- **Videos** in Supabase Storage with signed URLs; respect COPPA/consent gating before display.
- **TypeScript everywhere**; share rating/scoring types with the engine where practical.
- Mobile-first for judge + competitor; desktop-first for mission control.

---

## 6. First deliverable for the page-mapping chat
1. **Information architecture / site map** for all four surfaces.
2. Per-surface **page list** with each page's purpose, primary user, key data, and empty/loading/error states.
3. Then low-fi **wireframes** (mission-control pipeline board and the judge scoring screen are the two highest-risk UX flows — start there).

Everything above is fixed context; the page mapping is what we're opening up next.
