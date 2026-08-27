-- Mission Control "Badges" admin — staff-gated RPCs to edit badge earn rules
-- (the human "how to earn" description + the machine earn_rule jsonb) and the
-- shared numeric thresholds in dueling_award_config. Mirrors the admin_* pattern
-- (SECURITY DEFINER + _require_staff()). No engine change — the award functions
-- already read these values live.

create or replace function public.admin_badges()
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', code, 'name', name, 'category', category, 'rarity', rarity,
      'tiered', tiered, 'hidden', hidden, 'active', active,
      'description', description, 'earn_rule', earn_rule
    ) order by category nulls last, sort_order, name)
    from badges
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_badge(p_code text, p_description text, p_earn_rule jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_staff();
  if p_code is null or length(trim(p_code)) = 0 then raise exception 'code required'; end if;
  update badges set
    description = p_description,
    earn_rule   = coalesce(p_earn_rule, earn_rule)
  where code = trim(p_code);
  if not found then raise exception 'badge % not found', p_code; end if;
end $$;

create or replace function public.admin_award_config()
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', key, 'num', num, 'note', note) order by key)
    from dueling_award_config
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_save_award_config(p_key text, p_num numeric)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_staff();
  update dueling_award_config set num = p_num where key = p_key;
  if not found then raise exception 'config key % not found', p_key; end if;
end $$;

grant execute on function public.admin_badges() to authenticated;
grant execute on function public.admin_save_badge(text, text, jsonb) to authenticated;
grant execute on function public.admin_award_config() to authenticated;
grant execute on function public.admin_save_award_config(text, numeric) to authenticated;
