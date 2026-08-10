-- =====================================================================
-- Reveal PREVIEW: make your latest result a 1st-place GOLD so you can see the
-- full medal ceremony (spin → swirl → shine → glow + fanfare + green ▲).
-- Temporary/cosmetic — re-running the real pipeline overwrites it. Edit email if needed.
-- =====================================================================
do $$
declare v_comp uuid; v_entry uuid; v_before numeric;
begin
  select id into v_comp from competitors
   where auth_user_id = (select id from auth.users where email = 'senseibradlemley@gmail.com') limit 1;

  select r.entry_id, (r.rating_after - coalesce(r.rating_delta,0))
    into v_entry, v_before
    from results r join entries e on e.id = r.entry_id
   where e.competitor_id = v_comp order by r.created_at desc limit 1;
  if v_entry is null then raise notice 'No result found — run a round first.'; return; end if;

  update results set placement = 1, rating_delta = 8, rating_after = v_before + 8 where entry_id = v_entry;

  delete from medals where entry_id = v_entry;
  insert into medals(round_id, competitor_id, entry_id, event, medal_type, placement)
    select e.round_id, e.competitor_id, e.id, e.event, 'gold', 1 from entries e where e.id = v_entry;

  raise notice 'Preview set: 1st + gold + rating %→%. Reload Home and tap the banner.', v_before, v_before + 8;
end $$;
