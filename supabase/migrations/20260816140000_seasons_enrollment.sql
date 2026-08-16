-- Season timing + explicit season enrollment (season choice is mandatory at signup).
alter table public.seasons add column if not exists starts_at timestamptz;

-- Repurpose the demo season as the live "Pre-Season (Test)" (real students, bug-shakeout
-- until S1), and schedule Season 1 for 2027-01-15 sharing the same division scheme.
update public.seasons
  set name = 'Pre-Season (Test)', status = 'active', starts_at = now()
  where name = 'Demo Season 2026';

insert into public.seasons (name, status, starts_at, active_scheme_id)
select 'Season 1', 'scheduled', timestamptz '2027-01-15 00:00:00-05', active_scheme_id
from public.seasons where name = 'Pre-Season (Test)'
on conflict do nothing;

-- One competitor belongs to one or more seasons via an explicit enrollment.
create table if not exists public.season_enrollments (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  status text not null default 'enrolled',
  enrolled_at timestamptz not null default now(),
  unique (competitor_id, season_id)
);
alter table public.season_enrollments enable row level security;

-- A signed-in competitor or their guardian may read their own enrollments.
drop policy if exists season_enrollments_read_own on public.season_enrollments;
create policy season_enrollments_read_own on public.season_enrollments for select
  using (
    exists (select 1 from public.competitors c where c.id = competitor_id and c.auth_user_id = auth.uid())
    or exists (
      select 1 from public.guardian_competitors gc
      join public.guardians g on g.id = gc.guardian_id
      where gc.competitor_id = season_enrollments.competitor_id and g.auth_user_id = auth.uid()
    )
  );
