-- RBAC foundation (2026-09-25): capabilities-with-presets for Mission Control.
-- See the "Mission Control Role Access Plan" doc. Twelve capability slices; a
-- role is a preset bundle; per-person overrides live in staff.permissions
-- ({grant:[], revoke:[], reduced:{slice:level}}). owner/admin => all slices.
-- Enforcement is backend-first: staff_can()/staff_can_uid() gate the sensitive
-- RPCs and EFs; staff_me() feeds the UI. This migration only adds the helpers
-- (nothing is gated yet — existing owner/admin staff keep full access).

-- Preset bundle per role. Levels: full | triage | oversee | upload.
create or replace function nmao.staff_preset(p_role text)
returns jsonb language sql immutable as $$
  select case p_role
    when 'tournament' then '{"rounds":"full","judges":"full","fulfillment":"full","moderation":"full","schools":"full"}'::jsonb
    when 'growth'     then '{"schools":"full","sponsors":"full","social":"oversee","ambassadors":"full"}'::jsonb
    when 'designer'   then '{"badges":"full","social":"upload"}'::jsonb
    when 'community'  then '{"moderation":"triage","schools":"triage","social":"full"}'::jsonb
    else '{}'::jsonb
  end;
$$;

-- Effective capabilities for a user: preset(role) + grant - revoke, reduced applied.
-- owner/admin short-circuit to every slice at full.
create or replace function nmao.staff_caps_uid(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public, nmao as $$
declare r record; caps jsonb; k text; v text;
begin
  select role, coalesce(permissions, '{}'::jsonb) as permissions into r
    from public.staff where auth_user_id = p_uid;
  if not found then return '{}'::jsonb; end if;
  if r.role in ('owner','admin') then
    return jsonb_build_object(
      'rounds','full','judges','full','fulfillment','full','moderation','full',
      'schools','full','sponsors','full','social','full','ambassadors','full',
      'badges','full','config','full','finance','full','team','full');
  end if;
  caps := nmao.staff_preset(r.role);
  if r.permissions ? 'grant' then
    for k in select jsonb_array_elements_text(r.permissions->'grant') loop
      caps := caps || jsonb_build_object(k, 'full');
    end loop;
  end if;
  if r.permissions ? 'revoke' then
    for k in select jsonb_array_elements_text(r.permissions->'revoke') loop
      caps := caps - k;
    end loop;
  end if;
  if r.permissions ? 'reduced' then
    for k, v in select key, value from jsonb_each_text(r.permissions->'reduced') loop
      if caps ? k then caps := caps || jsonb_build_object(k, v); end if;
    end loop;
  end if;
  return caps;
end $$;

-- Does the user hold p_slice at >= p_level? 'view' = any grant; 'full' = full only;
-- a reduced level (triage/oversee/upload) is satisfied by that same level or full.
create or replace function nmao.staff_can_uid(p_uid uuid, p_slice text, p_level text default 'full')
returns boolean language plpgsql stable security definer set search_path = public, nmao as $$
declare held text;
begin
  held := nmao.staff_caps_uid(p_uid) ->> p_slice;
  if held is null then return false; end if;
  if held = 'full' then return true; end if;
  if p_level = 'view' then return true; end if;
  return held = p_level;
end $$;

-- Convenience wrapper for RPCs (uses the caller's auth.uid()).
create or replace function nmao.staff_can(p_slice text, p_level text default 'full')
returns boolean language sql stable security definer set search_path = public, nmao as $$
  select nmao.staff_can_uid(auth.uid(), p_slice, p_level);
$$;

-- UI bootstrap: the caller's role, owner flag, and effective capabilities.
create or replace function public.staff_me()
returns jsonb language sql stable security definer set search_path = public, nmao as $$
  select case when not exists (select 1 from public.staff where auth_user_id = auth.uid())
    then null
    else jsonb_build_object(
      'role', (select role from public.staff where auth_user_id = auth.uid()),
      'is_owner', (select role in ('owner','admin') from public.staff where auth_user_id = auth.uid()),
      'caps', nmao.staff_caps_uid(auth.uid()))
  end;
$$;

grant execute on function nmao.staff_can(text, text) to authenticated, service_role;
grant execute on function nmao.staff_can_uid(uuid, text, text) to authenticated, service_role;
grant execute on function nmao.staff_caps_uid(uuid) to authenticated, service_role;
grant execute on function nmao.staff_preset(text) to authenticated, service_role;
grant execute on function public.staff_me() to authenticated, service_role;
