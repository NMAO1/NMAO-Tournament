-- ============================================================
-- Dueling — Slice 2b: resolution engine + sweep
-- Duels settle themselves. All internal (nmao schema), SECURITY DEFINER,
-- driven by nmao.sweep_duels() on a cron. Not user-callable.
-- Spec: docs/DUELING-DECISIONS.md §2 (sudden death), §3 (ratings/forfeit).
--
--   settle_duel        — apply an outcome: status, ratings/streaks, voter accuracy
--   close_duel_voting  — certify: <3→extend once→no_contest; majority→win;
--                        tie→60-min sudden death→(tally-at-end) win or deadlock
--   forfeit_duel       — no-show at upload deadline: uploader wins (Elo-neutral,
--                        no penalty to the no-show); neither→cancelled
--   sweep_duels        — cron entrypoint: expire challenges, forfeits, closings
--
-- Deferred: monthly reveal batch + season reset (2c, monthly job).
-- ============================================================

-- ---------- settle_duel (internal) ----------
-- p_result: 'challenger' | 'opponent' | 'draw' | 'no_contest'
-- p_apply_elo: swing duel Elo (false = Elo-neutral, e.g. forfeit / deadlock)
-- p_penalize_loser: record a loss for the loser (false = forfeit: no-show untouched)
create or replace function nmao.settle_duel(
  p_duel_id uuid, p_result text, p_apply_elo boolean, p_penalize_loser boolean default true
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  d duels;
  v_winner uuid; v_loser uuid; v_side text;
  rw int; rl int; ew numeric; k int := 32; delta int;
begin
  select * into d from duels where id = p_duel_id for update;
  if not found or d.status in ('complete','no_contest','cancelled') then return; end if;

  if p_result in ('challenger','opponent') then
    if p_result = 'challenger' then v_winner := d.challenger_id; v_loser := d.opponent_id; v_side := 'challenger';
    else v_winner := d.opponent_id; v_loser := d.challenger_id; v_side := 'opponent'; end if;

    update duels set status = 'complete', result = p_result, winner_id = v_winner, resolved_at = now()
      where id = p_duel_id;

    insert into duel_ratings (competitor_id) values (v_winner) on conflict (competitor_id) do nothing;
    insert into duel_ratings (competitor_id) values (v_loser)  on conflict (competitor_id) do nothing;

    -- winner always: win + streak + a duel fought
    update duel_ratings
      set wins = wins + 1, streak = streak + 1, best_streak = greatest(best_streak, streak + 1),
          duels_fought = duels_fought + 1
      where competitor_id = v_winner;
    -- loser: only when penalized (forfeit no-show is untouched)
    if p_penalize_loser then
      update duel_ratings
        set losses = losses + 1, streak = 0, duels_fought = duels_fought + 1
        where competitor_id = v_loser;
    end if;

    if p_apply_elo then
      select rating into rw from duel_ratings where competitor_id = v_winner;
      select rating into rl from duel_ratings where competitor_id = v_loser;
      ew := 1.0 / (1.0 + power(10.0, (rl - rw) / 400.0));
      delta := round(k * (1 - ew))::int;
      update duel_ratings set rating = rating + delta where competitor_id = v_winner;
      update duel_ratings set rating = rating - delta where competitor_id = v_loser;
    end if;

    -- voter accuracy on a certified winner (Sharp-Eye): watched voters only
    update voter_stats vs set
      qualified = vs.qualified + 1,
      correct   = vs.correct + (case when dv.choice = v_side then 1 else 0 end),
      accuracy  = (vs.correct + (case when dv.choice = v_side then 1 else 0 end))::numeric
                  / nullif(vs.qualified + 1, 0)
    from duel_votes dv
    where dv.duel_id = p_duel_id and dv.watched and dv.voter_competitor_id = vs.competitor_id;

  elsif p_result = 'draw' then
    update duels set status = 'complete', result = 'draw', winner_id = null, resolved_at = now()
      where id = p_duel_id;
    insert into duel_ratings (competitor_id) values (d.challenger_id) on conflict (competitor_id) do nothing;
    insert into duel_ratings (competitor_id) values (d.opponent_id)  on conflict (competitor_id) do nothing;
    -- Elo-neutral, streak preserved, counts as a duel fought
    update duel_ratings set draws = draws + 1, duels_fought = duels_fought + 1
      where competitor_id in (d.challenger_id, d.opponent_id);

  elsif p_result = 'no_contest' then
    update duels set status = 'no_contest', result = 'no_contest', winner_id = null, resolved_at = now()
      where id = p_duel_id;
    -- no rating / accuracy changes (the duel did not really happen)
  end if;
end;
$$;

-- ---------- close_duel_voting (internal) ----------
create or replace function nmao.close_duel_voting(p_duel_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  d duels; total int; ch int; op int; in_ot boolean;
begin
  select * into d from duels where id = p_duel_id for update;
  if not found or d.status <> 'voting' then return coalesce(d.status, 'missing'); end if;
  in_ot := d.overtime_until is not null;

  select count(*) filter (where choice = 'challenger'),
         count(*) filter (where choice = 'opponent'),
         count(*)
    into ch, op, total
  from duel_votes where duel_id = p_duel_id;

  if total < 3 then
    if not in_ot and not d.extended then
      update duels set closes_vote_at = now() + interval '24 hours', extended = true where id = p_duel_id;
      return 'extended';
    else
      perform nmao.settle_duel(p_duel_id, 'no_contest', false);
      return 'no_contest';
    end if;
  end if;

  if ch <> op then
    perform nmao.settle_duel(p_duel_id, case when ch > op then 'challenger' else 'opponent' end, true);
    return 'complete';
  else
    if not in_ot then
      update duels set overtime_until = now() + interval '60 minutes' where id = p_duel_id;  -- sudden death
      return 'sudden_death';
    else
      perform nmao.settle_duel(p_duel_id, 'draw', false);  -- deadlock at overtime end
      return 'deadlock';
    end if;
  end if;
end;
$$;

-- ---------- forfeit_duel (internal) ----------
create or replace function nmao.forfeit_duel(p_duel_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare d duels;
begin
  select * into d from duels where id = p_duel_id for update;
  if not found or d.status <> 'accepted' then return coalesce(d.status, 'missing'); end if;

  if d.challenger_video is not null and d.opponent_video is null then
    perform nmao.settle_duel(p_duel_id, 'challenger', false, false);  -- forfeit-win, Elo-neutral, no-show untouched
    return 'forfeit_challenger';
  elsif d.opponent_video is not null and d.challenger_video is null then
    perform nmao.settle_duel(p_duel_id, 'opponent', false, false);
    return 'forfeit_opponent';
  else
    update duels set status = 'cancelled', resolved_at = now() where id = p_duel_id;  -- neither showed
    return 'cancelled';
  end if;
end;
$$;

-- ---------- sweep_duels (cron entrypoint) ----------
create or replace function nmao.sweep_duels()
returns int
language plpgsql security definer set search_path = public
as $$
declare r record; n int := 0;
begin
  -- 1) unanswered challenges expire
  update duels set status = 'cancelled'
    where status = 'pending' and now() > response_deadline;

  -- 2) upload deadline → forfeit / cancel
  for r in select id from duels where status = 'accepted' and now() > upload_deadline loop
    perform nmao.forfeit_duel(r.id); n := n + 1;
  end loop;

  -- 3) close voting (normal close OR sudden-death overtime end)
  for r in
    select id from duels
    where status = 'voting'
      and ( (overtime_until is null and now() >= closes_vote_at)
         or (overtime_until is not null and now() >= overtime_until) )
  loop
    perform nmao.close_duel_voting(r.id); n := n + 1;
  end loop;

  return n;
end;
$$;

-- ---------- grants: internal only; sweep callable by cron/service ----------
revoke all on function nmao.settle_duel(uuid, text, boolean, boolean) from public;
revoke all on function nmao.close_duel_voting(uuid)                   from public;
revoke all on function nmao.forfeit_duel(uuid)                        from public;
revoke all on function nmao.sweep_duels()                             from public;
grant execute on function nmao.sweep_duels()          to service_role;
grant execute on function nmao.close_duel_voting(uuid) to service_role;  -- admin force-close
