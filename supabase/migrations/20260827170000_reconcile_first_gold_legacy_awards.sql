-- Reconcile legacy binary first-gold awards (tier NULL, from the old evaluate_badges
-- block) with the new tier-'1' award produced by the medal-count ladder
-- (20260827160000). award_badge treats NULL and '1' as distinct tiers, so without
-- this every prior first-gold holder ends up with a duplicate row (and a spurious
-- re-reveal of an already-earned badge). One-shot forward migration.

-- 1) Where the ladder already created a tier-'1' row: carry the legacy row's `seen`
--    state onto it so an already-seen first-gold does not re-reveal, then drop the
--    now-redundant NULL-tier row.
update public.badge_awards a set seen = true
  from public.badge_awards leg
  where a.badge_code = 'first-gold' and a.tier = '1'
    and leg.badge_code = 'first-gold' and leg.tier is null
    and leg.competitor_id = a.competitor_id
    and leg.seen = true;

delete from public.badge_awards a
  where a.badge_code = 'first-gold' and a.tier is null
    and exists (
      select 1 from public.badge_awards b
      where b.competitor_id = a.competitor_id
        and b.badge_code = 'first-gold' and b.tier = '1'
    );

-- 2) Where only the legacy NULL-tier row exists (ladder hasn't run for them yet):
--    promote it in place to tier '1', preserving its `seen` state.
update public.badge_awards a set tier = '1'
  where a.badge_code = 'first-gold' and a.tier is null
    and not exists (
      select 1 from public.badge_awards b
      where b.competitor_id = a.competitor_id
        and b.badge_code = 'first-gold' and b.tier = '1'
    );
