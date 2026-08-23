# Scoring & Rating — how every number is produced

*A plain-language, auditable record of exactly how a video becomes a score, a
score becomes a placement, and a placement becomes a rating change. Nothing
here is a black box — any number in the system can be traced back through these
steps. Implemented in `supabase/functions/_shared/rating.ts` (tested).*

Last updated: 2026-08-05

---

## 1. Scoring a video

Every entry is a video. A judge scores it **one field per criterion** — the six criteria (technical, power, balance, timing, spirit, difficulty), each on a **0–100** scale. The judge's single score for the video is the **weighted combination** of those criteria, using the profile for the entry's style:

- **Traditional** events (`traditional_forms`, `traditional_weapons`): technical 25, power 20, balance 20, timing 15, spirit 12, difficulty 8.
- **Open** events (`open_forms`, `open_weapons`): technical 20, power 15, balance 15, timing 15, spirit 15, difficulty 20.

`judge_score = Σ(criterion_score × weight%) ÷ Σ(weight% present)` — with a full rubric (weights sum to 100) that's a weighted average on the same 0–100 scale. (Example, Traditional, scores 83/77/91/68/74/88 → **80.47**.) Every criterion score is stored (`submission_scores`) so any result traces back to the rubric. Weights live in `rubric_weights` and are tunable per season.

Then, per pod:

- **Beginner / intermediate** pods: **1 judge**. That judge's weighted score *is* the entry's pod score.
- **Advanced** pods: **3 judges**. The entry's pod score is the **straight average** of the three judges' weighted scores. (Example: 80, 90, 85 → **85.0**.)

Implemented in `functions/_shared/rating.ts` (`weightedJudgeScore` → then `resolvePod`); persisted via `submitJudgeScores` in `supabaseStore.ts`.

---

## 2. Placement within a pod

Once every entry in a pod has a score, we rank them highest-first to assign placements (1st, 2nd, 3rd, …). Ties are broken in this exact order:

1. **Higher pod score** wins.
2. **Tiebreak 1 — highest single-judge score.** If two entries have the same average, whoever earned the single highest mark from any one judge places above.
3. **Tiebreak 2 — earliest submission.** If still tied, whoever submitted their video first places above.

After this, every entry has a unique placement.

---

## 3. What the rating is

Each competitor carries one number, their **rating** (0–100). Its only jobs are to **form pods within their rank bracket** and to **track skill over time**. It is *not* their score, and it is *not* their standings.

Three rules define it:

- **Everyone starts at 50.** A brand-new competitor seeds at 50 regardless of rank, because rating only ever sorts people *within* their own bracket — beginners against beginners, and so on.
- **It moves on placement, measured only against same-rank podmates.** You go up by placing above people in your bracket and down by placing below them.
- **It never crosses a rank bracket.** A strong beginner's rating rising just means they face tougher *beginners*. Moving up to intermediate is a real promotion from their dojo, reflected in their declared rank — never something the tournament does on its own.

---

## 4. The rating formula (exact)

For competitor **i**, we look at each **same-rank** podmate **j** and compare what happened to what their ratings expected:

```
Expected result of i vs j:   E = 1 / (1 + 10^((Rj − Ri) / D))
Actual result of i vs j:     A = 1  if i placed ABOVE j
                                 0  if i placed BELOW j
                                 0.5 if tied
```

Sum that over all same-rank podmates and scale it:

```
delta_i = (K / opponents) × Σ (A − E)
R_i(new) = clamp( R_i + delta_i , 0 , 100 )
```

Where:

| Symbol | Meaning | Value |
|---|---|---|
| `Ri`, `Rj` | current ratings of i and each podmate | — |
| `D` | spread constant (bigger = gentler favorites) | **40** |
| `opponents` | how many **same-rank** podmates i had | — |
| `K` | learning rate — how fast the rating moves | **8** for a competitor's first **3** rounds, then **4** |

Two consequences worth stating plainly:

- **Beating a *higher*-rated podmate gains you more than beating a lower-rated one** (and losing to a lower-rated one costs more). That's the `A − E` term self-correcting for who you actually beat.
- **A competitor with no same-rank podmate does not move at all.** This is the collapse case: a lone beginner placed into a mixed pod with intermediates has `opponents = 0`, so their rating holds — exactly honoring "only within your bracket."

---

## 5. Worked examples

**A) An even pod of five beginners, all rated 50, in a provisional round (K = 8).**
Everyone's expected result against everyone is 0.5 (equal ratings).

| Place | Beat / lost | Σ(A−E) | delta = (8/4)×Σ | New rating |
|---|---|---|---|---|
| 1st | beat all 4 | +2.0 | **+4** | 54 |
| 2nd | beat 3, lost 1 | +1.0 | +2 | 52 |
| 3rd | beat 2, lost 2 | 0 | 0 | 50 |
| 4th | beat 1, lost 3 | −1.0 | −2 | 48 |
| 5th | lost all 4 | −2.0 | **−4** | 46 |

Win your pod → up 4; middle → flat; last → down 4. In a **steady** round (K = 4) those become +2 / 0 / −2.

**B) Field strength — a two-person pod, provisional round (K = 8).** A rated 70 beats B rated 50: A gains only ~**+1.9** (they were expected to win). But if B (50) upsets A (70): B gains ~**+6.1**. Beating someone stronger is worth much more. (In a steady round, K = 4, those same results are ~+1.0 and ~+3.0.)

**C) Collapse — a mixed pod (2 beginners, 2 intermediates), all rated 50.** Order: Bg1 (1st), In1 (2nd), Bg2 (3rd), In2 (4th).
Bg1's rating moves **only** on the comparison to Bg2 (the other beginner) — In1 placing between them is ignored. Bg1 beat Bg2 → **50 → 54**. And a lone beginner among only intermediates would not move at all.

---

## 6. What rating does *not* decide

Rating handles **matchmaking** (which pod you're in). It does **not** decide who advances. **Advancement to the semi-finals and grand finale uses season standings — your best 5 of 9 qualifying rounds** — which is a separate tally. Rating and standings are related (both reward doing well) but are computed independently.

---

## 7. Constants, configurability & audit

All the numbers above — seed 50, D = 40, K 8→4, provisional length 3 rounds, the 0–100 range — live in a single config block (`DEFAULT_RATING_CONFIG`) and can be tuned per season without touching the logic. We'll calibrate them against real data after the first live rounds.

**Auditability:** every rating change records its `before`, `delta`, `after`, the number of same-rank `opponents` it was measured against, and the `K` used. Combined with the stored pod scores and placements, that means any rating on the platform can be explained back to the exact videos, judges, and comparisons that produced it — which is the whole point.
