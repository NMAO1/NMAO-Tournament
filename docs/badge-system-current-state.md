# NMAO Badge System — Current State (post copy + leveling pass)

*Snapshot for handoff. Reflects the **live** `badges` table on Supabase project
`oxzuavpyoetchwebdejp` as of 2026-08-13, after migrations `20260815020000`–`20260815150000`.
Source of truth is the DB; this doc is a readable mirror to decide what to build next.*

---

## 1. Summary

- **105 active** badges · **9 retired** · **14 new** (vs the original 100-row catalog seed).
- **33 active tiered** (leveled) badges. **31 leveled badges** carry `earn_rule.unlocks = 'frame_upgrade'`.
- The newest badges (migrations `…150000` / `…160000`) are listed together in **§8** with their build dependencies (not yet threaded into the §2 category tables).
- Everything below is **catalog/data only**. **No award engine runs for the new ladders yet**, and the "border upgrades per level" behavior is **not built** (see §5).

### Data model (unchanged tables)
- `badges(code PK, name, description, category, rarity, tiered, hidden, emblem_key, earn_rule jsonb, sort_order, active)`
- `badge_awards(competitor_id, badge_code, tier, ...)` — **unique(competitor_id, badge_code, tier)**. Tiers/levels are stored here as the `tier` value.
- **Leveling convention (new):** a leveled badge sets `tiered = true` and stores its ladder in `earn_rule.levels` (jsonb array). `earn_rule.unlocks = 'frame_upgrade'` marks badges whose new levels should upgrade the equipped dueling frame.
- The **equipped frame / "border"** = `competitors.equipped_badge_code` (set via `set_equipped_frame()`, read in `duel_vote_queue()`); today its look is derived only from the badge's **rarity**.

### Award engines that exist today
- **Dueling/Voting only:** `nmao.award_dueling_badges()` reads live thresholds from `dueling_award_config`. It currently handles: `duelist` (3 tiers), `voice-of-the-people` (3 tiers), and **single-shot** awards for first-duel, first-blood, warpath, undefeated-duelist, deadlock, rivalry, road-warrior, peoples-champion, first-vote, daily-voter, sharp-eye, kingmaker, fair-witness. **It does not yet know about any new ladder tiers** (e.g. dueling-master, or tiers 4/5 of voice, or the tiered peoples-champion/road-warrior/etc).
- **No engine at all** for placement / growth / mastery / events / journal / championship / community badges — those award conditions are documented but unenforced.

---

## 2. Active badges by category

Legend: **Lvl** = `earn_rule.levels` ladder (blank = single-award). ⬆ = carries `frame_upgrade`.

### First steps
| code | name | rarity | trigger | how earned |
|---|---|---|---|---|
| first-step | First Step | common | on_entry_submitted | Submit your very first entry. |
| first-bow | First Bow | common | on_onboarding_complete | Finish your profile and get guardian consent. |
| first-reveal | First Reveal | common | on_reveal_viewed | Open your results for the very first time. |
| first-reflection | First Reflection | common | on_journal_entry | Write your first journal reflection. |
| first-medal | First Medal | uncommon | on_medal_awarded | Earn your first medal of any placement. |

### Effort
| code | name | rarity | trigger | Lvl | how earned |
|---|---|---|---|---|---|
| on-the-mat | On the Mat I/II/III | rare | on_result_finalized | 3/6/9 | Compete in 3, then 6, then 9 different rounds. |
| nine-bows | Nine Bows | rare | on_season_rollup | — | Compete in all nine season qualifiers. |
| back-on-the-mat | Back on the Mat | uncommon | on_entry_submitted | — | Come back and enter a round after missing the one before. |
| early-bird | Early Bird | uncommon | on_entry_submitted | — | Enter within the first 48 hours after a window opens. |
| deadline-warrior | Deadline Warrior | rare | on_entry_submitted | 3/5/10 | Submit 3, 5, then 10 entries in the last six hours before a deadline. |
| iron-will | Iron Will | rare | on_result_finalized | — | Compete in six rounds in a row. |
| perfect-attendance ⬆ | Perfect Attendance | rare | on_season_rollup | 1–10 | Enter every round in a season; level per perfect season, up to ten. |

### Growth
| code | name | rarity | trigger | Lvl | how earned |
|---|---|---|---|---|---|
| rising-star ⬆ | Rising Star | uncommon | on_result_finalized | 1–10 | Beat your personal-best round score; level up each time, up to ten. |
| new-heights ⬆ | New Heights | uncommon | on_rating_updated | 1–10 | Set a new personal-best rating; level up each time, up to ten. |
| steady-climb | Steady Climb | rare | on_result_finalized | — | Improve your score three rounds in a row. |
| comeback | Comeback | uncommon | on_result_finalized | — | Come back with a higher score after a lower round. |
| full-circle | Full Circle | epic | on_mastery_update | — | Fill every axis of your Mirror radar to 100%. |

### Mastery (⬆ all six criterion ladders; unit = rounds scoring **>85** in that criterion)
| code | name | rarity | Lvl | how earned |
|---|---|---|---|---|
| precision ⬆ | Precision (Technical) | rare | 1/5/10/25/50 | Score above 85 in Technical — new level at 1/5/10/25/50 rounds. |
| kime ⬆ | Kime (Power) | rare | 1/5/10/25/50 | Score above 85 in Power — … |
| rooted ⬆ | Rooted (Balance) | rare | 1/5/10/25/50 | Score above 85 in Balance — … |
| flow ⬆ | Flow (Timing) | rare | 1/5/10/25/50 | Score above 85 in Timing — … |
| spirit ⬆ | Spirit (Presentation) | rare | 1/5/10/25/50 | Score above 85 in Spirit — … |
| innovator ⬆ | Innovator (Difficulty) | rare | 1/5/10/25/50 | Score above 85 in Difficulty — … |
| grandmaster | Grandmaster | legendary | — | Reach gold in all six masteries. |

### Events
| code | name | rarity | trigger | Lvl | how earned |
|---|---|---|---|---|---|
| both-hands | Both Hands | uncommon | on_result_finalized | — | Compete in both forms and weapons events. |
| open-mind | Open Mind | uncommon | on_entry_submitted | — | Enter your first Open event. |
| traditionalist | Traditionalist | rare | on_season_rollup | — | Keep every entry in a season Traditional. |
| weapon-master ⬆ | Weapon Master | rare | on_medal_awarded | 5/10/25/50 | Win gold medals in weapon events — new level at 5/10/25/50. |
| style-explorer | Style Explorer | uncommon | on_entry_submitted | — | Compete in 5 Traditional events and 5 Open events. |
| well-rounded | Well-Rounded | rare | on_season_rollup | — | Compete in every event category in a single season. |

### Placement (incl. the medal **Paths**)
| code | name | rarity | trigger | Lvl | how earned |
|---|---|---|---|---|---|
| podium | Podium | uncommon | on_medal_awarded | — | Finish in the top three. |
| sweep | Sweep | epic | on_result_finalized | — | Win gold in more than one event in the same round. |
| undefeated ⬆ | Undefeated | rare | on_result_finalized | 5/10/25/50 | Win first place in consecutive rounds — new level at streaks of 5/10/25/50. |
| podium-season | Podium Season | epic | on_season_rollup | — | Earn a medal in every round of a season. |
| gold-medallion | Gold Medallion | legendary | on_season_rollup | — | Win gold in every qualifying round for a perfect season. |
| first-bronze ⬆ | **Bronze Path** | common | on_medal_awarded | 1/5/10/25/50/100 | Earn bronze medals — new level at 1/5/10/25/50/100. |
| first-silver ⬆ | **Silver Path** | uncommon | on_medal_awarded | 1/5/10/25/50/100 | Earn silver medals — … |
| first-gold ⬆ | **Gold Path** | rare | on_medal_awarded | 1/5/10/25/50/100 | Earn gold medals — … |

### Championship
| code | name | rarity | trigger | Lvl | how earned |
|---|---|---|---|---|---|
| semifinalist | Semifinalist | rare | on_bracket_advance | — | Reach the semifinals. |
| finalist | Finalist | epic | on_bracket_advance | — | Reach the finals. |
| grand-champion | Grand Champion | legendary | on_bracket_advance | — | Win the Grand Finale. |
| sponsors-champion | Sponsor's Champion | legendary | on_bracket_advance | — | Win a sponsor tournament. |
| giant-slayer ⬆ | Giant Slayer | epic | on_result_finalized | 10/20/30 | Beat an opponent rated above you — new level for rating gaps of 10/20/30. |
| season-champion-s1 … s10 | Season Champion S1–S10 | legendary | on_season_rollup | — | Be crowned Season N overall champion. *(Sapphire→Platinum)* |

### Imprint & Gem Series
| code | name | rarity | how earned |
|---|---|---|---|
| imprint-complete | Imprint Complete | rare | Complete all nine Imprint segments in a season. |
| season-keepsake | Season Keepsake | rare | Finish both the physical and digital Imprint for a season. |
| decade-of-dedication | Decade of Dedication | legendary | Complete ten seasons. |
| gem-s1 … gem-s10 | Gem Series S1–S10 | legendary | Complete Season N to earn its gem *(Sapphire, Amethyst, Ruby, Emerald, Coral, Onyx, Rose, Turquoise, Peridot, Platinum)*. |

### Journal
| code | name | rarity | Lvl | how earned |
|---|---|---|---|---|
| consistent-journaler | Consistent Journaler I/II/III | rare | 3/10/25 | Journal after 3, 10, then 25 reveals. |
| reflective-warrior | Reflective Warrior | rare | — | Journal after every round in a season. |

### Dueling
| code | name | rarity | Lvl | how earned | engine |
|---|---|---|---|---|---|
| first-duel | First Duel | common | — | Complete your first duel. | ✅ live |
| duelist ⬆ | Duelist I/II/III | rare | 10/25/50 | Complete 10, then 25, then 50 duels. | ✅ live (config) |
| first-blood | First Blood | uncommon | — | Win your first duel. | ✅ live |
| warpath | Warpath | rare | — | Win three duels in a row. | ✅ live (config=3) |
| peoples-champion ⬆ | People's Champion | rare | 3/10/25/50 | Win duels by an 80%+ community landslide — new level at 3/10/25/50. | ⚠ single only |
| road-warrior ⬆ | Road Warrior | rare | 5/10/25/50 | Duel opponents from different schools — new level at 5/10/25/50. | ⚠ single only |
| rivalry | Rivalry | uncommon | — | Rematch an opponent you have already dueled. | ✅ live |
| undefeated-duelist ⬆ | Undefeated Duelist | epic | 5/10/25/50/100 | Win duels with a spotless record — new level at streaks of 5/10/25/50/100. | ⚠ single only |
| fearless ⬆ | **Relentless** *(was Fearless Challenger)* | rare | 1/3/5/7/12 | Submit 5 duels a week — new level at 1/3/5/7/12 months of the pace. | ❌ none |
| iron-duelist | Iron Duelist | rare | — | Duel at least once a week for a full month. | ❌ none *(overlaps Relentless)* |
| duel-legend | Duel Legend | legendary | — | Reach number one on a dueling leaderboard. | ❌ none |
| deadlock | Deadlock | epic | — | Battle to a true draw that survives sudden death. | ✅ live |
| dueling-master ⬆ | **Dueling Master** *(new)* | legendary | 100/150/200/250/500/1000 | Complete 100…1,000 duels. | ❌ none |

### Voting
| code | name | rarity | Lvl | how earned | engine |
|---|---|---|---|---|---|
| first-vote | First Vote | common | — | Cast your first vote. | ✅ live |
| voice-of-the-people ⬆ | Voice of the People I/II/III | rare | 25/100/500/1000/5000 | Cast 25…5,000 votes. | ⚠ first 3 tiers only |
| daily-voter ⬆ | Daily Voter | uncommon | 5/10/25/50/100 | Vote on consecutive days — new level at streaks of 5/10/25/50/100. | ⚠ single only |
| sharp-eye ⬆ | Sharp Eye | rare | 10/25/50/100/250 | Pick the winning side in ≥70% of your votes — new level at 10/25/50/100/250 votes. | ⚠ single only |
| kingmaker ⬆ | Kingmaker | rare | 5/10/25/50/100 | Cast the final vote for a duel's winner — new level at 5/10/25/50/100 times. *(redefined)* | ⚠ redefined |
| fair-witness ⬆ | **Honorable Voter** *(was Fair Witness)* | uncommon | — *(revocable)* | Pick the duel winner more than 85% of the time. Drop below and you lose it. | ❌ needs revocation |

### Community, Legendary, Hidden, Charter
| code | name | rarity | how earned |
|---|---|---|---|
| teammate | Teammate | common | Compete in the same round as a schoolmate. |
| globetrotter | Globetrotter | rare | Compete alongside students from many different schools. |
| anniversary | Anniversary | uncommon | Reach one year since you joined. *(one-time; could become a years ladder)* |
| perfect-score | Perfect Score | legendary | Score above 96 in every judging criterion. |
| zen | Zen *(hidden)* | epic | Score above 95 overall in a single performance. |
| charter-member | Charter Member | legendary | Compete in the very first season. |
| trailblazer | Trailblazer | legendary | Be one of the first 100 competitors ever to join. |

---

## 3. New badges (3)
- **first-bronze — "Bronze Path"** · **first-silver — "Silver Path"** — medal-count ladders (1/5/10/25/50/100), siblings of the reshaped Gold Path.
- **dueling-master — "Dueling Master"** — elite duel-count ladder (100/150/200/250/500/1000), continues past Duelist.

## 4. Retired badges (9, `active = false`)
| code | was | why retired |
|---|---|---|
| breakthrough | "largest single rating jump" | moving-target metric; New Heights covers rating gains |
| rising-floor | "raise your worst round" | per review |
| gold-rush | "lifetime golds 3/5" | superseded by Gold Path |
| goal-keeper | "set + reach a season goal" | no metric/area to set a goal against |
| trusted-voter | "85% over 50 votes" | superseded by Honorable Voter |
| dojo-pride | "school milestone" | per review |
| encourager | "guardian-approved cheers" | per review |
| ghost | "hidden fun secret" | per review |
| mentor | "encourage N newer students" | overlapped encourager |

---

## 5. What's NOT built yet — the decision surface for the main chat

Everything above is **catalog data**. To make it real, three engines/systems are needed:

### A. Award engine for the new ladders
- **Non-dueling ladders have no engine at all:** Bronze/Silver/Gold Path, Perfect Attendance, Rising Star, New Heights, the 6 Mastery criteria, Weapon Master, Undefeated, Giant Slayer. Each needs progress-counting + per-tier `badge_awards` inserts (idempotent, `seen=false` for the reveal).
- **Dueling/Voting engine needs extension:** `award_dueling_badges()` must gain tiered logic + `dueling_award_config` keys for: Dueling Master, voice tiers 4/5, and the newly-tiered peoples-champion / road-warrior / undefeated-duelist / daily-voter / sharp-eye / kingmaker (currently single-shot). Relentless (duel pace) has no block at all.
- **Source data is available:** `medals.medal_type` (bronze/silver/gold + weapon events), `submission_scores` (per-criterion, >85), `results.placement`, `duel_ratings`, `duel_votes`, `voter_stats`.

### B. Per-level border/frame upgrade (the point of `frame_upgrade`)
- Today the equipped frame is drawn from **rarity only**; nothing changes as you level.
- Needs: (1) per-level border art/specs (extend `docs/badge-frames.csv` with per-tier rows), and (2) a resolver in `set_equipped_frame()` / `duel_vote_queue()` that reads the competitor's **highest earned tier** for the equipped badge and returns the upgraded frame.

### C. Revocable badges (new mechanic)
- **Honorable Voter** must be **removed** when winner-accuracy drops below 85% — the first badge that can be lost. The engine must `DELETE`/deactivate the award, not just insert. Provisional `min_qualified = 10` sample floor is **unconfirmed**.

---

## 6. Open nits / small decisions
- **Anniversary** left one-time — could become a years-loyalty ladder (e.g. 1/2/3/5/10).
- **Display names** still read "Duelist **I/II/III**" and "Voice of the People **I/II/III**" though tiers render separately — consider dropping the suffix.
- **Honorable Voter** `min_qualified` floor (currently 10) needs confirming.
- **iron-duelist** kept despite overlapping Relentless (per decision) — revisit if it feels redundant.
- **Mastery criterion wording** (Technical/Power/Balance/Timing/Spirit/Difficulty) is provisional.

---

## 8. Newest badges (migration `…150000`) — 10 added

Catalog-only, like everything else. The **Build hook** column is what each needs before it can award.

| code | name | category | rarity | Lvl | how earned | build hook |
|---|---|---|---|---|---|---|
| ascent ⬆ | Ascent | Growth | rare | 60/70/80/90/95 | Reach a rating of 60, 70, 80, 90, then 95. | `skill_ratings` threshold (absolute — new axis; complements the *relative* New Heights) |
| seasons-veteran ⬆ | Seasons Veteran | Imprint | rare | 2/3/5/7 | Compete across 2, 3, 5, then 7 seasons. | season-participation count |
| underdog ⬆ | Underdog | Dueling | rare | 1/5/10/25 | Win a duel as the lower-rated duelist. | rating-at-duel-time vs opponent |
| oracle ⬆ | Oracle | Voting | rare | 1/5/10/25 | Vote for an underdog who goes on to win. | `duel_votes` + ratings (voted lower-rated winner) |
| superfan ⬆ | Superfan | Voting | uncommon | 10/25/50/100/250 | Watch duels start to finish. | **needs watch-time persisted** (watch-to-vote meter completion) |
| clutch | Clutch | Dueling | epic | — | Win a duel in sudden death. | sudden-death win flag (same path as `deadlock`) |
| flawless-victory | Flawless Victory | Dueling | epic | — | Win a duel with every community vote. | 100% vote share |
| trendsetter | Trendsetter | Community | rare | — | Be the first at your school to earn a rare or higher badge. | **META hook** — evaluate on any badge award (school-first) |
| photo-finish | Photo Finish *(hidden)* | Hidden | uncommon | — | Win a duel by a single vote. | 1-vote winning margin |
| buzzer-beater | Buzzer Beater *(hidden)* | Hidden | uncommon | — | Submit an entry in the final minute before a deadline. | entry within 60s of deadline |
| redemption | Redemption | Dueling | rare | — | Beat an opponent who has beaten you before. | duel history (prior loss to same opponent) |

Most reuse existing signals (`duels`, `duel_votes`, `duel_ratings`, `skill_ratings`, entries/deadlines). **Two need new signals:** Superfan (watch-time) and Trendsetter (a badge-award meta hook).

---

## 7. Migrations in this pass
`20260815020000` copy pass (all 100 descriptions) · `…040000` medal Paths · `…050000` growth ladders + removals + Mirror fix · `…060000` mastery criterion ladders · `…070000` weapon-master/style-explorer/undefeated · `…080000` Relentless + Giant Slayer · `…090000` duelist retune + Dueling Master · `…100000` peoples-champion + road-warrior · `…110000` voting ladders + Honorable Voter · `…120000` Honorable Voter rename + retire trusted-voter + trailblazer · `…130000` retire mentor · `…140000` retire dojo-pride/encourager/ghost + perfect-score/zen thresholds · `…150000` 10 new badges (Ascent, Seasons Veteran, Underdog, Oracle, Superfan, Clutch, Flawless Victory, Trendsetter, Photo Finish, Buzzer Beater) · `…160000` Redemption.
