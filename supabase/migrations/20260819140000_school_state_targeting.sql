-- Geo targeting reads schools.state, but schools already capture their state in
-- the address JSON (address->>'state', used for geocoding). Backfill the column
-- from the address, and make the segment/reach logic fall back to the address
-- state — so regional sponsorship works off the data schools already enter.

update public.schools
  set state = upper(trim(address->>'state'))
  where (state is null or state = '') and coalesce(trim(address->>'state'),'') <> '';

-- competitor's segment — normalized state (column, else address), region derived.
create or replace function nmao.competitor_segment(p_competitor uuid)
returns table (age_bracket text, state text, region text, rank text)
language sql stable security definer set search_path = public as $$
  select nmao.age_bracket_of(c.dob),
         upper(coalesce(nullif(trim(s.address->>'state'),''), nullif(s.state,''))),
         coalesce(s.region, nmao.region_of(upper(coalesce(nullif(trim(s.address->>'state'),''), nullif(s.state,''))))),
         c.declared_rank
  from competitors c left join schools s on s.id = c.school_id where c.id = p_competitor;
$$;

-- reach — same normalized state fallback.
create or replace function public.admin_segment_reach(p_age text[], p_states text[], p_regions text[], p_ranks text[])
returns int language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  select count(*)::int into n from public.competitors c
    left join public.schools s on s.id = c.school_id
  where c.status = 'active' and coalesce(c.dueling_enabled, false)
    and (coalesce(p_age,'{}')     = '{}' or nmao.age_bracket_of(c.dob) = any(p_age))
    and (coalesce(p_states,'{}')  = '{}' or upper(coalesce(nullif(trim(s.address->>'state'),''), nullif(s.state,''))) = any(p_states))
    and (coalesce(p_regions,'{}') = '{}' or coalesce(s.region, nmao.region_of(upper(coalesce(nullif(trim(s.address->>'state'),''), nullif(s.state,''))))) = any(p_regions))
    and (coalesce(p_ranks,'{}')   = '{}' or c.declared_rank = any(p_ranks));
  return n;
end $$;
grant execute on function public.admin_segment_reach(text[], text[], text[], text[]) to authenticated;
