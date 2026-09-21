-- ============================================================================
-- In-house entrants: structured division (age group + skill), replacing the
-- old free-text `division`. The public registration form now uses two dropdowns
-- (Age group 7–9…18+ and Division Beginner/Intermediate/Advanced). `event` is no
-- longer athlete-entered — it is set to the tournament name at registration.
-- `division` is retained and populated with a combined human label for display.
-- ============================================================================

alter table public.ih_entrants add column if not exists age_group text;
alter table public.ih_entrants add column if not exists skill_division text;

comment on column public.ih_entrants.age_group is 'Age bracket code (7_9, 10_12, 13_15, 16_17, 18_plus).';
comment on column public.ih_entrants.skill_division is 'Skill division: Beginner | Intermediate | Advanced.';
