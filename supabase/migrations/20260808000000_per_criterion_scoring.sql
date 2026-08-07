-- =====================================================================
-- NMAO Tournaments — Migration 5 of 5: per-criterion judge scoring (A6)
-- Applies AFTER the RLS migration (uses nmao.judge_id() / nmao.is_staff()).
--
-- Judges score one field per criterion (the 6 in `criteria`), weighted by the
-- event's style profile (Traditional vs Open) in `rubric_weights`. The video's
-- per-judge score is the weighted combination (see functions/_shared/rating.ts
-- weightedJudgeScore + docs/scoring-and-rating.md §1) and is stored on
-- judge_assignments.score, so resolve/placement/rating are unchanged. These
-- per-criterion rows keep every score auditable back to the rubric.
-- =====================================================================

begin;

create table if not exists submission_scores (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid not null references entries(id) on delete cascade,
  judge_id       uuid not null references judges(id),
  criterion_code text not null references criteria(code),
  raw_score      numeric(6,2) not null check (raw_score >= 0 and raw_score <= 100),
  created_at     timestamptz not null default now(),
  unique (entry_id, judge_id, criterion_code)
);

create index if not exists idx_subscores_entry on submission_scores(entry_id);
create index if not exists idx_subscores_judge on submission_scores(judge_id);

alter table submission_scores enable row level security;

-- A judge reads and writes their own per-criterion scores; staff read all.
create policy subscore_judge_read on submission_scores for select to authenticated
  using (judge_id = nmao.judge_id() or nmao.is_staff());
create policy subscore_judge_insert on submission_scores for insert to authenticated
  with check (judge_id = nmao.judge_id());
create policy subscore_judge_update on submission_scores for update to authenticated
  using (judge_id = nmao.judge_id())
  with check (judge_id = nmao.judge_id());

grant select, insert, update on submission_scores to authenticated;
grant all on submission_scores to service_role;

commit;
