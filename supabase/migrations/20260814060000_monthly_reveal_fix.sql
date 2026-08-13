-- Fix: qualify duel_ratings.rating/best_streak (plpgsql variable vs column
-- collision) in run_monthly_reveal. create-or-replace; safe re-apply.

create or replace function nmao.run_monthly_reveal(p_period text)
returns int
language plpgsql security definer set search_path = public
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
  pay jsonb;
begin
  me   := ms + interval '1 month';
  prev := to_char(ms - interval '1 month', 'YYYY-MM');

  perform nmao.award_dueling_badges();   -- grant everything newly earned (seen=false)

  for r in
    select distinct cid from (
      select challenger_id cid from duels where status = 'complete' and resolved_at >= ms and resolved_at < me
      union select opponent_id  from duels where status = 'complete' and resolved_at >= ms and resolved_at < me
      union select voter_competitor_id from duel_votes where created_at >= ms and created_at < me
    ) a where cid is not null
  loop
    -- performance
    select count(*) into won   from duels where winner_id = r.cid and status = 'complete' and resolved_at >= ms and resolved_at < me;
    select count(*) into fought from duels where status = 'complete' and resolved_at >= ms and resolved_at < me and (challenger_id = r.cid or opponent_id = r.cid);
    select count(*) into deadlocks from duels where result = 'draw' and resolved_at >= ms and resolved_at < me and (challenger_id = r.cid or opponent_id = r.cid);
    select coalesce(duel_ratings.best_streak, 0), coalesce(duel_ratings.rating, 1200) into bstreak, rating from duel_ratings where competitor_id = r.cid;
    select count(*) into landslides from duels d
      where d.winner_id = r.cid and d.status = 'complete' and d.resolved_at >= ms and d.resolved_at < me
        and ( select (count(*) filter (where dv.choice = case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end))::numeric
                     / nullif(count(*), 0) from duel_votes dv where dv.duel_id = d.id ) >= nmao.dcfg('landslide_pct');
    -- rating gain vs last month's snapshot (up-only)
    select rating_at_reveal into prev_rating from monthly_reveals where competitor_id = r.cid and period = prev;
    rgain := case when prev_rating is not null and rating > prev_rating then rating - prev_rating else null end;
    -- voting contribution
    select count(*) into vcast from duel_votes where voter_competitor_id = r.cid and created_at >= ms and created_at < me;
    select count(*) into helped from duels d join duel_votes v on v.duel_id = d.id
      where v.voter_competitor_id = r.cid and d.status = 'complete' and d.resolved_at >= ms and d.resolved_at < me
        and v.choice = case when d.winner_id = d.challenger_id then 'challenger' else 'opponent' end;
    select accuracy into acc from voter_stats where competitor_id = r.cid;
    -- recognition (votes on your duels this month)
    select count(*) filter (where v.choice = case when d.challenger_id = r.cid then 'challenger' else 'opponent' end),
           count(distinct v.voter_competitor_id) filter (where v.choice = case when d.challenger_id = r.cid then 'challenger' else 'opponent' end),
           count(*)
      into vfor, backers, vdrew
      from duels d join duel_votes v on v.duel_id = d.id
      where (d.challenger_id = r.cid or d.opponent_id = r.cid) and v.created_at >= ms and v.created_at < me;
    -- reach
    select count(distinct c.school_id) into schools from (
      select opponent_id foe from duels where challenger_id = r.cid and status = 'complete' and resolved_at >= ms and resolved_at < me
      union all select challenger_id from duels where opponent_id = r.cid and status = 'complete' and resolved_at >= ms and resolved_at < me
    ) x join competitors c on c.id = x.foe;
    -- newly-earned badges (rarest first via sort_order)
    select coalesce(jsonb_agg(jsonb_build_object('code', ba.badge_code, 'tier', ba.tier, 'rarity', b.rarity, 'name', b.name) order by b.sort_order), '[]'::jsonb),
           count(*)
      into badges, bcount
      from badge_awards ba join badges b on b.code = ba.badge_code
      where ba.competitor_id = r.cid and ba.seen = false;
    -- signal → message (swap to sayings later)
    sig := case when won >= 3 then 'champion' when vcast >= 10 then 'voter' when rgain is not null then 'growth' else 'effort' end;
    msg := case sig
      when 'champion' then 'On fire this month — the arena knows your name.'
      when 'voter'    then 'The community trusts your eye. You keep the arena honest.'
      when 'growth'   then 'Sharper than last month — the climb is real.'
      else 'Every duel sharpened your edge. Bring it to the tournament.' end;

    pay := jsonb_strip_nulls(jsonb_build_object(
      'signal', sig, 'message', msg,
      'duels_won', won, 'duels_fought', fought, 'best_streak', bstreak,
      'rating', rating, 'rating_gain', rgain,
      'landslide_wins', landslides, 'deadlocks', deadlocks,
      'votes_cast', vcast, 'helped_decide', helped, 'sharp_eye_accuracy', acc,
      'votes_for_you', vfor, 'backers', backers, 'votes_drew', vdrew,
      'schools_faced', schools,
      'badges_earned', bcount, 'badges', badges
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
