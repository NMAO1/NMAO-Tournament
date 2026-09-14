-- =====================================================================
-- AMBASSADOR PORTAL — auth layer on public.partners  (amb.nmao.us login)
-- Adds a nullable auth.users link + authenticated READ-ONLY RLS so a
-- logged-in ambassador sees ONLY their own partner row and their attributed
-- schools. Payout/earnings tables (partner_event_payouts,
-- partner_school_payouts) stay LOCKED here on purpose — dollar figures are
-- deferred to v2 (tax/1099 finalization). Staff + Edge Functions use the
-- service role and bypass RLS, so all existing admin paths are unaffected.
-- Idempotent — safe to re-run.
-- =====================================================================

-- 1. Link a partner to an auth user (nullable: not every partner has a login).
alter table public.partners
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists partners_user_id_key
  on public.partners (user_id) where user_id is not null;

-- 2. Helper: the caller's partner id. SECURITY DEFINER so it can read partners
--    without tripping the partners RLS policy (no recursion).
create or replace function public.auth_partner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.partners where user_id = auth.uid() limit 1
$$;
revoke all on function public.auth_partner_id() from public, anon;
grant execute on function public.auth_partner_id() to authenticated;

-- 3. Table grants (RLS still scopes the rows; without SELECT the policy is moot).
grant select on public.partners                    to authenticated;
grant select on public.partner_school_attributions to authenticated;

-- 4. Authenticated, read-only, own-rows-only policies.
drop policy if exists partners_self_read on public.partners;
create policy partners_self_read on public.partners
  for select to authenticated using (user_id = auth.uid());

drop policy if exists psa_self_read on public.partner_school_attributions;
create policy psa_self_read on public.partner_school_attributions
  for select to authenticated using (partner_id = public.auth_partner_id());
