-- ============================================================
-- Player-facing copy pass on badges.description
-- The Arena badge "crest" tooltip and the Achievements vault show
-- badges.description verbatim as the "how earned" text. The catalog seed
-- (20260814030000_badge_catalog_seed.sql) shipped internal/dev phrasing
-- ("count(entries)=1", "consecutive placement=1", "streak of X") that leaked
-- implementation details. This rewrites all 100 rows into clean, second-person
-- copy that plainly states what earns the badge.
--
-- Tunable thresholds are substituted with the LIVE configured values:
--   dueling_award_config — warpath_streak=3, undefeated_streak=5,
--   daily_voter_days=5, road_warrior_schools=5, rivalry_count=2,
--   landslide_pct=0.80, sharp_eye_accuracy=0.70, trusted_accuracy=0.85,
--   trusted_min=50, fair_witness_types=2, kingmaker_margin=1,
--   duelist 5/15/30, voice 25/100/500.
--   Tiered ladders already fixed in earn_rule: on-the-mat 3/6/9,
--   deadline-warrior 3/5/10, gold-rush 3/5, consistent-journaler 3/10/25.
-- Badges whose threshold is a still-unspecified N/X with no configured value
-- and no award engine yet (undefeated (placement), giant-slayer, precision/
-- kime/rooted/flow/spirit/innovator streaks, trailblazer, mentor) are phrased
-- descriptively rather than with an invented number.
--
-- Idempotent: pure UPDATEs keyed by code; re-running is a no-op. Only
-- description changes — name, earn_rule, and every other column are untouched.
-- ============================================================

-- First steps & milestones
update badges set description = 'Submit your very first entry.'                                where code = 'first-step';
update badges set description = 'Finish your profile and get guardian consent.'                where code = 'first-bow';
update badges set description = 'Open your results for the very first time.'                   where code = 'first-reveal';
update badges set description = 'Write your first journal reflection.'                         where code = 'first-reflection';
update badges set description = 'Earn your first medal of any placement.'                      where code = 'first-medal';
update badges set description = 'Take first place for the first time.'                         where code = 'first-gold';

-- Effort & consistency
update badges set description = 'Compete in 3, then 6, then 9 different rounds.'               where code = 'on-the-mat';
update badges set description = 'Compete in all nine season qualifiers.'                       where code = 'nine-bows';
update badges set description = 'Come back and enter a round after missing the one before.'    where code = 'back-on-the-mat';
update badges set description = 'Enter within the first 48 hours after a window opens.'        where code = 'early-bird';
update badges set description = 'Submit 3, 5, then 10 entries in the last six hours before a deadline.' where code = 'deadline-warrior';
update badges set description = 'Compete in six rounds in a row.'                              where code = 'iron-will';
update badges set description = 'Enter every round in a season.'                               where code = 'perfect-attendance';

-- Growth & improvement
update badges set description = 'Beat your personal-best round score.'                         where code = 'rising-star';
update badges set description = 'Set a new personal-best rating.'                              where code = 'new-heights';
update badges set description = 'Improve your score three rounds in a row.'                    where code = 'steady-climb';
update badges set description = 'Come back with a higher score after a lower round.'           where code = 'comeback';
update badges set description = 'Record your biggest-ever jump in rating.'                     where code = 'breakthrough';
update badges set description = 'Raise your lowest round score.'                               where code = 'rising-floor';
update badges set description = 'Fill your mastery radar all the way to 100%.'                 where code = 'full-circle';

-- Mastery (per criterion, tiered consecutive-round streaks)
update badges set description = 'Score high in Technique for several rounds in a row.'         where code = 'precision';
update badges set description = 'Score high in Power for several rounds in a row.'             where code = 'kime';
update badges set description = 'Score high in Balance for several rounds in a row.'           where code = 'rooted';
update badges set description = 'Score high in Timing for several rounds in a row.'            where code = 'flow';
update badges set description = 'Score high in Presentation for several rounds in a row.'      where code = 'spirit';
update badges set description = 'Score high in Difficulty for several rounds in a row.'        where code = 'innovator';
update badges set description = 'Reach gold in all six masteries.'                             where code = 'grandmaster';

-- Events & exploration
update badges set description = 'Compete in both forms and weapons events.'                    where code = 'both-hands';
update badges set description = 'Enter your first Open event.'                                 where code = 'open-mind';
update badges set description = 'Keep every entry in a season Traditional.'                    where code = 'traditionalist';
update badges set description = 'Compete in every weapon event.'                               where code = 'weapon-master';
update badges set description = 'Compete in both Traditional and Open events in one season.'   where code = 'style-explorer';
update badges set description = 'Enter an event outside your usual category.'                  where code = 'fearless';

-- Placement & podium
update badges set description = 'Finish in the top three.'                                     where code = 'podium';
update badges set description = 'Win 3, then 5, gold medals in your career.'                   where code = 'gold-rush';
update badges set description = 'Win gold in more than one event in the same round.'           where code = 'sweep';
update badges set description = 'String together back-to-back first-place finishes.'           where code = 'undefeated';
update badges set description = 'Earn a medal in every round of a season.'                     where code = 'podium-season';
update badges set description = 'Win gold in every qualifying round for a perfect season.'     where code = 'gold-medallion';

-- Championship & advancement
update badges set description = 'Reach the semifinals.'                                        where code = 'semifinalist';
update badges set description = 'Reach the finals.'                                            where code = 'finalist';
update badges set description = 'Win the Grand Finale.'                                        where code = 'grand-champion';
update badges set description = 'Win a sponsor tournament.'                                    where code = 'sponsors-champion';
update badges set description = 'Defeat an opponent rated far above you.'                       where code = 'giant-slayer';

-- Imprint & the Gem Series
update badges set description = 'Complete all nine Imprint segments in a season.'              where code = 'imprint-complete';
update badges set description = 'Finish both the physical and digital Imprint for a season.'   where code = 'season-keepsake';
update badges set description = 'Complete Season 1 to earn the Sapphire gem.'                  where code = 'gem-s1';
update badges set description = 'Complete Season 2 to earn the Amethyst gem.'                  where code = 'gem-s2';
update badges set description = 'Complete Season 3 to earn the Ruby gem.'                      where code = 'gem-s3';
update badges set description = 'Complete Season 4 to earn the Emerald gem.'                   where code = 'gem-s4';
update badges set description = 'Complete Season 5 to earn the Coral gem.'                     where code = 'gem-s5';
update badges set description = 'Complete Season 6 to earn the Onyx gem.'                       where code = 'gem-s6';
update badges set description = 'Complete Season 7 to earn the Rose gem.'                       where code = 'gem-s7';
update badges set description = 'Complete Season 8 to earn the Turquoise gem.'                  where code = 'gem-s8';
update badges set description = 'Complete Season 9 to earn the Peridot gem.'                    where code = 'gem-s9';
update badges set description = 'Complete Season 10 to earn the Platinum gem.'                  where code = 'gem-s10';
update badges set description = 'Complete ten seasons.'                                        where code = 'decade-of-dedication';

-- Journal & reflection
update badges set description = 'Journal after 3, 10, then 25 reveals.'                        where code = 'consistent-journaler';
update badges set description = 'Journal after every round in a season.'                       where code = 'reflective-warrior';
update badges set description = 'Set a season goal and reach it.'                              where code = 'goal-keeper';

-- Dueling
update badges set description = 'Complete your first duel.'                                    where code = 'first-duel';
update badges set description = 'Complete 5, then 15, then 30 duels.'                          where code = 'duelist';
update badges set description = 'Win your first duel.'                                         where code = 'first-blood';
update badges set description = 'Win three duels in a row.'                                    where code = 'warpath';
update badges set description = 'Win a duel with at least 80% of the community vote.'          where code = 'peoples-champion';
update badges set description = 'Duel opponents from five or more different schools.'          where code = 'road-warrior';
update badges set description = 'Rematch an opponent you have already dueled.'                 where code = 'rivalry';
update badges set description = 'Win five duels in a row without a loss.'                       where code = 'undefeated-duelist';
update badges set description = 'Duel at least once a week for a full month.'                  where code = 'iron-duelist';
update badges set description = 'Reach number one on a dueling leaderboard.'                   where code = 'duel-legend';
update badges set description = 'Battle to a true draw that survives sudden death.'            where code = 'deadlock';

-- Voting
update badges set description = 'Cast your first vote.'                                        where code = 'first-vote';
update badges set description = 'Cast 25, then 100, then 500 votes.'                           where code = 'voice-of-the-people';
update badges set description = 'Vote five days in a row.'                                     where code = 'daily-voter';
update badges set description = 'Pick the winning side in at least 70% of your votes.'         where code = 'sharp-eye';
update badges set description = 'Cast the deciding vote in a duel settled by a single vote.'   where code = 'kingmaker';
update badges set description = 'Vote in at least two different duel types.'                   where code = 'fair-witness';
update badges set description = 'Keep an 85% winner-picking rate across 50 or more votes.'     where code = 'trusted-voter';

-- Community & dojo
update badges set description = 'Be part of your school reaching a shared milestone.'          where code = 'dojo-pride';
update badges set description = 'Compete in the same round as a schoolmate.'                   where code = 'teammate';
update badges set description = 'Send guardian-approved cheers to your dojo-mates.'            where code = 'encourager';
update badges set description = 'Send approved encouragement to newer students.'               where code = 'mentor';
update badges set description = 'Reach one year since you joined.'                             where code = 'anniversary';
update badges set description = 'Compete in every event category in a single season.'          where code = 'well-rounded';
update badges set description = 'Compete alongside students from many different schools.'       where code = 'globetrotter';

-- Legendary, hidden & charter
update badges set description = 'Earn a perfect or near-perfect score from the judges.'        where code = 'perfect-score';
update badges set description = 'Deliver a flawless, perfectly composed performance.'          where code = 'zen';
update badges set description = 'Uncover a fun hidden secret.'                                 where code = 'ghost';
update badges set description = 'Compete in the very first season.'                            where code = 'charter-member';
update badges set description = 'Be one of the first competitors ever to join.'               where code = 'trailblazer';

-- Season Champions (dragon medallion, colored to the season gem)
update badges set description = 'Be crowned Season 1 overall champion.'                        where code = 'season-champion-s1';
update badges set description = 'Be crowned Season 2 overall champion.'                        where code = 'season-champion-s2';
update badges set description = 'Be crowned Season 3 overall champion.'                        where code = 'season-champion-s3';
update badges set description = 'Be crowned Season 4 overall champion.'                        where code = 'season-champion-s4';
update badges set description = 'Be crowned Season 5 overall champion.'                        where code = 'season-champion-s5';
update badges set description = 'Be crowned Season 6 overall champion.'                        where code = 'season-champion-s6';
update badges set description = 'Be crowned Season 7 overall champion.'                        where code = 'season-champion-s7';
update badges set description = 'Be crowned Season 8 overall champion.'                        where code = 'season-champion-s8';
update badges set description = 'Be crowned Season 9 overall champion.'                        where code = 'season-champion-s9';
update badges set description = 'Be crowned Season 10 overall champion.'                       where code = 'season-champion-s10';
