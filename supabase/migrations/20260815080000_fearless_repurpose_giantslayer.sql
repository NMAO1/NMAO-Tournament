-- ============================================================
-- #33 fearless (REPURPOSED) + #44 giant-slayer (tiered) — CATALOG + LEVELS ONLY.
--
--   #33 fearless → repurposed from "enter an event outside your usual category"
--        into a DUEL-CONSISTENCY ladder: submit 5 duels/week, leveling on
--        ACCUMULATED qualifying months at 1 / 3 / 5 / 7 / 12 (not consecutive).
--        Moved to the Dueling category. Name is PROVISIONAL ("Relentless") —
--        "Fearless Challenger" no longer fits; confirm/replace.
--        ⚠ Overlaps iron-duelist (#69, "dueled every week for a month") — to be
--        reconciled when we review #69.
--
--   #44 giant-slayer → tiered by RATING GAP: beat an opponent rated >= 10 / 20 / 30
--        points above you (tier = the gap cleared, not a count).
--
-- Thresholds live in earn_rule; no award engine yet (deferred). Leveled badges
-- carry unlocks='frame_upgrade'. Idempotent UPDATEs keyed by code.
-- ============================================================

-- #33 fearless → duel-consistency ladder (repurposed)
update badges set
  name        = 'Relentless',
  category    = 'Dueling',
  rarity      = 'rare',
  tiered      = true,
  description = 'Submit 5 duels a week — reach a new level at 1, 3, 5, 7, and 12 months of keeping the pace.',
  earn_rule   = '{"trigger":"on_duel_completed","rule":"Months meeting the 5-duels/week pace; level at 1/3/5/7/12 accumulated qualifying months","quota_per_week":5,"unit":"qualifying_months","accumulative":true,"levels":[1,3,5,7,12],"unlocks":"frame_upgrade"}'::jsonb
where code = 'fearless';

-- #44 giant-slayer → tiered rating-gap upset
update badges set
  tiered      = true,
  description = 'Beat an opponent rated above you — reach a new level for rating gaps of 10, 20, and 30.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Beat an opponent rated at least X points higher; tiers at gaps of 10/20/30","unit":"rating_gap","levels":[10,20,30],"unlocks":"frame_upgrade"}'::jsonb
where code = 'giant-slayer';
