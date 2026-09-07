-- Server-authoritative "current required judge terms version" gate (2026-09-07).
-- The judge activation check (accept-judge-terms / approve-judge) requires a judge's
-- terms_version to equal this. Seeded to the current provisional version so nothing
-- changes today; when counsel-final agreements ship, set this to '"1.0"' (and flip
-- JudgeOnboarding.LEGAL_FINAL) — every judge who only accepted a draft version then
-- falls out of 'active' until they re-accept the final terms.
insert into public.app_settings (key, value)
select 'required_judge_terms_version', '"draft-2026-08"'::jsonb
where not exists (select 1 from public.app_settings where key = 'required_judge_terms_version');
