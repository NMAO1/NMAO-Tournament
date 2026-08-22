-- =====================================================================
-- Entered-voter gate for dueling (computed at vote-time) + two hardenings.
--
-- WHY: Voting was open to any authenticated competitor — a school could add
-- never-competing roster members purely to farm votes for its real duelists.
-- This gates voting to competitors with a PAID tournament entry in one of the
-- last N tournaments (rolling window, cadence-based so an off-season gap does
-- not nuke the whole voter pool). Eligibility is computed live at vote time —
-- no cron, and re-entering a tournament instantly restores voting.
--
-- Config lives in app_settings and DEFAULTS OFF, so single-school test
-- tournaments keep working until the league is large enough to turn it on
-- (flip from Mission Control by updating these two keys).
--
-- Also closes two prerequisite holes without which the gate is bypassable:
--   1) a second "door" — the authenticated direct-INSERT RLS policy on
--      duel_votes (all votes must route through cast_duel_vote); and
--   2) self/participant voting (a duelist voting on their own duel).
-- =====================================================================

-- ---- config (idempotent; DEFAULT OFF) -------------------------------
insert into app_settings (key, value) values
  ('duel_vote_gate_enabled',  to_jsonb(false)),  -- master switch: false = everyone may vote
  ('duel_vote_window_rounds', to_jsonb(3))       -- "entered one of the last N tournaments"
on conflict (key) do nothing;                     -- never clobber an operator's chosen value

-- ---- eligibility, computed live -------------------------------------
-- true when the gate is OFF, otherwise true iff the competitor has a PAID entry
-- in one of the last N real (non-demo, seq < 900) rounds, most-recent by open date.
create or replace function nmao.competitor_can_vote(p_competitor_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when not coalesce(
      (select (value #>> '{}')::boolean from app_settings where key = 'duel_vote_gate_enabled'),
      false)
    then true                                     -- gate disabled → everyone eligible
    else exists (
      select 1
      from entries e
      where e.competitor_id = p_competitor_id
        and e.payment_status = 'paid'
        and e.round_id in (
          select r.id
          from rounds r
          where coalesce(r.seq, 0) < 900          -- exclude demo/test rounds
          order by coalesce(r.opens_at, r.created_at) desc nulls last
          limit greatest(1, coalesce(
            (select (value #>> '{}')::int from app_settings where key = 'duel_vote_window_rounds'), 3))
        )
    )
  end;
$$;

-- App-facing check (ownership-scoped) so the client can show/hide the vote
-- button and nudge "Enter a tournament to vote" instead of failing on tap.
create or replace function public.competitor_can_vote(p_competitor_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized as this competitor' using errcode = '42501';
  end if;
  return nmao.competitor_can_vote(p_competitor_id);
end;
$$;
revoke all on function public.competitor_can_vote(uuid) from public;
grant execute on function public.competitor_can_vote(uuid) to authenticated;

-- ---- harden cast_duel_vote (adds self-vote block + eligibility gate) --
create or replace function public.cast_duel_vote(p_duel_id uuid, p_voter_competitor_id uuid, p_choice text, p_watched_seconds integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d duels;
begin
  if p_choice not in ('challenger','opponent') then
    raise exception 'invalid choice' using errcode = '22023';
  end if;
  if p_voter_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized as this competitor' using errcode = '42501';
  end if;
  if coalesce(p_watched_seconds, 0) < 15 then
    raise exception 'watch at least 15 seconds before voting' using errcode = 'P0001';
  end if;

  select * into d from duels where id = p_duel_id;
  if not found then raise exception 'duel not found' using errcode = '23503'; end if;
  if d.status <> 'voting' or d.moderation_status <> 'ok' then
    raise exception 'this duel is not open for voting' using errcode = 'P0001';
  end if;

  -- can't vote on a duel you're competing in
  if p_voter_competitor_id in (d.challenger_id, d.opponent_id) then
    raise exception 'you cannot vote on your own duel' using errcode = 'P0001';
  end if;

  -- entered-voter gate (no-op while the gate is disabled)
  if not nmao.competitor_can_vote(p_voter_competitor_id) then
    raise exception 'Enter a tournament to unlock duel voting.' using errcode = 'P0001';
  end if;

  begin
    insert into duel_votes (duel_id, voter_competitor_id, choice, watched)
    values (p_duel_id, p_voter_competitor_id, p_choice, true);
  exception when unique_violation then
    raise exception 'you have already voted on this duel' using errcode = 'P0001';
  end;

  -- votes + daily streak (accuracy is computed at certification, not here)
  insert into voter_stats (competitor_id, votes_cast, streak, last_vote_date)
  values (p_voter_competitor_id, 1, 1, current_date)
  on conflict (competitor_id) do update set
    votes_cast = voter_stats.votes_cast + 1,
    streak = case
      when voter_stats.last_vote_date = current_date     then voter_stats.streak
      when voter_stats.last_vote_date = current_date - 1  then voter_stats.streak + 1
      else 1 end,
    last_vote_date = current_date;
end;
$function$;

-- ---- close the side door --------------------------------------------
-- The RPC above is SECURITY DEFINER (owner postgres, duel_votes has no FORCE
-- RLS) so it still inserts fine. Removing this policy blocks the direct
-- authenticated INSERT path that bypassed the 15s-watch + moderation + gate.
drop policy if exists duel_votes_insert on duel_votes;
