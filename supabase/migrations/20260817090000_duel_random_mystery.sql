-- ============================================================
--  Dueling: random matchmaking + mystery opponents + event-based duels.
--  * duels.type now references event_types (the 4 tournament events),
--    not kata/weapon — data-driven with the rest of the config.
--  * request_duel(competitor, event): the SYSTEM picks a random,
--    rating-proximate, same-rank + same-age-bracket + in-geo opponent.
--    Competitors no longer choose who they face (no cherry-picking).
--  * my_active_duels(): opponent identity MASKED ('Mystery opponent')
--    for both parties until the reveal.
--  * duel_vote_queue: also excludes duels the viewer is a PARTICIPANT
--    in, so a competitor can't unmask their opponent via the queue.
--  Voters still see names in the Arena (product choice).
-- ============================================================

-- duels.type: kata/weapon -> event_types.code
alter table duels drop constraint if exists duels_type_check;
alter table duels add constraint duels_type_fk foreign key (type) references event_types(code);

-- Event options for the duel request picker (code + display name).
create or replace function public.duel_events()
returns table (code text, name text)
language sql stable security definer set search_path = public as $$
  select code, name from event_types order by discipline, style, name
$$;
grant execute on function public.duel_events() to authenticated;

-- Random, rating-proximate matchmaking. The competitor picks the event only.
create or replace function public.request_duel(p_competitor_id uuid, p_event text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cap int := nmao.duel_weekly_cap(); ch competitors; v_opp uuid; v_week int; v_rating int;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then raise exception 'not authorized to duel as this competitor' using errcode = '42501'; end if;
  if not exists (select 1 from event_types where code = p_event) then raise exception 'unknown event: %', p_event using errcode = '22023'; end if;

  select * into ch from competitors where id = p_competitor_id;
  if not coalesce(ch.dueling_enabled, false) then raise exception 'dueling is not enabled for you yet (ask your school)' using errcode = 'P0001'; end if;

  -- weekly cap (rolling 7 days; declined/cancelled don't count)
  select count(*) into v_week from duels
    where challenger_id = p_competitor_id and created_at > now() - interval '7 days' and status not in ('declined','cancelled');
  if v_week >= v_cap then raise exception 'weekly duel limit reached (% per week)', v_cap using errcode = 'P0001'; end if;

  select coalesce(dr.rating, 1200) into v_rating from duel_ratings dr where dr.competitor_id = p_competitor_id;
  v_rating := coalesce(v_rating, 1200);

  -- Random eligible opponent, preferring rating within +/-150 (else widening).
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

-- Active duels for the hub, with the opponent identity MASKED until reveal.
create or replace function public.my_active_duels(p_competitor_id uuid)
returns table (duel_id uuid, event text, status text, role text, my_video_in boolean, opp_name text, deadline timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id,
         coalesce(et.name, d.type),
         d.status,
         case when d.challenger_id = p_competitor_id then 'challenger' else 'opponent' end,
         case when d.challenger_id = p_competitor_id then d.challenger_video is not null else d.opponent_video is not null end,
         'Mystery opponent'::text,
         case d.status when 'pending' then d.response_deadline when 'accepted' then d.upload_deadline else d.closes_vote_at end
  from duels d
  left join event_types et on et.code = d.type
  where (d.challenger_id = p_competitor_id or d.opponent_id = p_competitor_id)
    and d.status in ('pending','accepted','live','voting')
  order by d.created_at desc
  limit 25
$$;
grant execute on function public.my_active_duels(uuid) to authenticated;

-- Vote queue: exclude the viewer's OWN duels (keeps opponents masked to
-- participants) and show the event display name instead of the code.
create or replace function public.duel_vote_queue(p_competitor_id uuid, p_limit integer default 20, p_search text default null)
returns table (duel_id uuid, duel_type text, closes_vote_at timestamptz, vote_count bigint,
  challenger_id uuid, challenger_name text, challenger_school text, challenger_video text,
  challenger_frame_code text, challenger_frame_rarity text, challenger_frame_name text, challenger_frame_desc text,
  opponent_id uuid, opponent_name text, opponent_school text, opponent_video text,
  opponent_frame_code text, opponent_frame_rarity text, opponent_frame_name text, opponent_frame_desc text)
language sql stable security definer set search_path = public as $$
  select d.id, coalesce(et.name, d.type), d.closes_vote_at,
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
  left join event_types et on et.code = d.type
  where d.status = 'voting'
    and d.moderation_status = 'ok'
    and d.challenger_id <> p_competitor_id
    and d.opponent_id <> p_competitor_id
    and not exists (select 1 from duel_votes v where v.duel_id = d.id and v.voter_competitor_id = p_competitor_id)
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
grant execute on function public.duel_vote_queue(uuid, integer, text) to authenticated;
