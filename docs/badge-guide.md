# NMAO Badge Guide — current state (105 active)

*Readable mirror of the **live `badges` table** (Supabase `oxzuavpyoetchwebdejp`, snapshot 2026-08-13, migrations …020000–…160000). The database is the source of truth; this doc and `badge-guide.csv` mirror it for handoff. Supersedes the original `badge-manifest.*` (which reflects the first 100-row seed).*

**Summary:** 105 active · 9 retired · 33 leveled (tiered) badges · ~30 carry `earn_rule.unlocks='frame_upgrade'` (their level upgrades the equipped dueling frame). **No award engine runs for the new ladders yet** — see the decision surface at the end.

**Legend:** *Levels* = tier ladder (blank = single award). *⬆* in Engine notes = leveling badge. *Art* = medallion art ready in `docs/badge-art/final/` or pending.


## First steps

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| First Step | common | — | `on_entry_submitted` | Submit your very first entry. | n/a | ready |
| First Bow | common | — | `on_onboarding_complete` | Finish your profile and get guardian consent. | n/a | ready |
| First Reveal | common | — | `on_reveal_viewed` | Open your results for the very first time. | n/a | ready |
| First Reflection | common | — | `on_journal_entry` | Write your first journal reflection. | n/a | ready |
| First Medal | uncommon | — | `on_medal_awarded` | Earn your first medal of any placement. | n/a | ready |

## Effort

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| On the Mat | rare | 3/6/9 | `on_result_finalized` | Compete in 3, then 6, then 9 different rounds. | no engine | ready |
| Nine Bows | rare | — | `on_season_rollup` | Compete in all nine season qualifiers. | no engine | ready |
| Back on the Mat | uncommon | — | `on_entry_submitted` | Enter a round after missing the one before. | no engine | ready |
| Early Bird | uncommon | — | `on_entry_submitted` | Enter within the first 48h after a window opens. | no engine | ready |
| Deadline Warrior | rare | 3/5/10 | `on_entry_submitted` | Submit 3/5/10 entries in the last six hours before a deadline. | no engine | ready |
| Iron Will | rare | — | `on_result_finalized` | Compete in six rounds in a row. | no engine | ready |
| Perfect Attendance ⬆ | rare | 1-10 | `on_season_rollup` | Enter every round in a season; level per perfect season, up to ten. | no engine | ready |

## Growth

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| Rising Star ⬆ | uncommon | 1-10 | `on_result_finalized` | Beat your personal-best round score; level up each time, up to ten. | no engine | ready |
| New Heights ⬆ | uncommon | 1-10 | `on_rating_updated` | Set a new personal-best rating; level up each time, up to ten. | no engine | ready |
| Steady Climb | rare | — | `on_result_finalized` | Improve your score three rounds in a row. | no engine | ready |
| Comeback | uncommon | — | `on_result_finalized` | Come back with a higher score after a lower round. | no engine | ready |
| Full Circle | epic | — | `on_mastery_update` | Fill every axis of your Mirror radar to 100%. | no engine | ready |
| Ascent ⬆ | rare | 60/70/80/90/95 | `on_rating_updated` | Reach a rating of 60, 70, 80, 90, then 95. | no engine · skill_ratings absolute threshold | ready |

## Mastery

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| Precision (Technical) ⬆ | rare | 1/5/10/25/50 | `on_result_finalized` | Score above 85 in Technical — new level at 1/5/10/25/50 rounds. | no engine | ready |
| Kime (Power) ⬆ | rare | 1/5/10/25/50 | `on_result_finalized` | Score above 85 in Power — new level at 1/5/10/25/50 rounds. | no engine | ready |
| Rooted (Balance) ⬆ | rare | 1/5/10/25/50 | `on_result_finalized` | Score above 85 in Balance — new level at 1/5/10/25/50 rounds. | no engine | ready |
| Flow (Timing) ⬆ | rare | 1/5/10/25/50 | `on_result_finalized` | Score above 85 in Timing — new level at 1/5/10/25/50 rounds. | no engine | ready |
| Spirit (Presentation) ⬆ | rare | 1/5/10/25/50 | `on_result_finalized` | Score above 85 in Presentation — new level at 1/5/10/25/50 rounds. | no engine | ready |
| Innovator (Difficulty) ⬆ | rare | 1/5/10/25/50 | `on_result_finalized` | Score above 85 in Difficulty — new level at 1/5/10/25/50 rounds. | no engine | ready |
| Grandmaster | legendary | — | `on_mastery_update` | Reach gold in all six masteries. | no engine | ready |

## Events

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| Both Hands | uncommon | — | `on_result_finalized` | Compete in both forms and weapons events. | no engine | ready |
| Open Mind | uncommon | — | `on_entry_submitted` | Enter your first Open event. | no engine | ready |
| Traditionalist | rare | — | `on_season_rollup` | Keep every entry in a season Traditional. | no engine | ready |
| Weapon Master ⬆ | rare | 5/10/25/50 | `on_medal_awarded` | Win gold medals in weapon events — new level at 5/10/25/50. | no engine | ready |
| Style Explorer | uncommon | — | `on_entry_submitted` | Compete in 5 Traditional and 5 Open events. | no engine | ready |
| Well-Rounded | rare | — | `on_season_rollup` | Compete in every event category in a single season. | no engine | ready |

## Placement

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| Podium | uncommon | — | `on_medal_awarded` | Finish in the top three. | no engine | ready |
| Sweep | epic | — | `on_result_finalized` | Win gold in more than one event in the same round. | no engine | ready |
| Undefeated ⬆ | rare | 5/10/25/50 | `on_result_finalized` | Win first place in consecutive rounds — new level at 5/10/25/50. | no engine | ready |
| Podium Season | epic | — | `on_season_rollup` | Earn a medal in every round of a season. | no engine | ready |
| Gold Medallion | legendary | — | `on_season_rollup` | Win gold in every qualifying round for a perfect season. | no engine | ready |
| Bronze Path ⬆ | common | 1/5/10/25/50/100 | `on_medal_awarded` | Earn bronze medals — new level at 1/5/10/25/50/100. | no engine | pending |
| Silver Path ⬆ | uncommon | 1/5/10/25/50/100 | `on_medal_awarded` | Earn silver medals — new level at 1/5/10/25/50/100. | no engine | pending |
| Gold Path ⬆ | rare | 1/5/10/25/50/100 | `on_medal_awarded` | Earn gold medals — new level at 1/5/10/25/50/100. | no engine | ready |

## Championship

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| Semifinalist | rare | — | `on_bracket_advance` | Reach the semifinals. | no engine | ready |
| Finalist | epic | — | `on_bracket_advance` | Reach the finals. | no engine | ready |
| Grand Champion | legendary | — | `on_bracket_advance` | Win the Grand Finale. | no engine | ready |
| Sponsor's Champion | legendary | — | `on_bracket_advance` | Win a sponsor tournament. | no engine | ready |
| Giant Slayer ⬆ | epic | 10/20/30 | `on_result_finalized` | Beat an opponent rated above you — new level for rating gaps of 10/20/30. | no engine | ready |
| Season Champion S1 (Sapphire) | legendary | — | `on_season_rollup` | Be crowned Season 1 overall champion. | no engine | ready |
| Season Champion S2 (Amethyst) | legendary | — | `on_season_rollup` | Be crowned Season 2 overall champion. | no engine | ready |
| Season Champion S3 (Ruby) | legendary | — | `on_season_rollup` | Be crowned Season 3 overall champion. | no engine | ready |
| Season Champion S4 (Emerald) | legendary | — | `on_season_rollup` | Be crowned Season 4 overall champion. | no engine | ready |
| Season Champion S5 (Coral) | legendary | — | `on_season_rollup` | Be crowned Season 5 overall champion. | no engine | ready |
| Season Champion S6 (Onyx) | legendary | — | `on_season_rollup` | Be crowned Season 6 overall champion. | no engine | ready |
| Season Champion S7 (Rose) | legendary | — | `on_season_rollup` | Be crowned Season 7 overall champion. | no engine | ready |
| Season Champion S8 (Turquoise) | legendary | — | `on_season_rollup` | Be crowned Season 8 overall champion. | no engine | ready |
| Season Champion S9 (Peridot) | legendary | — | `on_season_rollup` | Be crowned Season 9 overall champion. | no engine | ready |
| Season Champion S10 (Platinum) | legendary | — | `on_season_rollup` | Be crowned Season 10 overall champion. | no engine | ready |

## Imprint & Gem

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| Imprint Complete | rare | — | `on_season_rollup` | Complete all nine Imprint segments in a season. | no engine | ready |
| Season Keepsake | rare | — | `on_season_rollup` | Finish both the physical and digital Imprint for a season. | no engine | ready |
| Decade of Dedication | legendary | — | `on_season_rollup` | Complete ten seasons. | no engine | ready |
| Gem Series S1 (Sapphire) | legendary | — | `on_season_rollup` | Complete Season 1 to earn its Sapphire gem. | no engine | ready |
| Gem Series S2 (Amethyst) | legendary | — | `on_season_rollup` | Complete Season 2 to earn its Amethyst gem. | no engine | ready |
| Gem Series S3 (Ruby) | legendary | — | `on_season_rollup` | Complete Season 3 to earn its Ruby gem. | no engine | ready |
| Gem Series S4 (Emerald) | legendary | — | `on_season_rollup` | Complete Season 4 to earn its Emerald gem. | no engine | pending |
| Gem Series S5 (Coral) | legendary | — | `on_season_rollup` | Complete Season 5 to earn its Coral gem. | no engine | ready |
| Gem Series S6 (Onyx) | legendary | — | `on_season_rollup` | Complete Season 6 to earn its Onyx gem. | no engine | ready |
| Gem Series S7 (Rose) | legendary | — | `on_season_rollup` | Complete Season 7 to earn its Rose gem. | no engine | ready |
| Gem Series S8 (Turquoise) | legendary | — | `on_season_rollup` | Complete Season 8 to earn its Turquoise gem. | no engine | ready |
| Gem Series S9 (Peridot) | legendary | — | `on_season_rollup` | Complete Season 9 to earn its Peridot gem. | no engine | ready |
| Gem Series S10 (Platinum) | legendary | — | `on_season_rollup` | Complete Season 10 to earn its Platinum gem. | no engine | ready |
| Seasons Veteran ⬆ | rare | 2/3/5/7 | `on_season_rollup` | Compete across 2, 3, 5, then 7 seasons. | no engine · season-participation count | ready |

## Journal

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| Consistent Journaler | rare | 3/10/25 | `on_journal_entry` | Journal after 3, 10, then 25 reveals. | no engine | ready |
| Reflective Warrior | rare | — | `on_season_rollup` | Journal after every round in a season. | no engine | ready |

## Dueling

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| First Duel | common | — | `on_duel_completed` | Complete your first duel. | LIVE | ready |
| Duelist ⬆ | rare | 10/25/50 | `on_duel_completed` | Complete 10, then 25, then 50 duels. | LIVE (config) | ready |
| First Blood | uncommon | — | `on_duel_completed` | Win your first duel. | LIVE | ready |
| Warpath | rare | — | `on_duel_completed` | Win three duels in a row. | LIVE (config=3) | ready |
| People's Champion ⬆ | rare | 3/10/25/50 | `on_duel_completed` | Win duels by an 80%+ community landslide — new level at 3/10/25/50. | single-shot only — needs tier logic | ready |
| Road Warrior ⬆ | rare | 5/10/25/50 | `on_duel_completed` | Duel opponents from different schools — new level at 5/10/25/50. | single-shot only — needs tier logic | ready |
| Rivalry | uncommon | — | `on_duel_completed` | Rematch an opponent you have already dueled. | LIVE | ready |
| Undefeated Duelist ⬆ | epic | 5/10/25/50/100 | `on_duel_completed` | Win duels with a spotless record — new level at 5/10/25/50/100. | single-shot only — needs tier logic | ready |
| Relentless (was Fearless Challenger) ⬆ | rare | 1/3/5/7/12 | `on_duel_completed` | Submit 5 duels a week — new level at 1/3/5/7/12 months of the pace. | no engine | ready |
| Iron Duelist | rare | — | `on_duel_completed` | Duel at least once a week for a full month. | no engine · overlaps Relentless | ready |
| Duel Legend | legendary | — | `on_duel_completed` | Reach number one on a dueling leaderboard. | no engine | ready |
| Deadlock | epic | — | `on_duel_completed` | Battle to a true draw that survives sudden death. | LIVE | ready |
| Dueling Master ⬆ | legendary | 100/150/200/250/500/1000 | `on_duel_completed` | Complete 100 to 1,000 duels. | no engine | ready |
| Underdog ⬆ | rare | 1/5/10/25 | `on_duel_completed` | Win a duel as the lower-rated duelist. | no engine · rating-at-duel-time | ready |
| Clutch | epic | — | `on_duel_completed` | Win a duel in sudden death. | no engine · sudden-death flag | ready |
| Flawless Victory | epic | — | `on_duel_completed` | Win a duel with every community vote. | no engine · 100% vote share | ready |
| Photo Finish ⬆ | uncommon | — | `on_duel_completed` | Win a duel by a single vote. | no engine · 1-vote margin (hidden) | ready |
| Redemption | rare | — | `on_duel_completed` | Beat an opponent who has beaten you before. | no engine · duel history | ready |

## Voting

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| First Vote | common | — | `on_duel_vote_cast` | Cast your first vote. | LIVE | ready |
| Voice of the People ⬆ | rare | 25/100/500/1000/5000 | `on_duel_vote_cast` | Cast 25 to 5,000 votes. | first 3 tiers only — add 4/5 | ready |
| Daily Voter ⬆ | uncommon | 5/10/25/50/100 | `on_duel_vote_cast` | Vote on consecutive days — new level at 5/10/25/50/100. | single-shot only — needs tier logic | ready |
| Sharp Eye ⬆ | rare | 10/25/50/100/250 | `on_duel_completed` | Pick the winning side in >=70% of your votes — new level at 10/25/50/100/250. | single-shot only — needs tier logic | ready |
| Kingmaker ⬆ | rare | 5/10/25/50/100 | `on_duel_completed` | Cast the final vote for a duel's winner — new level at 5/10/25/50/100. | redefined — needs engine | ready |
| Honorable Voter (was Fair Witness) | uncommon | — | `on_duel_completed` | Pick the duel winner more than 85% of the time. Drop below and you lose it. | REVOCABLE — needs delete/deactivate | ready |
| Oracle ⬆ | rare | 1/5/10/25 | `on_duel_completed` | Vote for an underdog who goes on to win. | no engine · voted lower-rated winner | ready |
| Superfan ⬆ | uncommon | 10/25/50/100/250 | `on_duel_vote_cast` | Watch duels start to finish. | needs watch-time persisted | ready |

## Community & Charter

| name | rarity | levels | trigger | how earned | engine / build | art |
|---|---|---|---|---|---|---|
| Teammate | common | — | `on_result_finalized` | Compete in the same round as a schoolmate. | no engine | ready |
| Globetrotter | rare | — | `on_result_finalized` | Compete alongside students from many different schools. | no engine | ready |
| Anniversary | uncommon | — | `on_scheduled` | Reach one year since you joined. | no engine | ready |
| Trendsetter | rare | — | `on_badge_award` | Be the first at your school to earn a rare or higher badge. | no engine · META hook on any award | ready |
| Perfect Score | legendary | — | `on_result_finalized` | Score above 96 in every judging criterion. | no engine | ready |
| Zen ⬆ | epic | — | `on_result_finalized` | Score above 95 overall in a single performance. | no engine (hidden) | ready |
| Buzzer Beater ⬆ | uncommon | — | `on_entry_submitted` | Submit an entry in the final minute before a deadline. | no engine · <60s to deadline (hidden) | ready |
| Charter Member | legendary | — | `on_onboarding_complete` | Compete in the very first season. | no engine | ready |
| Trailblazer | legendary | — | `on_onboarding_complete` | Be one of the first 100 competitors ever to join. | no engine | ready |

---

## Retired (9 · `active=false`)

| code | why |
|---|---|
| breakthrough | moving-target metric; New Heights covers rating gains |
| rising-floor | per review |
| gold-rush | superseded by Gold Path |
| goal-keeper | no metric/area to set a goal against |
| trusted-voter | superseded by Honorable Voter |
| dojo-pride | per review |
| encourager | per review |
| ghost | per review |
| mentor | overlapped encourager |

---

## What's NOT built yet (the decision surface)

Everything above is **catalog data**. Three systems are needed to make it real:

1. **Award engine for the new ladders.** No engine at all for placement / growth / mastery / events / journal / championship / community. `nmao.award_dueling_badges()` exists for dueling+voting but is **single-shot** for the newly-tiered ones (peoples-champion, road-warrior, undefeated-duelist, daily-voter, sharp-eye, kingmaker) and **doesn't know** Dueling Master, voice tiers 4/5, or Relentless. Each ladder needs idempotent progress-counting + per-tier `badge_awards` inserts (`seen=false` for the reveal).
2. **Per-level frame upgrade** (`frame_upgrade`). Today the equipped frame is drawn from **rarity only**. Needs per-level border specs (extend `badge-frames.csv` with per-tier rows) + a resolver in `set_equipped_frame()` / `duel_vote_queue()` that returns the frame for the competitor's **highest earned tier** of the equipped badge.
3. **Revocable badges** (new mechanic). **Honorable Voter** must be **removed** when winner-accuracy drops below 85% — the engine must `DELETE`/deactivate, not only insert. Provisional `min_qualified=10` sample floor is unconfirmed.

**Two new signals needed:** *Superfan* (watch-time persisted) and *Trendsetter* (a badge-award meta hook — evaluate on any award, school-first).

## Data model & leveling convention

`badges(code PK, name, description, category, rarity, tiered, hidden, emblem_key, earn_rule jsonb, sort_order, active)` · `badge_awards(competitor_id, badge_code, tier, …)` **unique(competitor_id, badge_code, tier)** — tiers/levels stored as `tier`. A leveled badge sets `tiered=true`, stores its ladder in `earn_rule.levels`, and marks `earn_rule.unlocks='frame_upgrade'` when its levels upgrade the frame. Equipped frame = `competitors.equipped_badge_code` (via `set_equipped_frame()`, read in `duel_vote_queue()`).
