-- =====================================================================
-- public.compete_dashboard(p_competitor) — one call powering the Compete tab's
-- new depth: the current round (state-aware), the competitor's per-event
-- status, and their ratings/rank. Gated to a caller-owned competitor.
-- =====================================================================
create or replace function public.compete_dashboard(p_competitor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, nmao
as $$
declare
  v_round  public.rounds;
  v_open   boolean;
  v_season text;
  v_events jsonb;
  v_rating jsonb;
begin
  -- Caller may only read a competitor they own (self or guardian-linked).
  if p_competitor is null or p_competitor not in (select nmao.competitor_ids()) then
    raise exception 'not your competitor';
  end if;

  -- Current round: an open/collecting round if one exists (submissions on),
  -- else the most recent round (in judging / results out / next).
  select * into v_round from public.rounds
    where state in ('open', 'collecting') order by seq desc limit 1;
  if found then
    v_open := true;
  else
    select * into v_round from public.rounds order by seq desc limit 1;
    v_open := false;
  end if;

  select name into v_season from public.seasons where id = v_round.season_id;

  -- Per-event status for this competitor in the resolved round.
  with ev(code, name) as (
    values ('trad_forms', 'Traditional Forms'), ('trad_weapons', 'Traditional Weapons'),
           ('open_forms', 'Open Forms'), ('open_weapons', 'Open Weapons')
  )
  select jsonb_agg(
    jsonb_build_object(
      'event', ev.code,
      'name', ev.name,
      'entry_id', e.id,
      'status', case
        when e.id is null then 'not_entered'
        when e.payment_status = 'unpaid' then 'awaiting_payment'
        when e.video_url is null then 'awaiting_video'
        when m.id is not null then 'scored'
        when v_round.state in ('resolving', 'distributed', 'finalized') then 'scored'
        else 'in_judging'
      end,
      'medal', m.medal_type,
      'place', m.placement
    ) order by ev.code
  )
  into v_events
  from ev
  left join public.entries e
    on e.event = ev.code and e.competitor_id = p_competitor and e.round_id = v_round.id
  left join public.medals m on m.entry_id = e.id;

  -- Ratings + rank. skill = tournament (0–100); duel = Elo.
  select jsonb_build_object(
    'skill',             (select round(rating)::int from public.skill_ratings where competitor_id = p_competitor),
    'skill_provisional', (select provisional        from public.skill_ratings where competitor_id = p_competitor),
    'duel',              (select rating             from public.duel_ratings  where competitor_id = p_competitor),
    'duel_wins',         coalesce((select wins   from public.duel_ratings where competitor_id = p_competitor), 0),
    'duel_losses',       coalesce((select losses from public.duel_ratings where competitor_id = p_competitor), 0),
    'duel_streak',       coalesce((select streak from public.duel_ratings where competitor_id = p_competitor), 0),
    'rank',              (select declared_rank from public.competitors where id = p_competitor)
  ) into v_rating;

  return jsonb_build_object(
    'round', case when v_round.id is null then null else jsonb_build_object(
      'seq', v_round.seq, 'season_name', v_season, 'state', v_round.state,
      'opens_at', v_round.opens_at, 'closes_at', v_round.closes_at,
      'judging_deadline', v_round.judging_deadline, 'submissions_open', v_open
    ) end,
    'events', coalesce(v_events, '[]'::jsonb),
    'rating', v_rating
  );
end;
$$;

revoke all on function public.compete_dashboard(uuid) from public, anon;
grant execute on function public.compete_dashboard(uuid) to authenticated;
