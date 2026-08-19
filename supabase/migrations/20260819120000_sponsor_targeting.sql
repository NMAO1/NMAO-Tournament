-- ============================================================
--  Sponsor TARGETING (Phase ②) — segmented inventory for national scale.
--
--  A sponsorship (a granted entitlement) can target a SEGMENT across four
--  dimensions: age bracket × location (region + state) × event × rank. Empty =
--  "all / national". Serving matches the viewing competitor's segment → sponsor,
--  so many sponsors coexist (a national brand + N regional brands each own a
--  slice). Shared placements (ads) rotate among matches; price scales with reach.
--
--  This pass wires targeting into the flagship surface (Arena ads) + gives staff
--  the controls + a reach estimate. Other surfaces adopt the same match helper
--  incrementally.
-- ============================================================

-- ---- location model ---------------------------------------------------------
alter table public.schools add column if not exists state  text;   -- 2-letter US
alter table public.schools add column if not exists region text;   -- optional override; else derived from state

-- US state → region (5-region grouping). Feeds targeting when a school has a state.
create or replace function nmao.region_of(p_state text)
returns text language sql immutable as $$
  select case
    when upper(coalesce(p_state,'')) = any(array['CT','ME','MA','NH','RI','VT','NJ','NY','PA']) then 'Northeast'
    when upper(p_state) = any(array['DE','MD','DC','VA','WV','NC','SC','GA','FL','KY','TN','AL','MS','AR','LA']) then 'Southeast'
    when upper(p_state) = any(array['OH','MI','IN','WI','IL','MN','IA','MO','ND','SD','NE','KS']) then 'Midwest'
    when upper(p_state) = any(array['TX','OK','NM','AZ']) then 'Southwest'
    when upper(p_state) = any(array['CO','WY','MT','ID','UT','NV','CA','OR','WA','AK','HI']) then 'West'
    else null end;
$$;

-- ---- targeting on each granted entitlement ----------------------------------
alter table public.sponsor_entitlements add column if not exists age_brackets text[] not null default '{}';
alter table public.sponsor_entitlements add column if not exists states       text[] not null default '{}';
alter table public.sponsor_entitlements add column if not exists regions      text[] not null default '{}';
alter table public.sponsor_entitlements add column if not exists events       text[] not null default '{}';
alter table public.sponsor_entitlements add column if not exists ranks        text[] not null default '{}';

-- ---- a competitor's segment -------------------------------------------------
create or replace function nmao.competitor_segment(p_competitor uuid)
returns table (age_bracket text, state text, region text, rank text)
language sql stable security definer set search_path = public as $$
  select nmao.age_bracket_of(c.dob), s.state, coalesce(s.region, nmao.region_of(s.state)), c.declared_rank
  from competitors c left join schools s on s.id = c.school_id where c.id = p_competitor;
$$;

-- ---- Arena ads, now targeting-aware -----------------------------------------
-- Adds optional viewer + event so paid ads match the viewer's segment; national
-- ads (all targeting empty) always match. Return columns unchanged.
drop function if exists public.duel_sponsor();
create function public.duel_sponsor(p_viewer uuid default null, p_event text default null)
returns table (id uuid, name text, tagline text, video_url text, click_url text, min_seconds int, logo_url text, is_house boolean)
language plpgsql stable security definer set search_path = public as $$
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
  select id, name, tagline, video_url, click_url, min_seconds, logo_url, is_house from pick order by k limit 1;
end $$;
grant execute on function public.duel_sponsor(uuid, text) to anon, authenticated;

-- ---- staff: set an entitlement's targeting + estimate reach ------------------
create or replace function public.admin_set_entitlement_targeting(
  p_sponsor uuid, p_offering text, p_age text[], p_states text[], p_regions text[], p_events text[], p_ranks text[])
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  update public.sponsor_entitlements set
    age_brackets = coalesce(p_age, '{}'), states = coalesce(p_states, '{}'),
    regions = coalesce(p_regions, '{}'), events = coalesce(p_events, '{}'), ranks = coalesce(p_ranks, '{}')
  where sponsor_id = p_sponsor and offering_code = p_offering;
end $$;
grant execute on function public.admin_set_entitlement_targeting(uuid, text, text[], text[], text[], text[], text[]) to authenticated;

-- competitors matching a segment (events excluded — reach = audience size)
create or replace function public.admin_segment_reach(p_age text[], p_states text[], p_regions text[], p_ranks text[])
returns int language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  select count(*)::int into n from public.competitors c
    left join public.schools s on s.id = c.school_id
  where c.status = 'active' and coalesce(c.dueling_enabled, false)
    and (coalesce(p_age,'{}')     = '{}' or nmao.age_bracket_of(c.dob) = any(p_age))
    and (coalesce(p_states,'{}')  = '{}' or s.state = any(p_states))
    and (coalesce(p_regions,'{}') = '{}' or coalesce(s.region, nmao.region_of(s.state)) = any(p_regions))
    and (coalesce(p_ranks,'{}')   = '{}' or c.declared_rank = any(p_ranks));
  return n;
end $$;
grant execute on function public.admin_segment_reach(text[], text[], text[], text[]) to authenticated;

-- ---- entitlements list now carries targeting (for the MC editor) ------------
drop function if exists public.admin_sponsor_entitlements(uuid);
create function public.admin_sponsor_entitlements(p_sponsor uuid)
returns table (code text, name text, category text, live boolean, has boolean, source text, sort_order int,
               age_brackets text[], states text[], regions text[], events text[], ranks text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select o.code, o.name, o.category, o.live, coalesce(e.active, false), e.source, o.sort_order,
      coalesce(e.age_brackets,'{}'), coalesce(e.states,'{}'), coalesce(e.regions,'{}'), coalesce(e.events,'{}'), coalesce(e.ranks,'{}')
    from public.sponsor_offerings o
    left join public.sponsor_entitlements e on e.offering_code = o.code and e.sponsor_id = p_sponsor
    where o.active order by o.sort_order;
end $$;
grant execute on function public.admin_sponsor_entitlements(uuid) to authenticated;
