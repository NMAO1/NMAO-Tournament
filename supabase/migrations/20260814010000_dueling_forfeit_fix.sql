-- ============================================================
-- Dueling — settle_duel fix: a forfeited no-show stays truly untouched.
-- Before: both competitors always got a duel_ratings row (winner + loser),
-- so a no-show ended with a default all-zeros/1200 row despite "no penalty".
-- After: the loser row is only created when we actually record something for
-- them (a real loss, or an Elo swing). Forfeit (no penalty, Elo-neutral) leaves
-- the no-show with no dueling record at all.  Spec: DUELING-DECISIONS.md §3.
-- ============================================================

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
    -- only give the loser a record when we actually change something for them
    if p_penalize_loser or p_apply_elo then
      insert into duel_ratings (competitor_id) values (v_loser) on conflict (competitor_id) do nothing;
    end if;

    update duel_ratings
      set wins = wins + 1, streak = streak + 1, best_streak = greatest(best_streak, streak + 1),
          duels_fought = duels_fought + 1
      where competitor_id = v_winner;
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
    update duel_ratings set draws = draws + 1, duels_fought = duels_fought + 1
      where competitor_id in (d.challenger_id, d.opponent_id);

  elsif p_result = 'no_contest' then
    update duels set status = 'no_contest', result = 'no_contest', winner_id = null, resolved_at = now()
      where id = p_duel_id;
  end if;
end;
$$;
