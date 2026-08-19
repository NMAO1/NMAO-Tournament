-- SECURITY FIX (critical): grant_tier_entitlements / grant_offering_entitlements
-- are SECURITY DEFINER with no internal auth (webhook-only helpers), but were
-- granted to service_role WITHOUT revoking Postgres's default PUBLIC execute — so
-- anon/authenticated could self-grant any sponsor every paid offering for free,
-- bypassing the paywall. Revoke from public/anon/authenticated; keep service_role.
revoke all on function public.grant_tier_entitlements(uuid) from public, anon, authenticated;
revoke all on function public.grant_offering_entitlements(uuid, text[]) from public, anon, authenticated;
grant execute on function public.grant_tier_entitlements(uuid) to service_role;
grant execute on function public.grant_offering_entitlements(uuid, text[]) to service_role;
