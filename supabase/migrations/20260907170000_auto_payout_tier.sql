-- AUTO-DERIVED payout tier (decision 2026-09-07). The tier follows two facts:
--   • membership-linked  = school.external_member_school_id is set (on the Membership Platform)
--   • accredited         = school.accredited (synced from the Membership Platform)
-- Rule: base 15, +10 for membership, +10 for accreditation → 15 / 25 / 35.
-- The tier is a DERIVED, trigger-maintained column. Staff can still pin an explicit
-- OVERRIDE (payout_tier_override) that wins over the derived value; clearing it reverts
-- to auto. The webhook keeps reading schools.payout_tier exactly as before.

alter table public.schools add column if not exists accredited boolean not null default false;
alter table public.schools add column if not exists payout_tier_override int;

alter table public.schools drop constraint if exists schools_payout_tier_override_ck;
alter table public.schools add constraint schools_payout_tier_override_ck
  check (payout_tier_override is null or payout_tier_override in (15, 25, 35));

-- Pure rule: two booleans → tier.
create or replace function public.derive_payout_tier(p_linked boolean, p_accredited boolean)
returns int language sql immutable as $$
  select 15 + (case when p_linked then 10 else 0 end) + (case when p_accredited then 10 else 0 end);
$$;

-- Keep payout_tier in lock-step with (membership-linked, accredited, override).
create or replace function public.schools_apply_payout_tier()
returns trigger language plpgsql as $$
declare v_linked boolean;
begin
  v_linked := (new.external_member_school_id is not null and new.external_member_school_id <> '');
  new.payout_tier := coalesce(
    new.payout_tier_override,
    public.derive_payout_tier(v_linked, coalesce(new.accredited, false)));
  return new;
end $$;

drop trigger if exists trg_schools_payout_tier on public.schools;
create trigger trg_schools_payout_tier
  before insert or update of external_member_school_id, accredited, payout_tier_override
  on public.schools
  for each row execute function public.schools_apply_payout_tier();

-- Preserve any current hand-set deviation as an explicit override (so nothing changes
-- unexpectedly for a school staff already tuned), then backfill everyone from the rule.
update public.schools
  set payout_tier_override = payout_tier
  where payout_tier_override is null
    and payout_tier in (15, 25, 35)
    and payout_tier <> public.derive_payout_tier(
          external_member_school_id is not null and external_member_school_id <> '',
          coalesce(accredited, false));

update public.schools
  set payout_tier = coalesce(
    payout_tier_override,
    public.derive_payout_tier(
      external_member_school_id is not null and external_member_school_id <> '',
      coalesce(accredited, false)));

-- ---- Mission Control RPCs (supersede 20260907160000) ----

-- Setting a tier from Mission Control now writes an OVERRIDE that wins over auto.
create or replace function public.admin_set_school_payout_tier(p_school uuid, p_tier int)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_name text; v_tier int;
begin
  perform public._require_staff();
  if p_tier not in (15, 25, 35) then
    raise exception 'Invalid tier % — must be 15, 25, or 35.', p_tier;
  end if;
  update public.schools set payout_tier_override = p_tier where id = p_school
    returning name, payout_tier into v_name, v_tier;
  if v_name is null then raise exception 'School not found.'; end if;
  return jsonb_build_object('ok', true, 'id', p_school, 'name', v_name, 'payout_tier', v_tier, 'override', true);
end $$;
grant execute on function public.admin_set_school_payout_tier(uuid, int) to authenticated, service_role;

-- Clear the override → tier reverts to the auto-derived value.
create or replace function public.admin_clear_school_payout_tier_override(p_school uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_name text; v_tier int;
begin
  perform public._require_staff();
  update public.schools set payout_tier_override = null where id = p_school
    returning name, payout_tier into v_name, v_tier;
  if v_name is null then raise exception 'School not found.'; end if;
  return jsonb_build_object('ok', true, 'id', p_school, 'name', v_name, 'payout_tier', v_tier, 'override', false);
end $$;
grant execute on function public.admin_clear_school_payout_tier_override(uuid) to authenticated, service_role;

-- List now surfaces accredited + the auto value + the override so the UI can show
-- "why" each tier is what it is and whether it's pinned.
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
      'auto_tier', public.derive_payout_tier(
        s.external_member_school_id is not null and s.external_member_school_id <> '',
        coalesce(s.accredited, false)),
      'override', s.payout_tier_override,
      'membership_linked', (s.external_member_school_id is not null and s.external_member_school_id <> ''),
      'accredited', coalesce(s.accredited, false),
      'can_receive', (s.stripe_connect_account_id is not null and s.stripe_connect_account_id <> ''),
      'status', s.status
    ) order by s.name)
    from public.schools s
  ), '[]'::jsonb);
end $$;
grant execute on function public.admin_schools_payout() to authenticated, service_role;
