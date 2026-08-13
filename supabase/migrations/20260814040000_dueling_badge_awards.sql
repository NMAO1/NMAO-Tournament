-- ============================================================
-- Dueling — badge award engine (adjustable by design)
-- award_dueling_badges() re-evaluates every competitor's dueling + voting
-- state and inserts newly-earned badge_awards (seen=false, so the MONTHLY
-- REVEAL surfaces them). Fully idempotent (not-exists guards) — safe to run
-- any time; the monthly reveal job calls it.
--
-- EASILY ADJUSTABLE: every threshold lives in dueling_award_config and is read
-- live via nmao.dcfg('key'). Tune a rule with a single UPDATE, no code change:
--   update dueling_award_config set num = 4 where key = 'warpath_streak';
-- Each badge is its own labeled block below — add/remove/edit in place.
-- ============================================================

create table if not exists dueling_award_config (
  key  text primary key,
  num  numeric not null,
  note text
);

insert into dueling_award_config (key, num, note) values
  ('duelist_t1',            5,    'Duelist I — duels fought'),
  ('duelist_t2',            15,   'Duelist II'),
  ('duelist_t3',            30,   'Duelist III'),
  ('voice_t1',              25,   'Voice of the People I — votes cast'),
  ('voice_t2',              100,  'Voice II'),
  ('voice_t3',              500,  'Voice III'),
  ('warpath_streak',        3,    'Warpath — best win streak >='),
  ('undefeated_streak',     5,    'Undefeated Duelist — best streak with 0 losses'),
  ('landslide_pct',         0.80, 'People''s Champion — winner vote share >='),
  ('road_warrior_schools',  5,    'Road Warrior — distinct opponent schools >='),
  ('rivalry_count',         2,    'Rivalry — completed duels vs the same opponent >='),
  ('daily_voter_days',      5,    'Daily Voter — voting streak (days) >='),
  ('sharp_eye_accuracy',    0.70, 'Sharp Eye — min accuracy'),
  ('sharp_eye_min',         10,   'Sharp Eye — min qualified votes'),
  ('trusted_accuracy',      0.85, 'Trusted Voter — min accuracy'),
  ('trusted_min',           50,   'Trusted Voter — min qualified votes'),
  ('fair_witness_types',    2,    'Fair Witness — distinct duel types voted >='),
  ('kingmaker_margin',      1,    'Kingmaker — voted for winner in a duel decided by this margin')
on conflict (key) do nothing;

-- live threshold read
create or replace function nmao.dcfg(p_key text) returns numeric
  language sql stable security definer set search_path = public
as $$ select num from dueling_award_config where key = p_key $$;

-- ============================================================
create or replace function nmao.award_dueling_badges()
returns int
language plpgsql security definer set search_path = public
as $$
declare total int := 0; x int;
begin
  -- ---- DUELING (from duel_ratings + duels + duel_votes) ----

  -- first-duel: any completed duel
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select dr.competitor_id, 'first-duel', false, now() from duel_ratings dr
    where dr.duels_fought >= 1
      and not exists (select 1 from badge_awards b where b.competitor_id = dr.competitor_id and b.badge_code = 'first-duel');
  get diagnostics x = row_count; total := total + x;

  -- first-blood: first win
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select dr.competitor_id, 'first-blood', false, now() from duel_ratings dr
    where dr.wins >= 1
      and not exists (select 1 from badge_awards b where b.competitor_id = dr.competitor_id and b.badge_code = 'first-blood');
  get diagnostics x = row_count; total := total + x;

  -- duelist I/II/III: total duels fought
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select dr.competitor_id, 'duelist', t.tier, false, now()
    from duel_ratings dr
    cross join lateral (values ('1', nmao.dcfg('duelist_t1')), ('2', nmao.dcfg('duelist_t2')), ('3', nmao.dcfg('duelist_t3'))) t(tier, thresh)
    where dr.duels_fought >= t.thresh
      and not exists (select 1 from badge_awards b where b.competitor_id = dr.competitor_id and b.badge_code = 'duelist' and b.tier = t.tier);
  get diagnostics x = row_count; total := total + x;

  -- warpath: best win streak
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select dr.competitor_id, 'warpath', false, now() from duel_ratings dr
    where dr.best_streak >= nmao.dcfg('warpath_streak')
      and not exists (select 1 from badge_awards b where b.competitor_id = dr.competitor_id and b.badge_code = 'warpath');
  get diagnostics x = row_count; total := total + x;

  -- undefeated-duelist: streak with zero losses
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select dr.competitor_id, 'undefeated-duelist', false, now() from duel_ratings dr
    where dr.best_streak >= nmao.dcfg('undefeated_streak') and dr.losses = 0
      and not exists (select 1 from badge_awards b where b.competitor_id = dr.competitor_id and b.badge_code = 'undefeated-duelist');
  get diagnostics x = row_count; total := total + x;

  -- deadlock: had a deadlock draw
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select dr.competitor_id, 'deadlock', false, now() from duel_ratings dr
    where dr.draws >= 1
      and not exists (select 1 from badge_awards b where b.competitor_id = dr.competitor_id and b.badge_code = 'deadlock');
  get diagnostics x = row_count; total := total + x;

  -- rivalry: >= N completed duels vs the same opponent
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select distinct r.competitor_id, 'rivalry', false, now()
    from (
      select competitor_id, foe from (
        select challenger_id as competitor_id, opponent_id as foe from duels where status in ('complete','no_contest')
        union all
        select opponent_id, challenger_id from duels where status in ('complete','no_contest')
      ) p group by competitor_id, foe having count(*) >= nmao.dcfg('rivalry_count')
    ) r
    where not exists (select 1 from badge_awards b where b.competitor_id = r.competitor_id and b.badge_code = 'rivalry');
  get diagnostics x = row_count; total := total + x;

  -- road-warrior: distinct opponent SCHOOLS
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select r.competitor_id, 'road-warrior', false, now()
    from (
      select x2.competitor_id, count(distinct c.school_id) schools from (
        select challenger_id as competitor_id, opponent_id as foe from duels where status = 'complete'
        union all
        select opponent_id, challenger_id from duels where status = 'complete'
      ) x2 join competitors c on c.id = x2.foe
      group by x2.competitor_id
    ) r
    where r.schools >= nmao.dcfg('road_warrior_schools')
      and not exists (select 1 from badge_awards b where b.competitor_id = r.competitor_id and b.badge_code = 'road-warrior');
  get diagnostics x = row_count; total := total + x;

  -- peoples-champion: won a duel by a landslide vote share
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select d.winner_id, 'peoples-champion', false, now()
    from duels d
    where d.status = 'complete' and d.winner_id is not null
      and ( select (count(*) filter (where dv.choice = case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end))::numeric
                   / nullif(count(*), 0)
            from duel_votes dv where dv.duel_id = d.id ) >= nmao.dcfg('landslide_pct')
      and not exists (select 1 from badge_awards b where b.competitor_id = d.winner_id and b.badge_code = 'peoples-champion');
  get diagnostics x = row_count; total := total + x;

  -- ---- VOTING (from voter_stats + duel_votes + duels) ----

  -- first-vote
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select vs.competitor_id, 'first-vote', false, now() from voter_stats vs
    where vs.votes_cast >= 1
      and not exists (select 1 from badge_awards b where b.competitor_id = vs.competitor_id and b.badge_code = 'first-vote');
  get diagnostics x = row_count; total := total + x;

  -- voice-of-the-people I/II/III: votes cast
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select vs.competitor_id, 'voice-of-the-people', t.tier, false, now()
    from voter_stats vs
    cross join lateral (values ('1', nmao.dcfg('voice_t1')), ('2', nmao.dcfg('voice_t2')), ('3', nmao.dcfg('voice_t3'))) t(tier, thresh)
    where vs.votes_cast >= t.thresh
      and not exists (select 1 from badge_awards b where b.competitor_id = vs.competitor_id and b.badge_code = 'voice-of-the-people' and b.tier = t.tier);
  get diagnostics x = row_count; total := total + x;

  -- daily-voter: voting streak (days)
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select vs.competitor_id, 'daily-voter', false, now() from voter_stats vs
    where vs.streak >= nmao.dcfg('daily_voter_days')
      and not exists (select 1 from badge_awards b where b.competitor_id = vs.competitor_id and b.badge_code = 'daily-voter');
  get diagnostics x = row_count; total := total + x;

  -- sharp-eye: accuracy at/above bar with enough sample
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select vs.competitor_id, 'sharp-eye', false, now() from voter_stats vs
    where vs.accuracy >= nmao.dcfg('sharp_eye_accuracy') and vs.qualified >= nmao.dcfg('sharp_eye_min')
      and not exists (select 1 from badge_awards b where b.competitor_id = vs.competitor_id and b.badge_code = 'sharp-eye');
  get diagnostics x = row_count; total := total + x;

  -- trusted-voter: sustained elite accuracy
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select vs.competitor_id, 'trusted-voter', false, now() from voter_stats vs
    where vs.accuracy >= nmao.dcfg('trusted_accuracy') and vs.qualified >= nmao.dcfg('trusted_min')
      and not exists (select 1 from badge_awards b where b.competitor_id = vs.competitor_id and b.badge_code = 'trusted-voter');
  get diagnostics x = row_count; total := total + x;

  -- fair-witness: voted across distinct duel types
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select v.voter_competitor_id, 'fair-witness', false, now()
    from duel_votes v join duels d on d.id = v.duel_id
    group by v.voter_competitor_id
    having count(distinct d.type) >= nmao.dcfg('fair_witness_types')
       and not exists (select 1 from badge_awards b where b.competitor_id = v.voter_competitor_id and b.badge_code = 'fair-witness');
  get diagnostics x = row_count; total := total + x;

  -- kingmaker: voted for the winner in a duel decided by the configured margin
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select distinct v.voter_competitor_id, 'kingmaker', false, now()
    from duels d join duel_votes v on v.duel_id = d.id
    where d.status = 'complete' and d.winner_id is not null
      and v.choice = case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end
      and abs( (select count(*) filter (where choice = 'challenger') - count(*) filter (where choice = 'opponent')
                from duel_votes where duel_id = d.id) ) <= nmao.dcfg('kingmaker_margin')
      and not exists (select 1 from badge_awards b where b.competitor_id = v.voter_competitor_id and b.badge_code = 'kingmaker');
  get diagnostics x = row_count; total := total + x;

  -- DEFERRED (need extra data/windows): iron-duelist (weekly-for-a-month),
  -- duel-legend (leaderboard #1). Add blocks here when those are built.

  return total;
end;
$$;

revoke all on function nmao.award_dueling_badges() from public;
grant execute on function nmao.award_dueling_badges() to service_role;
