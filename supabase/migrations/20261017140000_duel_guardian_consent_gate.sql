-- Guardian-consent gate for dueling (Brad 2026-10-17). A REAL (non-demo) minor
-- (under 18) must have a guardian consent on file (any consents row) before they
-- can open a duel. Demo/is_test competitors are exempt (matches the test-data
-- isolation 20260923195000). Also adds school_duel_consent() so the school portal
-- can SHOW each competitor's consent status by the dueling toggle — owners can't
-- read consents directly (RLS limits that to the guardian/competitor/staff).

-- 1) Enforcement — request_duel with the consent gate. Body otherwise identical
--    to the live 20260924161000 definition (challenger status + dueling gates,
--    is_test-bucketed matchmaking, block checks).
create or replace function public.request_duel(p_competitor_id uuid, p_event text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_cap int := nmao.duel_weekly_cap(); ch competitors; v_opp uuid; v_week int; v_rating int;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then raise exception 'not authorized to duel as this competitor' using errcode = '42501'; end if;
  if not exists (select 1 from event_types where code = p_event) then raise exception 'unknown event: %', p_event using errcode = '22023'; end if;

  select * into ch from competitors where id = p_competitor_id;
  if coalesce(ch.status, 'active') <> 'active' then raise exception 'This account is suspended and cannot duel.' using errcode = '42501'; end if;
  if not coalesce(ch.dueling_enabled, false) then raise exception 'dueling is not enabled for you yet (ask your school)' using errcode = 'P0001'; end if;
  -- NEW (COPPA): a real minor must have guardian consent on file before dueling.
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

  select op.id into v_opp
  from competitors op
  left join duel_ratings dr on dr.competitor_id = op.id
  where op.status = 'active' and op.id <> p_competitor_id
    and coalesce(op.is_test, false) = coalesce(ch.is_test, false)
    and coalesce(op.dueling_enabled, false)
    and op.declared_rank is not distinct from ch.declared_rank
    and nmao.age_bracket_of(op.dob) is not distinct from nmao.age_bracket_of(ch.dob)
    and nmao.duel_geo_allowed(ch.school_id, op.school_id)
    and not exists (
      select 1 from duels d where d.status in ('pending','accepted','live','voting')
        and ((d.challenger_id = p_competitor_id and d.opponent_id = op.id)
          or (d.challenger_id = op.id and d.opponent_id = p_competitor_id)))
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
end $function$;

-- 2) Portal status — per-competitor consent status for the caller's own schools.
--    Returns booleans only (never raw consent rows), scoped to owned schools.
create or replace function public.school_duel_consent()
returns table (competitor_id uuid, is_minor boolean, has_consent boolean)
language sql stable security definer set search_path to 'public' as $function$
  select c.id,
         (extract(year from age(c.dob)) < 18),
         exists (select 1 from public.consents cn where cn.competitor_id = c.id)
  from public.competitors c
  where c.school_id in (select nmao.owned_school_ids());
$function$;
revoke all on function public.school_duel_consent() from public, anon;
grant execute on function public.school_duel_consent() to authenticated;
