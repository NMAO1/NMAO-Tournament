-- Sponsor creative review — bring config-based sponsor placements (starting with
-- the monthly-reveal bookends) up to the same staff-approval bar the ad and
-- product creatives already have (duel_sponsors.approved_at / sponsor_products
-- .approved_at). The reveal creative lives in sponsor_entitlements.config, so the
-- review gate goes on sponsor_entitlements: a creative is invisible to the reveal
-- until a staff member has approved it, and any edit to the creative or its
-- targeting sends it back to pending review.

-- 1) Review columns (mirrors the ad/product approval shape).
alter table public.sponsor_entitlements
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists approved_at  timestamptz,
  add column if not exists approved_by  uuid,
  add column if not exists review_notes text;

-- 2) Auto-revert: editing the creative (config) or its targeting clears the
--    approval so it must be reviewed again. Approving (which touches only
--    approved_at/approved_by) leaves config untouched, so it does NOT re-trip this.
create or replace function nmao.entitlement_review_reset() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at := now(); new.approved_at := null; new.approved_by := null;
    return new;
  end if;
  if new.config       is distinct from old.config
     or new.age_brackets is distinct from old.age_brackets
     or new.states       is distinct from old.states
     or new.regions      is distinct from old.regions
     or new.events       is distinct from old.events
     or new.ranks        is distinct from old.ranks then
    new.approved_at := null; new.approved_by := null; new.submitted_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_entitlement_review_reset on public.sponsor_entitlements;
create trigger trg_entitlement_review_reset
  before insert or update on public.sponsor_entitlements
  for each row execute function nmao.entitlement_review_reset();

-- 3) Gate the reveal resolver on approval (added: e.approved_at is not null).
create or replace function public.reveal_sponsor(p_viewer uuid default null)
returns table (name text, logo_url text, tagline text, color text, message text, offer text, store_url text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_age text; v_state text; v_region text; v_rank text;
  v_sid uuid; v_name text; v_logo text; v_tag text; v_web text; v_cfg jsonb;
begin
  if p_viewer is not null then
    select age_bracket, state, region, rank into v_age, v_state, v_region, v_rank
    from nmao.competitor_segment(p_viewer);
  end if;

  select e.sponsor_id, sp.company_name, sp.logo_url, sp.tagline, sp.website, e.config
    into v_sid, v_name, v_logo, v_tag, v_web, v_cfg
  from public.sponsor_entitlements e
  join public.sponsors sp on sp.id = e.sponsor_id
  where e.offering_code = 'reveal_sponsor' and e.active and e.approved_at is not null
    and sp.status = 'active' and nmao.sponsor_has(sp.id, 'reveal_sponsor')
    and (e.age_brackets = '{}' or (v_age    is not null and v_age    = any(e.age_brackets)))
    and (e.states       = '{}' or (v_state  is not null and v_state  = any(e.states)))
    and (e.regions      = '{}' or (v_region is not null and v_region = any(e.regions)))
    and (e.ranks        = '{}' or (v_rank   is not null and v_rank   = any(e.ranks)))
  order by (cardinality(e.age_brackets) + cardinality(e.states) + cardinality(e.regions) + cardinality(e.ranks)) desc
  limit 1;

  if v_sid is null then return; end if;

  name      := v_name;
  logo_url  := v_logo;
  tagline   := v_tag;
  color     := coalesce(nullif(trim(v_cfg->>'color'), ''), '#E6B93F');
  message   := nullif(trim(v_cfg->>'message'), '');
  offer     := nullif(trim(v_cfg->>'offer'), '');
  store_url := coalesce(
    nullif(trim(v_cfg->>'store_url'), ''),
    (select product_url from public.sponsor_products
       where sponsor_id = v_sid and active and approved_at is not null
       order by sort_order limit 1),
    nullif(trim(v_web), '')
  );
  return next;
end $$;

-- 4) Staff approve/reject. One call: p_approve true stamps approver + now();
--    false clears approval (returns it to pending). Notes are stored either way.
create or replace function public.admin_review_entitlement(p_id uuid, p_approve boolean, p_notes text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  update public.sponsor_entitlements set
    approved_at  = case when p_approve then now() else null end,
    approved_by  = case when p_approve then auth.uid() else null end,
    review_notes = p_notes
  where id = p_id;
end $$;

-- 5) The review queue — every reveal creative (pending first) with its sponsor
--    and config, so the Mission Control panel can render a live preview + act.
create or replace function public.admin_creative_queue()
returns table (
  entitlement_id uuid, sponsor_id uuid, company_name text, sponsor_status text,
  logo_url text, tagline text, website text, config jsonb, active boolean,
  age_brackets text[], states text[], regions text[], ranks text[],
  submitted_at timestamptz, approved_at timestamptz, review_notes text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select e.id, sp.id, sp.company_name, sp.status,
           sp.logo_url, sp.tagline, sp.website, e.config, e.active,
           e.age_brackets, e.states, e.regions, e.ranks,
           e.submitted_at, e.approved_at, e.review_notes
    from public.sponsor_entitlements e
    join public.sponsors sp on sp.id = e.sponsor_id
    where e.offering_code = 'reveal_sponsor'
    order by (e.approved_at is not null), e.submitted_at desc;
end $$;

grant execute on function public.admin_review_entitlement(uuid, boolean, text) to authenticated;
grant execute on function public.admin_creative_queue() to authenticated;
