-- Per-school DEFAULTS for new competitors' tournament settings (Brad 2026-10-17).
-- A school configures default events / class / dueling once; every newly-inserted
-- competitor (add, import, join-approval, bridge redeem — any path) auto-gets a
-- student_tournament_settings row seeded from them. Owner-editable via the
-- existing schools owner-update RLS. The STS->competitors.dueling_enabled sync
-- trigger (20260822220000) then mirrors the default dueling flag automatically.

alter table public.schools add column if not exists default_tour_events text[];
alter table public.schools add column if not exists default_tour_class   text;
alter table public.schools add column if not exists default_tour_dueling boolean not null default false;

create or replace function nmao.apply_school_tour_defaults()
returns trigger language plpgsql security definer set search_path = public, nmao as $$
declare d_events text[]; d_class text; d_duel boolean;
begin
  select default_tour_events, default_tour_class, coalesce(default_tour_dueling, false)
    into d_events, d_class, d_duel
    from public.schools where id = NEW.school_id;
  -- Only seed a settings row when the school actually set a default; otherwise
  -- behavior is unchanged (no STS row until the owner edits that competitor).
  if coalesce(array_length(d_events, 1), 0) > 0 or d_duel or d_class is not null then
    insert into public.student_tournament_settings
      (competitor_id, school_id, allowed_events, dueling_enabled, competition_class)
    values (NEW.id, NEW.school_id, d_events, d_duel, d_class)
    on conflict (competitor_id) do nothing;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_apply_tour_defaults on public.competitors;
create trigger trg_apply_tour_defaults
  after insert on public.competitors
  for each row execute function nmao.apply_school_tour_defaults();
