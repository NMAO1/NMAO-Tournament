-- School payout is now a PER-SCHOOL tier (decision 2026-09-07), stored in
-- schools.payout_tier as a whole-number percentage:
--   15 = base
--   25 = on the membership platform OR accredited
--   35 = on the membership platform AND accredited
-- The webhook reads payout_tier per school (default 15% if unset) for BOTH flat entries
-- and season-pass purchases. Normalize existing rows to the model: schools linked to the
-- membership platform (external_member_school_id set) start at 25; everyone else at 15.
-- Staff bump accredited members to 35 from Mission Control.
update public.schools
set payout_tier = case
  when external_member_school_id is not null and external_member_school_id <> '' then 25
  else 15
end
where payout_tier is null or payout_tier not in (15, 25, 35);
