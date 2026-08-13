-- ============================================================
-- Batch-4 revisions (#31, #32, #37) — CATALOG + LEVELS ONLY.
--   #31 weapon-master → REDEFINED from "compete in every weapon event" to an
--        accumulation ladder of GOLD medals won in weapon events: 5/10/25/50.
--   #32 style-explorer → REDEFINED to "compete in 5 Traditional and 5 Open
--        events" (single threshold, lifetime; dropped the one-season constraint).
--   #37 undefeated → tiered CONSECUTIVE first-place streak: 5/10/25/50.
--        (Explicitly a streak per direction; top tiers are a cross-season chase.)
--
-- #33 (fearless) intentionally NOT touched here — the direction given describes a
-- duel-frequency badge, which conflicts with fearless's meaning; held for clarify.
-- #34 podium / #36 sweep remain one-time (unchanged).
--
-- Thresholds live in earn_rule; no award engine yet (deferred). Leveled badges
-- carry unlocks='frame_upgrade'. Idempotent UPDATEs keyed by code.
-- ============================================================

-- #31 weapon-master → weapon gold-medal ladder
update badges set
  tiered      = true,
  description = 'Win gold medals in weapon events — reach a new level at 5, 10, 25, and 50.',
  earn_rule   = '{"trigger":"on_medal_awarded","rule":"Gold medals won in weapon events; level at 5/10/25/50","metal":"gold","event_class":"weapon","unit":"weapon_gold","levels":[5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'weapon-master';

-- #32 style-explorer → 5 Traditional + 5 Open (single threshold)
update badges set
  tiered      = false,
  description = 'Compete in 5 Traditional events and 5 Open events.',
  earn_rule   = '{"trigger":"on_entry_submitted","rule":"At least 5 Traditional entries and 5 Open entries (lifetime)","need":{"traditional":5,"open":5}}'::jsonb
where code = 'style-explorer';

-- #37 undefeated → tiered consecutive first-place streak
update badges set
  tiered      = true,
  description = 'Win first place in consecutive rounds — reach a new level at streaks of 5, 10, 25, and 50.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Consecutive first-place finishes (placement=1); level at streaks of 5/10/25/50","unit":"win_streak","consecutive":true,"levels":[5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'undefeated';
