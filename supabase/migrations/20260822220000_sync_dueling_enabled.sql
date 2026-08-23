-- =====================================================================
-- Make the school portal's dueling toggle actually enable dueling.
-- The portal writes student_tournament_settings.dueling_enabled, but
-- request_duel / find_duel_opponents / the pool readers all enforce
-- competitors.dueling_enabled — with no sync between them, a school toggling
-- dueling in the portal was a NO-OP (fails closed).
--
-- Fix: a one-way mirror — whenever STS.dueling_enabled is set (insert or
-- changed on update), copy it to the enforced competitors.dueling_enabled for
-- that competitor. SECURITY DEFINER because the school owner can write STS but
-- not competitors directly. No backfill: competitors already enabled directly
-- must not be flipped off by stale STS rows.
-- =====================================================================
create or replace function nmao.sync_dueling_enabled()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if TG_OP = 'INSERT' or NEW.dueling_enabled is distinct from OLD.dueling_enabled then
    update competitors set dueling_enabled = NEW.dueling_enabled
      where id = NEW.competitor_id
        and dueling_enabled is distinct from NEW.dueling_enabled;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sts_sync_dueling on student_tournament_settings;
create trigger trg_sts_sync_dueling
  after insert or update of dueling_enabled on student_tournament_settings
  for each row execute function nmao.sync_dueling_enabled();
