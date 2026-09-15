-- =====================================================================
-- SUBMISSION PASSWORDS — anti-reuse "say-this-on-camera" codes.
--   • MONTHLY tournament password: per round (rounds.submission_password),
--     auto-generated at round creation. Judges verify it.
--   • WEEKLY dueling password: public.weekly_passwords, one row per calendar
--     week (Mon-start), auto-generated (weekly cron + on-read fallback).
--     Community-reported (no judge).
-- A competitor states the current code on camera before the form; a video with
-- the wrong/missing code (or any edit) is disqualified after review.
-- Idempotent.
-- =====================================================================

-- Say-able code generator: a word + 2 digits, e.g. "TIGER 47".
create or replace function nmao.gen_say_password()
returns text language sql volatile as $$
  select (array['DRAGON','TIGER','CRANE','FALCON','PHOENIX','COBRA','EAGLE','MANTIS',
                'LOTUS','THUNDER','JADE','IRON','STORM','RIVER','SUMMIT','SHADOW',
                'WARRIOR','SENSEI','KATANA','BAMBOO'])[floor(random()*20)+1]
    || ' ' || lpad((floor(random()*90)+10)::text, 2, '0')
$$;

-- MONTHLY tournament password on the round; auto-set at insert, backfill existing.
alter table public.rounds
  add column if not exists submission_password text;
alter table public.rounds
  alter column submission_password set default nmao.gen_say_password();
update public.rounds set submission_password = nmao.gen_say_password()
 where submission_password is null;

-- WEEKLY dueling password — one row per Monday-start calendar week.
create table if not exists public.weekly_passwords (
  week_start date primary key,
  password   text not null default nmao.gen_say_password(),
  created_at timestamptz not null default now()
);
alter table public.weekly_passwords enable row level security;  -- locked; served via RPC below

-- Current week's dueling password, minting the row on first read (so it always
-- exists even before the cron runs). SECURITY DEFINER so authenticated app users
-- can read the current code without exposing the whole table.
create or replace function public.current_duel_password()
returns text language plpgsql stable security definer set search_path = public, nmao as $$
declare ws date := date_trunc('week', now())::date; pw text;
begin
  select password into pw from public.weekly_passwords where week_start = ws;
  if pw is null then
    insert into public.weekly_passwords(week_start) values (ws) on conflict (week_start) do nothing;
    select password into pw from public.weekly_passwords where week_start = ws;
  end if;
  return pw;
end $$;
revoke all on function public.current_duel_password() from public, anon;
grant execute on function public.current_duel_password() to authenticated;

-- JUDGE verify flag (flag-for-review, NOT auto-void): per judge×entry assignment.
-- null = not answered yet · true = said correctly · false = wrong/missing → staff review.
alter table public.judge_assignments
  add column if not exists password_verified boolean;

-- Weekly cron: pre-mint the current week's dueling password every Monday 04:00 UTC.
create extension if not exists pg_cron;
do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'rotate-duel-password' loop
    perform cron.unschedule(j);
  end loop;
end $$;
select cron.schedule(
  'rotate-duel-password',
  '0 4 * * 1',
  $cron$ insert into public.weekly_passwords(week_start)
         values (date_trunc('week', now())::date) on conflict (week_start) do nothing; $cron$
);
