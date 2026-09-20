-- ============================================================
-- Monthly reveal — populate REAL data behind the scorecard stat tiles.
-- Re-declare nmao.run_monthly_reveal to also assemble, into the payload, the
-- itemized breakdowns the app's tap-into stat detail can list:
--   • duels_won_list[]  {opp, pct}   — opponents defeated + winning vote share
--   • streak_list[]     {opp}        — the current consecutive-win run (most recent)
--   • schools_list[]    [name]       — distinct dojos faced
--   • landslide_list[]  {opp, pct}   — wins by >= landslide_pct of the vote
-- Everything else is unchanged from the medals-era builder.
-- ============================================================

create or replace function nmao.run_monthly_reveal(p_period text)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  ms timestamptz := to_timestamp(p_period || '-01', 'YYYY-MM-DD');
  me timestamptz;
  prev text;
  r record; n int := 0;
  won int; fought int; deadlocks int; landslides int;
  bstreak int; rating int; prev_rating int; rgain int;
  vcast int; helped int; acc numeric; vfor int; backers int; vdrew int; schools int;
  badges jsonb; bcount int; sig text; msg text;
  medals jsonb; mcount int;
  dwon_list jsonb; streak_list jsonb; sch_list jsonb; land_list jsonb;
  pay jsonb;
begin
  me   := ms + interval '1 month';
  prev := to_char(ms - interval '1 month', 'YYYY-MM');

  perform nmao.award_dueling_badges();

  for r in
    select distinct cid from (
      select challenger_id cid from duels where status = 'complete' and resolved_at >= ms and resolved_at < me
      union select opponent_id  from duels where status = 'complete' and resolved_at >= ms and resolved_at < me
      union select voter_competitor_id from duel_votes where created_at >= ms and created_at < me
      union select competitor_id from medals where created_at >= ms and created_at < me
    ) a where cid is not null
  loop
    select count(*) into won   from duels where winner_id = r.cid and status = 'complete' and resolved_at >= ms and resolved_at < me;
    select count(*) into fought from duels where status = 'complete' and resolved_at >= ms and resolved_at < me and (challenger_id = r.cid or opponent_id = r.cid);
    select count(*) into deadlocks from duels where result = 'draw' and resolved_at >= ms and resolved_at < me and (challenger_id = r.cid or opponent_id = r.cid);
    select coalesce(duel_ratings.best_streak, 0), coalesce(duel_ratings.rating, 1200) into bstreak, rating from duel_ratings where competitor_id = r.cid;
    select count(*) into landslides from duels d
      where d.winner_id = r.cid and d.status = 'complete' and d.resolved_at >= ms and d.resolved_at < me
        and ( select (count(*) filter (where dv.choice = case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end))::numeric
                     / nullif(count(*), 0) from duel_votes dv where dv.duel_id = d.id ) >= nmao.dcfg('landslide_pct');
    select rating_at_reveal into prev_rating from monthly_reveals where competitor_id = r.cid and period = prev;
    rgain := case when prev_rating is not null and rating > prev_rating then rating - prev_rating else null end;
    select count(*) into vcast from duel_votes where voter_competitor_id = r.cid and created_at >= ms and created_at < me;
    select count(*) into helped from duels d join duel_votes v on v.duel_id = d.id
      where v.voter_competitor_id = r.cid and d.status = 'complete' and d.resolved_at >= ms and d.resolved_at < me
        and v.choice = case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end;
    select accuracy into acc from voter_stats where competitor_id = r.cid;
    select count(*) filter (where v.choice = case when d.challenger_id = r.cid then 'challenger' else 'opponent' end),
           count(distinct v.voter_competitor_id) filter (where v.choice = case when d.challenger_id = r.cid then 'challenger' else 'opponent' end),
           count(*)
      into vfor, backers, vdrew
      from duels d join duel_votes v on v.duel_id = d.id
      where (d.challenger_id = r.cid or d.opponent_id = r.cid) and v.created_at >= ms and v.created_at < me;
    select count(distinct c.school_id) into schools from (
      select opponent_id foe from duels where challenger_id = r.cid and status = 'complete' and resolved_at >= ms and resolved_at < me
      union all select challenger_id from duels where opponent_id = r.cid and status = 'complete' and resolved_at >= ms and resolved_at < me
    ) x join competitors c on c.id = x.foe;

    -- ---- itemized breakdowns for the scorecard stat detail ---------------------
    -- opponents defeated this period + the winner's share of the vote
    select coalesce(jsonb_agg(t.j order by t.rat desc), '[]'::jsonb) into dwon_list
    from (
      select d.resolved_at as rat,
        jsonb_build_object(
          'opp', (select trim(c.first_name || ' ' || coalesce(left(c.last_name, 1) || '.', ''))
                    from competitors c where c.id = (case when d.winner_id = d.challenger_id then d.opponent_id else d.challenger_id end)),
          'pct', (select round(100.0 * count(*) filter (where dv.choice = (case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end))::numeric / nullif(count(*), 0))
                    from duel_votes dv where dv.duel_id = d.id)
        ) as j
      from duels d
      where d.winner_id = r.cid and d.status = 'complete' and d.resolved_at >= ms and d.resolved_at < me
      order by d.resolved_at desc limit 8
    ) t;

    -- the current consecutive-win run (most recent wins until the first non-win)
    select coalesce(jsonb_agg(jsonb_build_object('opp', s.opp) order by s.rat desc), '[]'::jsonb) into streak_list
    from (
      with mine as (
        select d.resolved_at as rat, (d.winner_id = r.cid) as win,
               (case when d.winner_id = d.challenger_id then d.opponent_id else d.challenger_id end) as foe
        from duels d
        where d.status = 'complete' and d.resolved_at >= ms and d.resolved_at < me
          and (d.challenger_id = r.cid or d.opponent_id = r.cid)
      ),
      numbered as (select m.*, row_number() over (order by m.rat desc) rn from mine m),
      cut as (select coalesce(min(rn), 999999) rn from numbered where not win)
      select n.rat, (select trim(c.first_name || ' ' || coalesce(left(c.last_name, 1) || '.', '')) from competitors c where c.id = n.foe) as opp
      from numbered n, cut where n.rn < cut.rn and n.win
      limit 8
    ) s;

    -- distinct dojos faced
    select coalesce(jsonb_agg(distinct sc.name), '[]'::jsonb) into sch_list
    from (
      select opponent_id foe from duels where challenger_id = r.cid and status = 'complete' and resolved_at >= ms and resolved_at < me
      union all select challenger_id from duels where opponent_id = r.cid and status = 'complete' and resolved_at >= ms and resolved_at < me
    ) x join competitors c on c.id = x.foe join schools sc on sc.id = c.school_id;

    -- landslide wins (>= landslide_pct of the vote), biggest margin first
    select coalesce(jsonb_agg(t.j order by t.pct desc), '[]'::jsonb) into land_list
    from (
      select
        (select round(100.0 * count(*) filter (where dv.choice = (case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end))::numeric / nullif(count(*), 0))
           from duel_votes dv where dv.duel_id = d.id) as pct,
        jsonb_build_object(
          'opp', (select trim(c.first_name || ' ' || coalesce(left(c.last_name, 1) || '.', ''))
                    from competitors c where c.id = (case when d.winner_id = d.challenger_id then d.opponent_id else d.challenger_id end)),
          'pct', (select round(100.0 * count(*) filter (where dv.choice = (case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end))::numeric / nullif(count(*), 0))
                    from duel_votes dv where dv.duel_id = d.id)
        ) as j
      from duels d
      where d.winner_id = r.cid and d.status = 'complete' and d.resolved_at >= ms and d.resolved_at < me
        and (select (count(*) filter (where dv.choice = (case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end)))::numeric / nullif(count(*), 0)
               from duel_votes dv where dv.duel_id = d.id) >= nmao.dcfg('landslide_pct')
    ) t;

    -- newly-earned badges (rarest first) + criterion + concrete earned-action (G8)
    select coalesce(jsonb_agg(jsonb_build_object(
             'code', ba.badge_code, 'tier', ba.tier, 'rarity', b.rarity, 'name', b.name,
             'description', b.description, 'earned_action', ba.context) order by b.sort_order), '[]'::jsonb),
           count(*)
      into badges, bcount
      from badge_awards ba join badges b on b.code = ba.badge_code
      where ba.competitor_id = r.cid and ba.seen = false;

    -- tournament medals earned this period (G7)
    select coalesce(jsonb_agg(jsonb_build_object('tier', md.medal_type, 'place', md.placement, 'event', md.event)
             order by md.placement nulls last), '[]'::jsonb),
           count(*)
      into medals, mcount
      from medals md
      where md.competitor_id = r.cid and md.created_at >= ms and md.created_at < me;

    sig := case when won >= 3 then 'champion' when vcast >= 10 then 'voter' when rgain is not null then 'growth' else 'effort' end;
    msg := nmao.duel_reveal_message(sig);

    pay := jsonb_strip_nulls(jsonb_build_object(
      'signal', sig, 'message', msg,
      'duels_won', won, 'duels_fought', fought, 'best_streak', bstreak,
      'rating', rating, 'rating_gain', rgain,
      'landslide_wins', landslides, 'deadlocks', deadlocks,
      'votes_cast', vcast, 'helped_decide', helped, 'sharp_eye_accuracy', acc,
      'votes_for_you', vfor, 'backers', backers, 'votes_drew', vdrew,
      'schools_faced', schools,
      'badges_earned', bcount, 'badges', badges,
      'medals_earned', mcount, 'medals', medals,
      'duels_won_list', dwon_list, 'streak_list', streak_list,
      'schools_list', sch_list, 'landslide_list', land_list
    ));

    insert into monthly_reveals (competitor_id, period, payload, rating_at_reveal, seen, created_at)
    values (r.cid, p_period, pay, rating, false, now())
    on conflict (competitor_id, period) do update
      set payload = excluded.payload, rating_at_reveal = excluded.rating_at_reveal, created_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;
