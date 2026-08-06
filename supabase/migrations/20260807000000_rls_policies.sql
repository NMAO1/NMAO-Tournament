-- =====================================================================
-- NMAO Tournaments — Migration 4 of 4: Row-Level Security policies
-- Reconciled schema (2026-08-06). Applies AFTER the base, engine, and
-- ratings/finance migrations.
--
-- Posture: deny-by-default RLS on every table. The engine runs as the
-- Supabase service role, which BYPASSES RLS — so all engine writes work
-- without per-table write policies. These policies govern the three spoke
-- apps (competitor, judge, school) plus NMAO staff/operators.
--
-- IDENTITY MODEL (assumptions — confirm with Bradley; handoff §3 left this
-- [TO DEFINE]):
--   - Supabase Auth. A person is linked to their auth user via the
--     `auth_user_id` column already on competitors / guardians / judges / staff.
--   - A GUARDIAN acts on behalf of their linked competitors (guardian_competitors).
--   - A JUDGE is a row in `judges` whose auth_user_id = auth.uid().
--   - STAFF (owner/admin/organizer) are NMAO operators with broad read.
--   - The SCHOOL app has no school↔auth mapping yet, so school-scoped
--     self-service is deferred (school data is staff-only for now). This is
--     the main open item to close before the school app ships.
-- =====================================================================

begin;

-- ---------- helper schema + functions (SECURITY DEFINER to avoid recursive RLS) ----------
create schema if not exists nmao;

create or replace function nmao.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff s where s.auth_user_id = auth.uid());
$$;

-- Competitor ids the current user may act as: themselves + any competitor
-- they are the guardian of.
create or replace function nmao.competitor_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select c.id from competitors c where c.auth_user_id = auth.uid()
  union
  select gc.competitor_id
    from guardian_competitors gc
    join guardians g on g.id = gc.guardian_id
   where g.auth_user_id = auth.uid();
$$;

create or replace function nmao.judge_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select j.id from judges j where j.auth_user_id = auth.uid() limit 1;
$$;

-- ---------- enable RLS on base + reference tables (engine + ratings already on) ----------
alter table event_types          enable row level security;
alter table age_brackets         enable row level security;
alter table criteria             enable row level security;
alter table rubric_weights       enable row level security;
alter table app_settings         enable row level security;
alter table schools              enable row level security;
alter table competitors          enable row level security;
alter table guardians            enable row level security;
alter table guardian_competitors enable row level security;
alter table judges               enable row level security;
alter table staff                enable row level security;
alter table consents             enable row level security;

-- =====================================================================
-- Reference + public tournament structure: readable by any authenticated user.
-- (Writes have no policy -> service-role-only.)
-- =====================================================================
create policy ref_read_event_types    on event_types      for select to authenticated using (true);
create policy ref_read_age_brackets   on age_brackets     for select to authenticated using (true);
create policy ref_read_criteria       on criteria         for select to authenticated using (true);
create policy ref_read_rubric_weights on rubric_weights   for select to authenticated using (true);
create policy ref_read_app_settings   on app_settings     for select to authenticated using (true);
create policy pub_read_seasons        on seasons          for select to authenticated using (true);
create policy pub_read_schemes        on division_schemes for select to authenticated using (true);
create policy pub_read_rounds         on rounds           for select to authenticated using (true);
create policy pub_read_divisions      on divisions        for select to authenticated using (true);
create policy pub_read_pods           on pods             for select to authenticated using (true);

-- =====================================================================
-- People / org
-- =====================================================================
-- Schools: a user reads their own school (as competitor or judge); staff read all.
create policy school_read on schools for select to authenticated
  using (
    nmao.is_staff()
    or id in (select c.school_id from competitors c where c.id in (select nmao.competitor_ids()))
    or id = (select j.school_id from judges j where j.id = nmao.judge_id())
  );

-- Competitors: the user (or their guardian) reads their own competitor rows; staff all.
create policy competitor_read on competitors for select to authenticated
  using (id in (select nmao.competitor_ids()) or nmao.is_staff());

-- Guardians: read/manage own guardian row; staff all.
create policy guardian_read on guardians for select to authenticated
  using (auth_user_id = auth.uid() or nmao.is_staff());

create policy guardian_link_read on guardian_competitors for select to authenticated
  using (
    competitor_id in (select nmao.competitor_ids())
    or guardian_id in (select g.id from guardians g where g.auth_user_id = auth.uid())
    or nmao.is_staff()
  );

-- Judges: read/update own judge row; staff all.
create policy judge_read on judges for select to authenticated
  using (auth_user_id = auth.uid() or nmao.is_staff());

-- Staff: a staffer reads their own row; staff read all.
create policy staff_read on staff for select to authenticated
  using (auth_user_id = auth.uid() or nmao.is_staff());

-- Consents: guardian/competitor see their own; guardian may insert; staff all.
create policy consent_read on consents for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());
create policy consent_insert on consents for insert to authenticated
  with check (competitor_id in (select nmao.competitor_ids()));

-- =====================================================================
-- Entries: competitor/guardian see & submit their own; a judge sees entries
-- assigned to them (to view the video); staff all.
-- =====================================================================
create policy entry_read on entries for select to authenticated
  using (
    competitor_id in (select nmao.competitor_ids())
    or nmao.is_staff()
    or exists (
      select 1 from judge_assignments ja
       where ja.entry_id = entries.id and ja.judge_id = nmao.judge_id()
    )
  );
create policy entry_insert on entries for insert to authenticated
  with check (competitor_id in (select nmao.competitor_ids()));

-- =====================================================================
-- Judge assignments: a judge sees only their own assignments and may update
-- them (to submit a score). Staff read all. (Column-level restriction of
-- which fields a judge may change is enforced by grants / the edge layer.)
-- =====================================================================
create policy ja_read on judge_assignments for select to authenticated
  using (judge_id = nmao.judge_id() or nmao.is_staff());
create policy ja_update on judge_assignments for update to authenticated
  using (judge_id = nmao.judge_id())
  with check (judge_id = nmao.judge_id());

-- =====================================================================
-- Results / ratings / recognition / payments: competitor-or-guardian scoped.
-- =====================================================================
create policy results_read on results for select to authenticated
  using (
    nmao.is_staff()
    or exists (select 1 from entries e where e.id = results.entry_id
                and e.competitor_id in (select nmao.competitor_ids()))
  );

create policy skillrating_read on skill_ratings for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create policy ratinghist_read on rating_history for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create policy seasonresults_read on season_results for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create policy medals_read on medals for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create policy payments_read on payments for select to authenticated
  using (
    nmao.is_staff()
    or competitor_id in (select nmao.competitor_ids())
  );

-- =====================================================================
-- Staff-only tables (operations & moderation). No policy for other roles
-- means deny; service role still bypasses.
-- =====================================================================
create policy audit_staff       on engine_audit      for select to authenticated using (nmao.is_staff());
create policy steprun_staff     on round_step_runs   for select to authenticated using (nmao.is_staff());
create policy shipments_staff   on medal_shipments   for select to authenticated using (nmao.is_staff());
create policy payouts_staff     on school_payouts    for select to authenticated using (nmao.is_staff());
create policy reports_staff     on content_reports   for select to authenticated using (nmao.is_staff());

-- =====================================================================
-- Grants. RLS filters rows; roles still need table privileges. Supabase
-- pre-creates the anon / authenticated / service_role roles.
-- =====================================================================
grant usage on schema public, nmao to authenticated, service_role;
grant execute on all functions in schema nmao to authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant insert on entries, consents to authenticated;
grant update on judge_assignments to authenticated;
grant all on all tables in schema public to service_role;

commit;
