# NMAO Tournament Engine — Technical Specification

**Version 0.1 — draft for build**
Last updated: 2026-08-05

---

## 1. Purpose

The engine is the automated core of the tournament hub. It takes a pile of competitor entries each round and, with no manual work in the common case, turns them into fair divisions, balanced pods, judge assignments, scored results, updated ratings, standings, and a medal shipping list. Operators watch it happen on a mission-control screen and step in only for exceptions.

Its guiding shape is a three-step spine wrapped in a state machine:

> **classify → collapse (if thin) → form pods** — then assign judges, collect scores, resolve, distribute.

Everything configurable lives in a per-season **Division Scheme**; the engine code itself is generic and never hardcodes ages, ranks, or events.

---

## 2. Core concepts

- **Season** — a full competitive cycle (9 qualifying rounds → semi-finals → grand finale). Holds the active Division Scheme and config.
- **Round** — one monthly qualifying event. The unit the state machine operates on.
- **Entry** — one competitor's submission to one event in one round (a video + metadata). The atomic unit. Revenue, medal, and judging are all per-entry.
- **Division** — a competitive category for a round, defined by the active scheme's axes (default: age × rank × event). May be a *collapsed* division (a merge of thin base divisions).
- **Pod** — a judged group within a division, formed by rating. Target cap 20, hard split at 22.
- **Judge assignment** — a link of a judge to a pod (or to individual videos), 1 for beginner/intermediate, 3 for advanced.
- **Result** — a competitor's score and placement within their pod.
- **Rating** — a competitor's evolving skill number, seeded by declared rank and updated by results (per the scoring rules already agreed; see §9).

---

## 3. Data model (essentials)

Only the engine-critical entities and fields are listed; existing tables carry more.

**seasons**: `id`, `name`, `scheme_id`, `config` (jsonb), `status`.

**division_schemes**: `id`, `season_id`, `version`, `axes` (jsonb — see §5), `pod_cap` (20), `pod_split_threshold` (22), `pod_floor` (default 6), `collapse_order` (jsonb, e.g. `["rank","age"]`), `created_at`. Schemes are **versioned and immutable once a round using them is locked**, so historical rounds stay reproducible.

**rounds**: `id`, `season_id`, `scheme_version`, `state` (see §4), `opens_at`, `closes_at`, `locked_at`.

**entries**: `id`, `round_id`, `competitor_id`, `event`, `age_bracket`, `declared_rank`, `rating_at_entry`, `video_url`, `division_id` (nullable until classified), `pod_id` (nullable until formed), `status` (`submitted|valid|voided`).

**divisions**: `id`, `round_id`, `event`, `age_key`, `rank_key`, `is_collapsed` (bool), `collapsed_from` (jsonb list of base division keys), `entry_count`.

**pods**: `id`, `division_id`, `seq`, `size`, `state` (`forming|judging|resolved`).

**judge_assignments**: `id`, `pod_id` (or `entry_id` for per-video), `judge_id`, `role` (`sole|panel`), `state` (`assigned|submitted`).

**results**: `id`, `entry_id`, `pod_id`, `score`, `placement`, `rating_delta`, `rating_after`.

**Idempotency:** every engine step is keyed by `(round_id, step)` and safe to re-run. Re-running a completed step is a no-op unless the round is reset to before that step. This matters because steps run as scheduled edge functions and must tolerate retries.

---

## 4. Round lifecycle (state machine)

States, in order, with the trigger and the engine work each does:

| State | Entered by | Engine work on entry |
|---|---|---|
| `open` | operator / schedule | Round accepts entries. |
| `collecting` | first entry | Entries stream in; validated on arrival. |
| `closed` | `closes_at` reached or operator | No new entries accepted. |
| `classified` | engine | **Classify** every valid entry into a base division (§6.1). |
| `collapsed` | engine | **Collapse** thin divisions per scheme (§6.2). |
| `podded` | engine | **Form pods** by rating within each final division (§6.3). |
| `judging` | engine | **Assign judges** (§6.4); pods open for scoring. |
| `resolving` | all pod panels complete | **Resolve** scores → placements; **update ratings** (§6.6–6.7). Incomplete pods at deadline are reopened, not force-resolved (§6.5). |
| `distributed` | engine | Standings updated, **ship list generated**, notifications sent (§6.8). |
| `finalized` | operator | Round archived; scheme version frozen. |

Transitions are one-directional in normal flow. Operators can **roll a round back** one or more states (e.g. from `podded` to `classified` to fix an override); rolling back clears the downstream artifacts for that round and re-runs from that point. A **preview/simulate** run (§7) executes classify→collapse→form in a sandbox without changing round state.

Guardrails: a round cannot advance past `closed` with zero valid entries; cannot enter `judging` with any pod below an operator-acknowledged floor; cannot `distribute` with any pod not `resolved`.

---

## 5. The Division Scheme (configuration)

The scheme is the engine's brain, edited by the operator, read by the code. Shape of `axes`:

```
axes: [
  { key: "age",   type: "bracket", active: true,
    brackets: [ {key:"7-9",min:7,max:9}, {key:"10-12",min:10,max:12},
                {key:"13-15",min:13,max:15}, {key:"16-17",min:16,max:17},
                {key:"18+",min:18,max:200} ],
    mergeable: true },
  { key: "rank",  type: "tier",    active: true,
    tiers: ["beginner","intermediate","advanced"],
    mergeable: true },
  { key: "event", type: "category", active: true,
    values: ["traditional_forms","creative_forms","weapons","..."],
    mergeable: false }        // never merge across events
]
pod_cap: 20
pod_split_threshold: 22
pod_floor: 6
collapse_order: ["rank","age"]     // which axis to merge first when thin
```

Season-1 locked values: **age brackets** 7-9, 10-12, 13-15, 16-17, 18+; **rank tiers** beginner, intermediate, advanced; **pod_floor** 6.

Design intent: **the scheme is yours to grow.** The collapse logic keeps thin divisions viable at launch, and you can add rank tiers or split age brackets in later seasons as participation justifies — a config edit, never a code change. `mergeable:false` on `event` enforces the "never merge across events" rule structurally.

---

## 6. The engine pipeline

### 6.1 Classify
For each valid entry, compute its base division key `(event, age_key, rank_key)` from the active scheme's brackets/tiers and the entry's `age_bracket`/`declared_rank`. Create the division row if new; increment `entry_count`. Output: every entry has a `division_id`.

### 6.2 Collapse (thin-division merge)
For each division with `entry_count < pod_floor`, merge along `collapse_order`:
1. Try merging with the **nearest adjacent tier on the first axis** (default rank: beginner↔intermediate, intermediate↔advanced), within the same other-axis keys.
2. If still `< pod_floor`, merge the **nearest adjacent bracket on the next axis** (age).
3. Never merge across a `mergeable:false` axis (event).
4. Repeat until the merged division reaches `pod_floor`, or no further legal merge exists (then run it as an under-floor pod and flag it for the operator).

Merged divisions get `is_collapsed=true` and record their `collapsed_from` keys so the operator sees exactly what was combined and why. "Nearest" is defined by adjacency order in the scheme's tier/bracket lists.

### 6.3 Form pods (by rating)
Within each final division, sort entries by `rating_at_entry` and cut into pods of up to `pod_cap` (20), keeping similar ratings together. If a division has 21–22, keep one pod; at ≥ `pod_split_threshold` (22), split into balanced pods (e.g. two pods of 11 rather than 20 + 2) so no pod is lopsided. Because rating is seeded by rank and updated by results, pods naturally group like-skilled competitors without hard rank fragmentation beyond the division itself.

### 6.4 Assign judges
Determine each pod's judging tier from its (possibly collapsed) rank: **1 judge** for beginner/intermediate pods, **3 judges** for advanced pods. Because judges are paid *per video*, assignment can be per-video rather than per-pod — the engine allocates each entry's video to the required number of available judges, load-balancing across the judge pool and honoring any judge's conflict-of-interest exclusions (e.g. own school). Output: `judge_assignments` rows.

### 6.5 Collect & validate scores
As judges submit, validate each score against the rubric bounds. For 3-judge pods, the pod score is the **straight average** of the three judges' scores. Mark assignment `submitted`. When all assignments for a pod are in, the pod is ready to resolve.

**Incomplete pod at deadline.** If the judging window closes with a pod still missing a score, the engine does **not** auto-resolve it. Instead it (a) flags the pod on the hub/admin board, (b) notifies the missing judge that their assigned pod is incomplete, and (c) notifies the rest of the eligible judge pool that the pod is **available for completion** — any non-conflicted judge can pick it up. The pod resolves only once its panel is complete. (A 1-judge pod missing its score is likewise reopened to the pool.)

### 6.6 Resolve
Per pod: aggregate scores, rank entries, assign `placement` (1st/2nd/3rd + ordinal). **Tiebreak:** highest single-judge score wins; if still tied, earliest submission time. Write `results`.

### 6.7 Update ratings
Apply the agreed rating update (§9) from each entry's placement/score, writing `rating_delta` and `rating_after`. This new rating seeds the competitor's next round and their standings.

### 6.8 Distribute
- Update **season standings** (best-6-of-9 logic; see §9).
- Generate the **medal ship list**: one grouped shipment per school, listing each competitor's medal (everyone gets one) plus placement medals, with the school's address and a per-competitor packing list. This is the artifact handed to the print-and-mail step.
- Fire **notifications** to each spoke: competitors get results, schools get their roster's outcomes + earnings, judges get "complete."

---

## 7. Preview / simulate

Before locking a round, the operator triggers a simulate run: the engine executes **classify → collapse → form pods** against the current entries in a sandbox (no state change, no judge assignment) and returns a summary — division count, pod count, how many pods are healthy vs under-floor, and what got collapsed into what. The operator can then tune the Division Scheme (broaden a bracket, lower the floor, reorder collapse) and re-simulate until satisfied, *then* commit. Simulation is pure and side-effect-free.

---

## 8. Manual overrides

All overrides are audited (who, when, before/after) and trigger a localized re-resolve where needed, not a full round rerun:

- **Move competitor** — reassign an entry to a different pod/division (e.g. a misclassified rank). Recomputes both affected pods' sizes.
- **Merge pods** — combine two thin pods within a division; re-checks cap.
- **Split pod** — divide an oversized or contested pod; re-forms by rating.
- **Reassign judge** — swap a judge who didn't complete; reissues assignments.
- **Void entry** — invalidate a bad submission (wrong video, rule violation); removes it from its pod and, if already resolved, re-resolves that pod.

Overrides are only permitted in states where they make sense (e.g. move/merge/split during `podded`/`judging`; void any time before `finalized`).

---

## 9. Standings, ratings & advancement  [LOCKED — full detail in docs/scoring-and-rating.md]

- **Scoring**: an entry's pod score is the **straight average** of its judge scores (1 judge beginner/intermediate, 3 advanced). Placement = score descending; tiebreak **highest single-judge score, then earliest submission**.
- **Rating**: everyone seeds at **50**; moves on **placement, measured only against same-rank podmates**; learning rate **K = 8 for a competitor's first 3 rounds, then 4**; clamped 0–100. Rating drives **pod formation within a rank bracket only** and never crosses ranks — a rank change is a real dojo promotion carried on `declared_rank`. In a collapsed mixed pod, a competitor's rating moves only on comparisons to same-rank podmates (a lone-rank competitor doesn't move). Formula + worked examples: `docs/scoring-and-rating.md`. Implemented and unit-tested: `functions/_shared/rating.ts`.
- **Standings**: each competitor's season score is their **best 5 of 9** qualifying rounds.
- **Advancement**: top competitors by standings advance to the **semi-finals**, then the **grand finale** — the only stages with cash prize pools (~8% per-entry set-aside + sponsors).

All constants live in `DEFAULT_RATING_CONFIG` and are tunable per season without code changes.

---

## 10. Growth nudges

A background check flags scaling signals to the operator: e.g. "Teen Traditional Forms has run 6+ pods for three straight rounds — consider splitting the age band" or "Beginner Weapons keeps collapsing — it's still too thin to stand alone." The product tells the operator *when* to add granularity, rather than making them notice.

---

## 11. Championship stage (hooks)

Semi-finals and grand finale reuse the same pipeline (classify the advancing field → pods → judging) with two additions: **prize-pool distribution** from the accumulated set-aside, and the **audience Sponsor Vote** (parked — see project log). The engine should expose a clean event/webhook when a championship pod resolves, so the (future) sponsor-vote and payout modules can hang off it without touching core logic.

---

## 12. Mission-control surfaces (operator UI)

Four surfaces over the engine:

1. **Division Scheme editor** — the axes/granularity/floor/collapse knobs (§5).
2. **Preview / simulate** — run the scheme against current entries, see pod counts, tune, commit (§7).
3. **Live round board** — the state machine made visible: entries → divisions → pods → judges → results, updating in real time, with the current state and any under-floor / stuck-pod flags.
4. **Override tools** — move / merge / split / reassign / void (§8), each one click with an audit trail.

---

## 13. Parameters — confirmed

- **`pod_floor` = 6.**
- **Rank tiers:** beginner, intermediate, advanced.
- **Age brackets:** 7-9, 10-12, 13-15, 16-17, 18+.
- **3-judge aggregation:** straight average of the three scores.
- **Tiebreak:** highest single-judge score, then earliest submission.
- **Judging deadline:** incomplete pods are not force-resolved — flag hub/admin, notify the missing judge, and reopen the pod to the eligible judge pool for completion (§6.5).
- **Entry fee:** $45 (working; final on vendor quotes).

### Still to confirm
- **Under-7 competitors** — brackets start at 7; is 7 the minimum entry age, or is there a 6-and-under bracket?
- **Vendor quotes** — interlocking medal, presentation box, bulk-to-school shipping (these lock the final entry fee).

---

## 14. Build notes for implementation

- Implement each pipeline step (§6.1–6.8) as an **idempotent, independently-runnable edge function**, keyed by `(round_id, step)`, so scheduled execution and retries are safe.
- Drive state transitions from a single **round-state controller** that calls steps in order and enforces the §4 guardrails.
- Keep the **Division Scheme** the *only* source of ages/ranks/events/pod-rules; the engine reads it and must contain no hardcoded category logic.
- **Simulate** reuses the exact classify/collapse/form functions in a read-only transaction — never a separate code path — so preview always matches reality.
- Every override and state rollback writes an **audit record**; the live board reads these for its activity feed.
