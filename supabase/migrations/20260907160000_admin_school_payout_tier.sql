-- Mission Control control for the per-school payout tier (decision 2026-09-07).
-- schools.payout_tier is a whole-number % — 15 base / 25 membership-or-accredited /
-- 35 membership-and-accredited. Accreditation is tracked on the membership platform,
-- so staff pick the tier by hand here. Two staff-gated definer RPCs back the UI.

-- List schools with their current tier + the context staff need to decide it.
create or replace function public.admin_schools_payout()
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'payout_tier', coalesce(s.payout_tier, 15),
      'membership_linked', (s.external_member_school_id is not null and s.external_member_school_id <> ''),
      'can_receive', (s.stripe_connect_account_id is not null and s.stripe_connect_account_id <> ''),
      'status', s.status
    ) order by s.name)
    from public.schools s
  ), '[]'::jsonb);
end $$;
grant execute on function public.admin_schools_payout() to authenticated, service_role;

-- Set one school's payout tier. Only 15 / 25 / 35 are valid (the three revenue-share tiers).
create or replace function public.admin_set_school_payout_tier(p_school uuid, p_tier int)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_name text;
begin
  perform public._require_staff();
  if p_tier not in (15, 25, 35) then
    raise exception 'Invalid tier % — must be 15, 25, or 35.', p_tier;
  end if;
  update public.schools set payout_tier = p_tier where id = p_school
  returning name into v_name;
  if v_name is null then
    raise exception 'School not found.';
  end if;
  return jsonb_build_object('ok', true, 'id', p_school, 'name', v_name, 'payout_tier', p_tier);
end $$;
grant execute on function public.admin_set_school_payout_tier(uuid, int) to authenticated, service_role;
