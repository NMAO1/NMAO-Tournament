-- ============================================================
-- New badges (10) — CATALOG ONLY. No award engine for any of these yet; several
-- also need NEW signals/triggers (noted per row). earn_rule.levels documents
-- ladders; unlocks='frame_upgrade' on the leveled ones.
--
--   Ladders:   ascent, seasons-veteran, underdog, oracle, superfan
--   Single:    clutch, flawless-victory, trendsetter
--   Hidden:    photo-finish, buzzer-beater  (refill the Hidden shelf)
--
-- Engine/signal dependencies to build later:
--   • trendsetter  → META hook: evaluate when ANY badge is awarded (school-first).
--   • superfan     → needs watch-time persisted (watch-to-vote meter completion).
--   • underdog/oracle/photo-finish/flawless-victory/clutch → derivable from
--     duels + duel_votes + duel_ratings (rating-at-duel-time, vote counts,
--     sudden-death flag) once the dueling engine is extended.
--   • ascent       → skill_ratings threshold; seasons-veteran → season participation.
--
-- Idempotent upsert keyed by code.
-- ============================================================

insert into badges (code, name, description, category, rarity, tiered, hidden, emblem_key, earn_rule, sort_order, active) values

  ('trendsetter', 'Trendsetter',
   'Be the first at your school to earn a rare or higher badge.',
   'Community', 'rare', false, false, 'trendsetter',
   '{"trigger":"on_badge_awarded","rule":"First competitor at your school to earn a rare-or-higher badge","scope":"school_first","min_rarity":"rare"}'::jsonb,
   105, true),

  ('photo-finish', 'Photo Finish',
   'Win a duel by a single vote.',
   'Hidden', 'uncommon', false, true, 'photo-finish',
   '{"trigger":"on_duel_completed","rule":"Win a duel decided by a 1-vote margin","margin":1}'::jsonb,
   106, true),

  ('buzzer-beater', 'Buzzer Beater',
   'Submit an entry in the final minute before a deadline.',
   'Hidden', 'uncommon', false, true, 'buzzer-beater',
   '{"trigger":"on_entry_submitted","rule":"Entry submitted within the final 60 seconds before the deadline","within_seconds":60}'::jsonb,
   107, true),

  ('superfan', 'Superfan',
   'Watch duels start to finish — reach a new level at 10, 25, 50, 100, and 250.',
   'Voting', 'uncommon', true, false, 'superfan',
   '{"trigger":"on_duel_vote_cast","rule":"Duels fully watched (watch-to-vote meter completed); tiers at 10/25/50/100/250","unit":"fully_watched_duels","levels":[10,25,50,100,250],"needs_signal":"watch_time","unlocks":"frame_upgrade"}'::jsonb,
   108, true),

  ('oracle', 'Oracle',
   'Vote for an underdog who goes on to win — reach a new level at 1, 5, 10, and 25.',
   'Voting', 'rare', true, false, 'oracle',
   '{"trigger":"on_duel_completed","rule":"Voted for the lower-rated duelist who then won; tiers at 1/5/10/25","unit":"underdog_correct_votes","levels":[1,5,10,25],"unlocks":"frame_upgrade"}'::jsonb,
   109, true),

  ('clutch', 'Clutch',
   'Win a duel in sudden death.',
   'Dueling', 'epic', false, false, 'clutch',
   '{"trigger":"on_duel_completed","rule":"Win a duel resolved in sudden death"}'::jsonb,
   110, true),

  ('flawless-victory', 'Flawless Victory',
   'Win a duel with every community vote.',
   'Dueling', 'epic', false, false, 'flawless-victory',
   '{"trigger":"on_duel_completed","rule":"Win a duel with 100% of the community vote","vote_share":1.0}'::jsonb,
   111, true),

  ('underdog', 'Underdog',
   'Win a duel as the lower-rated duelist — reach a new level at 1, 5, 10, and 25.',
   'Dueling', 'rare', true, false, 'underdog',
   '{"trigger":"on_duel_completed","rule":"Win a duel as the lower-rated duelist; tiers at 1/5/10/25","unit":"underdog_wins","levels":[1,5,10,25],"unlocks":"frame_upgrade"}'::jsonb,
   112, true),

  ('seasons-veteran', 'Seasons Veteran',
   'Compete across 2, 3, 5, then 7 seasons.',
   'Imprint', 'rare', true, false, 'seasons-veteran',
   '{"trigger":"on_season_rollup","rule":"Seasons competed in; tiers at 2/3/5/7","unit":"seasons_competed","levels":[2,3,5,7],"unlocks":"frame_upgrade"}'::jsonb,
   113, true),

  ('ascent', 'Ascent',
   'Reach a rating of 60, 70, 80, 90, then 95.',
   'Growth', 'rare', true, false, 'ascent',
   '{"trigger":"on_rating_updated","rule":"Reach an absolute rating of 60/70/80/90/95","unit":"rating_reached","levels":[60,70,80,90,95],"unlocks":"frame_upgrade"}'::jsonb,
   114, true)

on conflict (code) do update set
  name=excluded.name, description=excluded.description, category=excluded.category,
  rarity=excluded.rarity, tiered=excluded.tiered, hidden=excluded.hidden,
  emblem_key=excluded.emblem_key, earn_rule=excluded.earn_rule,
  sort_order=excluded.sort_order, active=excluded.active;
