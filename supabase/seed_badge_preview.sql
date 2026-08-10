-- =====================================================================
-- Preview the BADGE-UNLOCK reveal: create two sample badges + award them
-- (unseen) to your competitor. After a result reveal, the Continue button
-- becomes "See what you unlocked →" and shows the badges.
-- emblem_key is left NULL so the rarity-gradient FALLBACK disc renders (upload
-- real art to the badge-emblems bucket + set emblem_key to see your dragons).
-- Cleanup at the bottom. Edit email if needed.
-- =====================================================================
insert into badges (code, name, description, category, rarity, emblem_key, active) values
  ('first_step', 'First Step', 'Submitted your first competition entry.', 'milestone', 'uncommon', null, true),
  ('perfect_season_champion', 'Perfect-Season Champion', 'Won every round in a season. A legend is forged.', 'championship', 'legendary', null, true)
on conflict (code) do update set name = excluded.name, description = excluded.description, rarity = excluded.rarity;

insert into badge_awards (competitor_id, badge_code, tier, seen)
select c.id, b.code, null, false
from competitors c
cross join (values ('first_step'), ('perfect_season_champion')) as b(code)
where c.auth_user_id = (select id from auth.users where email = 'senseibradlemley@gmail.com')
on conflict (competitor_id, badge_code, tier) do update set seen = false;

select b.name, b.rarity, ba.seen
from badge_awards ba join badges b on b.code = ba.badge_code
where ba.competitor_id = (select id from competitors where auth_user_id = (select id from auth.users where email = 'senseibradlemley@gmail.com'));

-- CLEANUP:  delete from badge_awards using competitors c where badge_awards.competitor_id=c.id
--             and c.auth_user_id=(select id from auth.users where email='senseibradlemley@gmail.com');
--           delete from badges where code in ('first_step','perfect_season_champion');
