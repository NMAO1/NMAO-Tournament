-- SECURITY (2026-09-23): close self-service payout escalation on public.schools.
--
-- `authenticated` holds table-wide UPDATE on schools and the owner RLS policy's
-- WITH CHECK only re-asserts row ownership (auth_user_id = auth.uid()) — it does
-- NOT restrict WHICH columns change. So a signed-in owner could
--   PATCH /schools?id=eq.<own>  {"payout_tier_override":35}
-- (or {"accredited":true} + {"external_member_school_id":"x"}) and set their own
-- payout tier to the 35% max, bypassing the accreditation bridge entirely — real
-- dollars off every entry fee the payout webhook reads from schools.payout_tier.
--
-- Fix: a BEFORE UPDATE guard that pins the accreditation/tier columns to their
-- OLD values for untrusted callers. Only service_role (the Membership→Tournament
-- bridge EF), SECURITY DEFINER admin RPCs (Mission Control's payout override, which
-- run as the definer/postgres), and direct admin SQL may change them. Fires before
-- trg_schools_payout_tier (alphabetical: g < p), so the tier recompute then derives
-- from the pinned inputs. Normal profile edits (name, phone, geo, logo, …) are
-- untouched.

create or replace function public.schools_guard_privileged_cols()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.accredited                := old.accredited;
    new.external_member_school_id := old.external_member_school_id;
    new.payout_tier_override      := old.payout_tier_override;
    new.payout_tier               := old.payout_tier;
  end if;
  return new;
end $$;

drop trigger if exists trg_schools_guard_cols on public.schools;
create trigger trg_schools_guard_cols
  before update on public.schools
  for each row execute function public.schools_guard_privileged_cols();
