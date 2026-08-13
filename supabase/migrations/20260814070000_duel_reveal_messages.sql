-- ============================================================
-- Dueling reveal messages — a large, adjustable catalog keyed by signal.
-- The monthly reveal picks a random active message for each competitor's top
-- positive signal via nmao.duel_reveal_message(signal). Add/edit freely:
--   insert into duel_reveal_messages(signal, body) values ('champion','...');
-- ============================================================

create table if not exists duel_reveal_messages (
  id     uuid primary key default gen_random_uuid(),
  signal text not null,   -- champion | voter | growth | effort | general (extend freely)
  body   text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (signal, body)
);
grant select on duel_reveal_messages to authenticated;

insert into duel_reveal_messages (signal, body) values
  ('champion', 'On fire this month — the arena knows your name.'),
  ('champion', 'Undeniable. You ran the table.'),
  ('champion', 'Champion''s rhythm, start to finish.'),
  ('champion', 'The crowd chose, and the crowd chose you.'),
  ('champion', 'A true champion is humble in the win and gracious in the arena.'),
  ('champion', 'You didn''t just win — you showed everyone what discipline looks like.'),
  ('champion', 'Mastery is quiet confidence. You carried it all month.'),
  ('champion', 'Save some glory for next month, legend.'),
  ('champion', 'Somebody cue the highlight reel.'),
  ('champion', 'Every vote you earned, you earned honestly.'),
  ('champion', 'Victory is a habit. You made it one.'),
  ('champion', 'The mat remembers champions. It''ll remember you.'),
  ('champion', 'Loud results, quiet ego — that''s the way.'),
  ('champion', 'This is what showing up every day builds.'),
  ('voter', 'The community trusts your eye.'),
  ('voter', 'A fair witness, every single duel.'),
  ('voter', 'You keep the arena honest.'),
  ('voter', 'To judge fairly is its own mastery — you practiced it all month.'),
  ('voter', 'The strongest communities are built by people who lift others. You did.'),
  ('voter', 'A sharp eye is earned, not given. Yours is sharpening.'),
  ('voter', 'Certified vote machine.'),
  ('voter', 'Your ballots are basically a superpower now.'),
  ('voter', 'Every duel you watched, someone felt seen.'),
  ('voter', 'You crowned champions this month — that matters.'),
  ('voter', 'Discernment is a martial art too. You''re training it.'),
  ('voter', 'The people who power judging rarely get thanked. Thank you.'),
  ('voter', 'Quiet contribution, loud impact.'),
  ('voter', 'You showed up for everyone else''s moment.'),
  ('growth', 'Sharper than last month — the climb is real.'),
  ('growth', 'Leveling up, one duel at a time.'),
  ('growth', 'The gap is closing.'),
  ('growth', 'Progress isn''t loud; it''s the quiet result of showing up. You''re proof.'),
  ('growth', 'A black belt is a white belt who never quit. Keep climbing.'),
  ('growth', 'Every rep is a deposit. Your account is growing.'),
  ('growth', 'New rating, new you.'),
  ('growth', 'The grind respects you now.'),
  ('growth', 'Somebody''s been practicing.'),
  ('growth', 'You''re not the same competitor you were 30 days ago.'),
  ('growth', 'Small gains compound into legends.'),
  ('growth', 'The mountain didn''t move — you got stronger.'),
  ('growth', 'Better than yesterday. That''s the whole game.'),
  ('growth', 'Growth this steady is hard to stop.'),
  ('effort', 'Every duel sharpened your edge. Bring it to the tournament.'),
  ('effort', 'You stepped into the arena — that''s the hard part.'),
  ('effort', 'Consistency is its own victory.'),
  ('effort', 'Courage isn''t the absence of nerves — it''s uploading anyway. You did.'),
  ('effort', 'The mat rewards those who return. You kept returning.'),
  ('effort', 'Losses today become technique tomorrow. Sharpen here, shine there.'),
  ('effort', 'You warmed up all month — now light up the tournament.'),
  ('effort', 'Showing up is a skill. You''ve got it.'),
  ('effort', 'The arena missed you — now it knows you.'),
  ('effort', 'Reps in, doubt out.'),
  ('effort', 'No duel is wasted. Each one taught you something.'),
  ('effort', 'You put in the work where nobody was watching.'),
  ('effort', 'This is exactly the training the next tournament rewards.'),
  ('effort', 'Keep stepping on the mat. The rest follows.'),
  ('general', 'Every bow, every rep, every duel — it all counts. See you in the arena.'),
  ('general', 'Discipline like yours builds legends.'),
  ('general', 'Win or draw, you carried yourself like a martial artist.'),
  ('general', 'Honor in, honor out. Proud of your month.'),
  ('general', 'The journey is the reward — and you''re on it.'),
  ('general', 'Strength with humility. That''s the way.'),
  ('general', 'One month down, a lifetime of mastery ahead.'),
  ('general', 'However this month went, you showed up. That''s everything.')
on conflict (signal, body) do nothing;

-- random active message for a signal, with a general fallback
create or replace function nmao.duel_reveal_message(p_signal text)
returns text language sql stable security definer set search_path = public
as $fn$
  select coalesce(
    (select body from duel_reveal_messages where signal = p_signal and active order by random() limit 1),
    (select body from duel_reveal_messages where signal = 'general' and active order by random() limit 1),
    'Every duel sharpened your edge. See you in the arena.'
  );
$fn$;
grant execute on function nmao.duel_reveal_message(text) to authenticated, service_role;

-- wire the reveal message to the catalog
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
    msg := nmao.duel_reveal_message(sig);

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
