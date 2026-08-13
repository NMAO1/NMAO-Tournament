-- Fix: age_bracket_of must handle open-ended brackets (max_age IS NULL, e.g. 18_plus).
-- `age between min and max` returns NULL when max_age is null, dropping the match.
create or replace function nmao.age_bracket_of(p_dob date)
returns text language sql stable security definer set search_path = public as $$
  select ab.code from age_brackets ab
  where date_part('year', age(p_dob)) >= ab.min_age
    and (ab.max_age is null or date_part('year', age(p_dob)) <= ab.max_age)
  order by ab.min_age desc
  limit 1
$$;
