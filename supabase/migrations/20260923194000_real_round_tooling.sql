-- Soft-open core-flow fix (2026-09-23):
--  (1) compete_dashboard must only resolve REAL (seq < 900) rounds, so the Compete
--      home screen stops advertising a $15 entry the money path refuses (the money
--      path already filters seq < 900). Adds the filter to BOTH the open-round and
--      the fallback latest-round selects.
--  (2) admin_open_real_round: the missing operator action to create+open a REAL round
--      with opens_at/closes_at set. Guarded to staff + the 1..899 real band, and it
--      REQUIRES closes_at (upload reminders + timing badges silently no-op without it).

CREATE OR REPLACE FUNCTION public.compete_dashboard(p_competitor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'nmao'
AS $function$
declare
  v_round  public.rounds;
  v_open   boolean;
  v_season text;
  v_events jsonb;
  v_rating jsonb;
begin
  if p_competitor is null or p_competitor not in (select nmao.competitor_ids()) then
    raise exception 'not your competitor';
  end if;

  -- Only ever resolve REAL rounds; seq >= 900 is the synthetic test band that the
  -- money path (create-entry-checkout / claim_round_entry) refuses, so the dashboard
  -- must not advertise an entry the app can't actually take.
  select * into v_round from public.rounds
    where state in ('open', 'collecting') and coalesce(seq, 0) < 900 order by seq desc limit 1;
  if found then
    v_open := true;
  else
    select * into v_round from public.rounds where coalesce(seq, 0) < 900 order by seq desc limit 1;
    v_open := false;
  end if;

  select name into v_season from public.seasons where id = v_round.season_id;

  with ev(code, name) as (
    values ('trad_forms', 'Traditional Forms'), ('trad_weapons', 'Traditional Weapons'),
           ('open_forms', 'Open Forms'), ('open_weapons', 'Open Weapons')
  )
  select jsonb_agg(
    jsonb_build_object(
      'event', ev.code, 'name', ev.name, 'entry_id', e.id,
      'status', case
        when e.id is null then 'not_entered'
        when e.payment_status = 'unpaid' then 'awaiting_payment'
        when e.video_url is null then 'awaiting_video'
        when m.id is not null then 'scored'
        when v_round.state in ('resolving', 'distributed', 'finalized') then 'scored'
        else 'in_judging'
      end,
      'medal', m.medal_type, 'place', m.placement
    ) order by ev.code
  )
  into v_events
  from ev
  left join public.entries e
    on e.event = ev.code and e.competitor_id = p_competitor and e.round_id = v_round.id
  left join public.medals m on m.entry_id = e.id;

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
      'judging_deadline', v_round.judging_deadline, 'submissions_open', v_open,
      'submission_password', v_round.submission_password
    ) end,
    'events', coalesce(v_events, '[]'::jsonb),
    'rating', v_rating
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- Operator action: create + OPEN a real (seq 1..899) round with opens_at/closes_at.
-- Staff-gated, SECURITY DEFINER. Mirrors admin_create_test_round's season/scheme
-- resolution but for a REAL round, and REQUIRES closes_at.
create or replace function public.admin_open_real_round(
  p_season_id        uuid        default null,   -- default = the active season
  p_seq              int         default null,   -- default = next real seq (max(seq<900)+1)
  p_closes_at        timestamptz default null,   -- REQUIRED: submissions deadline
  p_opens_at         timestamptz default null,   -- default = now()
  p_judging_deadline timestamptz default null    -- optional
) returns jsonb
language plpgsql security definer set search_path = public, nmao as $fn$
declare
  v_season uuid;
  v_scheme uuid;
  v_seq    int;
  v_opens  timestamptz := coalesce(p_opens_at, now());
  v_round  uuid;
begin
  if not nmao.is_staff() then raise exception 'staff only'; end if;

  v_season := coalesce(p_season_id,
    (select id from seasons where status = 'active' order by created_at limit 1));
  if v_season is null then raise exception 'no active season — pass p_season_id'; end if;
  select active_scheme_id into v_scheme from seasons where id = v_season;
  if v_scheme is null then raise exception 'season % has no active_scheme_id', v_season; end if;

  v_seq := coalesce(p_seq,
    (select coalesce(max(seq), 0) + 1 from rounds where season_id = v_season and coalesce(seq,0) < 900));
  if v_seq < 1 or v_seq >= 900 then
    raise exception 'p_seq must be a real round number (1..899); use admin_create_test_round for the 900+ test band';
  end if;
  if p_closes_at is null then
    raise exception 'p_closes_at is required — upload reminders and timing badges silently do nothing without it';
  end if;
  if p_closes_at <= v_opens then
    raise exception 'p_closes_at (%) must be after opens_at (%)', p_closes_at, v_opens;
  end if;
  if exists (select 1 from rounds where season_id = v_season and seq = v_seq) then
    raise exception 'round seq % already exists in this season', v_seq;
  end if;

  insert into rounds (season_id, seq, scheme_id, state, opens_at, closes_at, judging_deadline)
    values (v_season, v_seq, v_scheme, 'open', v_opens, p_closes_at, p_judging_deadline)
    returning id into v_round;

  return jsonb_build_object(
    'round_id', v_round, 'season_id', v_season, 'scheme_id', v_scheme, 'seq', v_seq,
    'state', 'open', 'opens_at', v_opens, 'closes_at', p_closes_at,
    'judging_deadline', p_judging_deadline
  );
end $fn$;

revoke all on function public.admin_open_real_round(uuid, int, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_open_real_round(uuid, int, timestamptz, timestamptz, timestamptz) to authenticated;
