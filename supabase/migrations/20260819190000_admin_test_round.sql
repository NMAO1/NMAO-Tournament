-- =====================================================================
-- Staff-only QA/operator tooling: seed + tear down a disposable TEST ROUND
-- so the full engine pipeline (open -> close -> divide -> assign_judges ->
-- resolve -> distribute -> finalize) can be rehearsed on demand WITHOUT
-- touching real competitors' ratings and WITHOUT hand-seeding SQL.
--
--   admin_create_test_round(template, season, seq)
--       Clones an existing round's ENTRY SHAPE (event / age_bracket /
--       declared_rank / video) onto FRESH synthetic competitors (status='test',
--       seeded skill_ratings) in a new OPEN round. Isolated: real competitors
--       are never re-rated. Seq lands in a 900+ "test band" so it can never
--       collide with (or be mistaken for) a real 1..9 round.
--   admin_autoscore_round(round)
--       Fills every still-'assigned' judge seat in the round with a submitted
--       score, so `resolve`/`distribute` can proceed without live judging.
--   admin_delete_test_round(round)
--       Deletes the round (cascades entries/divisions/pods/medals/results/
--       judge_assignments) + its synthetic competitors (cascades their
--       skill_ratings / rating_history / medals). Guarded to seq >= 900.
--
-- All three: SECURITY DEFINER, gated on nmao.is_staff(), authenticated-only.
-- =====================================================================

-- ---------------------------------------------------------------------
create or replace function public.admin_create_test_round(
  p_template_round_id uuid default null,   -- entry-shape source; default = latest round in the season
  p_season_id         uuid default null,   -- default = the (single) active season
  p_seq               int  default null    -- default = next free seq in the 900+ test band
) returns jsonb
language plpgsql security definer set search_path = public, nmao as $$
declare
  v_season   uuid;
  v_scheme   uuid;
  v_template uuid;
  v_seq      int;
  v_round    uuid;
  v_school   uuid;
  v_comp     uuid;
  v_n        int := 0;
  rec        record;
begin
  if not nmao.is_staff() then raise exception 'staff only'; end if;

  -- 1. season + its active scheme (the round's frozen ruleset)
  v_season := coalesce(p_season_id,
    (select id from seasons where status = 'active' order by created_at limit 1));
  if v_season is null then raise exception 'no active season — pass p_season_id'; end if;
  select active_scheme_id into v_scheme from seasons where id = v_season;
  if v_scheme is null then raise exception 'season % has no active_scheme_id', v_season; end if;

  -- 2. template round to clone entry-shape from (must have valid, video-bearing entries)
  v_template := coalesce(p_template_round_id,
    (select id from rounds where season_id = v_season order by seq desc limit 1));
  if v_template is null then raise exception 'no template round in season %', v_season; end if;
  if not exists (select 1 from entries where round_id = v_template and video_url is not null) then
    raise exception 'template round % has no video-bearing entries to clone', v_template;
  end if;

  -- 3. seq in the 900+ test band (never collides with real 1..9 rounds)
  v_seq := coalesce(p_seq,
    (select coalesce(max(seq), 900) + 1 from rounds where season_id = v_season and seq >= 900));

  insert into rounds (season_id, seq, scheme_id, state)
    values (v_season, v_seq, v_scheme, 'open')
    returning id into v_round;

  -- fallback school if a template competitor somehow lacks one
  select id into v_school from schools limit 1;

  -- 4. for each template entry, mint a fresh synthetic competitor (copying the
  --    real one's school/dob/rank so brackets stay valid) + a matching OPEN
  --    entry. Seed skill_ratings at the table default (rating 50, provisional).
  for rec in
    select e.event, e.age_bracket, e.declared_rank, e.video_url,
           coalesce(c.school_id, v_school) as school_id, c.dob,
           coalesce(c.declared_rank, 'intermediate') as c_rank
      from entries e
      join competitors c on c.id = e.competitor_id
     where e.round_id = v_template
       and e.video_url is not null
  loop
    v_n := v_n + 1;
    insert into competitors (school_id, first_name, last_name, dob, declared_rank, status)
      values (rec.school_id, 'QA', 'Test-' || v_n::text, rec.dob, rec.c_rank, 'test')
      returning id into v_comp;
    insert into skill_ratings (competitor_id) values (v_comp);   -- defaults: 50 / provisional
    insert into entries (round_id, competitor_id, event, age_bracket, declared_rank, video_url, status)
      values (v_round, v_comp, rec.event, rec.age_bracket, rec.declared_rank, rec.video_url, 'submitted');
  end loop;

  return jsonb_build_object(
    'round_id', v_round, 'season_id', v_season, 'scheme_id', v_scheme,
    'template_round_id', v_template, 'seq', v_seq,
    'synthetic_competitors', v_n, 'entries', v_n, 'state', 'open',
    'next', 'round-controller: close -> divide -> assign_judges -> admin_autoscore_round -> resolve -> distribute -> finalize'
  );
end $$;

revoke all on function public.admin_create_test_round(uuid, uuid, int) from public, anon;
grant execute on function public.admin_create_test_round(uuid, uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- Fill unclaimed judge seats with a submitted score so a test round can
-- resolve without live judging. Only touches seats still 'assigned'.
create or replace function public.admin_autoscore_round(p_round_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, nmao as $$
declare v_filled int;
begin
  if not nmao.is_staff() then raise exception 'staff only'; end if;
  if not exists (select 1 from rounds where id = p_round_id and seq >= 900) then
    raise exception 'refusing to autoscore a non-test round (seq < 900)';
  end if;

  with seats as (
    select ja.id
      from judge_assignments ja
      join entries e on e.id = ja.entry_id
     where e.round_id = p_round_id and ja.state = 'assigned'
  )
  update judge_assignments ja
     set score = round((70 + random() * 25)::numeric, 2),  -- 70.00 .. 95.00
         state = 'submitted',
         submitted_at = now(),
         updated_at = now()
    from seats
   where ja.id = seats.id;
  get diagnostics v_filled = row_count;

  return jsonb_build_object('round_id', p_round_id, 'seats_scored', v_filled);
end $$;

revoke all on function public.admin_autoscore_round(uuid) from public, anon;
grant execute on function public.admin_autoscore_round(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Tear down a test round + its synthetic competitors. Guarded to seq >= 900
-- so it can never delete a real (or the demo) round.
create or replace function public.admin_delete_test_round(p_round_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, nmao as $$
declare
  v_comp_ids uuid[];
  v_rounds   int;
  v_comps    int;
begin
  if not nmao.is_staff() then raise exception 'staff only'; end if;
  if not exists (select 1 from rounds where id = p_round_id and seq >= 900) then
    raise exception 'refusing to delete a non-test round (seq < 900)';
  end if;

  -- synthetic competitors are the status='test' ones entered in THIS round only
  select array_agg(distinct c.id) into v_comp_ids
    from entries e
    join competitors c on c.id = e.competitor_id
   where e.round_id = p_round_id and c.status = 'test';

  delete from rounds where id = p_round_id;      -- cascades entries/divisions/pods/medals/results/assignments
  get diagnostics v_rounds = row_count;

  v_comps := 0;
  if v_comp_ids is not null then
    delete from competitors where id = any(v_comp_ids);   -- cascades skill_ratings/rating_history/medals
    get diagnostics v_comps = row_count;
  end if;

  return jsonb_build_object('deleted_round', v_rounds, 'deleted_synthetic_competitors', v_comps);
end $$;

revoke all on function public.admin_delete_test_round(uuid) from public, anon;
grant execute on function public.admin_delete_test_round(uuid) to authenticated;
