-- ============================================================
-- Medal level ladders — bronze / silver / gold collector badges
-- CATALOG + LEVELS ONLY (no award engine, no border resolver yet).
--
-- Each medal color is a single tiered badge that levels on ACCUMULATED medals
-- of that color, tracked independently. Ladder (6 levels):
--     I=1  II=5  III=10  IV=25  V=50  VI=100
-- Level I is the "first" medal of that color; each new level is intended to
-- upgrade the equipped dueling frame/border (resolver deferred — see NOTE).
--
-- Reconciliation (per product decision):
--   • first-gold  → becomes the GOLD ladder (tiered, levels above). Code/art kept.
--   • first-bronze / first-silver → NEW ladders for their colors.
--   • gold-rush   → RETIRED (active=false); its 3/5 goldcount is superseded.
--   • first-medal → unchanged (still "first medal of ANY color", the intro moment).
--
-- Accrual source (for the future engine): count(medals) per competitor grouped
-- by medals.medal_type in ('gold','silver','bronze'). Thresholds live in
-- earn_rule.levels so they stay tunable without code; when the placement award
-- engine is built we can lift them into a config table like dueling_award_config.
--
-- NOTE (deferred, follow-up): the frame system today draws ONE border per badge
-- from badges.rarity (set_equipped_frame + duel_vote_queue). "Each level upgrades
-- the border" needs (a) per-level border art/specs in badge-frames.csv and
-- (b) a resolver that reads the competitor's highest earned tier for the equipped
-- badge. earn_rule.unlocks='frame_upgrade' flags these three for that work.
--
-- Idempotent: upserts keyed by code + plain updates. Re-running is a no-op.
-- ============================================================

-- GOLD ladder — reshape the existing first-gold milestone into the gold collector.
update badges set
  name        = 'Gold Path',
  tiered      = true,
  description = 'Earn gold medals — reach a new level at 1, 5, 10, 25, 50, and 100.',
  category    = 'Placement',
  sort_order  = 103,
  earn_rule   = '{"trigger":"on_medal_awarded","rule":"Accumulate gold medals (medals.medal_type=gold); level at 1/5/10/25/50/100","metal":"gold","levels":[1,5,10,25,50,100],"unlocks":"frame_upgrade"}'::jsonb
where code = 'first-gold';

-- BRONZE + SILVER ladders — new sibling collectors.
insert into badges (code, name, description, category, rarity, tiered, hidden, emblem_key, earn_rule, sort_order, active) values
  ('first-bronze', 'Bronze Path',
   'Earn bronze medals — reach a new level at 1, 5, 10, 25, 50, and 100.',
   'Placement', 'common', true, false, 'first-bronze',
   '{"trigger":"on_medal_awarded","rule":"Accumulate bronze medals (medals.medal_type=bronze); level at 1/5/10/25/50/100","metal":"bronze","levels":[1,5,10,25,50,100],"unlocks":"frame_upgrade"}'::jsonb,
   101, true),
  ('first-silver', 'Silver Path',
   'Earn silver medals — reach a new level at 1, 5, 10, 25, 50, and 100.',
   'Placement', 'uncommon', true, false, 'first-silver',
   '{"trigger":"on_medal_awarded","rule":"Accumulate silver medals (medals.medal_type=silver); level at 1/5/10/25/50/100","metal":"silver","levels":[1,5,10,25,50,100],"unlocks":"frame_upgrade"}'::jsonb,
   102, true)
on conflict (code) do update set
  name=excluded.name, description=excluded.description, category=excluded.category,
  rarity=excluded.rarity, tiered=excluded.tiered, hidden=excluded.hidden,
  emblem_key=excluded.emblem_key, earn_rule=excluded.earn_rule,
  sort_order=excluded.sort_order, active=excluded.active;

-- RETIRE gold-rush (superseded by the gold ladder above).
update badges set active = false where code = 'gold-rush';
