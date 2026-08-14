-- ============================================================
-- App-support gap G3 (spec: APP-WIRING-SPEC.md §2a / §8a)
--   nmao.competitor_card(id)  — one competitor's "Tale of the Path" card
--                               (name, school, rank, rating, wins, streak, frame, photo)
--   public.duel_faceoff(duel) — both cards + duel meta, NO tally. For the pre-vote
--                               landscape face-off (arena opening) AND the reveal's face-off.
--   public.duel_reveal(duel)  — faceoff + tally + result. Tally stays HIDDEN until the
--                               duel resolves (complete/no_contest) — honors the hidden-tally rule.
-- ============================================================

create or replace function nmao.competitor_card(p_competitor_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'competitor_id', c.id,
    'name', c.first_name || ' ' || c.last_name,
    'first_name', c.first_name,
    'last_name', c.last_name,
    'school', s.name,
    'rank', c.declared_rank,
    'age_bracket', nmao.age_bracket_of(c.dob),
    'photo', c.profile_photo_url,
    'rating', coalesce(dr.rating, 1200),
    'duel_wins', coalesce(dr.wins, 0),
    'win_streak', coalesce(dr.streak, 0),
    'best_streak', coalesce(dr.best_streak, 0),
    'frame', case when c.equipped_badge_code is null then null else
      jsonb_build_object('code', b.code, 'name', b.name, 'rarity', b.rarity::text, 'description', b.description) end
  )
  from competitors c
  left join schools s        on s.id = c.school_id
  left join duel_ratings dr  on dr.competitor_id = c.id
  left join badges b         on b.code = c.equipped_badge_code
  where c.id = p_competitor_id
$$;

-- ---- face-off: both cards + meta, no tally (safe pre-vote) ----
create or replace function public.duel_faceoff(p_duel_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d duels;
begin
  select * into d from duels where id = p_duel_id;
  if not found then raise exception 'duel not found' using errcode = '23503'; end if;
  if d.moderation_status <> 'ok'
     and not nmao.is_staff()
     and not (d.challenger_id in (select nmao.competitor_ids()) or d.opponent_id in (select nmao.competitor_ids())) then
    raise exception 'not available' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'duel_id', d.id, 'type', d.type, 'status', d.status,
    'challenger', nmao.competitor_card(d.challenger_id),
    'opponent',   nmao.competitor_card(d.opponent_id)
  );
end;
$$;

-- ---- reveal: face-off + tally + result (only once resolved) ----
create or replace function public.duel_reveal(p_duel_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d duels; v_face jsonb; ch_v int; op_v int; ch_b int; op_b int;
begin
  select * into d from duels where id = p_duel_id;
  if not found then raise exception 'duel not found' using errcode = '23503'; end if;
  -- hidden-tally rule: no counts until the duel closes (staff may preview)
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
    'challenger_backers', ch_b, 'opponent_backers', op_b
  );
end;
$$;

revoke all on function public.duel_faceoff(uuid) from public;
revoke all on function public.duel_reveal(uuid)  from public;
grant execute on function public.duel_faceoff(uuid) to authenticated;
grant execute on function public.duel_reveal(uuid)  to authenticated;
