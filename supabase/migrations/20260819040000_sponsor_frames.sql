-- ============================================================
--  Custom branded frames (sponsor offering: custom_frame).
--
--  A sponsor gets ONE literal branded frame — their colors + logo + name — that
--  rings a competitor's video. Competitors CHOOSE to equip it (like a badge
--  frame); everyone who watches their duels sees the brand. A blank
--  "Your Sponsorship Here" TEMPLATE (sponsor_id NULL, is_template) is the sales
--  demo — never equippable.
--
--  Flows into the Arena via nmao.competitor_card (→ duel_faceoff/reveal): each
--  card gains a `sponsor_frame` object when the competitor has one equipped and
--  the sponsor is still active. Gated on the custom_frame entitlement.
-- ============================================================

create table if not exists public.sponsor_frames (
  id           uuid primary key default gen_random_uuid(),
  sponsor_id   uuid references public.sponsors(id) on delete cascade,   -- NULL = the template
  name         text not null,
  logo_url     text,
  accent_color text not null default '#E9C15A',   -- band color (hex)
  label        text,                                -- "presented by" line (defaults to company name)
  is_template  boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (sponsor_id)                              -- one frame per sponsor (multiple NULL templates allowed)
);
alter table public.sponsor_frames enable row level security;

insert into public.sponsor_frames (sponsor_id, name, accent_color, label, is_template, active)
values (null, 'Your Sponsorship Here', '#E9C15A', 'Your brand here', true, true)
on conflict do nothing;

alter table public.competitors add column if not exists equipped_sponsor_frame_id uuid references public.sponsor_frames(id) on delete set null;

-- ---- competitor equips a sponsor frame (own competitor only) ------------------
create or replace function public.set_equipped_sponsor_frame(p_competitor_id uuid, p_frame uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not (p_competitor_id in (select nmao.competitor_ids())) then raise exception 'Not your competitor.'; end if;
  if p_frame is not null and not exists (
    select 1 from public.sponsor_frames sf join public.sponsors sp on sp.id = sf.sponsor_id
    where sf.id = p_frame and sf.active and not sf.is_template and sp.status = 'active'
      and nmao.sponsor_has(sp.id, 'custom_frame')
  ) then raise exception 'That frame is not available.'; end if;
  update public.competitors set equipped_sponsor_frame_id = p_frame where id = p_competitor_id;
end $$;

-- ---- frames a competitor can equip ------------------------------------------
create or replace function public.available_sponsor_frames(p_competitor_id uuid)
returns table (id uuid, name text, logo_url text, accent_color text, label text, sponsor_name text, equipped boolean)
language sql stable security definer set search_path = public as $$
  select sf.id, sf.name, sf.logo_url, sf.accent_color, coalesce(sf.label, sp.company_name), sp.company_name,
         (c.equipped_sponsor_frame_id = sf.id)
  from public.sponsor_frames sf
  join public.sponsors sp on sp.id = sf.sponsor_id
  left join public.competitors c on c.id = p_competitor_id
  where sf.active and not sf.is_template and sp.status = 'active' and nmao.sponsor_has(sp.id, 'custom_frame')
  order by sp.company_name;
$$;

-- ---- extend competitor_card so an equipped frame shows in the Arena ----------
CREATE OR REPLACE FUNCTION nmao.competitor_card(p_competitor_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'competitor_id', c.id,
    'name', nmao.display_name(c.first_name, c.last_name),
    'first_name', c.first_name,
    'last_name', upper(left(c.last_name,1)),
    'school', s.name,
    'rank', c.declared_rank,
    'age_bracket', nmao.age_bracket_of(c.dob),
    'photo', c.profile_photo_url,
    'rating', coalesce(dr.rating, 1200),
    'duel_wins', coalesce(dr.wins, 0),
    'win_streak', coalesce(dr.streak, 0),
    'best_streak', coalesce(dr.best_streak, 0),
    'frame', case when c.equipped_badge_code is null then null else
      jsonb_build_object('code', b.code, 'name', b.name, 'rarity', b.rarity::text, 'description', b.description) end,
    'sponsor_frame', case when sf.id is null or sp.id is null then null else
      jsonb_build_object('id', sf.id, 'name', sf.name, 'logo_url', sf.logo_url,
                         'accent_color', sf.accent_color, 'label', coalesce(sf.label, sp.company_name)) end
  )
  from competitors c
  left join schools s        on s.id = c.school_id
  left join duel_ratings dr  on dr.competitor_id = c.id
  left join badges b         on b.code = c.equipped_badge_code
  left join sponsor_frames sf on sf.id = c.equipped_sponsor_frame_id and sf.active
  left join sponsors sp      on sp.id = sf.sponsor_id and sp.status = 'active'
  where c.id = p_competitor_id
$function$;

-- =====================================================================
--  STAFF RPCs — a sponsor's frame (in Mission Control)
-- =====================================================================
create or replace function public.admin_sponsor_frame(p_sponsor uuid)
returns setof public.sponsor_frames language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.sponsor_frames where sponsor_id = p_sponsor;
end $$;

create or replace function public.admin_upsert_sponsor_frame(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  if v_sponsor is null then raise exception 'sponsor_id required'; end if;
  insert into public.sponsor_frames (sponsor_id, name, logo_url, accent_color, label, active)
  values (v_sponsor, coalesce(nullif(p->>'name',''),'Sponsor frame'), p->>'logo_url',
          coalesce(nullif(p->>'accent_color',''),'#E9C15A'), p->>'label', coalesce((p->>'active')::boolean, true))
  on conflict (sponsor_id) do update set
    name = coalesce(nullif(p->>'name',''), public.sponsor_frames.name),
    logo_url = coalesce(p->>'logo_url', public.sponsor_frames.logo_url),
    accent_color = coalesce(nullif(p->>'accent_color',''), public.sponsor_frames.accent_color),
    label = coalesce(p->>'label', public.sponsor_frames.label),
    active = coalesce((p->>'active')::boolean, public.sponsor_frames.active)
  returning id into v_id;
  -- adding a frame grants the custom_frame offering (revocable)
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  values (v_sponsor, 'custom_frame', 'auto', true)
  on conflict (sponsor_id, offering_code) do update set active = true;
  return v_id;
end $$;

grant execute on function public.set_equipped_sponsor_frame(uuid, uuid) to authenticated;
grant execute on function public.available_sponsor_frames(uuid) to anon, authenticated;
grant execute on function public.admin_sponsor_frame(uuid) to authenticated;
grant execute on function public.admin_upsert_sponsor_frame(jsonb) to authenticated;
