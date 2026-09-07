-- ============================================================================
-- School-affiliation confirmation (product decision 2026-09-07)
--
-- Self-signup competitors used to attach directly to any school_id they picked,
-- landing on that school's roster/rankings unconfirmed (roster pollution).
-- Now: a self-signup creates the competitor with school_id = NULL and a PENDING
-- affiliation request; the school owner approves (sets school_id → joins roster)
-- or rejects. Because unconfirmed competitors have NULL school_id, every existing
-- school-scoped query (roster, school leaderboard, counts) excludes them for free.
-- The membership-bridge INVITE path is unaffected — the school initiated it, so it
-- stays a direct, confirmed affiliation.
-- ============================================================================

create table if not exists public.school_affiliation_requests (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  school_id     uuid not null references public.schools(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid
);
-- at most one OPEN request per competitor
create unique index if not exists uq_school_aff_pending
  on public.school_affiliation_requests (competitor_id) where status = 'pending';
create index if not exists ix_school_aff_school
  on public.school_affiliation_requests (school_id, status);

-- Reachable only through the definer RPCs below + service-role (onboard). No direct client access.
alter table public.school_affiliation_requests enable row level security;
revoke all on table public.school_affiliation_requests from anon, authenticated;

-- Owner-facing list of pending join requests for the caller's school(s).
create or replace function nmao.school_pending_affiliations()
returns table (request_id uuid, competitor_id uuid, first_name text, last_name text, dob date, requested_at timestamptz)
language sql security definer set search_path = public, nmao as $$
  select r.id, c.id, c.first_name, c.last_name, c.dob, r.created_at
  from public.school_affiliation_requests r
  join public.competitors c on c.id = r.competitor_id
  where r.status = 'pending'
    and r.school_id in (select nmao.owned_school_ids())
  order by r.created_at;
$$;
revoke all on function nmao.school_pending_affiliations() from public, anon;
grant execute on function nmao.school_pending_affiliations() to authenticated, service_role;

-- Owner approves (competitor joins the roster) or rejects a pending request.
create or replace function nmao.school_decide_affiliation(p_request uuid, p_approve boolean)
returns jsonb
language plpgsql security definer set search_path = public, nmao as $$
declare r record;
begin
  select * into r from public.school_affiliation_requests where id = p_request and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'Request not found or already decided.'); end if;
  if r.school_id not in (select nmao.owned_school_ids()) then
    return jsonb_build_object('ok', false, 'error', 'Not your school.');
  end if;

  if p_approve then
    -- only join if still unaffiliated (guards a race where they got an invite meanwhile)
    update public.competitors set school_id = r.school_id where id = r.competitor_id and school_id is null;
    update public.school_affiliation_requests set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = p_request;
  else
    update public.school_affiliation_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_request;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function nmao.school_decide_affiliation(uuid, boolean) from public, anon;
grant execute on function nmao.school_decide_affiliation(uuid, boolean) to authenticated, service_role;
