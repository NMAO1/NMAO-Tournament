-- RBAC (2026-09-25): allow the four preset roles on staff.role, and treat the
-- legacy 'organizer' role as all-access (like owner/admin) so no existing staff
-- is locked out. Presets: tournament, growth, designer, community.

alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role = any (array['owner','admin','organizer','tournament','growth','designer','community']));

create or replace function nmao.staff_caps_uid(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public, nmao as $$
declare r record; caps jsonb; k text; v text;
begin
  select role, coalesce(permissions, '{}'::jsonb) as permissions into r
    from public.staff where auth_user_id = p_uid;
  if not found then return '{}'::jsonb; end if;
  if r.role in ('owner','admin','organizer') then
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

-- staff_me() must also report owner for the legacy roles.
create or replace function public.staff_me()
returns jsonb language sql stable security definer set search_path = public, nmao as $$
  select case when not exists (select 1 from public.staff where auth_user_id = auth.uid())
    then null
    else jsonb_build_object(
      'role', (select role from public.staff where auth_user_id = auth.uid()),
      'is_owner', (select role in ('owner','admin','organizer') from public.staff where auth_user_id = auth.uid()),
      'caps', nmao.staff_caps_uid(auth.uid()))
  end;
$$;
