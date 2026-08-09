# Competitor App — Growth, Effort & Recognition (design pillar)

*The product's center of gravity. Most competitors lose more than they win; the
app must celebrate the effort and the growth as loudly as the wins — "constant
competition yields constant growth." Medals mark the wins; the Imprint, the
Growth Graph, the earned Virtues, the Badges, and the Journal mark the effort,
and those are everywhere.*

Last updated: 2026-08-08 · Companion to `docs/competitor-app.md`.

---

## 1. The Imprint is 100% earned by showing up

Competing in a round fills that round's segment — regardless of placement. A
competitor who never places still completes the whole yin-yang over the season,
and that completed symbol *is* the trophy. The gold/silver/bronze finish is a
shimmer layered on; the participation finish is **named with dignity** (e.g.
"Tempered") so it reads as earned, never as "didn't place." Nobody's Imprint
stays empty for lack of a medal.

## 2. The Reveal, reframed — growth first, placement quiet

Reorder the ceremony so effort/growth lead:

1. The segment lights and fills (participation always earns this).
2. **The round's earned Virtue** (see §4) and, for non-placers, a **motivational
   saying** (§below) appear front and center.
3. **Growth** — rating movement and any personal best, shown big.
4. Placement appears quietly below. The word "lost" never appears. Closing line
   is always forward: *"You rose. Keep training."*

**Motivational sayings for non-placers.** Bradley's "500 motivational sayings"
list is imported into a `motivational_sayings` table. On reveal, any competitor
who did **not** place 1st/2nd/3rd is shown a saying — non-repeating per competitor
(track shown ids), optionally themed (comeback / perseverance / effort) and
matched to context (e.g. a personal-best-but-no-placement gets a "learning from
every defeat" line). Examples from the list: *"Every setback is an opportunity for
a comeback." · "A black belt is a white belt who never gave up." · "Success is the
sum of small efforts repeated day in and day out."*

## 3. The Growth Graph (+ the Mirror merged in)

A charted arc of improvement over the season — the metric most competitors *can*
win every month, because it's them vs their past self.

- **Overall line:** rating and/or pod score per round, rising across the season,
  with "personal best" markers.
- **The Mirror (per-criterion series):** toggle on any of the six judging
  criteria — Technical, Power/Kime, Balance, Timing, Spirit, Difficulty — pulled
  from `submission_scores`, so a competitor sees *where* they grew
  ("your Balance improved most"). Judging becomes a coach, not a verdict.
- Data: `rating_history` (rating over rounds), `results.score` (overall), and
  per-criterion averages from `submission_scores` joined across the competitor's
  entries. Recharts line chart with selectable series.

## 3b. Sustaining growth past the ceiling — the Mastery Path

A 0-100 score/rating *will* plateau near the top, and a strong competitor is
exactly who most embodies "constant growth" — so a capped line must not be the
whole story. In martial arts, mastery isn't a higher number; it's holding higher,
wider, deeper, and against stronger. Two layers:

- **Skill (rating, 0-100)** — a *snapshot* of current ability, expected to plateau
  (like a black belt's forms not getting "more correct"). Healthy, not a failure.
- **The Mastery Path (lifetime, unbounded, never resets across seasons)** — the
  number that always answers "am I still growing?" with yes. It only ever accrues,
  from: competing, personal bests, consistency (rising floor), mastering criteria
  (the Mirror filling), attempting higher **difficulty**, and advancing stages /
  beating higher-rated opponents. Surfaced as **Mastery Degrees** (like dan grades)
  — you don't cap, you earn the next degree.

**The chart evolves with the athlete.** Early: the score line climbs. Near the
ceiling, the Growth view shifts what it celebrates, via a **This Season / Lifetime**
toggle:

- **Rising floor, not just peak** — "your *worst* round is now a 60" is growth.
- **The Mirror radar filling** — closing the gaps across all six criteria until the
  hexagon is complete (a long, always-visible arc).
- **Difficulty climbing** — reward daring harder material.
- **Climbing the ladder** — division → semis → finals → city → national → world.
- **Seasons as chapters** — completed Imprints stack into a lifetime constellation,
  **each season rendered in its own signature color** (a rotating metallic hue —
  sapphire, amethyst, ruby, emerald, gold…). This mirrors the physical collectible's
  changing **season-color enamel** (`physical-medal.md` §5), so a competitor's
  in-app constellation and their shelf of real medallions match, year over year.
  A veteran's profile looks *richer and more colorful* over time, never flatter.

The app says it out loud: **growth doesn't stop at the ceiling — it changes shape**
(from "climb higher" to "hold it, widen it, deepen it, test it against the best").

## 4. Earned Virtues (fixing the "arbitrary" problem)

The virtue must be *earned from what you actually did*, not assigned at random.
So each round's virtue is a **readout of your performance and behavior** — a
mirror of who you were on the mat:

**Performance virtues (from your strongest / most-improved criterion this round):**

| Judging criterion | Virtue earned |
|---|---|
| Technical execution | **Precision** |
| Power & focus (Kime) | **Focus** |
| Balance, stability, rooting | **Composure** |
| Timing, rhythm, fluidity | **Flow** |
| Spirit & presentation | **Courage** |
| Difficulty & composition | **Ambition** |

**Behavior virtues (from what you did, not scored):**

- **Perseverance** — improved your score after a lower round, or completed a streak.
- **Resilience** — returned and competed after missing a round.
- **Boldness** — entered a new or harder event for the first time.
- **Devotion** — competed in a round nobody required you to (already advanced/safe).

The engine picks the round's virtue as the strongest signal (biggest per-criterion
strength or growth, else the behavior that round most embodied). Over the season
the competitor assembles a **personal Code** — a creed built entirely from their
own demonstrated qualities. Meaningful, specific, never arbitrary. (Persist the
per-round virtue on `results` or a small `round_virtues` table for the Imprint +
Journey history.)

## 5. Effort streaks (encouragement, never pressure)

Consecutive rounds competed, framed as encouragement. Best-6-of-9 already forgives
misses, so a gap is **never** shamed — a missed round shows "the mat's waiting,"
not a broken streak. Streak milestones feed badges (§6).

## 6. Badges — a dedicated collecting tab

A full "Badges" page: a grid of earned + locked badges, many **tiered**
(Bronze/Silver/Gold levels), each with a clear, data-driven earn condition. Built
from Bradley's list plus a broadened catalog. (Source of truth: a `badges`
reference table + `badge_awards` per competitor.)

### Effort & consistency (the heart)
- **First Step** — submit your first entry.
- **On the Mat** *(tiered 3/6/9)* — compete in 3 / 6 / all 9 rounds; top tier = **Nine Bows**.
- **Back on the Mat** — compete again after missing a round (resilience).
- **Deadline Keeper** *(tiered)* — submit before the deadline N times.
- **Event Enthusiast** *(his #10, tiered)* — compete across many events over the season.
- **Dedicated Duelist** *(his #2, tiered)* — enter multiple events in a single round.

### Growth & improvement (vs your past self)
- **Rising Star** *(his #4)* — beat your personal-best pod score.
- **New Heights** — set a personal-best rating.
- **Steady Climb** — improve your score three rounds running.
- **Comeback** — improve after a lower-scoring round (pairs with saying #2).
- **Breakthrough** — your single biggest rating jump of the season.

### Mastery — per criterion, tiered (Bradley's #1 idea, made concrete)
- **Precision** (Technical), **Kime** (Power), **Rooted** (Balance), **Flow**
  (Timing), **Spirit** (Presentation), **Innovator** (Difficulty/Creativity) — each
  earned by scoring high in that criterion across **consecutive rounds**; Bronze/
  Silver/Gold by streak length or threshold. (Folds in **Technique Guru #5** &
  **Creative Innovator #6**.)
- **Martial Arts Master** *(his #1)* — sustain a high overall rating and top-tier
  marks across multiple criteria.

### Courage & exploration
- **Fearless Challenger** *(his #13)* — enter an event outside your usual.
- **Both Hands** — compete in both a forms and a weapons event.
- **Open Mind** — try an Open (creative) event for the first time.
- **Style Explorer** — compete in both Traditional and Open in one season.

### Journey & reflection
- **Consistent Journaler** *(his #8, tiered)* — journal after N reveals.
- **Reflective Warrior** — complete a reflection every round in a season.
- **Goal Keeper** — set a season goal and reach it.

### Milestones & recognition
- **First Medal · First Gold · Podium** (top-3) — placement milestones.
- **Imprint Complete** — finish the nine-segment yin-yang (earnable by *everyone*
  who shows up all season — the effort crown).
- **Semifinalist · Finalist · Champion** — advancement.
- **Season Keepsake** — complete the season's full physical + digital Imprint.

### Community & dojo (COPPA-safe adaptations)
Bradley's #3 Community Contributor, #9 Engagement Champion, #15 Community
Supporter, and the "viewer vote" idea assume public social features. For a
minor-safe app (no public discovery, guardian-gated), reframe these as **dojo-
internal** recognition:
- **Dojo Pride** — your school reaches a collective entry milestone.
- **Teammate** — compete in the same round as a schoolmate.
- **Encourager** — send a (pre-set, guardian-approved) cheer to a dojo-mate.

> **Flag:** #7 Perseverance Warrior → folded into behavior virtue + Comeback badge.
> #14 Fitness Guru needs practice/conditioning data we don't collect from a
> performance video — hold unless we add a training log. "Viewer vote" badges are
> deferred until/unless a safe, guardian-gated voting model exists.

## 7. Journal & reflection prompts

A private growth journal — the deliberate-practice habit you teach, built into the
loop. After each reveal, one optional, age-appropriate prompt; free-form entries
any time; feeds **Consistent Journaler / Reflective Warrior**. Private by default,
guardian-visible for minors, never public.

**Prompt bank (rotating, martial-growth framed):**
- "What is one thing you did better this round than last?"
- "What was hardest, and how did you handle it?"
- "What will you practice before the next round?"
- "Your virtue this round was *{virtue}* — where did you show it?"
- "You set out to improve *{goal}* — how did it go?"
- "Win or lose, what did the effort teach you?"

Optional: a **season goal** set at the start ("improve my balance," "compete every
round") that the Journey/Growth view tracks against — turning reflection into
direction.

## 8. Data & tables to add (for Claude Code)

- `motivational_sayings (id, text, theme, active)` — import the 500; reveal serves
  non-placers, non-repeating per competitor.
- `journal_entries (id, competitor_id, round_id?, prompt, body, created_at)` —
  RLS: the competitor + their guardian only.
- `badges (code, name, description, category, tiered, earn_rule)` — reference
  catalog; `badge_awards (id, competitor_id, badge_code, tier, round_id?, awarded_at)`.
- `round_virtues (entry_id/round_id, competitor_id, virtue, source)` *(or a column
  on `results`)* — the earned virtue per round for Imprint + Journey.
- Growth graph reads `rating_history`, `results`, and per-criterion
  `submission_scores`; no new table needed.
- `mastery_path (competitor_id, points, degree, updated_at)` + a
  `mastery_events` ledger (source, points, round_id?) — the lifetime, never-reset
  progression; degrees are thresholds on cumulative points. Lifetime "constellation"
  reads completed Imprints per season from `results`/`medals`.

## 9. Guardrails

Effort-first framing everywhere; every zero-state is an invitation, not a verdict;
no dark-pattern streak pressure aimed at children; growth (vs self) is surfaced
larger than placement; wins are honored without making the rest feel lesser.
