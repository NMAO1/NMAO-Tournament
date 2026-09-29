-- Auto-cadence: steady weekly drip of APPROVED posts. social-cadence EF assigns
-- each eligible post the next open slot and schedules it via social-publish/Postiz.
create table if not exists public.social_settings (
  id int primary key default 1 check (id = 1),
  auto_schedule boolean not null default false,
  slots jsonb not null default '[{"dow":1,"h":20},{"dow":3,"h":20},{"dow":5,"h":20}]',  -- Mon/Wed/Fri 20:00 UTC
  tz text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);
insert into public.social_settings(id) values (1) on conflict (id) do nothing;
alter table public.social_settings enable row level security;
drop policy if exists social_settings_read on public.social_settings;
create policy social_settings_read on public.social_settings for select using (nmao.staff_can('social','full'));
grant select on public.social_settings to authenticated;

create or replace function public.social_settings_get()
returns public.social_settings language sql security definer set search_path to 'public','nmao' stable as $$
  select * from public.social_settings where id = 1;
$$;
grant execute on function public.social_settings_get() to authenticated;

create or replace function public.social_settings_set(p_auto boolean, p_slots jsonb default null)
returns public.social_settings language plpgsql security definer set search_path to 'public','nmao' as $fn$
declare r public.social_settings;
begin
  if not nmao.staff_can('social','full') then raise exception 'not authorized for social' using errcode='42501'; end if;
  update public.social_settings set
    auto_schedule = coalesce(p_auto, auto_schedule),
    slots = coalesce(p_slots, slots),
    updated_at = now()
  where id = 1 returning * into r;
  return r;
end $fn$;
grant execute on function public.social_settings_set(boolean, jsonb) to authenticated;

-- daily cron (only acts when auto_schedule is on)
select cron.unschedule('social-cadence') where exists (select 1 from cron.job where jobname = 'social-cadence');
select cron.schedule('social-cadence', '30 5 * * *', $cmd$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/social-cadence',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$cmd$);
