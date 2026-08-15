-- ============================================================
--  Make Tournament Config the source of truth: edits to age
--  brackets / event types echo into the active season's division
--  scheme axes (which the pod/division engine reads). Rank tiers
--  live only in the scheme, so they're edited directly here.
--    axes[age].brackets   <- age_brackets
--    axes[event].values   <- event_types (codes)
--    axes[rank].tiers      <- edited via admin_save_scheme_ranks
--  Sync runs automatically after every bracket/event write, and can
--  be triggered manually. Locked schemes are left untouched.
-- ============================================================

create or replace function public.admin_sync_active_scheme()
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_locked boolean; v_axes jsonb; v_age jsonb; v_events jsonb;
begin
  perform public._require_staff();
  select ds.id, ds.locked, ds.axes into v_id, v_locked, v_axes
  from division_schemes ds join seasons s on ds.id = s.active_scheme_id
  where s.status = 'active' order by s.created_at desc limit 1;
  if v_id is null then return 'No active scheme'; end if;
  if v_locked then return 'Scheme locked — not synced'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('key', code, 'min', min_age, 'max', coalesce(max_age, 200)) order by min_age), '[]'::jsonb)
    into v_age from age_brackets;
  select coalesce(jsonb_agg(code order by discipline, style, name), '[]'::jsonb)
    into v_events from event_types;

  select jsonb_agg(
    case ax->>'key'
      when 'age'   then jsonb_set(ax, '{brackets}', v_age)
      when 'event' then jsonb_set(ax, '{values}',   v_events)
      else ax
    end)
    into v_axes from jsonb_array_elements(v_axes) ax;

  update division_schemes set axes = v_axes where id = v_id;
  return 'Synced to active scheme';
end $$;
grant execute on function public.admin_sync_active_scheme() to authenticated;

-- Rank tiers (source of truth is the scheme itself — no reference table).
create or replace function public.admin_save_scheme_ranks(p_tiers text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_locked boolean; v_axes jsonb;
begin
  perform public._require_staff();
  if p_tiers is null or array_length(p_tiers, 1) is null then raise exception 'At least one rank tier required'; end if;
  select ds.id, ds.locked, ds.axes into v_id, v_locked, v_axes
  from division_schemes ds join seasons s on ds.id = s.active_scheme_id
  where s.status = 'active' order by s.created_at desc limit 1;
  if v_id is null then raise exception 'No active scheme'; end if;
  if v_locked then raise exception 'Scheme is locked'; end if;
  select jsonb_agg(case when ax->>'key' = 'rank' then jsonb_set(ax, '{tiers}', to_jsonb(p_tiers)) else ax end)
    into v_axes from jsonb_array_elements(v_axes) ax;
  update division_schemes set axes = v_axes where id = v_id;
end $$;
grant execute on function public.admin_save_scheme_ranks(text[]) to authenticated;

-- Extend pod-settings read with the current rank tiers.
drop function if exists public.admin_pod_settings();
create or replace function public.admin_pod_settings()
returns table (scheme_id uuid, version int, pod_cap int, pod_split_threshold int, pod_floor int, locked boolean, season_name text, ranks text[])
language sql stable security definer set search_path = public as $$
  select ds.id, ds.version, ds.pod_cap, ds.pod_split_threshold, ds.pod_floor, ds.locked, s.name,
         array(select jsonb_array_elements_text(ax->'tiers') from jsonb_array_elements(ds.axes) ax where ax->>'key' = 'rank')
  from seasons s join division_schemes ds on ds.id = s.active_scheme_id
  where s.status = 'active' order by s.created_at desc limit 1
$$;
grant execute on function public.admin_pod_settings() to authenticated;

-- Re-create the config writers so each one echoes into the scheme afterwards.
create or replace function public.admin_save_age_bracket(p_code text, p_label text, p_min int, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_staff();
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  insert into age_brackets (code, label, min_age, max_age)
  values (trim(p_code), p_label, p_min, p_max)
  on conflict (code) do update set label = excluded.label, min_age = excluded.min_age, max_age = excluded.max_age;
  perform public.admin_sync_active_scheme();
end $$;

create or replace function public.admin_delete_age_bracket(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin perform public._require_staff(); delete from age_brackets where code = p_code; perform public.admin_sync_active_scheme(); end $$;

create or replace function public.admin_save_event_type(p_code text, p_name text, p_discipline text, p_style text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_staff();
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  insert into event_types (code, name, discipline, style)
  values (trim(p_code), p_name, p_discipline, p_style)
  on conflict (code) do update set name = excluded.name, discipline = excluded.discipline, style = excluded.style;
  perform public.admin_sync_active_scheme();
end $$;

create or replace function public.admin_delete_event_type(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin perform public._require_staff(); delete from event_types where code = p_code; perform public.admin_sync_active_scheme(); end $$;

-- App event filter now lists the CANONICAL events (event_types.name), so an event
-- added in Tournament Config (Musical Forms, Team Forms, …) appears in the app
-- immediately — even before any medal has been awarded in it.
create or replace function public.event_options()
returns table (event text)
language sql stable security definer set search_path = public as $$
  select name from event_types order by discipline, style, name
$$;
grant execute on function public.event_options() to authenticated;
