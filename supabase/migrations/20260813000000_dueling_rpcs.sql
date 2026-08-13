-- ============================================================
-- Dueling — Slice 2a: transition + vote RPCs
-- The ONLY way a duel changes state. SECURITY DEFINER + internal auth
-- (nmao.competitor_ids()), so participants can't rig outcomes and RLS on the
-- underlying tables can't be bypassed by direct writes. Callable by the client
-- via supabase.rpc(...). Spec: docs/DUELING-DECISIONS.md.
--
-- Functions (public schema so PostgREST exposes them):
--   create_duel        — challenger opens a duel (enforces the 4/week cap)
--   respond_to_duel    — opponent accepts (→ upload window) or declines
--   submit_duel_video  — a participant uploads; both uploaded → voting opens
--   cast_duel_vote     — open voting: one vote, ≥15s watched, updates voter_stats
--   duel_vote_queue    — under-voted live duels for a voter (also the public
--                        duel-pool read: exposes only safe fields via definer)
--
-- Deferred to 2b/cron: close/certify (≥3, majority, 60-min sudden-death,
-- deadlock/no-contest), duel Elo, no-show forfeit, season reset, monthly reveal.
-- Not enforced here (Phase 1): the $3.99 membership gate, per-student dueling
-- toggle, geo eligibility, random matchmaking. ============================================================

-- ---------- create_duel ----------
create or replace function public.create_duel(p_challenger_id uuid, p_opponent_id uuid, p_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_week int;
begin
  if p_type not in ('kata','weapon') then
    raise exception 'invalid duel type: %', p_type using errcode = '22023';
  end if;
  if p_challenger_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized to duel as this competitor' using errcode = '42501';
  end if;
  if p_opponent_id = p_challenger_id then
    raise exception 'cannot duel yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from competitors where id = p_opponent_id and status = 'active') then
    raise exception 'opponent not found' using errcode = '23503';
  end if;
  -- 4 duels per rolling 7 days (declined/cancelled don't count against the cap)
  select count(*) into v_week
  from duels
  where challenger_id = p_challenger_id
    and created_at > now() - interval '7 days'
    and status not in ('declined','cancelled');
  if v_week >= 4 then
    raise exception 'weekly duel limit reached (4 per week)' using errcode = 'P0001';
  end if;

  insert into duels (challenger_id, opponent_id, type, status, response_deadline)
  values (p_challenger_id, p_opponent_id, p_type, 'pending', now() + interval '48 hours')
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- respond_to_duel ----------
create or replace function public.respond_to_duel(p_duel_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d duels;
begin
  select * into d from duels where id = p_duel_id for update;
  if not found then raise exception 'duel not found' using errcode = '23503'; end if;
  if d.opponent_id not in (select nmao.competitor_ids()) then
    raise exception 'only the challenged competitor can respond' using errcode = '42501';
  end if;
  if d.status <> 'pending' then
    raise exception 'duel is not awaiting a response (status=%)', d.status using errcode = 'P0001';
  end if;
  if now() > d.response_deadline then
    update duels set status = 'cancelled' where id = p_duel_id;
    raise exception 'challenge expired' using errcode = 'P0001';
  end if;

  if p_accept then
    update duels set status = 'accepted', upload_deadline = now() + interval '72 hours' where id = p_duel_id;
    return 'accepted';
  else
    update duels set status = 'declined' where id = p_duel_id;
    return 'declined';
  end if;
end;
$$;

-- ---------- submit_duel_video ----------
create or replace function public.submit_duel_video(p_duel_id uuid, p_competitor_id uuid, p_video_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d duels;
  v_both boolean;
begin
  if coalesce(p_video_url, '') = '' then raise exception 'video required' using errcode = '22023'; end if;
  select * into d from duels where id = p_duel_id for update;
  if not found then raise exception 'duel not found' using errcode = '23503'; end if;
  if p_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized as this competitor' using errcode = '42501';
  end if;
  if p_competitor_id not in (d.challenger_id, d.opponent_id) then
    raise exception 'not a participant in this duel' using errcode = '42501';
  end if;
  if d.status <> 'accepted' then
    raise exception 'not in the upload phase (status=%)', d.status using errcode = 'P0001';
  end if;
  if now() > d.upload_deadline then
    raise exception 'upload window closed' using errcode = 'P0001';
  end if;

  if p_competitor_id = d.challenger_id then
    update duels set challenger_video = p_video_url where id = p_duel_id;
  else
    update duels set opponent_video = p_video_url where id = p_duel_id;
  end if;

  select (challenger_video is not null and opponent_video is not null) into v_both
  from duels where id = p_duel_id;
  if v_both then
    update duels
      set status = 'voting', opens_vote_at = now(), closes_vote_at = now() + interval '48 hours'
      where id = p_duel_id;
    return 'voting';
  end if;
  return 'accepted';
end;
$$;

-- ---------- cast_duel_vote (open voting; ≥15s watch; updates voter_stats) ----------
create or replace function public.cast_duel_vote(p_duel_id uuid, p_voter_competitor_id uuid, p_choice text, p_watched_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------- duel_vote_queue (under-voted live duels + the public pool read) ----------
-- SECURITY DEFINER so it can expose participants' names/schools (competitors RLS
-- otherwise hides them). Returns only safe public fields. Videos are object paths;
-- the client gets a signed playback URL via the get-playback-url seam.
create or replace function public.duel_vote_queue(p_competitor_id uuid, p_limit int default 20)
returns table (
  duel_id uuid, duel_type text, closes_vote_at timestamptz, vote_count bigint,
  challenger_id uuid, challenger_name text, challenger_school text, challenger_video text,
  opponent_id uuid, opponent_name text, opponent_school text, opponent_video text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.type, d.closes_vote_at,
         (select count(*) from duel_votes v where v.duel_id = d.id) as vote_count,
         ch.id, (ch.first_name || ' ' || ch.last_name), chs.name, d.challenger_video,
         op.id, (op.first_name || ' ' || op.last_name), ops.name, d.opponent_video
  from duels d
  join competitors ch on ch.id = d.challenger_id
  join competitors op on op.id = d.opponent_id
  left join schools chs on chs.id = ch.school_id
  left join schools ops on ops.id = op.school_id
  where d.status = 'voting'
    and d.moderation_status = 'ok'
    and not exists (
      select 1 from duel_votes v
      where v.duel_id = d.id and v.voter_competitor_id = p_competitor_id
    )
  order by vote_count asc, d.closes_vote_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- ---------- grants (authenticated only; definer + internal auth) ----------
revoke all on function public.create_duel(uuid, uuid, text)        from public;
revoke all on function public.respond_to_duel(uuid, boolean)       from public;
revoke all on function public.submit_duel_video(uuid, uuid, text)  from public;
revoke all on function public.cast_duel_vote(uuid, uuid, text, int) from public;
revoke all on function public.duel_vote_queue(uuid, int)           from public;

grant execute on function public.create_duel(uuid, uuid, text)        to authenticated;
grant execute on function public.respond_to_duel(uuid, boolean)       to authenticated;
grant execute on function public.submit_duel_video(uuid, uuid, text)  to authenticated;
grant execute on function public.cast_duel_vote(uuid, uuid, text, int) to authenticated;
grant execute on function public.duel_vote_queue(uuid, int)           to authenticated;
