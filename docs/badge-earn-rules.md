# NMAO Badges — Earn-Rules Handoff (for Claude Code)

*Wiring spec: attaches every badge to a concrete system action. For each badge:
a **stable `code`** (the `emblem_key` / award key — never renumber this), the **art
filename**, rarity/tier/hidden flags, the **trigger event** that should run the check,
and the **earn condition** in terms of existing tables/events. Hand this to Claude Code
to implement award checks + `badge_awards` inserts.*

Source of truth for names/rarity: `badge-catalog.md`. Art direction: `badge-art-direction.md`.
Data model: `BUILD-HANDOFF.md` §5.

Last updated: 2026-08-09

---

## How to use this

- **`code`** is the permanent key (slug). Use it for `badges.code` / `emblem_key`,
  `badge_awards.badge_code`, and the pin `sku`. **Do not** key off catalog numbers —
  the catalog has a few number collisions (flagged below); the slugs are collision-free.
- **`art file`** = the **cropped, transparent medallion** at
  `docs/badge-art/final/<n>-<slug>.png` (medallion only, background removed — see
  `scripts/crop_medallion.py`). Raw square generations live in `docs/badge-art/reference/`;
  **use the `final/` versions in the app.** Every other file appears as art is produced;
  the name is fixed now so DB rows and assets line up.
- **Trigger event** = when to evaluate the check (see glossary). **Earn condition** =
  the boolean to award. Awards are **idempotent** — insert into `badge_awards` only if
  not already present (`unique(competitor_id, badge_code, tier)`).
- **Tiered** badges award per tier (Bronze/Silver/Gold or I/II/III); store `tier` on the
  award. **Hidden** badges render as "?" until earned.

### Trigger-event glossary (map to existing tables / engine steps)

| Event | Fires when | Primary tables |
|---|---|---|
| `on_onboarding_complete` | guardian consent + profile done | `consents`, `competitors` |
| `on_entry_submitted` | a competitor submits a round entry | `entries` |
| `on_reveal_viewed` | competitor opens their reveal | `results` (`seen`) |
| `on_journal_entry` | a journal entry is saved | `journal_entries` |
| `on_result_finalized` | round `resolve`/`distribute` writes results | `results`, `submission_scores` |
| `on_medal_awarded` | placement medal shipped/recorded | `medals`, `medal_shipments` |
| `on_rating_updated` | rating recomputed after a round | `skill_ratings`, `rating_history` |
| `on_mastery_update` | mastery-path/criterion totals recomputed | `mastery_path`, `mastery_events` |
| `on_season_rollup` | season standings finalized | `season_results` |
| `on_bracket_advance` | competitor advances a championship stage | `rounds`, `entries` (bracket) |
| `on_duel_completed` | a duel resolves | `duels` |
| `on_duel_vote_cast` | a community vote is recorded | `duel_votes`, `voter_stats` |
| `on_school_milestone` | a school hits a collective metric | `schools`, aggregate |

> Streak/consecutive/attendance checks read history (`rating_history`, `results`,
> `entries`) at the trigger; no separate scheduler needed unless noted.

---

## First steps & milestones

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `first-step` | First Step | Common | – | – | 01-first-step.png | on_entry_submitted | competitor's **first** `entries` row |
| `first-bow` | First Bow | Common | – | – | 02-first-bow.png | on_onboarding_complete | consent granted **and** profile complete |
| `first-reveal` | First Reveal | Common | – | – | 03-first-reveal.png | on_reveal_viewed | first `results.seen = true` |
| `first-reflection` | First Reflection | Common | – | – | 04-first-reflection.png | on_journal_entry | first `journal_entries` row |
| `first-medal` | First Medal | Uncommon | – | – | 05-first-medal.png | on_medal_awarded | first medal of any placement |
| `first-gold` | First Gold | Rare | – | – | 06-first-gold.png | on_result_finalized | first `results.placement = 1` |

## Effort & consistency

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `on-the-mat` | On the Mat I/II/III | Common→Rare | ✓ 3/6/9 | – | 07-on-the-mat.png | on_result_finalized | distinct rounds competed ≥ **3 / 6 / 9** |
| `nine-bows` | Nine Bows | Rare | – | – | 08-nine-bows.png | on_season_rollup | competed in **all 9** season qualifiers |
| `back-on-the-mat` | Back on the Mat | Uncommon | – | – | 09-back-on-the-mat.png | on_entry_submitted | entered a round after **missing** the prior round |
| `early-bird` | Early Bird | Uncommon | – | – | 10-early-bird.png | on_entry_submitted | entry within **first 48h** of window open |
| `deadline-warrior` | Deadline Warrior | tiered | ✓ 3/5/10 | – | 11-deadline-warrior.png | on_entry_submitted | entries submitted in **last 6h** before deadline ≥ **N** |
| `iron-will` | Iron Will | Rare | – | – | 12-iron-will.png | on_result_finalized | **6 consecutive** rounds competed |
| `perfect-attendance` | Perfect Attendance | Rare | – | – | 13-perfect-attendance.png | on_season_rollup | entered **every** round in a season |

## Growth & improvement (vs. your past self)

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `rising-star` | Rising Star | Uncommon | – | – | 14-rising-star.png | on_result_finalized | round score > **personal-best score** |
| `new-heights` | New Heights | Uncommon | – | – | 15-new-heights.png | on_rating_updated | rating > **personal-best rating** |
| `steady-climb` | Steady Climb | Rare | – | – | 16-steady-climb.png | on_result_finalized | score improved **3 rounds running** |
| `comeback` | Comeback | Uncommon | – | – | 17-comeback.png | on_result_finalized | score improved after a **lower** round |
| `breakthrough` | Breakthrough | Rare | – | – | 18-breakthrough.png | on_rating_updated | **largest single** rating jump on record |
| `rising-floor` | Rising Floor | Uncommon | – | – | 19-rising-floor.png | on_result_finalized | raised your **worst-round** score |
| `full-circle` | Full Circle | Epic | – | – | 20-full-circle.png | on_mastery_update | Mirror mastery radar = **100%** |

## Mastery — per criterion (each tiered Bronze/Silver/Gold)

*Criterion scores come from `submission_scores` (6-criterion rubric). "High" = top band
per `rubric_weights`/threshold; tier = length of the consecutive-round streak.*

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `precision` | Precision (Technical) | tiered | ✓ | – | 21-precision.png | on_result_finalized | high **Technical** across N consecutive rounds |
| `kime` | Kime (Power) | tiered | ✓ | – | 22-kime.png | on_result_finalized | high **Power** streak |
| `rooted` | Rooted (Balance) | tiered | ✓ | – | 23-rooted.png | on_result_finalized | high **Balance** streak |
| `flow` | Flow (Timing) | tiered | ✓ | – | 24-flow.png | on_result_finalized | high **Timing** streak |
| `spirit` | Spirit (Presentation) | tiered | ✓ | – | **25-spirit-fire-tiger-eye.png** ✅ | on_result_finalized | high **Presentation** streak |
| `innovator` | Innovator (Difficulty) | tiered | ✓ | – | 26-innovator.png | on_result_finalized | high **Difficulty/Creative** streak |
| `grandmaster` | Grandmaster | Legendary | – | – | 27-grandmaster.png | on_mastery_update | **Gold** reached in **all six** masteries |

## Events & exploration

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `both-hands` | Both Hands | Uncommon | – | – | 28-both-hands.png | on_result_finalized | competed in **forms** and **weapons** event types |
| `open-mind` | Open Mind | Uncommon | – | – | **29-open-mind-lotus.png** ✅ | on_entry_submitted | first entry in an **Open** event |
| `traditionalist` | Traditionalist | Rare | – | – | 30-traditionalist.png | on_season_rollup | **all** season entries were **Traditional** |
| `weapon-master` | Weapon Master | Rare | – | – | 31-weapon-master.png | on_result_finalized | competed in **every** weapon event |
| `style-explorer` | Style Explorer | Uncommon | – | – | 32-style-explorer.png | on_season_rollup | **Traditional + Open** in one season |
| `fearless` | Fearless Challenger | Uncommon | – | – | 33-fearless.png | on_entry_submitted | entered an event **outside** your usual category |

## Placement & podium

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `podium` | Podium | Uncommon | – | – | 34-podium.png | on_medal_awarded | any **top-3** finish (placement ≤ 3) |
| `gold-rush` | Gold Rush x3/x5 | tiered | ✓ 3/5 | – | 35-gold-rush.png | on_result_finalized | lifetime golds ≥ **3 / 5** |
| `sweep` | Sweep | Epic | – | – | 36-sweep.png | on_result_finalized | **gold in multiple events** in one round |
| `undefeated` | Undefeated | Rare | – | – | **37-undefeated-dragon.png** ✅ | on_result_finalized | win streak of **N** (consecutive placement=1) |
| `podium-season` | Podium Season | Epic | – | – | 71-podium-season.png | on_season_rollup | a **placement medal in every round** of the season |
| `gold-medallion` | Gold Medallion | Legendary | – | – | **72-gold-medallion-nmao-dragon.png** ✅ | on_season_rollup | **gold in every qualifying round** — the perfect season |

## Championship & advancement

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `semifinalist` | Semifinalist | Rare | – | – | 38-semifinalist.png | on_bracket_advance | reached the **semifinals** |
| `finalist` | Finalist | Epic | – | – | 39-finalist.png | on_bracket_advance | reached the **finals** |
| `grand-champion` | Grand Champion | Legendary | – | – | 40-grand-champion.png | on_bracket_advance | **won** the Grand Finale |
| `sponsors-champion` | Sponsor's Champion | Legendary | – | – | 41-sponsors-champion.png | on_bracket_advance | **won** a sponsor tournament |
| `giant-slayer` | Giant Slayer | Epic | – | – | 42-giant-slayer.png | on_result_finalized | beat an opponent rated **≥ X higher** |

## Imprint & the Gem Series

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `imprint-complete` | Imprint Complete | Rare | – | – | 43-imprint-complete.png | on_season_rollup | completed all **9 Imprint segments** (showed up all season) |
| `season-keepsake` | Season Keepsake | Rare | – | – | 44-season-keepsake.png | on_season_rollup | finished season's **physical + digital** Imprint |
| `gem-series` | Gem Series S1–S10 | tiered/flagship | ✓ S1–S10 | – | 45-54-gem-<season>.png | on_season_rollup | **completed that season**; award the season's gem (tier = season #) |
| `decade-of-dedication` | Decade of Dedication | Legendary | – | – | 55-decade-of-dedication.png | on_season_rollup | completed **10 seasons** |

*Gem colors (locked): S1 Sapphire, S2 Amethyst, S3 Ruby, S4 Emerald, S5 Coral, S6 Onyx,
S7 Rose, S8 Turquoise, S9 Peridot, S10 Platinum.*

## Journal & reflection

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `consistent-journaler` | Consistent Journaler I/II/III | tiered | ✓ 3/10/25 | – | 56-consistent-journaler.png | on_journal_entry | journaled after **N** reveals |
| `reflective-warrior` | Reflective Warrior | Rare | – | – | 57-reflective-warrior.png | on_season_rollup | journaled **every round** in a season |
| `goal-keeper` | Goal Keeper | Uncommon | – | – | 58-goal-keeper.png | on_season_rollup | **set and reached** a season goal |

## Dueling

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `first-duel` | First Duel | Common | – | – | 59-first-duel.png | on_duel_completed | **first** completed duel |
| `duelist` | Duelist I/II/III | tiered | ✓ 5/15/30 | – | 60-duelist.png | on_duel_completed | duels completed ≥ **5 / 15 / 30** |
| `first-blood` | First Blood | Uncommon | – | – | 61-first-blood.png | on_duel_completed | **first duel win** |
| `warpath` | Warpath | Rare | – | – | 62-warpath.png | on_duel_completed | **N duel wins in a row** |
| `peoples-champion` | People's Champion | Rare | – | – | 63-peoples-champion.png | on_duel_completed | win by a **landslide** community vote |
| `road-warrior` | Road Warrior | Rare | – | – | 64-road-warrior.png | on_duel_completed | dueled opponents from **many states/schools** |
| `rivalry` | Rivalry | Uncommon | – | – | 65-rivalry.png | on_duel_completed | **rematch** the same opponent |
| `undefeated-duelist` | Undefeated Duelist | Epic | – | – | 66-undefeated-duelist.png | on_duel_completed | win streak of **X** with **no losses** |
| `iron-duelist` | Iron Duelist | Rare | – | – | 67-iron-duelist.png | on_duel_completed | dueled **every week for a month** |
| `duel-legend` | Duel Legend | Legendary | – | – | 68-duel-legend.png | on_duel_completed | reached **#1** on a dueling leaderboard tier |
| `deadlock` | Deadlock | Epic | – | – | 80-deadlock.png | on_duel_completed | duel ends in a **true deadlock draw** (survives sudden death) |

## Voting

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `first-vote` | First Vote | Common | – | – | 73-first-vote.png | on_duel_vote_cast | **first** vote cast |
| `voice-of-the-people` | Voice of the People I/II/III | tiered | ✓ 25/100/500 | – | 74-voice-of-the-people.png | on_duel_vote_cast | votes cast ≥ **25 / 100 / 500** |
| `daily-voter` | Daily Voter | Uncommon | – | – | 75-daily-voter.png | on_duel_vote_cast | voted **N days in a row** |
| `sharp-eye` | Sharp Eye | Rare | – | – | 76-sharp-eye.png | on_duel_completed | votes match the **winner** at a high rate (`voter_stats`) |
| `kingmaker` | Kingmaker | Rare | – | – | 77-kingmaker.png | on_duel_completed | your vote **decided a razor-thin** duel |
| `fair-witness` | Fair Witness | Uncommon | – | – | 78-fair-witness.png | on_duel_vote_cast | voted across **many divisions/categories** |
| `trusted-voter` | Trusted Voter | Epic | – | – | 79-trusted-voter.png | on_duel_completed | sustained **elite** Sharp-Eye accuracy |

## Community & dojo (COPPA-safe)

*Catalog reused #63/64/65 here — reassigned unique numbers below; slugs are the keys.*

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `dojo-pride` | Dojo Pride | Uncommon | – | – | 81-dojo-pride.png | on_school_milestone | your **school** hits a collective milestone |
| `teammate` | Teammate | Common | – | – | 82-teammate.png | on_result_finalized | competed in the **same round** as a schoolmate |
| `encourager` | Encourager | Uncommon | – | – | 83-encourager.png | on_duel_vote_cast* | sent **guardian-approved cheers** to dojo-mates |

## Legendary, hidden & charter (the chase)

*Catalog reused #66/67/68 here — reassigned unique numbers below; slugs are the keys.*

| code | name | rarity | tiered | hidden | art file | trigger | earn condition |
|---|---|---|---|---|---|---|---|
| `perfect-score` | Perfect Score | Legendary | – | – | 84-perfect-score.png | on_result_finalized | a **perfect / near-perfect** judge score |
| `zen` | Zen | Epic | – | ✓ | 85-zen.png | on_result_finalized | a **flawless, composed** performance *(hidden)* |
| `ghost` | Ghost | Rare | – | ✓ | 86-ghost.png | (special) | a **fun secret** condition *(hidden)* |
| `charter-member` | Charter Member | Legendary (limited) | – | – | 69-charter-member.png | on_onboarding_complete | competed in the **very first season** |
| `trailblazer` | Trailblazer | Legendary (limited) | – | – | 70-trailblazer.png | on_onboarding_complete | among the **first N** competitors ever |

---

## Catalog cleanup flags (fix before minting SKUs)

- **#63/64/65** appear twice (Dueling **and** Community). Community entries reassigned to
  **81/82/83** above; Dueling keep 63/64/65. Slugs (`peoples-champion`, `road-warrior`,
  `rivalry` vs `dojo-pride`, `teammate`, `encourager`) are already unique.
- **#66/67/68** appear twice (Dueling **and** Legendary/Hidden). Legendary/Hidden
  reassigned to **84/85/86** above; Dueling keep 66/67/68.
- `encourager` trigger marked `*` — depends on the cheers feature; wire when built.

## Suggested `badges` seed columns

`code` · `name` · `category` · `rarity` · `tiered`(bool) · `tiers`(json, e.g.
`[3,6,9]`) · `hidden`(bool) · `emblem_key`(=code) · `art_file` · `trigger_event` ·
`earn_rule`(text, from this doc) · `sku`. Award rows: `badge_awards(competitor_id,
badge_code, tier, round_id?, season_id?, awarded_at, seen=false)`.

## Assets present today

`spirit` (25), `open-mind` (29), `undefeated` (37), `gold-medallion` (72) — cropped
transparent medallions in `docs/badge-art/final/` (raw squares in `reference/`). All
others land as art is produced, using the fixed filenames above.

> Note: the `gold-medallion` hero was generated **before** the text-free rule and has a
> "Perfect-Season Champion" banner baked in — regenerate it text-free before shipping.
