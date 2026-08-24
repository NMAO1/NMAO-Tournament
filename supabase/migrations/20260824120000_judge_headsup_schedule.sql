-- =====================================================================
-- Judge "heads-up" scheduler — advance-notice emails before judging opens.
-- Submissions always close the 15th; judging opens the 16th @ 09:00 ET, so
-- the open time is known and we can pre-warn judges on a timer.
--
-- This migration holds the *brains* only (config + dedup log + a due-check
-- function) — NO secret. An hourly pg_cron job (created out-of-band via direct
-- SQL, mirroring fill-unclaimed-deadline, so the x-cron-secret literal stays
-- out of git) calls nmao.judge_headsup_due() and, when it returns a lead,
-- POSTs notify-judges(kind:heads_up, hours_until:<lead>).
-- =====================================================================

-- Schedule config (single jsonb row; edit any time, no redeploy).
--   day        — day of month pods go live for judging (16 = day after deadline)
--   time       — local open time "HH:MM"
--   tz         — IANA timezone the day/time are measured in
--   lead_hours — how many hours before open to send heads-up email(s)
insert into public.app_settings (key, value)
values ('judge_headsup_schedule',
        '{"day":16,"time":"09:00","tz":"America/New_York","lead_hours":[24]}'::jsonb)
on conflict (key) do nothing;

-- Dedup: one row per (open month, lead) once its heads-up has fired.
create table if not exists public.judge_headsup_log (
  open_date  date        not null,
  lead_hours int         not null,
  sent_at    timestamptz not null default now(),
  primary key (open_date, lead_hours)
);

-- Returns the lead (hours) whose heads-up is due RIGHT NOW, else NULL.
-- "Due" = now() is within [open - lead, open - lead + 1h) for the upcoming
-- open, and that (open_date, lead) hasn't been sent yet. Claims the dedup row
-- on match so a repeat run in the same window is a no-op. Hourly cron → the
-- 1-hour window is hit exactly once per lead per month.
create or replace function nmao.judge_headsup_due()
returns integer
language plpgsql
security definer
set search_path = public, nmao
as $$
declare
  cfg        jsonb;
  v_tz       text;
  v_day      int;
  v_time     text;
  v_open     timestamptz;
  v_lead     int;
  v_send     timestamptz;
begin
  select value into cfg from public.app_settings where key = 'judge_headsup_schedule';
  if cfg is null then return null; end if;
  v_tz   := coalesce(cfg->>'tz', 'America/New_York');
  v_day  := coalesce((cfg->>'day')::int, 16);
  v_time := coalesce(cfg->>'time', '09:00');

  -- This month's open instant, in the configured tz.
  v_open := ((to_char((now() at time zone v_tz)::date, 'YYYY-MM-')
              || lpad(v_day::text, 2, '0') || ' ' || v_time)::timestamp)
            at time zone v_tz;
  -- If we're already past it, the next open is next month (same day/time).
  if v_open <= now() then
    v_open := ((to_char(((now() at time zone v_tz)::date + interval '1 month')::date, 'YYYY-MM-')
                || lpad(v_day::text, 2, '0') || ' ' || v_time)::timestamp)
              at time zone v_tz;
  end if;

  for v_lead in
    select (x)::int from jsonb_array_elements_text(coalesce(cfg->'lead_hours', '[24]'::jsonb)) as x
  loop
    v_send := v_open - make_interval(hours => v_lead);
    if now() >= v_send and now() < v_send + interval '1 hour' then
      begin
        insert into public.judge_headsup_log (open_date, lead_hours)
        values (v_open::date, v_lead);          -- claim; unique-violation => already sent
        return v_lead;
      exception when unique_violation then
        -- already fired this window; fall through to any other lead
        null;
      end;
    end if;
  end loop;

  return null;
end;
$$;
