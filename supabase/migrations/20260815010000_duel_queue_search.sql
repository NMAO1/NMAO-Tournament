-- ============================================================
-- Dueling — vote-queue search + badge tooltip data (spec: APP-WIRING-SPEC.md §2a)
--   • p_search: server-side filter (name/school ILIKE) so a voter can find a
--     SPECIFIC duel even when it's past the first page of the queue
--   • frame_name + frame_desc: the selected badge's name + how-earned text, so the
--     ring can show a "why does this duelist have that badge?" crest with zero extra
--     round-trips (definer already reads badges regardless of RLS)
-- Return-type change → drop & recreate.
-- ============================================================

drop function if exists public.duel_vote_queue(uuid, int);
create function public.duel_vote_queue(p_competitor_id uuid, p_limit int default 20, p_search text default null)
returns table (
  duel_id uuid, duel_type text, closes_vote_at timestamptz, vote_count bigint,
  challenger_id uuid, challenger_name text, challenger_school text, challenger_video text,
  challenger_frame_code text, challenger_frame_rarity text, challenger_frame_name text, challenger_frame_desc text,
  opponent_id uuid, opponent_name text, opponent_school text, opponent_video text,
  opponent_frame_code text, opponent_frame_rarity text, opponent_frame_name text, opponent_frame_desc text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.type, d.closes_vote_at,
         (select count(*) from duel_votes v where v.duel_id = d.id) as vote_count,
         ch.id, (ch.first_name || ' ' || ch.last_name), chs.name, d.challenger_video,
         ch.equipped_badge_code, chb.rarity::text, chb.name, chb.description,
         op.id, (op.first_name || ' ' || op.last_name), ops.name, d.opponent_video,
         op.equipped_badge_code, opb.rarity::text, opb.name, opb.description
  from duels d
  join competitors ch on ch.id = d.challenger_id
  join competitors op on op.id = d.opponent_id
  left join schools chs on chs.id = ch.school_id
  left join schools ops on ops.id = op.school_id
  left join badges  chb on chb.code = ch.equipped_badge_code
  left join badges  opb on opb.code = op.equipped_badge_code
  where d.status = 'voting'
    and d.moderation_status = 'ok'
    and not exists (
      select 1 from duel_votes v
      where v.duel_id = d.id and v.voter_competitor_id = p_competitor_id
    )
    and (
      p_search is null or btrim(p_search) = '' or
      (ch.first_name || ' ' || ch.last_name) ilike '%' || btrim(p_search) || '%' or
      (op.first_name || ' ' || op.last_name) ilike '%' || btrim(p_search) || '%' or
      chs.name ilike '%' || btrim(p_search) || '%' or
      ops.name ilike '%' || btrim(p_search) || '%'
    )
  order by vote_count asc, d.closes_vote_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
revoke all on function public.duel_vote_queue(uuid, int, text) from public;
grant execute on function public.duel_vote_queue(uuid, int, text) to authenticated;
