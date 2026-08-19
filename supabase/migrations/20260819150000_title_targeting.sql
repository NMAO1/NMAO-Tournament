-- ============================================================
--  Regional title sponsorship — "NE Traditional Forms, presented by ___".
--  A title sponsorship can now target a segment (region / state / age), so many
--  sponsors present the same season/event, each to their own slice. The Arena
--  shows the sponsor matching the viewer; a segment-specific title beats a
--  national one. Uniqueness moves to (scope, scope_key, sponsor_id) so multiple
--  sponsors coexist per scope.
-- ============================================================

alter table public.sponsor_titles add column if not exists regions      text[] not null default '{}';
alter table public.sponsor_titles add column if not exists states       text[] not null default '{}';
alter table public.sponsor_titles add column if not exists age_brackets text[] not null default '{}';

alter table public.sponsor_titles drop constraint if exists sponsor_titles_scope_scope_key_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sponsor_titles_scope_key_sponsor') then
    alter table public.sponsor_titles add constraint sponsor_titles_scope_key_sponsor unique (scope, scope_key, sponsor_id);
  end if;
end $$;

-- drop the old (non-targeted) signatures so the new ones don't create ambiguous overloads
drop function if exists public.title_sponsor_season();
drop function if exists public.title_sponsor_event(text);
drop function if exists public.admin_set_title(uuid, text, text, boolean);
drop function if exists public.admin_list_titles(uuid);

-- who presents the current season / a given event FOR THIS VIEWER (best match wins)
create or replace function public.title_sponsor_season(p_viewer uuid default null)
returns table (company_name text, logo_url text, tagline text)
language plpgsql stable security definer set search_path = public as $$
declare v_age text; v_state text; v_region text;
begin
  if p_viewer is not null then select age_bracket, state, region into v_age, v_state, v_region from nmao.competitor_segment(p_viewer); end if;
  return query
    select sp.company_name, sp.logo_url, sp.tagline
    from public.sponsor_titles t
    join public.sponsors sp on sp.id = t.sponsor_id
    where t.active and t.scope = 'season'
      and t.scope_key = (select id::text from public.seasons where status = 'active' order by starts_at desc nulls last limit 1)
      and sp.status = 'active' and nmao.sponsor_has(sp.id, 'title_sponsor')
      and (t.regions = '{}'      or (v_region is not null and v_region = any(t.regions)))
      and (t.states = '{}'       or (v_state  is not null and v_state  = any(t.states)))
      and (t.age_brackets = '{}' or (v_age    is not null and v_age    = any(t.age_brackets)))
    order by (cardinality(t.regions) + cardinality(t.states) + cardinality(t.age_brackets)) desc
    limit 1;
end $$;

create or replace function public.title_sponsor_event(p_event text, p_viewer uuid default null)
returns table (company_name text, logo_url text, tagline text)
language plpgsql stable security definer set search_path = public as $$
declare v_age text; v_state text; v_region text;
begin
  if p_viewer is not null then select age_bracket, state, region into v_age, v_state, v_region from nmao.competitor_segment(p_viewer); end if;
  return query
    select sp.company_name, sp.logo_url, sp.tagline
    from public.sponsor_titles t
    join public.sponsors sp on sp.id = t.sponsor_id
    where t.active and t.scope = 'event' and t.scope_key = p_event
      and sp.status = 'active' and nmao.sponsor_has(sp.id, 'title_sponsor')
      and (t.regions = '{}'      or (v_region is not null and v_region = any(t.regions)))
      and (t.states = '{}'       or (v_state  is not null and v_state  = any(t.states)))
      and (t.age_brackets = '{}' or (v_age    is not null and v_age    = any(t.age_brackets)))
    order by (cardinality(t.regions) + cardinality(t.states) + cardinality(t.age_brackets)) desc
    limit 1;
end $$;

-- staff: assign a (optionally segment-targeted) title sponsorship
create or replace function public.admin_set_title(
  p_sponsor uuid, p_scope text, p_key text, p_active boolean default true,
  p_regions text[] default '{}', p_states text[] default '{}', p_ages text[] default '{}')
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_key text;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  if p_scope not in ('season','event') then raise exception 'bad scope'; end if;
  v_key := case when p_scope = 'season'
                then (select id::text from public.seasons where status = 'active' order by starts_at desc nulls last limit 1)
                else nullif(p_key,'') end;
  if v_key is null then raise exception 'no active season / missing key'; end if;
  insert into public.sponsor_titles (sponsor_id, scope, scope_key, active, regions, states, age_brackets)
  values (p_sponsor, p_scope, v_key, p_active, coalesce(p_regions,'{}'), coalesce(p_states,'{}'), coalesce(p_ages,'{}'))
  on conflict (scope, scope_key, sponsor_id) do update set
    active = excluded.active, regions = excluded.regions, states = excluded.states, age_brackets = excluded.age_brackets;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  values (p_sponsor, 'title_sponsor', 'auto', true)
  on conflict (sponsor_id, offering_code) do update set active = true;
end $$;

create or replace function public.admin_list_titles(p_sponsor uuid)
returns table (scope text, scope_key text, active boolean, label text, regions text[], states text[], age_brackets text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select t.scope, t.scope_key, t.active,
      case when t.scope = 'season'
           then 'Season: ' || coalesce((select name from public.seasons where id::text = t.scope_key), '?')
           else 'Event: ' || t.scope_key end,
      t.regions, t.states, t.age_brackets
    from public.sponsor_titles t where t.sponsor_id = p_sponsor order by t.scope, t.scope_key;
end $$;

grant execute on function public.title_sponsor_season(uuid) to anon, authenticated;
grant execute on function public.title_sponsor_event(text, uuid) to anon, authenticated;
grant execute on function public.admin_set_title(uuid, text, text, boolean, text[], text[], text[]) to authenticated;
grant execute on function public.admin_list_titles(uuid) to authenticated;
