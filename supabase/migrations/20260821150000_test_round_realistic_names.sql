-- =====================================================================
-- admin_create_test_round: emit REALISTIC synthetic-athlete names instead of
-- "QA / Test-N", so demo rounds — and everything that renders their roster
-- (Mission Control divisions drill-down, the medal packing & shipping list) —
-- read like a genuine tournament during a live demo.
--
-- Behavior is otherwise byte-for-byte identical: still status='test', still
-- gated on nmao.is_staff(), still 900+ seq band, still cloned from a template
-- round's video-bearing entries. admin_delete_test_round is unchanged (it keys
-- teardown off status='test', not the name).
--
-- Names cycle from a 30-name pool; the surname index uses a stride of 7 (coprime
-- with 30) so first/last pairs never collide for a typical (<=30-athlete) round.
-- =====================================================================
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
  v_first    text[] := array['Sophia','Ethan','Olivia','Mason','Isla','Liam','Isabella','Noah','Mia','Lucas','Charlotte','Elijah','Amelia','Benjamin','Harper','Jackson','Evelyn','Sebastian','Grace','Daniel','Layla','Theo','Zoe','Gabriel','Nora','Miles','Aria','Owen','Chloe','Caleb'];
  v_last     text[] := array['Martinez','Nguyen','Brooks','Reyes','Sullivan','Foster','Tran','Coleman','Patel','Rivera','Kim','Ramos','Wong','Hayes','Diaz','Bell','Ortiz','Cruz','Bennett','Flores','Morgan','Castillo','Sanders','Reed','Jenkins','Ward','Hale','Novak','Pierce','Yamamoto'];
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
      values (rec.school_id,
              v_first[1 + (v_n - 1) % array_length(v_first, 1)],
              v_last[1 + ((v_n - 1) * 7) % array_length(v_last, 1)],
              rec.dob, rec.c_rank, 'test')
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
