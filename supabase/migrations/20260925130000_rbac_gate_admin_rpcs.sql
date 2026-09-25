-- RBAC Phase 1b (2026-09-25): gate the remaining 54 admin_* RPCs by slice.
-- Generated: guard swapped to nmao.staff_can('<slice>'); bodies otherwise verbatim.
-- config/finance slices are owner-only; sponsors=Growth, badges=Designer, rounds=Tournament.
-- Excludes duel_faceoff/duel_reveal (Compete app-facing).

CREATE OR REPLACE FUNCTION public.admin_age_brackets()
 RETURNS TABLE(code text, label text, min_age integer, max_age integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select q.* from (
select code, label, min_age, max_age from age_brackets order by min_age
  ) q where nmao.staff_can('config', 'view')
$function$;

CREATE OR REPLACE FUNCTION public.admin_apply_tier(p_sponsor uuid, p_tier uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('config') then raise exception 'Not authorized — staff only'; end if;
  update public.sponsors set tier_id = p_tier, updated_at = now() where id = p_sponsor;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  select p_sponsor, t.offering_code, 'tier', true from public.tier_offerings t where t.tier_id = p_tier
  on conflict (sponsor_id, offering_code) do update set active = true, source = 'tier';
end $function$;

CREATE OR REPLACE FUNCTION public.admin_autoscore_round(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'nmao'
AS $function$
declare v_filled int;
begin
  if not nmao.staff_can('rounds') then raise exception 'staff only'; end if;
  if not exists (select 1 from rounds where id = p_round_id and seq >= 900) then
    raise exception 'refusing to autoscore a non-test round (seq < 900)';
  end if;

  with seats as (
    select ja.id
      from judge_assignments ja
      join entries e on e.id = ja.entry_id
     where e.round_id = p_round_id and ja.state = 'assigned'
  )
  update judge_assignments ja
     set score = round((70 + random() * 25)::numeric, 2),  -- 70.00 .. 95.00
         state = 'submitted',
         submitted_at = now(),
         updated_at = now()
    from seats
   where ja.id = seats.id;
  get diagnostics v_filled = row_count;

  return jsonb_build_object('round_id', p_round_id, 'seats_scored', v_filled);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_award_config()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', key, 'num', num, 'note', note) order by key)
    from dueling_award_config
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_award_prize(p_prize uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pr public.prizes; v_top int; v_n int := 0;
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  select * into pr from public.prizes where id = p_prize;
  if pr.id is null then raise exception 'prize not found'; end if;
  v_top := coalesce((pr.criteria->>'top')::int, nullif(pr.quantity,0), 1);

  if pr.scope = 'duel_month' then
    insert into public.prize_awards (prize_id, competitor_id)
    select p_prize, dr.competitor_id from public.duel_ratings dr
      join public.competitors c on c.id = dr.competitor_id and c.status = 'active' and coalesce(c.dueling_enabled, false)
      order by dr.rating desc, dr.wins desc limit v_top
    on conflict (prize_id, competitor_id) do nothing;
    get diagnostics v_n = row_count;
  elsif pr.scope = 'voter_award' then
    insert into public.prize_awards (prize_id, competitor_id)
    select p_prize, vs.competitor_id from public.voter_stats vs
      join public.competitors c on c.id = vs.competitor_id and c.status = 'active'
      where vs.votes_cast > 0
      order by vs.accuracy desc nulls last, vs.votes_cast desc limit v_top
    on conflict (prize_id, competitor_id) do nothing;
    get diagnostics v_n = row_count;
  elsif pr.scope = 'round_placement' then
    insert into public.prize_awards (prize_id, competitor_id)
    select p_prize, m.competitor_id from public.medals m
      where (pr.criteria->>'event' is null or m.event = pr.criteria->>'event')
        and (pr.criteria->>'place' is null or m.placement = (pr.criteria->>'place')::int)
        and (pr.criteria->>'round_id' is null or m.round_id = (pr.criteria->>'round_id')::uuid)
    on conflict (prize_id, competitor_id) do nothing;
    get diagnostics v_n = row_count;
  else
    raise exception 'scope % has no auto-award — award it manually', pr.scope;
  end if;

  update public.prizes set status = 'awarded' where id = p_prize;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_award_prize_to(p_prize uuid, p_competitor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  insert into public.prize_awards (prize_id, competitor_id) values (p_prize, p_competitor)
  on conflict (prize_id, competitor_id) do nothing;
  update public.prizes set status = 'awarded' where id = p_prize;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_badge_coverage()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('badges') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_object_agg(b.code, jsonb_build_object('mode', coalesce(c.mode,'unimplemented'), 'note', c.note))
    from badges b
    left join nmao.badge_engine_coverage c on c.code = b.code
    where coalesce(b.active, true)
  ), '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_badges()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('badges') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', code, 'name', name, 'category', category, 'rarity', rarity,
      'tiered', tiered, 'hidden', hidden, 'active', active,
      'description', description, 'earn_rule', earn_rule
    ) order by category nulls last, sort_order, name)
    from badges
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_clear_school_payout_tier_override(p_school uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_tier int;
begin
  if not nmao.staff_can('finance') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  update public.schools set payout_tier_override = null where id = p_school
    returning name, payout_tier into v_name, v_tier;
  if v_name is null then raise exception 'School not found.'; end if;
  return jsonb_build_object('ok', true, 'id', p_school, 'name', v_name, 'payout_tier', v_tier, 'override', false);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_create_test_round(p_template_round_id uuid DEFAULT NULL::uuid, p_season_id uuid DEFAULT NULL::uuid, p_seq integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'nmao'
AS $function$
declare
  v_season   uuid;
  v_scheme   uuid;
  v_template uuid;
  v_seq      int;
  v_round    uuid;
  v_school   uuid;
  v_comp     uuid;
  v_n        int := 0;
  rec        record;
  v_first    text[] := array['Sophia','Ethan','Olivia','Mason','Isla','Liam','Isabella','Noah','Mia','Lucas','Charlotte','Elijah','Amelia','Benjamin','Harper','Jackson','Evelyn','Sebastian','Grace','Daniel','Layla','Theo','Zoe','Gabriel','Nora','Miles','Aria','Owen','Chloe','Caleb'];
  v_last     text[] := array['Martinez','Nguyen','Brooks','Reyes','Sullivan','Foster','Tran','Coleman','Patel','Rivera','Kim','Ramos','Wong','Hayes','Diaz','Bell','Ortiz','Cruz','Bennett','Flores','Morgan','Castillo','Sanders','Reed','Jenkins','Ward','Hale','Novak','Pierce','Yamamoto'];
begin
  if not nmao.staff_can('rounds') then raise exception 'staff only'; end if;

  -- 1. season + its active scheme (the round's frozen ruleset)
  v_season := coalesce(p_season_id,
    (select id from seasons where status = 'active' order by created_at limit 1));
  if v_season is null then raise exception 'no active season — pass p_season_id'; end if;
  select active_scheme_id into v_scheme from seasons where id = v_season;
  if v_scheme is null then raise exception 'season % has no active_scheme_id', v_season; end if;

  -- 2. template round to clone entry-shape from (must have valid, video-bearing entries)
  v_template := coalesce(p_template_round_id,
    (select id from rounds where season_id = v_season order by seq desc limit 1));
  if v_template is null then raise exception 'no template round in season %', v_season; end if;
  if not exists (select 1 from entries where round_id = v_template and video_url is not null) then
    raise exception 'template round % has no video-bearing entries to clone', v_template;
  end if;

  -- 3. seq in the 900+ test band (never collides with real 1..9 rounds)
  v_seq := coalesce(p_seq,
    (select coalesce(max(seq), 900) + 1 from rounds where season_id = v_season and seq >= 900));

  insert into rounds (season_id, seq, scheme_id, state)
    values (v_season, v_seq, v_scheme, 'open')
    returning id into v_round;

  -- fallback school if a template competitor somehow lacks one
  select id into v_school from schools limit 1;

  -- 4. for each template entry, mint a fresh synthetic competitor (copying the
  --    real one's school/dob/rank so brackets stay valid) + a matching OPEN
  --    entry. Seed skill_ratings at the table default (rating 50, provisional).
  for rec in
    select e.event, e.age_bracket, e.declared_rank, e.video_url,
           coalesce(c.school_id, v_school) as school_id, c.dob,
           coalesce(c.declared_rank, 'intermediate') as c_rank
      from entries e
      join competitors c on c.id = e.competitor_id
     where e.round_id = v_template
       and e.video_url is not null
  loop
    v_n := v_n + 1;
    insert into competitors (school_id, first_name, last_name, dob, declared_rank, status)
      values (rec.school_id,
              v_first[1 + (v_n - 1) % array_length(v_first, 1)],
              v_last[1 + ((v_n - 1) * 7) % array_length(v_last, 1)],
              rec.dob, rec.c_rank, 'test')
      returning id into v_comp;
    insert into skill_ratings (competitor_id) values (v_comp);   -- defaults: 50 / provisional
    insert into entries (round_id, competitor_id, event, age_bracket, declared_rank, video_url, status)
      values (v_round, v_comp, rec.event, rec.age_bracket, rec.declared_rank, rec.video_url, 'submitted');
  end loop;

  return jsonb_build_object(
    'round_id', v_round, 'season_id', v_season, 'scheme_id', v_scheme,
    'template_round_id', v_template, 'seq', v_seq,
    'synthetic_competitors', v_n, 'entries', v_n, 'state', 'open',
    'next', 'round-controller: close -> divide -> assign_judges -> admin_autoscore_round -> resolve -> distribute -> finalize'
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_creative_queue()
 RETURNS TABLE(entitlement_id uuid, sponsor_id uuid, company_name text, sponsor_status text, logo_url text, tagline text, website text, config jsonb, active boolean, age_brackets text[], states text[], regions text[], ranks text[], events text[], submitted_at timestamp with time zone, approved_at timestamp with time zone, review_notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query
    select e.id, sp.id, sp.company_name, sp.status,
           sp.logo_url, sp.tagline, sp.website, e.config, e.active,
           e.age_brackets, e.states, e.regions, e.ranks, e.events,
           e.submitted_at, e.approved_at, e.review_notes
    from public.sponsor_entitlements e
    join public.sponsors sp on sp.id = e.sponsor_id
    where e.offering_code = 'reveal_sponsor'
    order by (e.approved_at is not null), e.submitted_at desc;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_age_bracket(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if; delete from age_brackets where code = p_code; perform public.admin_sync_active_scheme(); end $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_event_type(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if; delete from event_types where code = p_code; perform public.admin_sync_active_scheme(); end $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_test_round(p_round_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'nmao'
AS $function$
declare
  v_comp_ids uuid[];
  v_rounds   int;
  v_comps    int;
begin
  if not nmao.staff_can('rounds') then raise exception 'staff only'; end if;
  if not exists (select 1 from rounds where id = p_round_id and seq >= 900) then
    raise exception 'refusing to delete a non-test round (seq < 900)';
  end if;

  -- synthetic competitors are the status='test' ones entered in THIS round only
  select array_agg(distinct c.id) into v_comp_ids
    from entries e
    join competitors c on c.id = e.competitor_id
   where e.round_id = p_round_id and c.status = 'test';

  delete from rounds where id = p_round_id;      -- cascades entries/divisions/pods/medals/results/assignments
  get diagnostics v_rounds = row_count;

  v_comps := 0;
  if v_comp_ids is not null then
    delete from competitors where id = any(v_comp_ids);   -- cascades skill_ratings/rating_history/medals
    get diagnostics v_comps = row_count;
  end if;

  return jsonb_build_object('deleted_round', v_rounds, 'deleted_synthetic_competitors', v_comps);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_event_types()
 RETURNS TABLE(code text, name text, discipline text, style text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select q.* from (
select code, name, discipline, style from event_types order by discipline, style, name
  ) q where nmao.staff_can('config', 'view')
$function$;

CREATE OR REPLACE FUNCTION public.admin_house_ads()
 RETURNS SETOF duel_sponsors
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.duel_sponsors where is_house order by created_at desc;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_awards(p_prize uuid)
 RETURNS TABLE(award_id uuid, competitor_id uuid, competitor_name text, school text, claim_status text, awarded_at timestamp with time zone, tracking text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query
    select a.id, a.competitor_id, nmao.display_name(c.first_name, c.last_name), s.name, a.claim_status, a.awarded_at, a.tracking
    from public.prize_awards a
    join public.competitors c on c.id = a.competitor_id
    left join public.schools s on s.id = coalesce(a.school_id, c.school_id)
    where a.prize_id = p_prize order by a.awarded_at;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_offerings()
 RETURNS SETOF sponsor_offerings
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.sponsor_offerings where active order by sort_order;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_prizes(p_sponsor uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, sponsor_id uuid, title text, scope text, status text, quantity integer, value_cents integer, award_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query
    select p.id, p.sponsor_id, p.title, p.scope, p.status, p.quantity, p.value_cents,
      (select count(*) from public.prize_awards a where a.prize_id = p.id)::int, p.created_at
    from public.prizes p
    where (p_sponsor is null or p.sponsor_id = p_sponsor)
    order by p.created_at desc;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_sponsors()
 RETURNS TABLE(id uuid, company_name text, status text, tier_id uuid, tier_name text, logo_url text, tagline text, contact_email text, ad_count integer, product_count integer, impressions bigint, clicks bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query
    select s.id, s.company_name, s.status, s.tier_id, t.name, s.logo_url, s.tagline, s.contact_email,
      (select count(*) from public.duel_sponsors d where d.sponsor_id = s.id)::int,
      (select count(*) from public.sponsor_products p where p.sponsor_id = s.id)::int,
      coalesce((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::bigint,
      (coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)
        + coalesce((select sum(p.clicks) from public.sponsor_products p where p.sponsor_id = s.id), 0))::bigint,
      s.created_at
    from public.sponsors s
    left join public.sponsor_tiers t on t.id = s.tier_id
    order by s.created_at desc;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_tiers()
 RETURNS SETOF sponsor_tiers
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.sponsor_tiers where active order by sort_order;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_titles(p_sponsor uuid)
 RETURNS TABLE(scope text, scope_key text, active boolean, label text, regions text[], states text[], age_brackets text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query
    select t.scope, t.scope_key, t.active,
      case when t.scope = 'season'
           then 'Season: ' || coalesce((select name from public.seasons where id::text = t.scope_key), '?')
           else 'Event: ' || t.scope_key end,
      t.regions, t.states, t.age_brackets
    from public.sponsor_titles t where t.sponsor_id = p_sponsor order by t.scope, t.scope_key;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_mark_fulfilled(p_award uuid, p_tracking text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  update public.prize_awards set claim_status = 'fulfilled', fulfilled_at = now(), tracking = coalesce(p_tracking, tracking) where id = p_award;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_open_real_round(p_season_id uuid DEFAULT NULL::uuid, p_seq integer DEFAULT NULL::integer, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_opens_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_judging_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'nmao'
AS $function$
declare
  v_season uuid;
  v_scheme uuid;
  v_seq    int;
  v_opens  timestamptz := coalesce(p_opens_at, now());
  v_round  uuid;
begin
  if not nmao.staff_can('rounds') then raise exception 'staff only'; end if;

  v_season := coalesce(p_season_id,
    (select id from seasons where status = 'active' order by created_at limit 1));
  if v_season is null then raise exception 'no active season — pass p_season_id'; end if;
  select active_scheme_id into v_scheme from seasons where id = v_season;
  if v_scheme is null then raise exception 'season % has no active_scheme_id', v_season; end if;

  v_seq := coalesce(p_seq,
    (select coalesce(max(seq), 0) + 1 from rounds where season_id = v_season and coalesce(seq,0) < 900));
  if v_seq < 1 or v_seq >= 900 then
    raise exception 'p_seq must be a real round number (1..899); use admin_create_test_round for the 900+ test band';
  end if;
  if p_closes_at is null then
    raise exception 'p_closes_at is required — upload reminders and timing badges silently do nothing without it';
  end if;
  if p_closes_at <= v_opens then
    raise exception 'p_closes_at (%) must be after opens_at (%)', p_closes_at, v_opens;
  end if;
  if exists (select 1 from rounds where season_id = v_season and seq = v_seq) then
    raise exception 'round seq % already exists in this season', v_seq;
  end if;

  insert into rounds (season_id, seq, scheme_id, state, opens_at, closes_at, judging_deadline)
    values (v_season, v_seq, v_scheme, 'open', v_opens, p_closes_at, p_judging_deadline)
    returning id into v_round;

  return jsonb_build_object(
    'round_id', v_round, 'season_id', v_season, 'scheme_id', v_scheme, 'seq', v_seq,
    'state', 'open', 'opens_at', v_opens, 'closes_at', p_closes_at,
    'judging_deadline', p_judging_deadline
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_pod_settings()
 RETURNS TABLE(scheme_id uuid, version integer, pod_cap integer, pod_split_threshold integer, pod_floor integer, locked boolean, season_name text, ranks text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select q.* from (
select ds.id, ds.version, ds.pod_cap, ds.pod_split_threshold, ds.pod_floor, ds.locked, s.name,
         array(select jsonb_array_elements_text(ax->'tiers') from jsonb_array_elements(ds.axes) ax where ax->>'key' = 'rank')
  from seasons s join division_schemes ds on ds.id = s.active_scheme_id
  where s.status = 'active' order by s.created_at desc limit 1
  ) q where nmao.staff_can('config', 'view')
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_dueling_demo(p_competitor_id uuid DEFAULT '28bfafdb-fdbb-42f0-8f24-53aebc6929ee'::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'nmao'
AS $function$
declare
  v_reveals int; v_notifs int; v_votes int;
begin
  if not nmao.staff_can('rounds') then raise exception 'staff only'; end if;

  update monthly_reveals set seen = false
    where competitor_id = p_competitor_id and seen = true;
  get diagnostics v_reveals = row_count;

  update notifications set read = false
    where competitor_id = p_competitor_id and read = true;
  get diagnostics v_notifs = row_count;

  delete from duel_votes
    where voter_competitor_id = p_competitor_id
      and duel_id in (select id from duels where status = 'voting');
  get diagnostics v_votes = row_count;

  return jsonb_build_object(
    'ok', true, 'competitor_id', p_competitor_id,
    'reveals_unseen', v_reveals, 'notifications_unread', v_notifs, 'votes_cleared', v_votes
  );
end $function$;

CREATE OR REPLACE FUNCTION public.admin_review_entitlement(p_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('finance') then raise exception 'Not authorized — staff only'; end if;
  update public.sponsor_entitlements set
    approved_at  = case when p_approve then now() else null end,
    approved_by  = case when p_approve then auth.uid() else null end,
    review_notes = p_notes
  where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_age_bracket(p_code text, p_label text, p_min integer, p_max integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  insert into age_brackets (code, label, min_age, max_age)
  values (trim(p_code), p_label, p_min, p_max)
  on conflict (code) do update set label = excluded.label, min_age = excluded.min_age, max_age = excluded.max_age;
  perform public.admin_sync_active_scheme();
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_award_config(p_key text, p_num numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  update dueling_award_config set num = p_num where key = p_key;
  if not found then raise exception 'config key % not found', p_key; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_badge(p_code text, p_description text, p_earn_rule jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('badges') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  update badges set
    description = p_description,
    earn_rule   = coalesce(p_earn_rule, earn_rule)
  where code = trim(p_code);
  if not found then raise exception 'badge % not found', p_code; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_event_type(p_code text, p_name text, p_discipline text, p_style text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  insert into event_types (code, name, discipline, style)
  values (trim(p_code), p_name, p_discipline, p_style)
  on conflict (code) do update set name = excluded.name, discipline = excluded.discipline, style = excluded.style;
  perform public.admin_sync_active_scheme();
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_pod_settings(p_cap integer, p_split integer, p_floor integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  update division_schemes ds set pod_cap = p_cap, pod_split_threshold = p_split, pod_floor = p_floor
  from seasons s
  where ds.id = s.active_scheme_id and s.status = 'active' and ds.locked = false;
  if not found then raise exception 'No editable active scheme (missing or locked)'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_save_scheme_ranks(p_tiers text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_locked boolean; v_axes jsonb;
begin
  if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  if p_tiers is null or array_length(p_tiers, 1) is null then raise exception 'At least one rank tier required'; end if;
  select ds.id, ds.locked, ds.axes into v_id, v_locked, v_axes
  from division_schemes ds join seasons s on ds.id = s.active_scheme_id
  where s.status = 'active' order by s.created_at desc limit 1;
  if v_id is null then raise exception 'No active scheme'; end if;
  if v_locked then raise exception 'Scheme is locked'; end if;
  select jsonb_agg(case when ax->>'key' = 'rank' then jsonb_set(ax, '{tiers}', to_jsonb(p_tiers)) else ax end)
    into v_axes from jsonb_array_elements(v_axes) ax;
  update division_schemes set axes = v_axes where id = v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_schools_payout()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('finance') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'payout_tier', coalesce(s.payout_tier, 15),
      'auto_tier', public.derive_payout_tier(
        s.external_member_school_id is not null and s.external_member_school_id <> '',
        coalesce(s.accredited, false)),
      'override', s.payout_tier_override,
      'membership_linked', (s.external_member_school_id is not null and s.external_member_school_id <> ''),
      'accredited', coalesce(s.accredited, false),
      'can_receive', (s.stripe_connect_account_id is not null and s.stripe_connect_account_id <> ''),
      'status', s.status
    ) order by s.name)
    from public.schools s
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_segment_reach(p_age text[], p_states text[], p_regions text[], p_ranks text[])
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  select count(*)::int into n from public.competitors c
    left join public.schools s on s.id = c.school_id
  where c.status = 'active' and coalesce(c.dueling_enabled, false)
    and (coalesce(p_age,'{}')     = '{}' or nmao.age_bracket_of(c.dob) = any(p_age))
    and (coalesce(p_states,'{}')  = '{}' or upper(coalesce(nullif(trim(s.address->>'state'),''), nullif(s.state,''))) = any(p_states))
    and (coalesce(p_regions,'{}') = '{}' or coalesce(s.region, nmao.region_of(upper(coalesce(nullif(trim(s.address->>'state'),''), nullif(s.state,''))))) = any(p_regions))
    and (coalesce(p_ranks,'{}')   = '{}' or c.declared_rank = any(p_ranks));
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_entitlement(p_sponsor uuid, p_offering text, p_active boolean, p_config jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('finance') then raise exception 'Not authorized — staff only'; end if;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, active, config, source)
  values (p_sponsor, p_offering, p_active, coalesce(p_config,'{}'::jsonb), 'addon')
  on conflict (sponsor_id, offering_code) do update set active = excluded.active, config = excluded.config;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_entitlement_targeting(p_sponsor uuid, p_offering text, p_age text[], p_states text[], p_regions text[], p_events text[], p_ranks text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('finance') then raise exception 'Not authorized — staff only'; end if;
  update public.sponsor_entitlements set
    age_brackets = coalesce(p_age, '{}'), states = coalesce(p_states, '{}'),
    regions = coalesce(p_regions, '{}'), events = coalesce(p_events, '{}'), ranks = coalesce(p_ranks, '{}')
  where sponsor_id = p_sponsor and offering_code = p_offering;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_school_payout_tier(p_school uuid, p_tier integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_tier int;
begin
  if not nmao.staff_can('finance') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  if p_tier not in (15, 25, 35) then
    raise exception 'Invalid tier % — must be 15, 25, or 35.', p_tier;
  end if;
  update public.schools set payout_tier_override = p_tier where id = p_school
    returning name, payout_tier into v_name, v_tier;
  if v_name is null then raise exception 'School not found.'; end if;
  return jsonb_build_object('ok', true, 'id', p_school, 'name', v_name, 'payout_tier', v_tier, 'override', true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_sponsor_status(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  if p_status not in ('pending','active','suspended','rejected','lapsed') then
    raise exception 'bad status: %', p_status;
  end if;
  update public.sponsors set
    status = p_status,
    approved_by = case when p_status = 'active' then auth.uid() else approved_by end,
    approved_at = case when p_status = 'active' then now() else approved_at end,
    updated_at = now()
  where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_tier_pricing(p_tier uuid, p_price_cents integer, p_stripe_price_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  update public.sponsor_tiers set
    monthly_price_cents = coalesce(p_price_cents, monthly_price_cents),
    stripe_price_id = coalesce(nullif(p_stripe_price_id, ''), stripe_price_id)
  where id = p_tier;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_title(p_sponsor uuid, p_scope text, p_key text, p_active boolean DEFAULT true, p_regions text[] DEFAULT '{}'::text[], p_states text[] DEFAULT '{}'::text[], p_ages text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_key text;
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  if p_scope not in ('season','event') then raise exception 'bad scope'; end if;
  v_key := case when p_scope = 'season'
                then (select id::text from public.seasons where status = 'active' order by starts_at desc nulls last limit 1)
                else nullif(p_key,'') end;
  if v_key is null then raise exception 'no active season / missing key'; end if;
  insert into public.sponsor_titles (sponsor_id, scope, scope_key, active, regions, states, age_brackets)
  values (p_sponsor, p_scope, v_key, p_active, coalesce(p_regions,'{}'), coalesce(p_states,'{}'), coalesce(p_ages,'{}'))
  on conflict (scope, scope_key, sponsor_id) do update set
    active = excluded.active, regions = excluded.regions, states = excluded.states, age_brackets = excluded.age_brackets;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  values (p_sponsor, 'title_sponsor', 'auto', true)
  on conflict (sponsor_id, offering_code) do update set active = true;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_sponsor_ads(p_sponsor uuid)
 RETURNS SETOF duel_sponsors
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.duel_sponsors where sponsor_id = p_sponsor order by created_at desc;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_sponsor_analytics()
 RETURNS TABLE(sponsor_id uuid, company_name text, status text, impressions bigint, completions bigint, completion_rate numeric, avg_watch numeric, ad_clicks bigint, product_clicks bigint, ctr numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query
    select s.id, s.company_name, s.status,
      coalesce((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::bigint as impressions,
      (select count(*) from public.sponsor_events e where e.sponsor_id = s.id and e.kind = 'ad_complete')::bigint,
      round(
        (select count(*) from public.sponsor_events e where e.sponsor_id = s.id and e.kind = 'ad_complete')::numeric
        / nullif((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) * 100, 1
      ),
      round((select avg(e.seconds) from public.sponsor_events e where e.sponsor_id = s.id and e.seconds is not null), 1),
      coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::bigint,
      coalesce((select sum(p.clicks) from public.sponsor_products p where p.sponsor_id = s.id), 0)::bigint,
      round(
        coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::numeric
        / nullif((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) * 100, 1
      )
    from public.sponsors s
    order by impressions desc;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_sponsor_entitlements(p_sponsor uuid)
 RETURNS TABLE(code text, name text, category text, live boolean, has boolean, source text, sort_order integer, age_brackets text[], states text[], regions text[], events text[], ranks text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query
    select o.code, o.name, o.category, o.live, coalesce(e.active, false), e.source, o.sort_order,
      coalesce(e.age_brackets,'{}'), coalesce(e.states,'{}'), coalesce(e.regions,'{}'), coalesce(e.events,'{}'), coalesce(e.ranks,'{}')
    from public.sponsor_offerings o
    left join public.sponsor_entitlements e on e.offering_code = o.code and e.sponsor_id = p_sponsor
    where o.active order by o.sort_order;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_sponsor_frame(p_sponsor uuid)
 RETURNS SETOF sponsor_frames
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.sponsor_frames where sponsor_id = p_sponsor;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_sponsor_products(p_sponsor uuid)
 RETURNS SETOF sponsor_products
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.sponsor_products where sponsor_id = p_sponsor order by sort_order, name;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_sync_active_scheme()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_locked boolean; v_axes jsonb; v_age jsonb; v_events jsonb;
begin
  if not nmao.staff_can('config') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  select ds.id, ds.locked, ds.axes into v_id, v_locked, v_axes
  from division_schemes ds join seasons s on ds.id = s.active_scheme_id
  where s.status = 'active' order by s.created_at desc limit 1;
  if v_id is null then return 'No active scheme'; end if;
  if v_locked then return 'Scheme locked — not synced'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('key', code, 'min', min_age, 'max', coalesce(max_age, 200)) order by min_age), '[]'::jsonb)
    into v_age from age_brackets;
  select coalesce(jsonb_agg(code order by discipline, style, name), '[]'::jsonb)
    into v_events from event_types;

  select jsonb_agg(
    case ax->>'key'
      when 'age'   then jsonb_set(ax, '{brackets}', v_age)
      when 'event' then jsonb_set(ax, '{values}',   v_events)
      else ax
    end)
    into v_axes from jsonb_array_elements(v_axes) ax;

  update division_schemes set axes = v_axes where id = v_id;
  return 'Synced to active scheme';
end $function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_badge(p_code text, p_name text, p_category text, p_rarity text, p_tiered boolean, p_hidden boolean, p_active boolean, p_title text, p_emblem_key text, p_sort_order integer, p_description text, p_earn_rule jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not nmao.staff_can('badges') then raise exception 'Not authorized — insufficient role.' using errcode = '42501'; end if;
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'name required'; end if;
  insert into badges (code, name, category, rarity, tiered, hidden, active, title, emblem_key, sort_order, description, earn_rule)
  values (
    trim(p_code), p_name, nullif(trim(coalesce(p_category,'')),''),
    coalesce(nullif(trim(coalesce(p_rarity,'')),''),'common'),
    coalesce(p_tiered,false), coalesce(p_hidden,false), coalesce(p_active,true),
    nullif(trim(coalesce(p_title,'')),''), nullif(trim(coalesce(p_emblem_key,'')),''),
    coalesce(p_sort_order, 0), p_description, p_earn_rule
  )
  on conflict (code) do update set
    name = excluded.name, category = excluded.category, rarity = excluded.rarity,
    tiered = excluded.tiered, hidden = excluded.hidden, active = excluded.active,
    title = excluded.title, emblem_key = excluded.emblem_key, sort_order = excluded.sort_order,
    description = excluded.description, earn_rule = excluded.earn_rule;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_offering(p jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_code text := lower(regexp_replace(coalesce(nullif(p->>'code',''), p->>'name'), '[^a-z0-9]+', '_', 'g'));
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  if coalesce(v_code,'') = '' then raise exception 'name or code required'; end if;
  insert into public.sponsor_offerings (code, name, category, description, default_price_cents, billing, thumbnail_url, live, sort_order, active)
  values (v_code, coalesce(nullif(p->>'name',''), v_code), coalesce(nullif(p->>'category',''),'placement'), p->>'description',
          coalesce((p->>'default_price_cents')::int, 0), coalesce(nullif(p->>'billing',''),'monthly'), p->>'thumbnail_url',
          coalesce((p->>'live')::boolean, false), coalesce((p->>'sort_order')::int, 500), coalesce((p->>'active')::boolean, true))
  on conflict (code) do update set
    name = coalesce(nullif(p->>'name',''), public.sponsor_offerings.name),
    category = coalesce(nullif(p->>'category',''), public.sponsor_offerings.category),
    description = coalesce(p->>'description', public.sponsor_offerings.description),
    default_price_cents = coalesce((p->>'default_price_cents')::int, public.sponsor_offerings.default_price_cents),
    billing = coalesce(nullif(p->>'billing',''), public.sponsor_offerings.billing),
    thumbnail_url = coalesce(p->>'thumbnail_url', public.sponsor_offerings.thumbnail_url),
    live = coalesce((p->>'live')::boolean, public.sponsor_offerings.live),
    sort_order = coalesce((p->>'sort_order')::int, public.sponsor_offerings.sort_order),
    active = coalesce((p->>'active')::boolean, public.sponsor_offerings.active);
  return v_code;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_prize(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.prizes (sponsor_id, title, description, image_url, value_cents, scope, criteria, quantity, status, fulfillment_channel, created_by)
    values (v_sponsor, p->>'title', p->>'description', p->>'image_url', nullif(p->>'value_cents','')::int,
            coalesce(nullif(p->>'scope',''),'custom'), coalesce(p->'criteria','{}'::jsonb), coalesce((p->>'quantity')::int,1),
            coalesce(nullif(p->>'status',''),'active'), coalesce(nullif(p->>'fulfillment_channel',''),'dojo'), auth.uid())
    returning id into v_id;
  else
    update public.prizes set
      title = coalesce(p->>'title', title), description = coalesce(p->>'description', description),
      image_url = coalesce(p->>'image_url', image_url), value_cents = coalesce(nullif(p->>'value_cents','')::int, value_cents),
      scope = coalesce(nullif(p->>'scope',''), scope), criteria = coalesce(p->'criteria', criteria),
      quantity = coalesce((p->>'quantity')::int, quantity), status = coalesce(nullif(p->>'status',''), status),
      fulfillment_channel = coalesce(nullif(p->>'fulfillment_channel',''), fulfillment_channel)
    where id = v_id;
  end if;
  if v_sponsor is not null then
    insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
    values (v_sponsor, 'sponsored_prize', 'auto', true)
    on conflict (sponsor_id, offering_code) do update set active = true;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_sponsor(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.sponsors (company_name, tagline, contact_name, contact_email, contact_phone, website, logo_url, tier_id, status, notes)
    values (p->>'company_name', p->>'tagline', p->>'contact_name', p->>'contact_email', p->>'contact_phone',
            p->>'website', p->>'logo_url', nullif(p->>'tier_id','')::uuid, coalesce(nullif(p->>'status',''),'pending'), p->>'notes')
    returning id into v_id;
  else
    update public.sponsors set
      company_name = coalesce(p->>'company_name', company_name),
      tagline      = coalesce(p->>'tagline', tagline),
      contact_name = coalesce(p->>'contact_name', contact_name),
      contact_email= coalesce(p->>'contact_email', contact_email),
      contact_phone= coalesce(p->>'contact_phone', contact_phone),
      website      = coalesce(p->>'website', website),
      logo_url     = coalesce(p->>'logo_url', logo_url),
      tier_id      = coalesce(nullif(p->>'tier_id','')::uuid, tier_id),
      notes        = coalesce(p->>'notes', notes),
      updated_at   = now()
    where id = v_id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_sponsor_ad(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.duel_sponsors (sponsor_id, name, tagline, video_url, poster_url, click_url, weight, min_seconds, active, placement, is_house, approved_by, approved_at)
    values (v_sponsor, p->>'name', p->>'tagline', p->>'video_url', p->>'poster_url', p->>'click_url',
            coalesce((p->>'weight')::int, 1), coalesce((p->>'min_seconds')::int, 3),
            coalesce((p->>'active')::boolean, true), coalesce(nullif(p->>'placement',''),'arena'),
            coalesce((p->>'is_house')::boolean, false), auth.uid(), now())
    returning id into v_id;
    if v_sponsor is not null and not coalesce((p->>'is_house')::boolean, false) then
      insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
      values (v_sponsor, 'ad_space', 'auto', true)
      on conflict (sponsor_id, offering_code) do update set active = true;
    end if;
  else
    update public.duel_sponsors set
      name=coalesce(p->>'name',name), tagline=coalesce(p->>'tagline',tagline),
      video_url=coalesce(p->>'video_url',video_url), poster_url=coalesce(p->>'poster_url',poster_url),
      click_url=coalesce(p->>'click_url',click_url), weight=coalesce((p->>'weight')::int,weight),
      min_seconds=coalesce((p->>'min_seconds')::int,min_seconds), active=coalesce((p->>'active')::boolean,active),
      placement=coalesce(nullif(p->>'placement',''),placement)
    where id = v_id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_sponsor_frame(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  if v_sponsor is null then raise exception 'sponsor_id required'; end if;
  insert into public.sponsor_frames (sponsor_id, name, logo_url, accent_color, label, image_url, animation, active)
  values (v_sponsor, coalesce(nullif(p->>'name',''),'Sponsor frame'), p->>'logo_url',
          coalesce(nullif(p->>'accent_color',''),'#E9C15A'), p->>'label', p->>'image_url',
          coalesce(nullif(p->>'animation',''),'none'), coalesce((p->>'active')::boolean, true))
  on conflict (sponsor_id) do update set
    name = coalesce(nullif(p->>'name',''), public.sponsor_frames.name),
    logo_url = coalesce(p->>'logo_url', public.sponsor_frames.logo_url),
    accent_color = coalesce(nullif(p->>'accent_color',''), public.sponsor_frames.accent_color),
    label = coalesce(p->>'label', public.sponsor_frames.label),
    image_url = coalesce(p->>'image_url', public.sponsor_frames.image_url),
    animation = coalesce(nullif(p->>'animation',''), public.sponsor_frames.animation),
    active = coalesce((p->>'active')::boolean, public.sponsor_frames.active)
  returning id into v_id;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  values (v_sponsor, 'custom_frame', 'auto', true)
  on conflict (sponsor_id, offering_code) do update set active = true;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_sponsor_product(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.staff_can('sponsors') then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.sponsor_products (sponsor_id, name, description, image_url, price_display, product_url, active, sort_order, approved_by, approved_at)
    values (v_sponsor, p->>'name', p->>'description', p->>'image_url', p->>'price_display',
            p->>'product_url', coalesce((p->>'active')::boolean, true), coalesce((p->>'sort_order')::int, 0), auth.uid(), now())
    returning id into v_id;
    if v_sponsor is not null then
      insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
      values (v_sponsor, 'product_listing', 'auto', true)
      on conflict (sponsor_id, offering_code) do update set active = true;
    end if;
  else
    update public.sponsor_products set
      name=coalesce(p->>'name',name), description=coalesce(p->>'description',description),
      image_url=coalesce(p->>'image_url',image_url), price_display=coalesce(p->>'price_display',price_display),
      product_url=coalesce(p->>'product_url',product_url), active=coalesce((p->>'active')::boolean,active),
      sort_order=coalesce((p->>'sort_order')::int,sort_order)
    where id = v_id;
  end if;
  return v_id;
end $function$;
