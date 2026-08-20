-- ============================================================
--  UGC safety (Apple Guideline 1.2): user-facing REPORT + BLOCK.
--  The competitor app shows other people's entry/duel videos + community voting,
--  so Apple requires a way to (a) report content and (b) block a user. The
--  duel_reports table already exists; this adds the RPC that files a report AND
--  auto-hides the duel pending staff review, plus a block feature that excludes a
--  blocked competitor from your matchmaking and your vote queue.
-- ============================================================

-- ---------- report a duel: file + immediately hide from vote queues ----------
create or replace function public.report_duel(p_duel_id uuid, p_reporter uuid, p_target text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_reporter not in (select nmao.competitor_ids()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from duels where id = p_duel_id) then
    raise exception 'duel not found' using errcode = '23503';
  end if;

  insert into duel_reports (duel_id, reporter_competitor_id, target, reason)
  values (
    p_duel_id, p_reporter,
    case when p_target in ('challenger','opponent','other') then p_target else 'other' end,
    coalesce(nullif(btrim(p_reason), ''), 'unspecified')
  );

  -- Auto-hide from vote queues pending staff review (duel_vote_queue serves only
  -- moderation_status='ok'). Idempotent; never touches an already-removed duel.
  update duels set moderation_status = 'under_review'
    where id = p_duel_id and moderation_status = 'ok';
end $$;
revoke all on function public.report_duel(uuid, uuid, text, text) from public, anon;
grant execute on function public.report_duel(uuid, uuid, text, text) to authenticated;

-- ---------- block list ----------
create table if not exists public.blocked_competitors (
  blocker_competitor_id uuid not null references competitors(id) on delete cascade,
  blocked_competitor_id uuid not null references competitors(id) on delete cascade,
  created_at            timestamptz not null default now(),
  primary key (blocker_competitor_id, blocked_competitor_id)
);
create index if not exists blocked_competitors_blocked_idx on public.blocked_competitors(blocked_competitor_id);
alter table public.blocked_competitors enable row level security;
drop policy if exists blocked_read on public.blocked_competitors;
create policy blocked_read on public.blocked_competitors for select to authenticated
  using (blocker_competitor_id in (select nmao.competitor_ids()));  -- writes go through the RPCs below

create or replace function public.block_competitor(p_blocker uuid, p_blocked uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_blocker not in (select nmao.competitor_ids()) then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_blocker = p_blocked then raise exception 'cannot block yourself' using errcode = '22023'; end if;
  if not exists (select 1 from competitors where id = p_blocked) then raise exception 'competitor not found' using errcode = '23503'; end if;
  insert into blocked_competitors (blocker_competitor_id, blocked_competitor_id)
    values (p_blocker, p_blocked) on conflict do nothing;
end $$;
revoke all on function public.block_competitor(uuid, uuid) from public, anon;
grant execute on function public.block_competitor(uuid, uuid) to authenticated;

create or replace function public.unblock_competitor(p_blocker uuid, p_blocked uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_blocker not in (select nmao.competitor_ids()) then raise exception 'not authorized' using errcode = '42501'; end if;
  delete from blocked_competitors where blocker_competitor_id = p_blocker and blocked_competitor_id = p_blocked;
end $$;
revoke all on function public.unblock_competitor(uuid, uuid) from public, anon;
grant execute on function public.unblock_competitor(uuid, uuid) to authenticated;

create or replace function public.my_blocked(p_competitor_id uuid)
returns table (competitor_id uuid, name text, school text)
language sql stable security definer set search_path = public as $$
  select c.id, nmao.display_name(c.first_name, c.last_name), s.name
  from blocked_competitors b
  join competitors c on c.id = b.blocked_competitor_id
  left join schools s on s.id = c.school_id
  where b.blocker_competitor_id = p_competitor_id
    and p_competitor_id in (select nmao.competitor_ids())
  order by c.first_name;
$$;
revoke all on function public.my_blocked(uuid) from public, anon;
grant execute on function public.my_blocked(uuid) to authenticated;

-- ---------- make matchmaking block-aware (re-assert request_duel) ----------
create or replace function public.request_duel(p_competitor_id uuid, p_event text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cap int := nmao.duel_weekly_cap(); ch competitors; v_opp uuid; v_week int; v_rating int;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then raise exception 'not authorized to duel as this competitor' using errcode = '42501'; end if;
  if not exists (select 1 from event_types where code = p_event) then raise exception 'unknown event: %', p_event using errcode = '22023'; end if;

  select * into ch from competitors where id = p_competitor_id;
  if not coalesce(ch.dueling_enabled, false) then raise exception 'dueling is not enabled for you yet (ask your school)' using errcode = 'P0001'; end if;

  select count(*) into v_week from duels
    where challenger_id = p_competitor_id and created_at > now() - interval '7 days' and status not in ('declined','cancelled');
  if v_week >= v_cap then raise exception 'weekly duel limit reached (% per week)', v_cap using errcode = 'P0001'; end if;

  select coalesce(dr.rating, 1200) into v_rating from duel_ratings dr where dr.competitor_id = p_competitor_id;
  v_rating := coalesce(v_rating, 1200);

  select op.id into v_opp
  from competitors op
  left join duel_ratings dr on dr.competitor_id = op.id
  where op.status = 'active' and op.id <> p_competitor_id
    and coalesce(op.dueling_enabled, false)
    and op.declared_rank is not distinct from ch.declared_rank
    and nmao.age_bracket_of(op.dob) is not distinct from nmao.age_bracket_of(ch.dob)
    and nmao.duel_geo_allowed(ch.school_id, op.school_id)
    and not exists (
      select 1 from duels d where d.status in ('pending','accepted','live','voting')
        and ((d.challenger_id = p_competitor_id and d.opponent_id = op.id)
          or (d.challenger_id = op.id and d.opponent_id = p_competitor_id)))
    -- NEW: never match someone either party has blocked
    and not exists (
      select 1 from blocked_competitors b
      where (b.blocker_competitor_id = p_competitor_id and b.blocked_competitor_id = op.id)
         or (b.blocker_competitor_id = op.id and b.blocked_competitor_id = p_competitor_id))
  order by (abs(coalesce(dr.rating, 1200) - v_rating) <= 150) desc, random()
  limit 1;

  if v_opp is null then
    raise exception 'No eligible opponents open right now — check back soon' using errcode = 'P0001';
  end if;

  insert into duels (challenger_id, opponent_id, type, status, response_deadline)
  values (p_competitor_id, v_opp, p_event, 'pending', now() + interval '48 hours')
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.request_duel(uuid, text) to authenticated;

-- ---------- make the vote queue block-aware (re-assert duel_vote_queue) ----------
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
    -- NEW: hide any duel with a competitor this viewer has blocked
    and not exists (select 1 from blocked_competitors b
      where b.blocker_competitor_id = p_competitor_id
        and b.blocked_competitor_id in (d.challenger_id, d.opponent_id))
    and (p_search is null or btrim(p_search) = '' or
      (nmao.display_name(ch.first_name, ch.last_name)) ilike '%' || btrim(p_search) || '%' or
      (nmao.display_name(op.first_name, op.last_name)) ilike '%' || btrim(p_search) || '%' or
      chs.name ilike '%' || btrim(p_search) || '%' or ops.name ilike '%' || btrim(p_search) || '%')
  order by vote_count asc, d.closes_vote_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.duel_vote_queue(uuid, integer, text) to authenticated;
