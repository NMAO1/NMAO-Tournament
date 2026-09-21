-- ============================================================================
-- directory_school_stats() — per-school tournament signals for the directory
-- flywheel. Read by the sync-directory-tournament-stats EF, which matches these
-- to Membership directory_listings (by name/location) and writes the counts so
-- listings show live league activity ("N athletes compete via NMAO", "Active").
-- ============================================================================

create or replace function public.directory_school_stats()
returns table (
  school_id uuid, name text, city text, state text,
  external_member_school_id text, competitors int, season_active boolean, medals int
)
language sql security definer set search_path = public as $$
  with comp as (
    select school_id, count(*)::int n
    from public.competitors
    where school_id is not null
    group by school_id
  ),
  act as (
    select distinct c.school_id
    from public.entries e
    join public.competitors c on c.id = e.competitor_id
    join public.rounds r on r.id = e.round_id
    join public.seasons se on se.id = r.season_id
    where se.status = 'active' and c.school_id is not null
  )
  select s.id, s.name, (s.address->>'city'), s.state, s.external_member_school_id,
         coalesce(comp.n, 0), (act.school_id is not null), 0
  from public.schools s
  left join comp on comp.school_id = s.id
  left join act on act.school_id = s.id;
$$;
revoke all on function public.directory_school_stats() from public, anon;
grant execute on function public.directory_school_stats() to service_role;
