-- ============================================================
--  rank_options() — the app's Division filter, driven by the active
--  scheme's rank tiers (same list Tournament Config edits). Adding /
--  renaming / reordering a tier in config now flows to the app's
--  division chips, closing the last hardcoded loop. Order preserved.
-- ============================================================
create or replace function public.rank_options()
returns table (code text, label text)
language sql stable security definer set search_path = public as $$
  with sc as (
    select ds.axes from division_schemes ds
    join seasons s on ds.id = s.active_scheme_id
    where s.status = 'active' order by s.created_at desc limit 1
  ),
  rank_axis as (
    select ax from sc, jsonb_array_elements(sc.axes) ax where ax->>'key' = 'rank' limit 1
  )
  select t.value as code, initcap(replace(t.value, '_', ' ')) as label
  from rank_axis, jsonb_array_elements_text((rank_axis.ax)->'tiers') with ordinality t(value, ord)
  order by t.ord
$$;
revoke all on function public.rank_options() from public;
grant execute on function public.rank_options() to authenticated;
