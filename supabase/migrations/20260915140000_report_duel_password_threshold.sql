-- =====================================================================
-- report_duel v2 — password reports need a QUORUM before hiding (anti-grief).
--   • A "wrong_password" report hides the duel from voting only after 5 DISTINCT
--     reporters flag it (community-verified, since duels have no judge).
--   • All OTHER reasons (inappropriate/harassment/etc.) still hide IMMEDIATELY —
--     safety must not wait for a quorum.
--   • One report per reporter per duel per reason (dedupe) so a single account
--     can't inflate the count. reporter_competitor_id is recorded on every row
--     for accountability / spotting serial false-reporters.
-- Staff then resolve (uphold → no-contest, or dismiss → back to voting) via the
-- resolve-duel-report EF.
-- =====================================================================
create or replace function public.report_duel(p_duel_id uuid, p_reporter uuid, p_target text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_reason text := coalesce(nullif(btrim(p_reason), ''), 'unspecified');
begin
  if p_reporter not in (select nmao.competitor_ids()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from duels where id = p_duel_id) then
    raise exception 'duel not found' using errcode = '23503';
  end if;

  -- Dedupe: one report per reporter per duel per reason.
  if exists (select 1 from duel_reports
              where duel_id = p_duel_id and reporter_competitor_id = p_reporter and reason = v_reason) then
    return;
  end if;

  insert into duel_reports (duel_id, reporter_competitor_id, target, reason)
  values (p_duel_id, p_reporter,
          case when p_target in ('challenger','opponent','other') then p_target else 'other' end,
          v_reason);

  if v_reason = 'wrong_password' then
    -- Password reports: hide only once 5 DISTINCT reporters agree.
    if (select count(distinct reporter_competitor_id) from duel_reports
          where duel_id = p_duel_id and reason = 'wrong_password') >= 5 then
      update duels set moderation_status = 'under_review'
        where id = p_duel_id and moderation_status = 'ok';
    end if;
  else
    -- Safety reports: hide immediately, pending staff review.
    update duels set moderation_status = 'under_review'
      where id = p_duel_id and moderation_status = 'ok';
  end if;
end $$;
revoke all on function public.report_duel(uuid, uuid, text, text) from public, anon;
grant execute on function public.report_duel(uuid, uuid, text, text) to authenticated;
