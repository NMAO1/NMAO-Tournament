-- =====================================================================
-- NMAO Tournament — DEMO SEED (one closed round, ready to run the engine)
--
-- Run AFTER the schema is applied (reset_and_apply.sql / apply_all.sql).
-- Creates one active season + scheme + a CLOSED round with 26 valid entries
-- across 5 cohorts, plus 4 schools and 8 cleared judges.
--
-- The cohorts are chosen to exercise the whole divisioner:
--   trad_forms / 10_12 / beginner      x7  -> normal pod, 1 judge
--   trad_forms / 10_12 / advanced      x6  -> normal pod, 3 judges
--   trad_forms / 13_15 / advanced      x3  -> THIN  ┐ collapse on rank ->
--   trad_forms / 13_15 / intermediate  x4  -> THIN  ┘ one 7-entry pod, 3 judges
--   open_forms / 10_12 / advanced      x6  -> separate event (never merges)
-- Expected after `divide`: 4 divisions, 4 pods, every entry seated.
--
-- Idempotent: re-running wipes the previous demo rows first.
-- Then run the engine:  divide -> assign_judges -> (seed_demo_scores.sql) ->
--                        resolve -> distribute   (see docs/run-a-round.md)
-- =====================================================================

-- ---------- clean any prior demo data (order matters for FKs) ----------
delete from seasons     where name = 'Demo Season 2026';           -- cascades rounds/entries/divisions/pods/medals/...
delete from competitors where email like 'demo-comp-%@nmao.us';    -- cascades skill_ratings
delete from judges      where email like 'demo-judge-%@nmao.us';
delete from schools     where slug  like 'demo-dojo-%';

drop sequence if exists demo_comp_seq;
create sequence demo_comp_seq;

do $$
declare
  v_season  uuid;
  v_scheme  uuid;
  v_round   uuid;
  v_schools uuid[] := '{}';
  s uuid; c uuid; i int;
  cohorts jsonb := '[
     {"event":"trad_forms","age":"10_12","rank":"beginner",    "n":7,"base":40},
     {"event":"trad_forms","age":"10_12","rank":"advanced",    "n":6,"base":60},
     {"event":"trad_forms","age":"13_15","rank":"advanced",    "n":3,"base":62},
     {"event":"trad_forms","age":"13_15","rank":"intermediate","n":4,"base":50},
     {"event":"open_forms","age":"10_12","rank":"advanced",    "n":6,"base":58}
  ]'::jsonb;
  co jsonb; ev text; ag text; rk text; nn int; base numeric; dob date; rt numeric;
begin
  -- season
  insert into seasons(name, status) values ('Demo Season 2026','active')
    returning id into v_season;

  -- division scheme (axes = the engine-spec §5 array; keys match the entries below)
  insert into division_schemes(season_id, version, axes, pod_cap, pod_split_threshold, pod_floor, collapse_order, locked)
  values (
    v_season, 1,
    '[
      {"key":"age","type":"bracket","active":true,"mergeable":true,"brackets":[
        {"key":"7_9","min":7,"max":9},
        {"key":"10_12","min":10,"max":12},
        {"key":"13_15","min":13,"max":15},
        {"key":"16_17","min":16,"max":17},
        {"key":"18_plus","min":18,"max":200}
      ]},
      {"key":"rank","type":"tier","active":true,"mergeable":true,"tiers":["beginner","intermediate","advanced"]},
      {"key":"event","type":"category","active":true,"mergeable":false,"values":["trad_forms","trad_weapons","open_forms","open_weapons"]}
    ]'::jsonb,
    15, 16, 6, '["rank","age"]'::jsonb, true
  ) returning id into v_scheme;

  update seasons set active_scheme_id = v_scheme where id = v_season;

  -- one round, already CLOSED (entry window over, ready to divide)
  insert into rounds(season_id, seq, scheme_id, state, opens_at, closes_at, judging_deadline)
  values (v_season, 1, v_scheme, 'closed',
          now() - interval '10 days', now() - interval '1 day', now() + interval '6 days')
    returning id into v_round;

  -- 4 schools
  for i in 1..4 loop
    insert into schools(name, slug, address, payout_tier, status)
    values ('Demo Dojo '||i, 'demo-dojo-'||i,
            jsonb_build_object('line1', i||' Main St','city','Austin','state','TX','postal', '7870'||i),
            20, 'active')
      returning id into s;
    v_schools := array_append(v_schools, s);
  end loop;

  -- 8 judges (2 per school), all cleared + active
  for i in 1..8 loop
    s := v_schools[1 + (i % 4)];
    insert into judges(first_name, last_name, email, school_id, background_check_status, status, certified_at)
    values ('Demo','Judge '||i, 'demo-judge-'||i||'@nmao.us', s, 'cleared','active', now());
  end loop;

  -- competitors + skill_ratings + entries, per cohort
  for co in select * from jsonb_array_elements(cohorts) loop
    ev := co->>'event'; ag := co->>'age'; rk := co->>'rank';
    nn := (co->>'n')::int; base := (co->>'base')::numeric;
    dob := case ag
             when '10_12' then date '2015-06-01'
             when '13_15' then date '2012-06-01'
             else date '2010-06-01'
           end;
    for i in 1..nn loop
      s  := v_schools[1 + (i % 4)];
      rt := base + i * 1.5;
      insert into competitors(school_id, first_name, last_name, dob, declared_rank, email, status)
      values (s, initcap(replace(ev,'_',' ')), rk||' '||i, dob, rk,
              'demo-comp-'||nextval('demo_comp_seq')||'@nmao.us', 'active')
        returning id into c;

      insert into skill_ratings(competitor_id, rating, events_count, provisional)
      values (c, rt, 5, false);   -- events_count 5 -> steady K (not provisional)

      insert into entries(round_id, competitor_id, event, age_bracket, declared_rank,
                          rating_at_entry, video_url, status)
      values (v_round, c, ev, ag, rk, rt, 'https://demo.local/video/'||c, 'valid');
    end loop;
  end loop;

  raise notice 'Demo seeded: season=% round=% (26 entries, 4 schools, 8 judges)', v_season, v_round;
end $$;

drop sequence if exists demo_comp_seq;

-- Handy: the round id to POST to round-controller.
select r.id as round_id, r.state, count(e.*) as valid_entries
from rounds r
join seasons se on se.id = r.season_id and se.name = 'Demo Season 2026'
left join entries e on e.round_id = r.id and e.status = 'valid'
group by r.id, r.state;
