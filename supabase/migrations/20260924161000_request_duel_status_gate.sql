-- App Store 1.2 defense-in-depth (2026-09-24): a suspended/ejected competitor
-- must not be able to open a NEW duel. request_duel already gates the OPPONENT
-- pool to status='active'; this adds the missing gate on the CHALLENGER (caller)
-- side. Body is otherwise identical to the live definition.
create or replace function public.request_duel(p_competitor_id uuid, p_event text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid; v_cap int := nmao.duel_weekly_cap(); ch competitors; v_opp uuid; v_week int; v_rating int;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then raise exception 'not authorized to duel as this competitor' using errcode = '42501'; end if;
  if not exists (select 1 from event_types where code = p_event) then raise exception 'unknown event: %', p_event using errcode = '22023'; end if;

  select * into ch from competitors where id = p_competitor_id;
  -- NEW: an ejected/suspended account cannot create user-generated content.
  if coalesce(ch.status, 'active') <> 'active' then raise exception 'This account is suspended and cannot duel.' using errcode = '42501'; end if;
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
