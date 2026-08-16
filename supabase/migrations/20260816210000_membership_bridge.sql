-- ============================================================
--  Membership → Tournament bridge (cross-product provisioning).
--  A Membership school one-click-provisions into Tournament: a signed
--  HS256 token (shared secret) hits bridge-provision-school, which links
--  the school and seeds its athletes as PENDING. Each guardian later
--  redeems an opaque invite to create the real competitor (consent +
--  season + payment). Rank is SCHOOL-chosen, never auto-derived.
--  See memory: tournament-membership-bridge.
-- ============================================================

-- External references back to the Membership product (project ykiozrdwudawpxdzbbyc).
alter table public.schools add column if not exists external_member_school_id text;
alter table public.competitors add column if not exists external_member_student_id text;
create unique index if not exists schools_external_member_uidx on public.schools (external_member_school_id) where external_member_school_id is not null;
create unique index if not exists competitors_external_member_uidx on public.competitors (external_member_student_id) where external_member_student_id is not null;

-- Seeded-but-not-yet-live athletes from a Membership roster. Rank is set by
-- the school owner (owner-only), null until then. Redeem creates the competitor.
create table if not exists public.bridge_pending_athletes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  external_member_student_id text,
  first_name text not null,
  last_name text not null,
  email text,
  dob date,
  belt_name text,                       -- hint for the owner; NOT a rank
  declared_rank text check (declared_rank in ('beginner','intermediate','advanced','black_belt')),
  invite_token text not null unique,     -- opaque, PII-free; carried in the deep-link
  status text not null default 'pending' check (status in ('pending','redeemed','expired','revoked')),
  competitor_id uuid references public.competitors(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  unique (school_id, external_member_student_id)
);
create index if not exists bridge_pending_school_idx on public.bridge_pending_athletes (school_id);

-- Idempotency: a provision token's jti maps to the exact response it produced,
-- so a retried/timed-out provision returns the same invites (no duplicates).
create table if not exists public.bridge_provisions (
  jti uuid primary key,
  external_member_school_id text,
  response jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS. EFs use the service role (bypass). The school owner may read + set rank
-- on their own pending athletes; provisions ledger is service-role-only.
alter table public.bridge_pending_athletes enable row level security;
alter table public.bridge_provisions enable row level security;

drop policy if exists bridge_pending_owner_sel on public.bridge_pending_athletes;
create policy bridge_pending_owner_sel on public.bridge_pending_athletes
  for select using (school_id in (select nmao.owned_school_ids()));
drop policy if exists bridge_pending_owner_upd on public.bridge_pending_athletes;
create policy bridge_pending_owner_upd on public.bridge_pending_athletes
  for update using (school_id in (select nmao.owned_school_ids())) with check (school_id in (select nmao.owned_school_ids()));

-- Owner-linking helper for bridge-provision-school: resolve a Tournament auth
-- user id by email so a provisioned school reuses the member's existing login.
-- Service-role only (called from the EF via rpc); never exposed to clients.
create or replace function public.bridge_auth_uid_by_email(p_email text)
returns uuid language sql security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function public.bridge_auth_uid_by_email(text) from public, anon, authenticated;
