-- ============================================================
-- Dueling — app-support gaps for the Arena (spec: docs/APP-WIRING-SPEC.md §9)
--   G1  competitors.equipped_badge_code + set_equipped_frame() — the badge frame
--       ringing your video/avatar; only a frame you actually earned may be equipped
--   G5  duel_vote_queue returns each duelist's equipped frame (code + rarity) so the
--       Arena can draw the rarity glow without a second round-trip
--   G6  mark_badges_seen() — clear the "new badge" shimmer after the vault is viewed
-- All idempotent. G1/G5/G6 are what the Arena needs to render frames correctly.
-- ============================================================

-- ---------- G1: equipped frame ----------
alter table competitors add column if not exists equipped_badge_code text;

-- equip (or clear, with null) the frame shown around your video/avatar.
-- Guardian-safe: p_competitor_id must be one of the caller's competitor_ids().
-- Only a badge the competitor has actually been awarded may be equipped (any tier).
create or replace function public.set_equipped_frame(p_competitor_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized as this competitor' using errcode = '42501';
  end if;
  if p_code is not null and not exists (
    select 1 from badge_awards where competitor_id = p_competitor_id and badge_code = p_code
  ) then
    raise exception 'you have not earned that frame' using errcode = 'P0001';
  end if;
  update competitors set equipped_badge_code = p_code where id = p_competitor_id;
end;
$$;
revoke all on function public.set_equipped_frame(uuid, text) from public;
grant execute on function public.set_equipped_frame(uuid, text) to authenticated;

-- ---------- G6: mark badges seen ----------
-- clear the unseen shimmer. null p_competitor_id → all of the caller's competitors
-- (guardian with multiple children); otherwise just that one (if authorized).
create or replace function public.mark_badges_seen(p_competitor_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_competitor_id is null then
    update badge_awards set seen = true
    where competitor_id in (select nmao.competitor_ids()) and seen = false;
  else
    if p_competitor_id not in (select nmao.competitor_ids()) then
      raise exception 'not authorized as this competitor' using errcode = '42501';
    end if;
    update badge_awards set seen = true where competitor_id = p_competitor_id and seen = false;
  end if;
end;
$$;
revoke all on function public.mark_badges_seen(uuid) from public;
grant execute on function public.mark_badges_seen(uuid) to authenticated;

-- ---------- G5: duel_vote_queue returns equipped frames ----------
-- Return-type change → must drop & recreate. Adds *_frame_code / *_frame_rarity for
-- both duelists (null when nothing equipped). Rarity comes from the badges catalog.
drop function if exists public.duel_vote_queue(uuid, int);
create function public.duel_vote_queue(p_competitor_id uuid, p_limit int default 20)
returns table (
  duel_id uuid, duel_type text, closes_vote_at timestamptz, vote_count bigint,
  challenger_id uuid, challenger_name text, challenger_school text, challenger_video text,
  challenger_frame_code text, challenger_frame_rarity text,
  opponent_id uuid, opponent_name text, opponent_school text, opponent_video text,
  opponent_frame_code text, opponent_frame_rarity text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.type, d.closes_vote_at,
         (select count(*) from duel_votes v where v.duel_id = d.id) as vote_count,
         ch.id, (ch.first_name || ' ' || ch.last_name), chs.name, d.challenger_video,
         ch.equipped_badge_code, chb.rarity::text,
         op.id, (op.first_name || ' ' || op.last_name), ops.name, d.opponent_video,
         op.equipped_badge_code, opb.rarity::text
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
  order by vote_count asc, d.closes_vote_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
revoke all on function public.duel_vote_queue(uuid, int) from public;
grant execute on function public.duel_vote_queue(uuid, int) to authenticated;
