-- ============================================================
-- New badge: redemption — CATALOG ONLY.
--   Beat an opponent who previously beat you in a duel. Single-award moment.
--   Build hook: duel history (a prior completed duel where this opponent won).
-- Idempotent upsert keyed by code.
-- ============================================================

insert into badges (code, name, description, category, rarity, tiered, hidden, emblem_key, earn_rule, sort_order, active) values
  ('redemption', 'Redemption',
   'Beat an opponent who has beaten you before.',
   'Dueling', 'rare', false, false, 'redemption',
   '{"trigger":"on_duel_completed","rule":"Win a duel against an opponent who previously beat you"}'::jsonb,
   115, true)
on conflict (code) do update set
  name=excluded.name, description=excluded.description, category=excluded.category,
  rarity=excluded.rarity, tiered=excluded.tiered, hidden=excluded.hidden,
  emblem_key=excluded.emblem_key, earn_rule=excluded.earn_rule,
  sort_order=excluded.sort_order, active=excluded.active;
