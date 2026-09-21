-- ============================================================================
-- School join-code funnel (Phase 1)
-- ----------------------------------------------------------------------------
-- Adds a self-serve way for a competitor to attach to a school:
--   * schools.join_code       -- short human-friendly code the instructor shares
--   * competitors.membership_status -- 'active' | 'pending' | 'removed'
-- A competitor who enters a school's join code is linked with membership_status
-- = 'pending' and CANNOT compete until the instructor approves them (→ 'active').
-- Existing school-linked competitors are grandfathered to 'active'.
-- ============================================================================

-- ---- 1. join code generator (acronym of school name + 3 unambiguous chars) --
create or replace function public.new_school_join_code(p_name text)
returns text
language plpgsql
as $$
declare
  v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- no I,L,O,0,1
  v_acr   text;
  v_suf   text;
  v_code  text;
  i int;
begin
  -- acronym: first letter of each word, in order
  select upper(regexp_replace(string_agg(left(w.word, 1), '' order by w.ord), '[^A-Za-z0-9]', '', 'g'))
    into v_acr
    from regexp_split_to_table(coalesce(p_name, ''), '\s+') with ordinality as w(word, ord)
    where w.word ~ '[A-Za-z0-9]';

  if v_acr is null or length(v_acr) < 2 then
    v_acr := upper(regexp_replace(coalesce(p_name, 'SCHOOL'), '[^A-Za-z0-9]', '', 'g'));
    v_acr := left(coalesce(nullif(v_acr, ''), 'SCHOOL'), 4);
  end if;
  v_acr := left(v_acr, 5);

  loop
    v_suf := '';
    for i in 1..3 loop
      v_suf := v_suf || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    v_code := v_acr || '-' || v_suf;
    exit when not exists (select 1 from public.schools where join_code = v_code);
  end loop;

  return v_code;
end;
$$;

-- ---- 2. schools.join_code (nullable → backfill → unique → auto on insert) ----
alter table public.schools add column if not exists join_code text;

update public.schools
   set join_code = public.new_school_join_code(name)
 where join_code is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.schools'::regclass and conname = 'schools_join_code_key'
  ) then
    alter table public.schools add constraint schools_join_code_key unique (join_code);
  end if;
end $$;

create or replace function public.assign_school_join_code()
returns trigger
language plpgsql
as $$
begin
  if new.join_code is null then
    new.join_code := public.new_school_join_code(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_school_join_code on public.schools;
create trigger trg_assign_school_join_code
  before insert on public.schools
  for each row execute function public.assign_school_join_code();

-- ---- 3. competitors.membership_status (existing linked rows = active) --------
alter table public.competitors
  add column if not exists membership_status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.competitors'::regclass and conname = 'competitors_membership_status_chk'
  ) then
    alter table public.competitors
      add constraint competitors_membership_status_chk
      check (membership_status in ('active', 'pending', 'removed'));
  end if;
end $$;

-- fast lookup of a school's pending join requests
create index if not exists idx_competitors_school_membership
  on public.competitors (school_id, membership_status);

comment on column public.schools.join_code is
  'Short human-friendly code an instructor shares so a competitor can self-attach to this school.';
comment on column public.competitors.membership_status is
  'active = may compete; pending = joined via code, awaiting instructor approval; removed = detached by instructor.';
