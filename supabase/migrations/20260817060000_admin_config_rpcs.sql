-- ============================================================
--  Mission Control — tournament config admin RPCs.
--  Reads (authenticated) expose the reference tables; writes are
--  staff-gated via _require_staff(). Manages age brackets, event
--  types, and the active season's pod/division settings.
-- ============================================================

create or replace function public._require_staff()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from staff where auth_user_id = auth.uid()) then
    raise exception 'Not authorized — staff only';
  end if;
end $$;
revoke all on function public._require_staff() from public;

-- ---- reads -------------------------------------------------------------
create or replace function public.admin_age_brackets()
returns table (code text, label text, min_age int, max_age int)
language sql stable security definer set search_path = public as $$
  select code, label, min_age, max_age from age_brackets order by min_age
$$;
grant execute on function public.admin_age_brackets() to authenticated;

create or replace function public.admin_event_types()
returns table (code text, name text, discipline text, style text)
language sql stable security definer set search_path = public as $$
  select code, name, discipline, style from event_types order by discipline, style, name
$$;
grant execute on function public.admin_event_types() to authenticated;

create or replace function public.admin_pod_settings()
returns table (scheme_id uuid, version int, pod_cap int, pod_split_threshold int, pod_floor int, locked boolean, season_name text)
language sql stable security definer set search_path = public as $$
  select ds.id, ds.version, ds.pod_cap, ds.pod_split_threshold, ds.pod_floor, ds.locked, s.name
  from seasons s join division_schemes ds on ds.id = s.active_scheme_id
  where s.status = 'active' order by s.created_at desc limit 1
$$;
grant execute on function public.admin_pod_settings() to authenticated;

-- ---- writes (staff only) -----------------------------------------------
create or replace function public.admin_save_age_bracket(p_code text, p_label text, p_min int, p_max int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_staff();
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  insert into age_brackets (code, label, min_age, max_age)
  values (trim(p_code), p_label, p_min, p_max)
  on conflict (code) do update set label = excluded.label, min_age = excluded.min_age, max_age = excluded.max_age;
end $$;
grant execute on function public.admin_save_age_bracket(text, text, int, int) to authenticated;

create or replace function public.admin_delete_age_bracket(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin perform public._require_staff(); delete from age_brackets where code = p_code; end $$;
grant execute on function public.admin_delete_age_bracket(text) to authenticated;

create or replace function public.admin_save_event_type(p_code text, p_name text, p_discipline text, p_style text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_staff();
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  insert into event_types (code, name, discipline, style)
  values (trim(p_code), p_name, p_discipline, p_style)
  on conflict (code) do update set name = excluded.name, discipline = excluded.discipline, style = excluded.style;
end $$;
grant execute on function public.admin_save_event_type(text, text, text, text) to authenticated;

create or replace function public.admin_delete_event_type(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin perform public._require_staff(); delete from event_types where code = p_code; end $$;
grant execute on function public.admin_delete_event_type(text) to authenticated;

create or replace function public.admin_save_pod_settings(p_cap int, p_split int, p_floor int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_staff();
  update division_schemes ds set pod_cap = p_cap, pod_split_threshold = p_split, pod_floor = p_floor
  from seasons s
  where ds.id = s.active_scheme_id and s.status = 'active' and ds.locked = false;
  if not found then raise exception 'No editable active scheme (missing or locked)'; end if;
end $$;
grant execute on function public.admin_save_pod_settings(int, int, int) to authenticated;
