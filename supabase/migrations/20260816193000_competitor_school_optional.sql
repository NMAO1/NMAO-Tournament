-- Competitor signup (onboard-competitor EF) treats school as optional — an
-- independent/unaffiliated competitor can register without a school, then link
-- one later. The competitors.school_id NOT NULL constraint rejected those
-- signups (23502). Make it nullable to match the signup flow.
alter table public.competitors alter column school_id drop not null;
