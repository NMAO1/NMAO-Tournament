-- ============================================================
-- Growth-badge review pass (#13–20) — CATALOG + LEVELS ONLY.
-- Decisions from the copy/earn-rule review:
--   • perfect-attendance → tiered 1..10, unit = PERFECT SEASONS (each season
--       you enter every round = +1 level).
--   • rising-star        → tiered 1..10, unit = new personal-best ROUND SCORES.
--   • new-heights        → tiered 1..10, unit = new personal-best RATINGS
--       (symmetric with rising-star).
--   • breakthrough       → REMOVED (active=false). "Largest single rating jump"
--       is a moving target; new-heights already covers rating improvement.
--   • rising-floor       → REMOVED (active=false).
--   • full-circle        → copy fix only: the "Mirror" is the per-criterion growth
--       radar (Technical, Power/Kime, Balance, Timing, Spirit, Difficulty). Full
--       Circle = all six axes at 100%. "Mirror" is player-facing, so name it.
--
-- Thresholds live in earn_rule.levels (tunable, machine-readable); no award engine
-- yet for growth badges — deferred like the Path ladders. Leveled badges carry
-- earn_rule.unlocks='frame_upgrade' so the future border resolver knows a new
-- level should upgrade the equipped dueling frame.
--
-- Idempotent: plain UPDATEs keyed by code. Re-running is a no-op.
-- Only these rows change; name/rarity/trigger of each are preserved.
-- ============================================================

-- perfect-attendance → 10-level ladder over perfect seasons
update badges set
  tiered      = true,
  description = 'Enter every round in a season; level up for each perfect season, up to ten.',
  earn_rule   = '{"trigger":"on_season_rollup","rule":"Perfect-attendance seasons (entered every round in the season); level at 1..10","unit":"perfect_season","levels":[1,2,3,4,5,6,7,8,9,10],"unlocks":"frame_upgrade"}'::jsonb
where code = 'perfect-attendance';

-- rising-star → 10-level ladder over new personal-best round scores
update badges set
  tiered      = true,
  description = 'Beat your personal-best round score; level up each time, up to ten.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"New personal-best round scores; level at 1..10","unit":"personal_best_score","levels":[1,2,3,4,5,6,7,8,9,10],"unlocks":"frame_upgrade"}'::jsonb
where code = 'rising-star';

-- new-heights → 10-level ladder over new personal-best ratings
update badges set
  tiered      = true,
  description = 'Set a new personal-best rating; level up each time, up to ten.',
  earn_rule   = '{"trigger":"on_rating_updated","rule":"New personal-best ratings; level at 1..10","unit":"personal_best_rating","levels":[1,2,3,4,5,6,7,8,9,10],"unlocks":"frame_upgrade"}'::jsonb
where code = 'new-heights';

-- breakthrough → removed (moving-target definition; superseded by new-heights)
update badges set active = false where code = 'breakthrough';

-- rising-floor → removed (per review)
update badges set active = false where code = 'rising-floor';

-- full-circle → copy fix: name the Mirror (the six-criterion growth radar)
update badges set
  description = 'Fill every axis of your Mirror radar to 100%.'
where code = 'full-circle';
