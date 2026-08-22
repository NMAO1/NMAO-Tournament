-- =====================================================================
-- Simple 3-product lineup: single entry ($55), subscription ($45/mo),
-- season pass ($350). Reactivate the single-entry tier (alacarte×1) retired
-- in the previous cleanup, and align the pay-at-entry flat charge to $55 so a
-- single entry costs the same whether bought ahead or paid at Register.
-- (full×1 and monthly×1 stay active; the slot-2 lanes stay retired.)
-- =====================================================================
update pricing_tiers set active = true  where lane = 'alacarte' and event_slots = 1;
update app_settings   set value  = to_jsonb(5500) where key = 'entry_fee_cents';
