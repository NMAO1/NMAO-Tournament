-- ============================================================
--  Title sponsorship (offering: title_sponsor) — "Traditional Forms,
--  presented by ___" / "[Season], presented by ___".
--
--  A sponsor is attached to a SCOPE — the active season, or a specific event —
--  and their brand shows as "presented by" on that surface (starting with the
--  Arena's Tale of the Path). One title sponsor per scope+key. Gated on the
--  title_sponsor entitlement + sponsor active.
-- ============================================================

create table if not exists public.sponsor_titles (
  id          uuid primary key default gen_random_uuid(),
  sponsor_id  uuid not null references public.sponsors(id) on delete cascade,
  scope       text not null,               -- 'season' | 'event'
  scope_key   text not null,               -- season_id (text) | event code
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (scope, scope_key)                -- one title sponsor per scope+key
);
alter table public.sponsor_titles enable row level security;

-- ---- app: who presents the current season / a given event -------------------
create or replace function public.title_sponsor_season()
returns table (company_name text, logo_url text, tagline text)
language sql stable security definer set search_path = public as $$
  select sp.company_name, sp.logo_url, sp.tagline
  from public.sponsor_titles t
  join public.sponsors sp on sp.id = t.sponsor_id
  where t.active and t.scope = 'season'
    and t.scope_key = (select id::text from public.seasons where status = 'active' order by starts_at desc nulls last limit 1)
    and sp.status = 'active' and nmao.sponsor_has(sp.id, 'title_sponsor')
  limit 1;
$$;

create or replace function public.title_sponsor_event(p_event text)
returns table (company_name text, logo_url text, tagline text)
language sql stable security definer set search_path = public as $$
  select sp.company_name, sp.logo_url, sp.tagline
  from public.sponsor_titles t
  join public.sponsors sp on sp.id = t.sponsor_id
  where t.active and t.scope = 'event' and t.scope_key = p_event
    and sp.status = 'active' and nmao.sponsor_has(sp.id, 'title_sponsor')
  limit 1;
$$;

-- ---- staff: assign / list title sponsorships --------------------------------
create or replace function public.admin_set_title(p_sponsor uuid, p_scope text, p_key text, p_active boolean default true)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_key text;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  if p_scope not in ('season','event') then raise exception 'bad scope'; end if;
  v_key := case when p_scope = 'season'
                then (select id::text from public.seasons where status = 'active' order by starts_at desc nulls last limit 1)
                else nullif(p_key,'') end;
  if v_key is null then raise exception 'no active season / missing key'; end if;
  insert into public.sponsor_titles (sponsor_id, scope, scope_key, active)
  values (p_sponsor, p_scope, v_key, p_active)
  on conflict (scope, scope_key) do update set sponsor_id = excluded.sponsor_id, active = excluded.active;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  values (p_sponsor, 'title_sponsor', 'auto', true)
  on conflict (sponsor_id, offering_code) do update set active = true;
end $$;

create or replace function public.admin_list_titles(p_sponsor uuid)
returns table (scope text, scope_key text, active boolean, label text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select t.scope, t.scope_key, t.active,
      case when t.scope = 'season'
           then 'Season: ' || coalesce((select name from public.seasons where id::text = t.scope_key), '?')
           else 'Event: ' || t.scope_key end
    from public.sponsor_titles t where t.sponsor_id = p_sponsor order by t.scope, t.scope_key;
end $$;

grant execute on function public.title_sponsor_season() to anon, authenticated;
grant execute on function public.title_sponsor_event(text) to anon, authenticated;
grant execute on function public.admin_set_title(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_list_titles(uuid) to authenticated;
