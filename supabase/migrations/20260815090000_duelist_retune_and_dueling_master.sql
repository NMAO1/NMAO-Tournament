-- ============================================================
-- #60 goal-keeper removed · #62 duelist re-tuned · NEW dueling-master.
--
--   #60 goal-keeper → REMOVED (active=false): no metric/area to set a goal against.
--
--   #62 duelist → thresholds 5/15/30 → 10/25/50. duelist is ENGINE-WIRED
--        (award_dueling_badges reads dueling_award_config), so this updates the
--        LIVE config keys → the engine awards at the new thresholds immediately.
--        Catalog description/earn_rule updated to match.
--
--   NEW dueling-master → elite continuation of the duelist grind:
--        duels completed, tiers at 100 / 150 / 200 / 250 / 500 / 1000.
--        CATALOG ONLY — the award engine does NOT yet grant it (needs an
--        award_dueling_badges block + config keys); deferred like the other
--        new ladders. earn_rule.levels documents the ladder meanwhile.
--
-- Idempotent: config UPDATEs + badge upsert + plain updates keyed by code.
-- ============================================================

-- #60 remove goal-keeper
update badges set active = false where code = 'goal-keeper';

-- #62 duelist → 10/25/50 (live config the engine reads)
update dueling_award_config set num = 10 where key = 'duelist_t1';
update dueling_award_config set num = 25 where key = 'duelist_t2';
update dueling_award_config set num = 50 where key = 'duelist_t3';

update badges set
  description = 'Complete 10, then 25, then 50 duels.',
  earn_rule   = '{"trigger":"on_duel_completed","rule":"Duels completed >= 10/25/50 (tier); thresholds live in dueling_award_config","levels":[10,25,50],"unlocks":"frame_upgrade"}'::jsonb
where code = 'duelist';

-- NEW dueling-master (catalog only; engine wiring deferred)
insert into badges (code, name, description, category, rarity, tiered, hidden, emblem_key, earn_rule, sort_order, active) values
  ('dueling-master', 'Dueling Master',
   'Complete 100, 150, 200, 250, 500, then 1,000 duels.',
   'Dueling', 'legendary', true, false, 'dueling-master',
   '{"trigger":"on_duel_completed","rule":"Duels completed; tiers at 100/150/200/250/500/1000","unit":"duels_fought","levels":[100,150,200,250,500,1000],"unlocks":"frame_upgrade"}'::jsonb,
   104, true)
on conflict (code) do update set
  name=excluded.name, description=excluded.description, category=excluded.category,
  rarity=excluded.rarity, tiered=excluded.tiered, hidden=excluded.hidden,
  emblem_key=excluded.emblem_key, earn_rule=excluded.earn_rule,
  sort_order=excluded.sort_order, active=excluded.active;
