# NMAO Tournament — Front-End Page Map (v1)

*Built to `docs/frontend-handoff.md` (Next.js App Router + Supabase, one codebase, route-grouped by audience). Deliverable 1 (IA/site map) + 2 (per-page list with states). Wireframes for the two highest-risk flows follow separately.*

Last updated: 2026-08-06

---

## Route structure

```
/login                         magic-link sign-in (all roles); post-auth role routing

(public)   — SSR, SEO, no auth
  /                            landing / current season snapshot
  /standings/[season]          season leaderboard
  /division/[divisionId]       a division's pods + results (bracket-style)
  /school/[slug]               a school's competitors + medal count
  /results/[roundId]           a round's published results
  /c/[competitorId]            shareable competitor card (guardian-gated visibility)

(control)  — staff only (nmao.is_staff)
  /control                     season dashboard
  /control/rounds/[roundId]    ★ pipeline board (highest-risk flow)
  /control/divisions           divisions & pods for a round
  /control/entries             entries validation / voids
  /control/judges              judge pool + assignments
  /control/results             results, ratings, standings
  /control/medals              medal ship list
  /control/finance             payments + school payouts
  /control/audit               overrides & rollback log
  /control/scheme              Division Scheme editor + simulate
  /control/settings            season/round setup, users

(judge)    — mobile-first
  /judge                       my queue
  /judge/score/[assignmentId]  ★ score a video (highest-risk flow)
  /judge/history               submitted scores
  /judge/profile               profile + conflicts

(me)       — competitor / guardian, mobile-first
  /me/onboarding               profile + guardian consent (COPPA gate)
  /me                          Season home (yin-yang imprint)
  /me/compete                  enter events + upload + pay
  /me/reveal/[roundId]         the reveal moment
  /me/journey                  results history + standings
  /me/profile                  avatar, stats, medals, settings
```

## Global concerns

- **Auth:** magic-link (Supabase). After sign-in, resolve the user's role (staff / judge / competitor / guardian via `auth_user_id`) and route to the right group. A user with no linked row → a "not enrolled / contact your school" screen.
- **Standard states** (apply to every data page unless noted): **loading** = skeletons matching the final layout (never a bare spinner on data-dense pages); **empty** = a purposeful zero-state with the next action; **error** = inline retry + a human message, never a raw stack; **unauthorized** = redirect to the correct surface or a gentle "you don't have access."
- **Realtime:** pages that show live pipeline/judging/results subscribe to the relevant tables (noted per page).

---

## (a) Mission Control — staff, desktop-first

| Page | Purpose | Key data | State notes |
|---|---|---|---|
| **/control** dashboard | Season at a glance: active round + its pipeline state, counts (entries, pods, judged %), flags. | `seasons, rounds, round_step_runs`, aggregate counts | Empty: "No active season — create one." Loading: card skeletons. |
| **/control/rounds/[roundId]** ★ pipeline board | The operational heart: advance the round through classify → collapse → form_pods → assign_judges → resolve → distribute; each step's status + run button; guardrail messages; rollback. | `round_step_runs` (**realtime**), `rounds`, `divisions`, `pods`, calls `round-controller` | Loading: step lanes skeleton. Error: per-step error surfaced from the EF response. Empty round (0 valid entries): block advance with reason. |
| **/control/divisions** | Divisions & pods for the round; who's where; under-floor/collapsed flags; overrides (move/merge/split). | `divisions, pods, entries` | Empty before classify. |
| **/control/entries** | Validate entries, void bad submissions, watch video, see payment status. | `entries, payments, submission video` | Filter by status; empty = "No entries yet." |
| **/control/judges** | Judge pool (cleared/active), per-video assignments, reassign, reopen incomplete pods. | `judges, judge_assignments` (**realtime**) | Flag under-judged videos. |
| **/control/results** | Resolved scores, placements, rating deltas, season standings (best 6/9). | `results, skill_ratings, rating_history` (**realtime**) | Empty before resolve. |
| **/control/medals** | Medal ship list — one shipment per school, counts, statuses. | `medals, medal_shipments, schools` | Export/print. |
| **/control/finance** | Entry-fee payments, school revenue-share payouts (10/20/30% tiers). | `payments, school_payouts` | Reconcile view. |
| **/control/audit** | Every override/rollback (who/when/before/after). | `engine_audit` (**realtime**) | Read-only timeline. |
| **/control/scheme** | Edit the Division Scheme (axes, brackets, floor, collapse order) and **simulate** against current entries before locking. | `division_schemes`, simulate via divisioning core | Preview counts; immutable once a round locks. |
| **/control/settings** | Create seasons/rounds, set deadlines (the 15th), manage staff, invite judges. | `seasons, rounds, staff, judges` | — |

## (b) Judge app — mobile-first

| Page | Purpose | Key data | State notes |
|---|---|---|---|
| **/judge** my queue | List of videos assigned to me, sorted by deadline; progress (scored/total). | `judge_assignments` (**realtime**), `entries` (video) | Empty = "You're all caught up." Loading: list skeleton. |
| **/judge/score/[assignmentId]** ★ | Watch the video; enter **one score per criterion** (Traditional or Open rubric based on the event); see the live weighted total; submit. | `entries` (signed video URL), `criteria, rubric_weights`, writes `submission_scores` + `judge_assignments` | Error on submit = keep entered scores, allow retry. Already-scored = read-only. |
| **/judge/history** | Past scored videos; reopened/incomplete flags. | `judge_assignments, submission_scores` | — |
| **/judge/profile** | Name, school (for conflict exclusion), status. | `judges` | — |

## (c) Competitor / Guardian — mobile-first

*(Experience detail — the yin-yang imprint and the reveal — in `docs/competitor-app.md`.)*

| Page | Purpose | Key data | State notes |
|---|---|---|---|
| **/me/onboarding** | Profile setup + **guardian consent / COPPA waiver** — the gate before competing. | `competitors, guardians, consents` | Blocks `/me/compete` until consent signed. |
| **/me** Season home | Yin-yang imprint (season progress), current round status + deadline countdown, rating & standing snapshot, reveal entry. | `rounds, entries, results, medals, skill_ratings` (**realtime** on round state) | Loading: hero skeleton. Empty (pre-season): "Season opens [date]." |
| **/me/compete** | Enter event(s), upload the performance video (Storage, signed), pay the entry fee (Stripe), track submitted → judging. | `entries` (write), Storage upload, `payments` | Deadline passed = read-only "closed." Upload progress + resumable. |
| **/me/reveal/[roundId]** | The ceremonial results moment — segment fills with the medal, score + placement + rating movement. | `results, medals, rating_history` | Locked (pre-reveal-day) = countdown. |
| **/me/journey** | Round-by-round history, season standing (best 6/9), advancement tracker, replay reveals. | `results, rating_history, skill_ratings` | Empty = "Your first round is coming." |
| **/me/profile** | Avatar + rank ring, rating gauge, medal shelf, badges, settings + guardian controls. | `competitors, skill_ratings, medals` | — |

## (d) Public results — SSR, SEO, shareable

| Page | Purpose | Key data | State notes |
|---|---|---|---|
| **/standings/[season]** | Season leaderboard (by division / overall). | `results, skill_ratings` (public read) | Loading: table skeleton. |
| **/division/[divisionId]** | A division's pods and placements, bracket-style. | `divisions, pods, results` | Pre-resolve = "Judging in progress." |
| **/school/[slug]** | A school's competitors + medal counts (a recruiting asset for schools). | `schools, competitors, medals` | — |
| **/results/[roundId]** | Published results for a round. | `results` | Only after `distributed`. |
| **/c/[competitorId]** | Shareable competitor card (yin-yang + medals). | `competitors, medals` | **Guardian-gated** for minors; off by default. |

## Realtime touchpoints (summary)

- `round_step_runs` → pipeline board, control dashboard.
- `judge_assignments` + `submission_scores` → judge queue, control/judges, judging progress.
- `results` + `skill_ratings` → control/results, competitor home/journey, public standings.
- `engine_audit` → control/audit.

## Highest-risk flows → wireframe first

1. **Mission-control pipeline board** (`/control/rounds/[roundId]`) — the stateful spine; most moving parts.
2. **Judge scoring screen** (`/judge/score/[assignmentId]`) — per-criterion scoring is the core judging interaction and must be fast + unambiguous.

*(Low-fi wireframes of these two are rendered separately.)*
