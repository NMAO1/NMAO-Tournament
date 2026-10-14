-- Raise the TOP payout tier 35 -> 40 (Brad decision 2026-10-14).
-- Ladder is now 15 / 25 / 40: base 15, +10 membership-linked, +10 accredited,
-- +5 when BOTH -- so only schools on the platform AND accredited reach the 40% top
-- ("up to 40%"). The stripe-webhook keeps reading schools.payout_tier unchanged.

-- 1) New ladder: both-tier schools now earn 40.
create or replace function public.derive_payout_tier(p_linked boolean, p_accredited boolean)
returns int language sql immutable as $$
  select 15
    + (case when p_linked then 10 else 0 end)
    + (case when p_accredited then 10 else 0 end)
    + (case when p_linked and p_accredited then 5 else 0 end);
$$;

-- 2) Allow 40 as a valid staff override (keep 35 so existing pins don't break).
alter table public.schools drop constraint if exists schools_payout_tier_override_ck;
alter table public.schools add constraint schools_payout_tier_override_ck
  check (payout_tier_override is null or payout_tier_override in (15, 25, 35, 40));

-- 3) Mission Control pin: allow 40 (keeps the live RBAC finance gate verbatim).
create or replace function public.admin_set_school_payout_tier(p_school uuid, p_tier integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_name text; v_tier int;
begin
  if not nmao.staff_can('finance') then raise exception 'Not authorized -- insufficient role.' using errcode = '42501'; end if;
  if p_tier not in (15, 25, 35, 40) then
    raise exception 'Invalid tier % -- must be 15, 25, 35, or 40.', p_tier;
  end if;
  update public.schools set payout_tier_override = p_tier where id = p_school
    returning name, payout_tier into v_name, v_tier;
  if v_name is null then raise exception 'School not found.'; end if;
  return jsonb_build_object('ok', true, 'id', p_school, 'name', v_name, 'payout_tier', v_tier, 'override', true);
end $function$;

-- 4) Recompute every school from the new rule. Auto both-tier schools rise 35 -> 40;
--    schools with an explicit override keep their pinned value.
update public.schools
  set payout_tier = coalesce(
    payout_tier_override,
    public.derive_payout_tier(
      external_member_school_id is not null and external_member_school_id <> '',
      coalesce(accredited, false)));
