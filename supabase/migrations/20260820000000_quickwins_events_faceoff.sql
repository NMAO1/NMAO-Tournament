-- ============================================================
--  Wave-2 quick-wins (SQL half):
--  1. event_options() — LIVE drifted (repair-marked but never ran): live returned
--     `select distinct event from medals` (raw codes, mixed case, MISSING the
--     Weapons events). Re-assert the repo-intended body (clean event_types.name).
--  2. duel_vote_queue() — the repo's LATEST def (20260818000000) accidentally
--     DROPPED the profile-photo columns; LIVE is the correct 22-col version. Re-
--     assert the correct def so a future rebuild from repo can't regress the app.
--     (No-op on live; corrects the repo lineage.)
--  3. duel_faceoff() — tighten the mystery gate: a NON-participant must not see a
--     pairing before it's public (voting/complete/no_contest) either. (The prior
--     gate only masked participants; a logged-in bystander could see pre-voting
--     pairings on a moderation-ok duel.)
-- ============================================================

-- ---------- 1. event_options: clean, admin-configurable, includes Weapons ----------
create or replace function public.event_options()
returns table (event text)
language sql stable security definer set search_path = public as $$
  select name from event_types order by discipline, style, name
$$;
grant execute on function public.event_options() to authenticated;

-- ---------- 2. duel_vote_queue: correct 22-col (photos + masked names) ----------
create or replace function public.duel_vote_queue(p_competitor_id uuid, p_limit integer default 20, p_search text default null)
returns table (
  duel_id uuid, duel_type text, closes_vote_at timestamptz, vote_count bigint,
  challenger_id uuid, challenger_name text, challenger_school text, challenger_video text, challenger_photo text,
  challenger_frame_code text, challenger_frame_rarity text, challenger_frame_name text, challenger_frame_desc text,
  opponent_id uuid, opponent_name text, opponent_school text, opponent_video text, opponent_photo text,
  opponent_frame_code text, opponent_frame_rarity text, opponent_frame_name text, opponent_frame_desc text
)
language sql stable security definer set search_path = public as $$
  select d.id, coalesce(et.name, d.type), d.closes_vote_at,
         (select count(*) from duel_votes v where v.duel_id = d.id) as vote_count,
         ch.id, (nmao.display_name(ch.first_name, ch.last_name)), chs.name, d.challenger_video, ch.profile_photo_url,
         ch.equipped_badge_code, chb.rarity::text, chb.name, chb.description,
         op.id, (nmao.display_name(op.first_name, op.last_name)), ops.name, d.opponent_video, op.profile_photo_url,
         op.equipped_badge_code, opb.rarity::text, opb.name, opb.description
  from duels d
  join competitors ch on ch.id = d.challenger_id
  join competitors op on op.id = d.opponent_id
  left join schools chs on chs.id = ch.school_id
  left join schools ops on ops.id = op.school_id
  left join badges  chb on chb.code = ch.equipped_badge_code
  left join badges  opb on opb.code = op.equipped_badge_code
  left join event_types et on et.code = d.type
  where d.status = 'voting' and d.moderation_status = 'ok'
    and d.challenger_id <> p_competitor_id and d.opponent_id <> p_competitor_id
    and not exists (select 1 from duel_votes v where v.duel_id = d.id and v.voter_competitor_id = p_competitor_id)
    and (p_search is null or btrim(p_search) = '' or
      (nmao.display_name(ch.first_name, ch.last_name)) ilike '%' || btrim(p_search) || '%' or
      (nmao.display_name(op.first_name, op.last_name)) ilike '%' || btrim(p_search) || '%' or
      chs.name ilike '%' || btrim(p_search) || '%' or ops.name ilike '%' || btrim(p_search) || '%')
  order by vote_count asc, d.closes_vote_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.duel_vote_queue(uuid, integer, text) to authenticated;

-- ---------- 3. duel_faceoff: mask pairings from bystanders pre-'voting' too ----------
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

  -- a NON-participant can only see a duel once it's public (voting onward)
  if not v_participant and not v_staff and d.status not in ('voting', 'complete', 'no_contest') then
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
