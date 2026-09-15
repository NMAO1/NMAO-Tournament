-- Reveal sponsor resolver — the segment-targeted sponsor shown in the monthly
-- reveal's bookend acts (pre-roll "presented by" + end-card "brought to you by").
-- Modeled on public.title_sponsor_season, but sourced from the sponsor_entitlements
-- row for the 'reveal_sponsor' offering: the brand's name/logo/tagline come from
-- public.sponsors, while the richer end-card fields (brand color, motivational
-- message, offer line, store link) live in the entitlement's config jsonb so no
-- schema change is needed. Returns at most one row; the app treats "no row" as
-- "no sponsor" and skips both bookend acts.

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
  where e.offering_code = 'reveal_sponsor' and e.active
    and sp.status = 'active' and nmao.sponsor_has(sp.id, 'reveal_sponsor')
    -- empty targeting array = national (matches everyone); else the viewer's
    -- segment value must be present. A NULL viewer only matches national rows.
    and (e.age_brackets = '{}' or (v_age    is not null and v_age    = any(e.age_brackets)))
    and (e.states       = '{}' or (v_state  is not null and v_state  = any(e.states)))
    and (e.regions      = '{}' or (v_region is not null and v_region = any(e.regions)))
    and (e.ranks        = '{}' or (v_rank   is not null and v_rank   = any(e.ranks)))
  -- most-specific targeting wins (a regional/age sponsor beats a national one)
  order by (cardinality(e.age_brackets) + cardinality(e.states) + cardinality(e.regions) + cardinality(e.ranks)) desc
  limit 1;

  if v_sid is null then return; end if;

  name      := v_name;
  logo_url  := v_logo;
  tagline   := v_tag;
  color     := coalesce(nullif(trim(v_cfg->>'color'), ''), '#E6B93F');   -- default = house gold
  message   := nullif(trim(v_cfg->>'message'), '');
  offer     := nullif(trim(v_cfg->>'offer'), '');
  -- store link: explicit config value, else the sponsor's top approved product, else their site
  store_url := coalesce(
    nullif(trim(v_cfg->>'store_url'), ''),
    (select product_url from public.sponsor_products
       where sponsor_id = v_sid and active and approved_at is not null
       order by sort_order limit 1),
    nullif(trim(v_web), '')
  );
  return next;
end $$;

grant execute on function public.reveal_sponsor(uuid) to authenticated, anon;

-- The surface now exists — mark the offering live so it can be sold/assigned.
update public.sponsor_offerings set live = true where code = 'reveal_sponsor';
