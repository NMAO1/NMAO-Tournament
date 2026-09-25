-- RBAC Phase 3 (2026-09-25): owner Team management + overview aggregator.
-- All gated on the owner-only `team` slice (staff_can('team')). The invite/
-- create-account flow lives in the team-invite-staff EF (needs the auth admin API).

-- List staff for the Team page.
create or replace function public.team_list_staff()
returns table(id uuid, first_name text, last_name text, email text, role text,
              permissions jsonb, auth_user_id uuid, created_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = public, nmao as $$
begin
  if not nmao.staff_can('team') then raise exception 'owner only' using errcode = '42501'; end if;
  return query
  select s.id, s.first_name, s.last_name, s.email, s.role, coalesce(s.permissions,'{}'::jsonb),
         s.auth_user_id, s.created_at, (s.auth_user_id = auth.uid())
  from public.staff s order by (s.role in ('owner','admin','organizer')) desc, s.created_at;
end $$;
revoke all on function public.team_list_staff() from public, anon;
grant execute on function public.team_list_staff() to authenticated;

-- Change a staffer's role and/or per-person overrides. Guards against locking
-- yourself out of the owner seat.
create or replace function public.team_set_role(p_staff_id uuid, p_role text, p_permissions jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public, nmao as $$
declare v_target record;
begin
  if not nmao.staff_can('team') then raise exception 'owner only' using errcode = '42501'; end if;
  if p_role not in ('owner','admin','organizer','tournament','growth','designer','community') then
    raise exception 'invalid role: %', p_role using errcode = '22023';
  end if;
  select auth_user_id, role into v_target from public.staff where id = p_staff_id;
  if not found then raise exception 'no such staff' using errcode = 'P0002'; end if;
  -- Don't let an owner demote their own account (self-lockout guard).
  if v_target.auth_user_id = auth.uid() and p_role not in ('owner','admin','organizer') then
    raise exception 'You cannot remove your own owner access.' using errcode = 'P0001';
  end if;
  update public.staff set role = p_role, permissions = coalesce(p_permissions,'{}'::jsonb) where id = p_staff_id;
  return true;
end $$;
revoke all on function public.team_set_role(uuid, text, jsonb) from public, anon;
grant execute on function public.team_set_role(uuid, text, jsonb) to authenticated;

-- Remove a staffer (deletes the staff row; the auth login is left intact but is
-- no longer staff). Can't remove yourself.
create or replace function public.team_remove_staff(p_staff_id uuid)
returns boolean language plpgsql security definer set search_path = public, nmao as $$
declare v_uid uuid;
begin
  if not nmao.staff_can('team') then raise exception 'owner only' using errcode = '42501'; end if;
  select auth_user_id into v_uid from public.staff where id = p_staff_id;
  if v_uid = auth.uid() then raise exception 'You cannot remove yourself.' using errcode = 'P0001'; end if;
  delete from public.staff where id = p_staff_id;
  return found;
end $$;
revoke all on function public.team_remove_staff(uuid) from public, anon;
grant execute on function public.team_remove_staff(uuid) to authenticated;

-- Owner overview: one call, the key number per area for the oversight home.
create or replace function public.owner_overview()
returns jsonb language plpgsql stable security definer set search_path = public, nmao as $$
begin
  if not nmao.staff_can('team') then raise exception 'owner only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'round', (select jsonb_build_object('seq', seq, 'state', state)
              from public.rounds where coalesce(seq,0) < 900 order by opens_at desc nulls last limit 1),
    'pending_schools', (select count(*) from public.schools
              where coalesce(review_status,'pending') = 'pending' and coalesce(is_test,false) = false),
    'open_reports', (select count(*) from public.duels where moderation_status = 'under_review'),
    'reports_overdue', (select count(*) from public.duels
              where moderation_status = 'under_review' and created_at < now() - interval '24 hours'),
    'social_pending', (select count(*) from public.social_posts where status = 'pending'),
    'new_schools_30d', (select count(*) from public.schools
              where created_at > now() - interval '30 days' and coalesce(email_verified,false)
                and coalesce(is_test,false) = false),
    'staff_count', (select count(*) from public.staff)
  );
end $$;
revoke all on function public.owner_overview() from public, anon;
grant execute on function public.owner_overview() to authenticated;
