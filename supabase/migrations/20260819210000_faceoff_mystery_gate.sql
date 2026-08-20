-- ============================================================
--  Mystery-opponent integrity: a duel PARTICIPANT must not be able to unmask
--  their opponent before the reveal. my_active_duels already masks, but
--  duel_faceoff returned both competitor cards for any participant at any
--  status — a participant could call it with their own duel id and see the
--  "mystery" opponent early. Gate it: until the duel closes
--  (complete / no_contest), a participant sees their OWN card but the other
--  side is masked. Voters (non-participants) and staff are unaffected — the
--  Arena's community face-off during 'voting' still shows names by design.
-- ============================================================
create or replace function public.duel_faceoff(p_duel_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d duels;
  v_staff boolean;
  v_participant boolean;
  v_masked jsonb := jsonb_build_object(
    'competitor_id', null, 'name', 'Mystery opponent', 'first_name', 'Mystery', 'last_name', '',
    'school', null, 'rank', null, 'age_bracket', null, 'photo', null,
    'rating', 1200, 'duel_wins', 0, 'win_streak', 0, 'best_streak', 0, 'frame', null
  );
begin
  select * into d from duels where id = p_duel_id;
  if not found then raise exception 'duel not found' using errcode = '23503'; end if;

  v_staff := nmao.is_staff();
  v_participant := d.challenger_id in (select nmao.competitor_ids())
                or d.opponent_id  in (select nmao.competitor_ids());

  -- unmoderated duels are visible only to staff or the two participants
  if d.moderation_status <> 'ok' and not v_staff and not v_participant then
    raise exception 'not available' using errcode = '42501';
  end if;

  -- MYSTERY GATE: a participant can't unmask the other side pre-reveal.
  if v_participant and not v_staff and d.status not in ('complete', 'no_contest') then
    return jsonb_build_object(
      'duel_id', d.id, 'type', d.type, 'status', d.status,
      'challenger', case when d.challenger_id in (select nmao.competitor_ids())
                         then nmao.competitor_card(d.challenger_id) else v_masked end,
      'opponent',   case when d.opponent_id in (select nmao.competitor_ids())
                         then nmao.competitor_card(d.opponent_id) else v_masked end
    );
  end if;

  return jsonb_build_object(
    'duel_id', d.id, 'type', d.type, 'status', d.status,
    'challenger', nmao.competitor_card(d.challenger_id),
    'opponent',   nmao.competitor_card(d.opponent_id)
  );
end;
$$;

revoke all on function public.duel_faceoff(uuid) from public, anon;
grant execute on function public.duel_faceoff(uuid) to authenticated;
