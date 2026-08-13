-- ============================================================
-- #65 peoples-champion + #66 road-warrior → tiered ladders. CATALOG ONLY.
--
--   #65 peoples-champion → win duels by an 80%+ community landslide, tiers at
--        3 / 10 / 25 / 50 landslide wins.
--   #66 road-warrior → duel opponents from distinct schools, tiers at
--        5 / 10 / 25 / 50 schools.
--
-- ⚠ Both are ENGINE-WIRED (award_dueling_badges) as SINGLE awards today. This
-- change defines the ladders in the catalog but does NOT update the engine, so
-- until a tiered engine block + config keys are added they will keep awarding a
-- single (untiered) badge — road-warrior's single fires at 5 (== tier 1), and
-- peoples-champion's single fires on the first landslide (below tier 1 = 3).
-- Bundled with the other deferred engine work (Dueling Master, etc.).
-- earn_rule.levels documents each ladder; unlocks='frame_upgrade' as usual.
--
-- Idempotent UPDATEs keyed by code.
-- ============================================================

update badges set
  tiered      = true,
  description = 'Win duels by an 80% or more community landslide — reach a new level at 3, 10, 25, and 50 wins.',
  earn_rule   = '{"trigger":"on_duel_completed","rule":"Landslide-vote wins (winner share >= landslide_pct); tiers at 3/10/25/50","unit":"landslide_wins","levels":[3,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'peoples-champion';

update badges set
  tiered      = true,
  description = 'Duel opponents from different schools — reach a new level at 5, 10, 25, and 50 schools.',
  earn_rule   = '{"trigger":"on_duel_completed","rule":"Distinct opponent schools dueled; tiers at 5/10/25/50","unit":"opponent_schools","levels":[5,10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'road-warrior';
