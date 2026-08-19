-- Fix: duel_sponsor became plpgsql (RETURNS TABLE named OUT params), so the final
-- SELECT's bare column names collide with the OUT params ("id is ambiguous").
-- Qualify with the CTE alias + tell plpgsql to prefer columns.
create or replace function public.duel_sponsor(p_viewer uuid default null, p_event text default null)
returns table (id uuid, name text, tagline text, video_url text, click_url text, min_seconds int, logo_url text, is_house boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_age text; v_state text; v_region text; v_rank text;
begin
  if p_viewer is not null then
    select age_bracket, state, region, rank into v_age, v_state, v_region, v_rank from nmao.competitor_segment(p_viewer);
  end if;
  return query
  with paid as (
    select ds.id, coalesce(sp.company_name, ds.name) as name, ds.tagline, ds.video_url, ds.click_url,
           ds.min_seconds, sp.logo_url, false as is_house, -ln(random()) / greatest(ds.weight, 1) as k
    from public.duel_sponsors ds
    join public.sponsors sp on sp.id = ds.sponsor_id
    join public.sponsor_entitlements e on e.sponsor_id = sp.id and e.offering_code = 'ad_space' and e.active
    where ds.active and ds.weight > 0 and coalesce(ds.video_url,'') <> '' and ds.approved_at is not null and sp.status = 'active'
      and (e.age_brackets = '{}' or (v_age    is not null and v_age    = any(e.age_brackets)))
      and (e.states       = '{}' or (v_state  is not null and v_state  = any(e.states)))
      and (e.regions      = '{}' or (v_region is not null and v_region = any(e.regions)))
      and (e.ranks        = '{}' or (v_rank   is not null and v_rank   = any(e.ranks)))
      and (e.events       = '{}' or (p_event  is not null and p_event  = any(e.events)))
  ),
  house as (
    select ds.id, ds.name, ds.tagline, ds.video_url, ds.click_url,
           ds.min_seconds, null::text as logo_url, true as is_house, -ln(random()) / greatest(ds.weight, 1) as k
    from public.duel_sponsors ds
    where ds.active and ds.weight > 0 and coalesce(ds.video_url,'') <> '' and ds.is_house
  ),
  pick as (select * from paid union all select * from house where not exists (select 1 from paid))
  select pick.id, pick.name, pick.tagline, pick.video_url, pick.click_url, pick.min_seconds, pick.logo_url, pick.is_house
  from pick order by pick.k limit 1;
end $$;
grant execute on function public.duel_sponsor(uuid, text) to anon, authenticated;
