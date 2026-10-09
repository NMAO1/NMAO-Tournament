-- =====================================================================
-- TAOSD Founding Competitor — limited-edition school badge + Arena border.
-- Earned by The Art of Self Defense students who sign up for the inaugural
-- NMAO pre-season: an entry in the pre-season league round OR an entrant in a
-- TAOSD in-house tournament. The equipped badge renders the custom TAOSD
-- living-frame border on the app side (FRAME_SPECS key = 'taosd-founder').
-- Isolated award function + cron (no edit to nmao.evaluate_badges).
-- =====================================================================

insert into badges (code, name, title, description, category, rarity, tiered, hidden, emblem_key, active, sort_order)
values (
  'taosd-founder',
  'TAOSD Founding Competitor',
  'Founding Competitor',
  'Awarded to The Art of Self Defense students who entered the inaugural NMAO pre-season — a founding member of the dojo''s first class.',
  'Charter', 'legendary', false, false, 'taosd-founder', true, 0
)
on conflict (code) do update set
  name = excluded.name, title = excluded.title, description = excluded.description,
  category = excluded.category, rarity = excluded.rarity, emblem_key = excluded.emblem_key, active = true;

-- Award to every active TAOSD student who has signed up for the pre-season.
create or replace function nmao.award_taosd_founders()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record;
begin
  for r in
    select c.id as comp
    from competitors c
    where c.status = 'active'
      and c.school_id = 'dc2d4a01-9031-4eaa-b2ee-c62ef06d42da'::uuid
      and (
        exists (select 1 from entries e
                where e.competitor_id = c.id
                  and e.round_id = '5a63bf86-777b-494b-b6a0-c0294a0f2391'::uuid)
        or exists (select 1 from ih_entrants ie
                   join in_house_tournaments t on t.id = ie.tournament_id
                   where ie.competitor_id = c.id and t.school_id = c.school_id)
      )
  loop
    if nmao.award_badge(r.comp, 'taosd-founder') then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function nmao.award_taosd_founders() from public, anon;

-- Run every 5 minutes so a signup earns the badge almost immediately.
do $$ begin perform cron.unschedule('award-taosd-founders'); exception when others then null; end $$;
select cron.schedule('award-taosd-founders', '*/5 * * * *', $$select nmao.award_taosd_founders()$$);
