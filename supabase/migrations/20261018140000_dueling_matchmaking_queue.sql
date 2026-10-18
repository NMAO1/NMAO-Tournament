-- Dueling matchmaking QUEUE — fixes the cold-start deadlock (Brad 2026-10-18).
-- Before this, request_duel matched only an opponent who already existed in the
-- pool and, finding none, raised "No eligible opponents open right now". With a
-- thin/early pool every FIRST mover hit that wall, so dueling could never
-- bootstrap. Now matchmaking is mutual-intent via a waiting queue:
--   • request_duel tries to match a WAITING queuer (prefer exact rank + age
--     bracket, widen to ±1 each — a beginner never faces an advanced).
--   • On a match it creates the duel (status 'pending'; the existing duels_notify
--     trigger sends the opponent challenge_received) and dequeues the opponent.
--   • With nobody waiting it ENQUEUES the requester and returns NULL (they wait).
-- Backward-compatible with the installed Compete app: it ignores the returned id
-- and never crashes on NULL (a later app build adds a proper "you're queued" UI).
-- All other gates (auth, active, dueling_enabled, COPPA consent, weekly cap,
-- geo, is_test bucket, blocks, no dup active duel) are preserved verbatim from
-- 20261017140000.

-- ---- helpers -------------------------------------------------------------
-- Competition-tier index for widening (beginner<intermediate<advanced; black_belt=advanced).
create or replace function nmao.rank_tier_idx(r text) returns int language sql immutable as $$
  select case r when 'beginner' then 0 when 'intermediate' then 1 when 'advanced' then 2 when 'black_belt' then 2 else 1 end
$$;

-- Ordinal of an age bracket (by min_age) so "adjacent bracket" = |idx diff| <= 1.
create or replace function nmao.age_bracket_idx(p_code text)
returns int language sql stable security definer set search_path = public as $$
  select idx::int from (
    select code, (row_number() over (order by min_age) - 1) as idx from age_brackets
  ) t where t.code = p_code
$$;

-- ---- queue table ---------------------------------------------------------
create table if not exists public.duel_queue (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  event         text not null,
  declared_rank text,
  age_bracket   text,
  rating        int not null default 1200,
  is_test       boolean not null default false,
  school_id     uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days',
  unique (competitor_id, event)          -- one waiting slot per event
);
create index if not exists idx_duel_queue_event on public.duel_queue(event, expires_at);

alter table public.duel_queue enable row level security;
-- A competitor can see their own queue slots (for a future "you're queued" UI).
-- No INSERT/UPDATE/DELETE policy → writes are service-definer only (request_duel / leave_duel_queue).
drop policy if exists dq_self_read on public.duel_queue;
create policy dq_self_read on public.duel_queue
  for select using (competitor_id in (select nmao.competitor_ids()));

-- Leave the queue (future app "cancel" button; harmless now).
create or replace function public.leave_duel_queue(p_competitor_id uuid, p_event text default null)
returns int language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then raise exception 'not authorized' using errcode = '42501'; end if;
  delete from public.duel_queue where competitor_id = p_competitor_id and (p_event is null or event = p_event);
  get diagnostics n = row_count; return n;
end $function$;
revoke all on function public.leave_duel_queue(uuid, text) from public, anon;
grant execute on function public.leave_duel_queue(uuid, text) to authenticated;

-- ---- request_duel: queue-based matchmaking ------------------------------
create or replace function public.request_duel(p_competitor_id uuid, p_event text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid; v_cap int := nmao.duel_weekly_cap(); ch competitors; v_opp uuid; v_week int; v_rating int;
  v_rank_idx int; v_age_bracket text; v_age_idx int;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then raise exception 'not authorized to duel as this competitor' using errcode = '42501'; end if;
  if not exists (select 1 from event_types where code = p_event) then raise exception 'unknown event: %', p_event using errcode = '22023'; end if;

  select * into ch from competitors where id = p_competitor_id;
  if coalesce(ch.status, 'active') <> 'active' then raise exception 'This account is suspended and cannot duel.' using errcode = '42501'; end if;
  if not coalesce(ch.dueling_enabled, false) then raise exception 'dueling is not enabled for you yet (ask your school)' using errcode = 'P0001'; end if;
  -- COPPA: a real minor must have guardian consent on file before dueling.
  if not coalesce(ch.is_test, false)
     and extract(year from age(ch.dob)) < 18
     and not exists (select 1 from consents cn where cn.competitor_id = ch.id) then
    raise exception 'Guardian consent is required before this competitor can duel.' using errcode = 'P0001';
  end if;

  select count(*) into v_week from duels
    where challenger_id = p_competitor_id and created_at > now() - interval '7 days' and status not in ('declined','cancelled');
  if v_week >= v_cap then raise exception 'weekly duel limit reached (% per week)', v_cap using errcode = 'P0001'; end if;

  select coalesce(dr.rating, 1200) into v_rating from duel_ratings dr where dr.competitor_id = p_competitor_id;
  v_rating := coalesce(v_rating, 1200);
  v_rank_idx := nmao.rank_tier_idx(ch.declared_rank);
  v_age_bracket := nmao.age_bracket_of(ch.dob);
  v_age_idx := nmao.age_bracket_idx(v_age_bracket);

  -- Opportunistic cleanup of stale (expired) waiters.
  delete from duel_queue where expires_at <= now();

  -- Match a WAITING opponent — prefer exact tier, widen to ±1 rank / ±1 age bracket.
  select q.competitor_id into v_opp
  from duel_queue q
  join competitors op on op.id = q.competitor_id
  left join duel_ratings dr on dr.competitor_id = q.competitor_id
  where q.event = p_event
    and q.competitor_id <> p_competitor_id
    and q.expires_at > now()
    and coalesce(op.is_test, false) = coalesce(ch.is_test, false)
    and coalesce(op.status, 'active') = 'active'
    and coalesce(op.dueling_enabled, false)
    and nmao.duel_geo_allowed(ch.school_id, op.school_id)
    and (coalesce(op.is_test, false)
         or extract(year from age(op.dob)) >= 18
         or exists (select 1 from consents cn where cn.competitor_id = op.id))
    and abs(v_rank_idx - nmao.rank_tier_idx(op.declared_rank)) <= 1
    and abs(v_age_idx - nmao.age_bracket_idx(nmao.age_bracket_of(op.dob))) <= 1
    and not exists (select 1 from duels d where d.status in ('pending','accepted','live','voting')
        and ((d.challenger_id = p_competitor_id and d.opponent_id = op.id)
          or (d.challenger_id = op.id and d.opponent_id = p_competitor_id)))
    and not exists (select 1 from blocked_competitors b
        where (b.blocker_competitor_id = p_competitor_id and b.blocked_competitor_id = op.id)
           or (b.blocker_competitor_id = op.id and b.blocked_competitor_id = p_competitor_id))
  order by
    (abs(v_rank_idx - nmao.rank_tier_idx(op.declared_rank)) + abs(v_age_idx - nmao.age_bracket_idx(nmao.age_bracket_of(op.dob)))) asc,
    abs(coalesce(dr.rating, 1200) - v_rating) asc,
    q.created_at asc
  limit 1
  for update of q skip locked;

  if v_opp is not null then
    insert into duels (challenger_id, opponent_id, type, status, response_deadline)
    values (p_competitor_id, v_opp, p_event, 'pending', now() + interval '48 hours')
    returning id into v_id;
    delete from duel_queue where competitor_id in (v_opp, p_competitor_id) and event = p_event;
    return v_id;
  end if;

  -- Nobody waiting → enqueue the requester and wait (NULL = queued, not matched).
  insert into duel_queue (competitor_id, event, declared_rank, age_bracket, rating, is_test, school_id, created_at, expires_at)
  values (p_competitor_id, p_event, ch.declared_rank, v_age_bracket, v_rating, coalesce(ch.is_test, false), ch.school_id, now(), now() + interval '7 days')
  on conflict (competitor_id, event) do update set created_at = now(), expires_at = now() + interval '7 days', rating = excluded.rating;
  return null;
end $function$;
