-- ============================================================
-- Mastery-criterion badges (#21–26) — CATALOG + LEVELS ONLY.
-- Reshaped from "high [criterion] across N CONSECUTIVE rounds" into an
-- ACCUMULATION ladder (a 50-consecutive streak is impossible in a 9-round
-- season, and this matches the Path pattern):
--     each level = ROUNDS scoring ABOVE 85 in that criterion, accumulated.
--     ladder: 1 / 5 / 10 / 25 / 50   ·   "high" = criterion score > 85
--
--   precision  → Technical      kime      → Power
--   rooted     → Balance         flow      → Timing
--   spirit     → Spirit          innovator → Difficulty
--
-- Thresholds + "high" bar live in earn_rule (tunable, machine-readable); no
-- mastery award engine yet — deferred like the other ladders. Leveled badges
-- carry earn_rule.unlocks='frame_upgrade' for the future border resolver.
--
-- Idempotent: plain UPDATEs keyed by code. tiered already true; reaffirmed.
-- Criterion wording is provisional (user note: "…or something alike") — trivially
-- re-editable if the labels should change.
-- ============================================================

update badges set
  tiered      = true,
  description = 'Score above 85 in Technical — reach a new level at 1, 5, 10, 25, and 50 rounds.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Rounds scoring above 85 in Technical; level at 1/5/10/25/50","criterion":"technical","high_above":85,"unit":"high_rounds","levels":[1,5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'precision';

update badges set
  tiered      = true,
  description = 'Score above 85 in Power — reach a new level at 1, 5, 10, 25, and 50 rounds.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Rounds scoring above 85 in Power; level at 1/5/10/25/50","criterion":"power","high_above":85,"unit":"high_rounds","levels":[1,5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'kime';

update badges set
  tiered      = true,
  description = 'Score above 85 in Balance — reach a new level at 1, 5, 10, 25, and 50 rounds.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Rounds scoring above 85 in Balance; level at 1/5/10/25/50","criterion":"balance","high_above":85,"unit":"high_rounds","levels":[1,5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'rooted';

update badges set
  tiered      = true,
  description = 'Score above 85 in Timing — reach a new level at 1, 5, 10, 25, and 50 rounds.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Rounds scoring above 85 in Timing; level at 1/5/10/25/50","criterion":"timing","high_above":85,"unit":"high_rounds","levels":[1,5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'flow';

update badges set
  tiered      = true,
  description = 'Score above 85 in Spirit — reach a new level at 1, 5, 10, 25, and 50 rounds.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Rounds scoring above 85 in Spirit; level at 1/5/10/25/50","criterion":"spirit","high_above":85,"unit":"high_rounds","levels":[1,5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'spirit';

update badges set
  tiered      = true,
  description = 'Score above 85 in Difficulty — reach a new level at 1, 5, 10, 25, and 50 rounds.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Rounds scoring above 85 in Difficulty; level at 1/5/10/25/50","criterion":"difficulty","high_above":85,"unit":"high_rounds","levels":[1,5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'innovator';
