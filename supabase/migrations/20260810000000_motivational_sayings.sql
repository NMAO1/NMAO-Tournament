-- =====================================================================
-- motivational_sayings — shown at the reveal to competitors who did NOT
-- place 1st/2nd/3rd (docs/competitor-growth-and-badges.md §2). Content is
-- seeded separately via supabase/seed_sayings.sql.
-- =====================================================================
create table if not exists motivational_sayings (
  id         uuid primary key default gen_random_uuid(),
  seq        int  unique,
  text       text not null unique,
  author     text,
  theme      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table motivational_sayings enable row level security;

-- Public, non-sensitive content: any signed-in user (competitor/guardian) may
-- read active sayings. The service role bypasses RLS for the reveal function.
drop policy if exists motivational_sayings_read on motivational_sayings;
create policy motivational_sayings_read on motivational_sayings
  for select to authenticated using (active);
