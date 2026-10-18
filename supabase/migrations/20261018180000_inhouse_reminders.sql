-- In-house tournament reminders (Brad 2026-10-18). The only in-house reminder
-- before this was inhouse-upload-reminders (video-format, paid, no-video-yet).
-- This adds, as in-app notifications (via nmao.notify — pref-gated, rendered by
-- the app's AlertsSheet) for BOTH in-person and video tournaments:
--   • event coming up  (T-3d and T-1d off event_date) → entrants
--   • finish registration (unpaid, fee>0, event within 5d) → entrants
--   • new tournament open → a school's active competitors who have no entry yet
-- Pure-DB hourly cron (no EF / cron-secret). Dedup: ih_entrants.nudge_reminders_sent
-- for entrant nudges; ih_signup_notified for the one-time discovery push.

alter table public.ih_entrants add column if not exists nudge_reminders_sent text[] not null default '{}';

create table if not exists public.ih_signup_notified (
  tournament_id uuid not null references public.in_house_tournaments(id) on delete cascade,
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (tournament_id, competitor_id)
);

create or replace function nmao.inhouse_reminders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n_event int := 0; n_dues int := 0; n_signup int := 0; v_evt text;
begin
  -- 1) Entrant nudges — event-coming-up + unpaid-dues, for LIVE tournaments.
  for r in
    select e.id as entrant_id, e.competitor_id, e.event, e.payment_status, e.nudge_reminders_sent,
           t.id as tournament_id, t.name, t.event_date, t.entry_fee_cents
    from ih_entrants e
    join in_house_tournaments t on t.id = e.tournament_id
    where e.competitor_id is not null
      and t.state not in ('draft','complete')
      and t.event_date is not null
      and t.event_date >= current_date
  loop
    v_evt := coalesce(r.event, 'your event');
    if r.event_date <= current_date + 3 and r.event_date > current_date + 1 and not ('event_3d' = any(r.nudge_reminders_sent)) then
      perform nmao.notify(r.competitor_id, 'inhouse_reminder', r.name || ' is coming up',
        v_evt || ' is ' || to_char(r.event_date, 'Mon DD') || ' at ' || r.name || '. Get ready!',
        jsonb_build_object('ih_entrant_id', r.entrant_id, 'tournament_id', r.tournament_id, 'kind', 'event'));
      update ih_entrants set nudge_reminders_sent = array_append(nudge_reminders_sent, 'event_3d') where id = r.entrant_id;
      n_event := n_event + 1;
    elsif r.event_date <= current_date + 1 and not ('event_1d' = any(r.nudge_reminders_sent)) then
      perform nmao.notify(r.competitor_id, 'inhouse_reminder',
        (case when r.event_date = current_date then r.name || ' is today' else r.name || ' is tomorrow' end),
        v_evt || ' is ' || (case when r.event_date = current_date then 'today' else 'tomorrow' end) || ' at ' || r.name || '. Good luck!',
        jsonb_build_object('ih_entrant_id', r.entrant_id, 'tournament_id', r.tournament_id, 'kind', 'event'));
      update ih_entrants set nudge_reminders_sent = array_append(nudge_reminders_sent, 'event_1d') where id = r.entrant_id;
      n_event := n_event + 1;
    end if;

    if coalesce(r.entry_fee_cents, 0) > 0 and r.payment_status = 'unpaid'
       and r.event_date <= current_date + 5 and not ('dues' = any(r.nudge_reminders_sent)) then
      perform nmao.notify(r.competitor_id, 'inhouse_reminder', 'Finish your ' || r.name || ' registration',
        'Your spot in ' || v_evt || ' at ' || r.name || ' isn''t finalized yet — complete your registration to compete.',
        jsonb_build_object('ih_entrant_id', r.entrant_id, 'tournament_id', r.tournament_id, 'kind', 'dues'));
      update ih_entrants set nudge_reminders_sent = array_append(nudge_reminders_sent, 'dues') where id = r.entrant_id;
      n_dues := n_dues + 1;
    end if;
  end loop;

  -- 2) Discovery — a school's active competitors without an entry, once per tournament.
  for r in
    select t.id as tournament_id, t.name, t.event_date, c.id as competitor_id
    from in_house_tournaments t
    join competitors c on c.school_id = t.school_id and coalesce(c.status, 'active') = 'active'
    where t.state not in ('draft','complete')
      and coalesce(t.registration_open, true)
      and (t.event_date is null or t.event_date >= current_date)
      and not exists (select 1 from ih_entrants e where e.tournament_id = t.id and e.competitor_id = c.id)
      and not exists (select 1 from ih_signup_notified s where s.tournament_id = t.id and s.competitor_id = c.id)
  loop
    perform nmao.notify(r.competitor_id, 'inhouse_reminder', 'New tournament at your school',
      r.name || ' is open for sign-ups' || (case when r.event_date is not null then ' — ' || to_char(r.event_date, 'Mon DD') else '' end) || '. Tap to join.',
      jsonb_build_object('tournament_id', r.tournament_id, 'kind', 'signup'));
    insert into ih_signup_notified (tournament_id, competitor_id) values (r.tournament_id, r.competitor_id) on conflict do nothing;
    n_signup := n_signup + 1;
  end loop;

  return jsonb_build_object('event', n_event, 'dues', n_dues, 'signup', n_signup);
end $$;

revoke all on function nmao.inhouse_reminders() from public;
grant execute on function nmao.inhouse_reminders() to service_role;

select cron.unschedule('inhouse-reminders') where exists (select 1 from cron.job where jobname = 'inhouse-reminders');
select cron.schedule('inhouse-reminders', '7 * * * *', $$ select nmao.inhouse_reminders(); $$);
