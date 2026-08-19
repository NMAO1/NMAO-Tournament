-- Custom product image + border animation per sponsor frame.
--   image_url : a product shot the sponsor can feature on the frame
--   animation : border style — none | shimmer | pulse | sheen
alter table public.sponsor_frames add column if not exists image_url text;
alter table public.sponsor_frames add column if not exists animation text not null default 'none';

-- competitor_card: include image_url + animation in the sponsor_frame object.
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
      jsonb_build_object('id', sf.id, 'name', sf.name, 'logo_url', sf.logo_url, 'accent_color', sf.accent_color,
                         'label', coalesce(sf.label, sp.company_name), 'image_url', sf.image_url, 'animation', sf.animation) end
  )
  from competitors c
  left join schools s        on s.id = c.school_id
  left join duel_ratings dr  on dr.competitor_id = c.id
  left join badges b         on b.code = c.equipped_badge_code
  left join sponsor_frames sf on sf.id = c.equipped_sponsor_frame_id and sf.active
  left join sponsors sp      on sp.id = sf.sponsor_id and sp.status = 'active'
  where c.id = p_competitor_id
$function$;

-- available_sponsor_frames: return image_url + animation too (return type changes → drop).
drop function if exists public.available_sponsor_frames(uuid);
create function public.available_sponsor_frames(p_competitor_id uuid)
returns table (id uuid, name text, logo_url text, accent_color text, label text, image_url text, animation text, sponsor_name text, equipped boolean)
language sql stable security definer set search_path = public as $$
  select sf.id, sf.name, sf.logo_url, sf.accent_color, coalesce(sf.label, sp.company_name), sf.image_url, sf.animation, sp.company_name,
         (c.equipped_sponsor_frame_id = sf.id)
  from public.sponsor_frames sf
  join public.sponsors sp on sp.id = sf.sponsor_id
  left join public.competitors c on c.id = p_competitor_id
  where sf.active and not sf.is_template and sp.status = 'active' and nmao.sponsor_has(sp.id, 'custom_frame')
  order by sp.company_name;
$$;
grant execute on function public.available_sponsor_frames(uuid) to anon, authenticated;

-- admin_upsert_sponsor_frame: accept image_url + animation.
create or replace function public.admin_upsert_sponsor_frame(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
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
end $$;
grant execute on function public.admin_upsert_sponsor_frame(jsonb) to authenticated;
