-- ============================================================
-- Dueling/Voting leveling pass (#68, #73–77) — CATALOG ONLY.
-- All of these are ENGINE-WIRED (award_dueling_badges + dueling_award_config);
-- this defines the ladders/rules in the catalog but does NOT update the engine.
-- Until the engine + config are extended, awarding stays at today's behavior.
-- Bundled with the other deferred engine work. earn_rule.levels documents each.
--
--   #68 undefeated-duelist → tiered win-streak-with-no-losses: 5/10/25/50/100
--   #73 voice-of-the-people → extend votes-cast ladder to 25/100/500/1000/5000
--   #74 daily-voter → tiered consecutive vote-day streak: 5/10/25/50/100
--   #75 sharp-eye → tiered by qualified votes at >=70% winner-accuracy:
--        10/25/50/100/250
--   #76 kingmaker → REDEFINED to "cast the last vote for the duel's winner",
--        tiered 5/10/25/50/100 (was: deciding vote by margin)
--   #77 fair-witness → RENAMED "Honorable Witness"; new rule: pick the duel
--        winner MORE THAN 85% of the time — REVOCABLE (lost if you drop below).
--        ⚠ Two novel notes: (a) revocation is a NEW mechanic (no other badge is
--        lost once earned) — needs engine support to DEACTIVATE on drop, not just
--        insert. (b) min_qualified=10 is a provisional sample floor (else 1/1=100%
--        qualifies) — confirm. (c) overlaps trusted-voter (#78, 85%/50) — reconcile
--        when we review #78.
--
-- Idempotent UPDATEs keyed by code.
-- ============================================================

-- #68 undefeated-duelist → tiered clean-record win streak
update badges set
  tiered      = true,
  description = 'Win duels with a spotless record — reach a new level at streaks of 5, 10, 25, 50, and 100.',
  earn_rule   = '{"trigger":"on_duel_completed","rule":"Win streak with zero losses; tiers at 5/10/25/50/100","unit":"win_streak_no_loss","levels":[5,10,25,50,100],"unlocks":"frame_upgrade"}'::jsonb
where code = 'undefeated-duelist';

-- #73 voice-of-the-people → extended votes-cast ladder
update badges set
  description = 'Cast 25, 100, 500, 1,000, then 5,000 votes.',
  earn_rule   = '{"trigger":"on_duel_vote_cast","rule":"Votes cast; tiers at 25/100/500/1000/5000 (t1-t3 live in dueling_award_config)","levels":[25,100,500,1000,5000],"unlocks":"frame_upgrade"}'::jsonb
where code = 'voice-of-the-people';

-- #74 daily-voter → tiered consecutive vote-day streak
update badges set
  tiered      = true,
  description = 'Vote on consecutive days — reach a new level at streaks of 5, 10, 25, 50, and 100.',
  earn_rule   = '{"trigger":"on_duel_vote_cast","rule":"Consecutive voting-day streak; tiers at 5/10/25/50/100","unit":"vote_day_streak","levels":[5,10,25,50,100],"unlocks":"frame_upgrade"}'::jsonb
where code = 'daily-voter';

-- #75 sharp-eye → tiered by volume at the 70% winner-accuracy bar
update badges set
  tiered      = true,
  description = 'Pick the winning side in 70% or more of your votes — reach a new level at 10, 25, 50, 100, and 250 votes.',
  earn_rule   = '{"trigger":"on_duel_completed","rule":"Winner-accuracy >= 0.70 sustained; tiers by qualified votes at 10/25/50/100/250","accuracy_min":0.70,"unit":"qualified_votes","levels":[10,25,50,100,250],"unlocks":"frame_upgrade"}'::jsonb
where code = 'sharp-eye';

-- #76 kingmaker → redefined to "last vote for the winner", tiered
update badges set
  tiered      = true,
  description = 'Cast the final vote for a duel''s winner — reach a new level at 5, 10, 25, 50, and 100 times.',
  earn_rule   = '{"trigger":"on_duel_completed","rule":"Times you cast the last vote for the eventual winner; tiers at 5/10/25/50/100","unit":"last_vote_for_winner","levels":[5,10,25,50,100],"unlocks":"frame_upgrade"}'::jsonb
where code = 'kingmaker';

-- #77 fair-witness → Honorable Witness (revocable accuracy status)
update badges set
  name        = 'Honorable Witness',
  description = 'Pick the duel winner more than 85% of the time. Drop below and you lose it.',
  earn_rule   = '{"trigger":"on_duel_completed","rule":"Winner-accuracy > 0.85; REVOCABLE (lost if accuracy falls below 0.85)","accuracy_min":0.85,"revocable":true,"min_qualified":10,"unlocks":"frame_upgrade"}'::jsonb
where code = 'fair-witness';
