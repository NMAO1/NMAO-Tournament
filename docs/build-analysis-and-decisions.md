# NMAO Tournament — Build Analysis, Contradictions & Recommended Next Slice

*Written 2026-08-08 after a full read of the BUILD-HANDOFF + all seven spec docs
and seven mockups. Purpose: separate what's genuinely done from what's blocked,
surface the contradictions across the docs that must be resolved before building,
and recommend the next real slice. Companion to `BUILD-HANDOFF.md`.*

---

## 1. What's actually built (and one thing the handoff undersells)

The handoff's "already built" list is accurate — engine, schema (8 migrations),
`round-controller`, seeds, 137+ automated checks — **plus two things done since:**

- **`round-controller` now has `finalize` + `rollback` operator actions** (FK-safe
  deletes, rating reversal via `rating_before`, a latest-round safety guard),
  deployed and covered by a new `validate-rollback.mts` — **47 pglite assertions,
  full `npm run validate` green.** The handoff's "Finalize (operator)" and the
  right-rail "roll back" are therefore **backed by real, tested engine actions.**
- **Mission Control's pipeline board is already built as a working page** —
  `mission-control/live.html` — not just the static `mission-control-mockup.html`.
  It signs in staff, lists rounds, drives the 7-stage board against the live
  `round-controller`, subscribes to realtime (`round_step_runs`, `judge_assignments`,
  `results`, `pods`, `engine_audit`), has the rollback control **and** the new
  stage **drill-downs** (View divisions/judges/results/medals). Anon key wired,
  connectivity verified.

**Implication:** the handoff's "suggested first task" (scaffold Next.js + build the
board) is **substantially already done** in plain HTML/supabase-js. The real open
question is whether to (a) keep that fast static-HTML approach for the operator
console and move on, or (b) re-platform onto Next.js for consistency with the
public/SEO surfaces. See §4.

## 2. Contradictions across the docs — resolve before building

These are places where the docs disagree with each other. Each needs a one-line
decision from Brad; I've flagged my read.

1. **Dueling voting model — the big one.** `dueling.md`, `competitor-app-map.md`,
   `badge-catalog.md`, and the `dueling-screens.html` mockup all describe
   **nationwide community voting** ("competitors nationwide vote," "68% of the
   community vote," a vote feed, Sharp-Eye accuracy, voter badges).
   But `product-scope-synthesis.md` §1 **LOCKS "participant-vote only for now, no
   public voting"** for minor safety, and §11 says public social features are gated
   off for minors. **These cannot both be true.** → *Decision needed:* community
   voting (with a hard adults/opt-in-only gate + guardian controls) **or**
   participant/judge-decided for minors. This gates the entire dueling build and a
   whole badge series. My read: keep community voting as the vision, but **v1 ships
   participant-or-judge-decided**; the nationwide-voting layer turns on only for
   adult/opt-in divisions once the COPPA model is legally reviewed.

2. **Age brackets.** `product-scope-synthesis.md` §1 says **KEEP OURS**
   (7-9/10-12/13-15/16-17/18+); the same file's §1b table says "Adopt the doc
   brackets (4-7…51+)." §1b is explicitly marked **"(superseded)"**, so **ours
   win** — but the contradiction sits in one file and will confuse whoever seeds
   `division_schemes.axes`. → *Just delete/annotate the §1b row.*

3. **Badge catalog numbering is not clean.** `badge-catalog.md` has **duplicate
   numbers** — e.g. #63 is both "People's Champion" and "Dojo Pride"; #64 both
   "Road Warrior" and "Teammate"; #66 both "Undefeated Duelist" and "Perfect
   Score"; #67, #68 likewise; the header says "~90" while `badge-gallery.html`
   says "~70". Before this becomes the `badges` seed table it needs a **dedup +
   renumber + assign stable `code`s** pass. Not a blocker, but do it before
   `badge_awards` logic keys on codes.

4. **Judging criteria & rubric** are consistent everywhere (locked 6-criterion,
   weighted, advanced=3-judge panel). No conflict — good.

## 3. The open decisions that actually block building (from handoff §9 + scope §13)

Ranked by how much they fan out:

1. **Web (Next.js PWA) vs. React Native for the competitor app.** This is the
   architectural fork — it decides the whole competitor codebase and the reveal/
   Imprint animation tech. My recommendation: **one Next.js web codebase (PWA) for
   all four surfaces to start.** The reveal/Imprint animations (light-sweep, ignite,
   particle burst, the 9-segment fill) are very achievable on web with Canvas/WebGL
   + Framer Motion; the rest (auth, data, realtime, SSR public pages) strongly
   favors web. Only split the competitor app to RN later if the ceremony genuinely
   needs native fidelity. Don't pay the two-codebase tax up front.
2. **Video hosting** — Supabase Storage vs. Vimeo (private/unlisted). Needed before
   Compete + Judge playback. (Storage keeps it in one stack + RLS; Vimeo offloads
   transcoding/bandwidth. Lean Storage for v1 with signed URLs.)
3. **Two-round advanced flow** (qualify → final medal round) — a real engine
   addition (a `round_stage` on pods, or linked pod-stages). Confirm **v1 or Phase 2.**
   The handoff/synthesis both put it Phase 2; the seasonal single-round flow is
   what's built.
4. **Dueling voting model** (see §2.1) + geo rule (hard exclusion vs soft
   preference).
5. **Points ledger vs. rating** — both are locked as separate metrics; the
   **season points ledger** table isn't built yet (only `skill_ratings`/
   `rating_history`/`season_results` exist). New: a points ledger + "total points
   earned" lifetime accumulator (ties into Mastery Path).

## 4. Recommended next real slice (when you're back)

Given Mission Control's board is already working, the highest-leverage **next real
build** is the **Judge app (Phase-1 core)** — it's the smallest well-specced
surface, it's mockup-ready (`judge-app-screens.html`), and it closes the only
missing link in the end-to-end loop (Mission Control can already `assign_judges`,
but nothing lets a judge actually score yet, so `resolve` has no real scores
outside the demo seed).

**Judge app v1 (thin, high-value):** magic-link auth → **Queue** (my
`judge_assignments`, realtime, ACCEPT/RECUSE) → **Score** screen (dual-angle
playback, the 6-criterion rubric writing `submission_scores` + the weighted
`judge_assignments.score` via the existing `weightedJudgeScore`) → **History** →
**Profile/Creed gate**. No new engine work — it writes exactly what `resolve`
already reads. That makes a *real* round runnable end-to-end by real people:
Mission Control divides → judges score in the judge app → Mission Control resolves
→ distributes.

Everything else (competitor app, school portal, dueling, in-house, badges) can
follow, but the judge app is the piece that turns the built engine into a live
loop with the least new surface area.

## 5. What I built this session while you were out

- This analysis.
- **`docs/mockups/competitor-hero-screens.html`** — the three **hero competitor
  screens that were missing** from the provided mockups: **Home (the bento)**, the
  **Imprint** (9-segment medallion), and the **effort-first Reveal** ceremony.
  These are the emotional core the growth pillar is built around, and nothing in
  the existing mockup set showed them. Matches the dark dojo-luxe palette + the
  existing mockups' style so they slot into the set.

## 6. Nothing here changes what's built

Per the locked decisions, the engine/schema/round-controller are untouched. This
doc is analysis + a recommended path, not a change. No code was altered to produce
it.
