-- Extend the Badges admin to CREATE new badges (and full-field edit), not just
-- edit rules. Insert-or-update by code, staff-gated. NOTE: adding a badge row
-- defines it (art/wording/rule) but does not itself wire award LOGIC — a badge
-- with a brand-new trigger/mechanic still needs engine support to auto-award.

create or replace function public.admin_upsert_badge(
  p_code text, p_name text, p_category text, p_rarity text,
  p_tiered boolean, p_hidden boolean, p_active boolean,
  p_title text, p_emblem_key text, p_sort_order integer,
  p_description text, p_earn_rule jsonb
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_staff();
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
end $$;

grant execute on function public.admin_upsert_badge(text,text,text,text,boolean,boolean,boolean,text,text,integer,text,jsonb) to authenticated;
