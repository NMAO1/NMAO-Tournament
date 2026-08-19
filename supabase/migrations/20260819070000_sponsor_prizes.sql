-- ============================================================
--  Sponsored prizes (offering: sponsored_prize).
--
--  A sponsor (or NMAO) puts up a prize tied to an OUTCOME. When it's awarded,
--  winners are computed from the prize's scope + criteria, a prize_award is
--  created for each, the champion claims it in-app, and fulfillment routes to the
--  DOJO (school) — never a minor's home address.
--
--  Auto-award scopes (computed from existing tables):
--    duel_month     — top {top} of the dueling leaderboard (duel_ratings)
--    voter_award    — top {top} voters by accuracy (voter_stats)
--    round_placement— medals matching {event?, place?, round_id?}
--  season_finish / custom → award manually (admin_award_prize_to).
-- ============================================================

create table if not exists public.prizes (
  id            uuid primary key default gen_random_uuid(),
  sponsor_id    uuid references public.sponsors(id) on delete set null,  -- NULL = NMAO-provided
  title         text not null,
  description   text,
  image_url     text,
  value_cents   int,
  product_id    uuid references public.sponsor_products(id) on delete set null,
  scope         text not null default 'custom',    -- duel_month | voter_award | round_placement | season_finish | custom
  criteria      jsonb not null default '{}'::jsonb,
  quantity      int not null default 1,
  status        text not null default 'draft',      -- draft | active | awarded | closed
  fulfillment_channel text not null default 'dojo', -- dojo | parent (never direct-to-minor)
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_prizes_sponsor on public.prizes(sponsor_id);

create table if not exists public.prize_awards (
  id            uuid primary key default gen_random_uuid(),
  prize_id      uuid not null references public.prizes(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  awarded_at    timestamptz not null default now(),
  claim_status  text not null default 'unclaimed',  -- unclaimed | claimed | shipped | fulfilled | forfeited
  school_id     uuid references public.schools(id), -- ships to the dojo
  tracking      text,
  notes         text,
  claimed_at    timestamptz,
  fulfilled_at  timestamptz,
  unique (prize_id, competitor_id)
);
create index if not exists idx_prize_awards_competitor on public.prize_awards(competitor_id);
alter table public.prizes       enable row level security;
alter table public.prize_awards enable row level security;

-- these offerings are now functional in-app
update public.sponsor_offerings set live = true where code in ('sponsored_prize','custom_frame','title_sponsor');

-- =====================================================================
--  APP: a champion's prizes + claim
-- =====================================================================
create or replace function public.my_prizes(p_competitor_id uuid)
returns table (award_id uuid, title text, description text, image_url text, value_cents int,
               sponsor_name text, claim_status text, awarded_at timestamptz, fulfillment_channel text)
language sql stable security definer set search_path = public as $$
  select a.id, p.title, p.description, coalesce(p.image_url, pr.image_url), p.value_cents,
         sp.company_name, a.claim_status, a.awarded_at, p.fulfillment_channel
  from public.prize_awards a
  join public.prizes p on p.id = a.prize_id
  left join public.sponsors sp on sp.id = p.sponsor_id
  left join public.sponsor_products pr on pr.id = p.product_id
  where a.competitor_id = p_competitor_id and a.competitor_id in (select nmao.competitor_ids())
  order by a.awarded_at desc;
$$;

-- Claim a prize → routes fulfillment to the competitor's dojo (never their address).
create or replace function public.claim_prize(p_award uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_comp uuid; v_school uuid;
begin
  select a.competitor_id, c.school_id into v_comp, v_school
  from public.prize_awards a join public.competitors c on c.id = a.competitor_id
  where a.id = p_award;
  if v_comp is null then raise exception 'award not found'; end if;
  if not (v_comp in (select nmao.competitor_ids())) then raise exception 'not your prize'; end if;
  update public.prize_awards
    set claim_status = case when claim_status = 'unclaimed' then 'claimed' else claim_status end,
        claimed_at = coalesce(claimed_at, now()),
        school_id = coalesce(school_id, v_school)
  where id = p_award;
end $$;

-- =====================================================================
--  STAFF: manage + award prizes
-- =====================================================================
create or replace function public.admin_list_prizes(p_sponsor uuid default null)
returns table (id uuid, sponsor_id uuid, title text, scope text, status text, quantity int, value_cents int,
               award_count int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select p.id, p.sponsor_id, p.title, p.scope, p.status, p.quantity, p.value_cents,
      (select count(*) from public.prize_awards a where a.prize_id = p.id)::int, p.created_at
    from public.prizes p
    where (p_sponsor is null or p.sponsor_id = p_sponsor)
    order by p.created_at desc;
end $$;

create or replace function public.admin_upsert_prize(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
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
end $$;

-- Auto-compute + award winners from the prize's scope + criteria (idempotent).
create or replace function public.admin_award_prize(p_prize uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare pr public.prizes; v_top int; v_n int := 0;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
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
end $$;

-- Manually award one competitor (for custom/season prizes).
create or replace function public.admin_award_prize_to(p_prize uuid, p_competitor uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  insert into public.prize_awards (prize_id, competitor_id) values (p_prize, p_competitor)
  on conflict (prize_id, competitor_id) do nothing;
  update public.prizes set status = 'awarded' where id = p_prize;
end $$;

create or replace function public.admin_list_awards(p_prize uuid)
returns table (award_id uuid, competitor_id uuid, competitor_name text, school text, claim_status text, awarded_at timestamptz, tracking text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select a.id, a.competitor_id, nmao.display_name(c.first_name, c.last_name), s.name, a.claim_status, a.awarded_at, a.tracking
    from public.prize_awards a
    join public.competitors c on c.id = a.competitor_id
    left join public.schools s on s.id = coalesce(a.school_id, c.school_id)
    where a.prize_id = p_prize order by a.awarded_at;
end $$;

create or replace function public.admin_mark_fulfilled(p_award uuid, p_tracking text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  update public.prize_awards set claim_status = 'fulfilled', fulfilled_at = now(), tracking = coalesce(p_tracking, tracking) where id = p_award;
end $$;

grant execute on function public.my_prizes(uuid) to authenticated;
grant execute on function public.claim_prize(uuid) to authenticated;
grant execute on function public.admin_list_prizes(uuid) to authenticated;
grant execute on function public.admin_upsert_prize(jsonb) to authenticated;
grant execute on function public.admin_award_prize(uuid) to authenticated;
grant execute on function public.admin_award_prize_to(uuid, uuid) to authenticated;
grant execute on function public.admin_list_awards(uuid) to authenticated;
grant execute on function public.admin_mark_fulfilled(uuid, text) to authenticated;
