import { supabase } from "./supabase";

export type Lane = "alacarte" | "monthly" | "full";
export type PricingTier = { lane: Lane; event_slots: number; unit_amount_cents: number; bill_interval: "month" | null };
export type Entitlement = { id: string; lane: Lane; event_slots: number; status: string; round_id: string | null; created_at: string };

// The public price catalog (6 tiers). Drives the plan screen.
export async function loadPricing(): Promise<PricingTier[]> {
  const { data } = await supabase
    .from("pricing_tiers")
    .select("lane, event_slots, unit_amount_cents, bill_interval")
    .eq("active", true)
    .order("lane")
    .order("event_slots");
  return (data ?? []) as PricingTier[];
}

export type CheckoutResult = {
  ok: boolean; error?: string;
  url?: string; entitlement_id?: string; amount?: number; lane?: Lane;
};

// Buy an entitlement (1–2 event slots) via a lane; returns a Stripe-hosted
// Checkout URL to open in the browser (keeps purchases off Apple's IAP rails).
export async function createEntitlementCheckout(input: {
  competitor_id: string; lane: Lane; event_slots: number; events?: string[];
}): Promise<CheckoutResult> {
  const { data, error } = await supabase.functions.invoke("create-entitlement-checkout", { body: input });
  if (error) return { ok: false, error: error.message };
  return data as CheckoutResult;
}

// A competitor's entitlements (to know if they've already paid this round/season).
export async function myEntitlements(competitorId: string): Promise<Entitlement[]> {
  const { data } = await supabase
    .from("entry_entitlements")
    .select("id, lane, event_slots, status, round_id, created_at")
    .eq("competitor_id", competitorId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Entitlement[];
}
