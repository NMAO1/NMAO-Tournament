-- =====================================================================
-- Pre-submission: deactivate the dormant "monthly" auto-renew entry tier.
-- It is not surfaced in the app UI, but leaving a recurring-subscription tier
-- ACTIVE in the catalog contradicts the App Review notes ("a single event entry
-- or a season pass") and is the recurring-purchase pattern Apple scrutinizes.
-- The app sells only: single entry (create-entry-checkout, flat fee) + season
-- pass (full x1). Reversible: set active = true to bring the monthly lane back.
-- =====================================================================
update public.pricing_tiers set active = false where lane = 'monthly';
