-- ============================================================
-- #77 rename · #78 retire · #86 trailblazer threshold. CATALOG ONLY.
--   #77 fair-witness → renamed again: "Honorable Witness" → "Honorable Voter".
--   #78 trusted-voter → RETIRED (active=false); Honorable Voter now owns the
--        85%-winner-accuracy space.
--   #86 trailblazer → concrete threshold: among the first 100 competitors ever.
-- Idempotent UPDATEs keyed by code.
-- ============================================================

-- #77 Honorable Witness → Honorable Voter
update badges set name = 'Honorable Voter' where code = 'fair-witness';

-- #78 retire trusted-voter (superseded by Honorable Voter)
update badges set active = false where code = 'trusted-voter';

-- #86 trailblazer → first 100 competitors
update badges set
  description = 'Be one of the first 100 competitors ever to join.',
  earn_rule   = '{"trigger":"on_onboarding_complete","rule":"Among the first 100 competitors ever (limited)","first_n":100}'::jsonb
where code = 'trailblazer';
