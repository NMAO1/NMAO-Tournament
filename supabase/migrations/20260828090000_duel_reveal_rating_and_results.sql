-- Crown-jewel duel reveal, part 1 (reachability + rating swing):
--  • persist each duelist's rating before/after at settlement (settle_duel computes
--    the Elo delta but stored it nowhere) so the reveal can show "1200 → 1216 ▲+16"
--  • surface those on duel_reveal
--  • my_duel_results: a caller-owned list of CLOSED duels (opponent revealed) so the
--    reveal is reachable in-app, not only via a push notification.

alter table public.duels add column if not exists challenger_rating_before integer;
alter table public.duels add column if not exists challenger_rating_after  integer;
alter table public.duels add column if not exists opponent_rating_before   integer;
alter table public.duels add column if not exists opponent_rating_after    integer;

-- settle_duel: identical to current, plus a stamp of the per-duel rating movement
-- inside the Elo branch (forward-only; draws/no-contest leave the columns null).
create or replace function nmao.settle_duel(p_duel_id uuid, p_result text, p_apply_elo boolean, p_penalize_loser boolean default true)
returns void language plpgsql security definer set search_path to 'public'
as $function$
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
      -- record the movement for the reveal (rw/rl are the pre-Elo ratings)
      update duels set
        challenger_rating_before = case when v_side = 'challenger' then rw else rl end,
        challenger_rating_after  = case when v_side = 'challenger' then rw + delta else rl - delta end,
        opponent_rating_before   = case when v_side = 'challenger' then rl else rw end,
        opponent_rating_after    = case when v_side = 'challenger' then rl - delta else rw + delta end
      where id = p_duel_id;
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
$function$;

-- duel_reveal: same payload + the per-side rating movement.
create or replace function public.duel_reveal(p_duel_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare d duels; v_face jsonb; ch_v int; op_v int; ch_b int; op_b int;
begin
  select * into d from duels where id = p_duel_id;
  if not found then raise exception 'duel not found' using errcode = '23503'; end if;
  if d.status not in ('complete','no_contest') and not nmao.is_staff() then
    raise exception 'the tally is hidden until this duel closes' using errcode = 'P0001';
  end if;
  select count(*) filter (where choice = 'challenger'),
         count(*) filter (where choice = 'opponent'),
         count(distinct voter_competitor_id) filter (where choice = 'challenger'),
         count(distinct voter_competitor_id) filter (where choice = 'opponent')
    into ch_v, op_v, ch_b, op_b
    from duel_votes where duel_id = p_duel_id;
  v_face := public.duel_faceoff(p_duel_id);
  return v_face || jsonb_build_object(
    'result', d.result, 'winner_id', d.winner_id, 'resolved_at', d.resolved_at,
    'challenger_votes', ch_v, 'opponent_votes', op_v, 'total_votes', coalesce(ch_v,0) + coalesce(op_v,0),
    'challenger_backers', ch_b, 'opponent_backers', op_b,
    'challenger_rating_before', d.challenger_rating_before, 'challenger_rating_after', d.challenger_rating_after,
    'opponent_rating_before', d.opponent_rating_before, 'opponent_rating_after', d.opponent_rating_after
  );
end;
$function$;

-- my_duel_results: the caller's CLOSED duels, opponent revealed, newest first.
create or replace function public.my_duel_results(p_competitor_id uuid, p_limit integer default 20)
returns table(duel_id uuid, event text, type text, result text, outcome text, opponent_name text, resolved_at timestamptz)
language sql stable security definer set search_path to 'public'
as $function$
  select d.id,
         coalesce(et.name, d.type),
         d.type,
         d.result,
         case
           when d.result in ('draw','no_contest') then 'draw'
           when d.winner_id = p_competitor_id then 'win'
           else 'loss'
         end,
         nmao.display_name(o.first_name, o.last_name),
         d.resolved_at
  from duels d
  left join event_types et on et.code = d.type
  join competitors o on o.id = case when d.challenger_id = p_competitor_id then d.opponent_id else d.challenger_id end
  where p_competitor_id in (select nmao.competitor_ids())
    and (d.challenger_id = p_competitor_id or d.opponent_id = p_competitor_id)
    and d.status in ('complete','no_contest')
  order by d.resolved_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$function$;

grant execute on function public.my_duel_results(uuid, integer) to authenticated;
