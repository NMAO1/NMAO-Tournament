-- App Store 1.2 (UGC) hardening (2026-09-24): eject offenders + let users remove
-- their own posts. Ejecting = competitors.status <> 'active' (matchmaking, boards,
-- and cast_duel_vote already exclude non-active); these add the audit trail, a
-- self-remove, and defense-in-depth gates on the two UGC-creation paths.

alter table public.competitors add column if not exists banned_at     timestamptz;
alter table public.competitors add column if not exists banned_reason text;

-- A competitor immediately removes their OWN duel video from the voting feed.
create or replace function public.withdraw_my_duel(p_competitor_id uuid, p_duel_id uuid)
returns boolean language plpgsql security definer set search_path = public, nmao as $$
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not your competitor';
  end if;
  update public.duels
     set moderation_status = 'removed', updated_at = now()
   where id = p_duel_id and (challenger_id = p_competitor_id or opponent_id = p_competitor_id);
  return found;
end $$;
revoke all on function public.withdraw_my_duel(uuid, uuid) from public, anon;
grant execute on function public.withdraw_my_duel(uuid, uuid) to authenticated;

-- The caller's own live duels (for the "remove my video" list).
create or replace function public.my_live_duels(p_competitor_id uuid)
returns table(id uuid, type text, status text, moderation_status text, created_at timestamptz)
language sql stable security definer set search_path = public, nmao as $$
  select d.id, d.type, d.status, d.moderation_status, d.created_at
  from public.duels d
  where p_competitor_id in (select nmao.competitor_ids())
    and (d.challenger_id = p_competitor_id or d.opponent_id = p_competitor_id)
    and coalesce(d.moderation_status,'ok') <> 'removed'
    and d.status in ('pending','accepted','live','voting')
  order by d.created_at desc;
$$;
revoke all on function public.my_live_duels(uuid) from public, anon;
grant execute on function public.my_live_duels(uuid) to authenticated;

-- Defense-in-depth: a banned competitor can't create a duel (challenger side was
-- unchecked) or vote. request_duel already gates the OPPONENT pool to status='active'.
create or replace function public.social_is_active_competitor(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'active' from public.competitors where id = p_id), false);
$$;
