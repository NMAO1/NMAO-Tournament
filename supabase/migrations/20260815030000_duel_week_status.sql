-- ============================================================
-- Dueling — "how many duels left this week" (spec: APP-WIRING-SPEC.md §2)
-- The 4/week cap was hardcoded in create_duel; the app needs to READ the remaining
-- count to remind competitors. To avoid the cap drifting between the reminder and
-- the enforcement, centralize it in nmao.duel_weekly_cap() and have BOTH use it.
--   • nmao.duel_weekly_cap()   — single source of truth for the weekly cap
--   • public.create_duel(...)   — re-declared (eligibility version) to read the cap
--   • public.duel_week_status() — used / limit / remaining / next_slot_at
-- next_slot_at = when the oldest counting duel ages out of the rolling 7-day window
-- (i.e. when a slot frees) — for a "resets in 2 days" line when at the cap.
-- ============================================================

create or replace function nmao.duel_weekly_cap()
returns int language sql immutable as $$ select 4 $$;

-- ---- create_duel: same eligibility gates, cap now read from the helper ----
create or replace function public.create_duel(p_challenger_id uuid, p_opponent_id uuid, p_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_week int; v_cap int := nmao.duel_weekly_cap(); ch competitors; op competitors;
begin
  if p_type not in ('kata','weapon') then raise exception 'invalid duel type: %', p_type using errcode = '22023'; end if;
  if p_challenger_id not in (select nmao.competitor_ids()) then raise exception 'not authorized to duel as this competitor' using errcode = '42501'; end if;
  if p_opponent_id = p_challenger_id then raise exception 'cannot duel yourself' using errcode = '22023'; end if;

  select * into ch from competitors where id = p_challenger_id;
  select * into op from competitors where id = p_opponent_id and status = 'active';
  if op.id is null then raise exception 'opponent not found' using errcode = '23503'; end if;

  -- eligibility gates
  if not coalesce(ch.dueling_enabled, false) then raise exception 'dueling is not enabled for you yet (ask your school)' using errcode = 'P0001'; end if;
  if not coalesce(op.dueling_enabled, false) then raise exception 'that competitor is not open to duels' using errcode = 'P0001'; end if;
  if ch.declared_rank is distinct from op.declared_rank then raise exception 'opponents must be the same rank/class' using errcode = 'P0001'; end if;
  if nmao.age_bracket_of(ch.dob) is distinct from nmao.age_bracket_of(op.dob) then raise exception 'opponents must be in the same age category' using errcode = 'P0001'; end if;
  if not nmao.duel_geo_allowed(ch.school_id, op.school_id) then raise exception 'that opponent is outside your schools'' dueling area' using errcode = 'P0001'; end if;

  -- one active duel between the pair at a time
  if exists (select 1 from duels d where d.status in ('pending','accepted','live','voting')
             and ((d.challenger_id = p_challenger_id and d.opponent_id = p_opponent_id)
               or (d.challenger_id = p_opponent_id and d.opponent_id = p_challenger_id))) then
    raise exception 'you already have an active duel with this competitor' using errcode = 'P0001';
  end if;

  -- weekly cap (rolling 7 days; declined/cancelled don't count)
  select count(*) into v_week from duels
    where challenger_id = p_challenger_id and created_at > now() - interval '7 days' and status not in ('declined','cancelled');
  if v_week >= v_cap then raise exception 'weekly duel limit reached (% per week)', v_cap using errcode = 'P0001'; end if;

  insert into duels (challenger_id, opponent_id, type, status, response_deadline)
  values (p_challenger_id, p_opponent_id, p_type, 'pending', now() + interval '48 hours')
  returning id into v_id;
  return v_id;
end;
$$;

-- ---- read: duels left this week ----
create or replace function public.duel_week_status(p_competitor_id uuid)
returns table (used int, weekly_limit int, remaining int, next_slot_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_cap int := nmao.duel_weekly_cap();
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized as this competitor' using errcode = '42501';
  end if;
  return query
    select count(*)::int,
           v_cap,
           greatest(0, v_cap - count(*)::int),
           (min(created_at) + interval '7 days')
    from duels
    where challenger_id = p_competitor_id
      and created_at > now() - interval '7 days'
      and status not in ('declined','cancelled');
end;
$$;

revoke all on function public.duel_week_status(uuid) from public;
grant execute on function public.duel_week_status(uuid) to authenticated;
