-- ============================================================
-- Dueling — eligibility & matchmaking
--   • competitors.dueling_enabled  (per-student toggle, off by default; school opts in)
--   • schools.dueling_area jsonb   (who a school's students may face)
--   • fair pairing: same declared_rank + same age bracket + category
--   • geo rules honored for BOTH schools (haversine on schools.lat/lng)
-- find_duel_opponents() lists eligible opponents; create_duel() enforces the gates.
-- Spec: docs/DUELING-HANDOFF.md §2, DUELING-DECISIONS.md §4.
-- ============================================================

alter table competitors add column if not exists dueling_enabled boolean not null default false;
alter table schools      add column if not exists dueling_area   jsonb;   -- {level, min_miles, max_miles, states[]}

-- ---- helpers ----
-- miles between two points (haversine); null if any coord missing
create or replace function nmao.miles_between(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
returns numeric language sql immutable as $$
  select case when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null else
    3958.8 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
    )) end
$$;

-- age bracket code for a dob (reuses the tournament's age_brackets table)
create or replace function nmao.age_bracket_of(p_dob date)
returns text language sql stable security definer set search_path = public as $$
  select ab.code from age_brackets ab
  where date_part('year', age(p_dob)) between ab.min_age and ab.max_age
  order by ab.min_age limit 1
$$;

-- does ONE school's dueling_area rule permit the other school?
-- null area = world (allowed). level='off' = no dueling. min/max_miles bound distance.
-- level='country' restricts to same country. (states[]/region: extend here later.)
create or replace function nmao.area_passes(p_area jsonb, p_own_country text, p_other_country text, p_dist numeric)
returns boolean language sql immutable as $$
  select case
    when p_area is null then true
    when p_area->>'level' = 'off' then false
    else
      (not (p_area ? 'min_miles') or p_dist is null or p_dist >= (p_area->>'min_miles')::numeric)
      and (not (p_area ? 'max_miles') or p_dist is null or p_dist <= (p_area->>'max_miles')::numeric)
      and (coalesce(p_area->>'level','') <> 'country' or p_own_country is not distinct from p_other_country)
  end
$$;

-- geo allowed between two schools (both schools' rules must pass)
create or replace function nmao.duel_geo_allowed(p_school_a uuid, p_school_b uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare a schools; b schools; d numeric;
begin
  if p_school_a = p_school_b then return true; end if;   -- same-school duels allowed
  select * into a from schools where id = p_school_a;
  select * into b from schools where id = p_school_b;
  if a.id is null or b.id is null then return false; end if;
  d := nmao.miles_between(a.lat, a.lng, b.lat, b.lng);
  return nmao.area_passes(a.dueling_area, a.country, b.country, d)
     and nmao.area_passes(b.dueling_area, b.country, a.country, d);
end;
$$;

-- ---- matchmaking: eligible opponents for a competitor ----
create or replace function public.find_duel_opponents(p_competitor_id uuid, p_type text default null, p_limit int default 20)
returns table (competitor_id uuid, name text, school text, declared_rank text, age_bracket text)
language plpgsql stable security definer set search_path = public as $$
declare me competitors;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into me from competitors where id = p_competitor_id;
  if not coalesce(me.dueling_enabled, false) then return; end if;  -- dueling off → no pool
  return query
    select o.id, (o.first_name || ' ' || o.last_name), s.name, o.declared_rank, nmao.age_bracket_of(o.dob)
    from competitors o
    left join schools s on s.id = o.school_id
    where o.id <> me.id
      and o.status = 'active'
      and coalesce(o.dueling_enabled, false)
      and o.declared_rank is not distinct from me.declared_rank
      and nmao.age_bracket_of(o.dob) is not distinct from nmao.age_bracket_of(me.dob)
      and nmao.duel_geo_allowed(me.school_id, o.school_id)
      and not exists (
        select 1 from duels d where d.status in ('pending','accepted','live','voting')
          and ((d.challenger_id = me.id and d.opponent_id = o.id) or (d.challenger_id = o.id and d.opponent_id = me.id))
      )
    order by random()
    limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;
revoke all on function public.find_duel_opponents(uuid, text, int) from public;
grant execute on function public.find_duel_opponents(uuid, text, int) to authenticated;

-- ---- create_duel with eligibility gates (replaces the 2a version) ----
create or replace function public.create_duel(p_challenger_id uuid, p_opponent_id uuid, p_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_week int; ch competitors; op competitors;
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

  -- 4 duels / rolling 7 days
  select count(*) into v_week from duels
    where challenger_id = p_challenger_id and created_at > now() - interval '7 days' and status not in ('declined','cancelled');
  if v_week >= 4 then raise exception 'weekly duel limit reached (4 per week)' using errcode = 'P0001'; end if;

  insert into duels (challenger_id, opponent_id, type, status, response_deadline)
  values (p_challenger_id, p_opponent_id, p_type, 'pending', now() + interval '48 hours')
  returning id into v_id;
  return v_id;
end;
$$;
