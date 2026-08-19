-- Staff reader for HOUSE ads (NMAO's own promos: is_house = true, sponsor_id NULL).
-- admin_sponsor_ads(p_sponsor) filters by sponsor_id and can't return NULL-sponsor
-- rows, so Mission Control lists house ads through this instead.
create or replace function public.admin_house_ads()
returns setof public.duel_sponsors
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.duel_sponsors where is_house order by created_at desc;
end $$;

grant execute on function public.admin_house_ads() to authenticated;
