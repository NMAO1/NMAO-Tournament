-- Record which version of the judge agreements was acknowledged, so a stored
-- acceptance honestly reflects whether the terms were a DRAFT (provisional,
-- "draft-*") or a finalized version — and judges can be re-prompted when final
-- terms ship. See accept-judge-terms + JudgeOnboarding (LEGAL_FINAL flag).
alter table judges add column if not exists terms_version text;
