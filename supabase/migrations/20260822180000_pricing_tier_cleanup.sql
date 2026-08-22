-- =====================================================================
-- Pricing catalog cleanup for the credit-bucket model.
-- The app now sells only: full×1 (season pass = 9 credits) and monthly×1
-- (1 credit/month). Single entries go through create-entry-checkout (flat
-- app_settings.entry_fee_cents); "buy more" is the topup lane (per-credit =
-- full ÷ season_pass_credits). The slot-2 variants and the alacarte lane are
-- no longer offered — retire them so nothing surfaces or charges them.
-- Reversible: set active = true to bring one back.
-- =====================================================================
update pricing_tiers
   set active = false
 where active = true
   and not (lane = 'full'    and event_slots = 1)
   and not (lane = 'monthly' and event_slots = 1);
