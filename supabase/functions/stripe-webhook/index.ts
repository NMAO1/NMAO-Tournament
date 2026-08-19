// =====================================================================
// EDGE FUNCTION: stripe-webhook  (payments confirmation)
// Stripe calls this on payment events. On payment_intent.succeeded we flip the
// entry (from the PI metadata) to payment_status='paid' — that's what turns a
// registration into a LIVE entry.
//
// AUTH: Verify JWT = OFF (Stripe can't send a Supabase JWT). Security is the
// Stripe signature check against STRIPE_WEBHOOK_SECRET.
// Requires env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Deploy (editor-safe, no _shared): name = stripe-webhook, Verify JWT OFF.
// Then register the endpoint in Stripe → Developers → Webhooks (event
// payment_intent.succeeded) and put its signing secret in STRIPE_WEBHOOK_SECRET.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  const whsec = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("stripe-signature");
  if (!secret || !whsec) return new Response("Stripe not configured", { status: 500 });
  if (!sig) return new Response("Missing signature", { status: 400 });

  const stripe = new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() });
  const raw = await req.text();

  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, whsec, undefined, cryptoProvider);
  } catch (e: any) {
    console.error("webhook signature error:", e?.message || e);
    return new Response(`Bad signature: ${e?.message || ""}`, { status: 400 });
  }

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const now = () => new Date().toISOString();
  // Map a Stripe subscription.status onto an entitlement status (null = leave as-is).
  const subToEnt = (s: string): string | null =>
    s === "active" || s === "trialing" ? "active"
    : s === "past_due" || s === "unpaid" ? "past_due"
    : s === "canceled" || s === "incomplete_expired" ? "canceled" : null;
  // Activate an entitlement + mark any round entries it staged as paid.
  async function activateEntitlement(entitlementId: string) {
    await svc.from("entry_entitlements").update({ status: "active", updated_at: now() }).eq("id", entitlementId).neq("status", "canceled");
    await svc.from("entries").update({ payment_status: "paid", paid_at: now() }).eq("entitlement_id", entitlementId).neq("payment_status", "paid");
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      // New model: entitlement-scoped payment (à la carte / full / monthly first invoice).
      if (pi.metadata?.entitlement_id) await activateEntitlement(pi.metadata.entitlement_id);
      // Legacy: single-entry PI.
      if (pi.metadata?.entry_id) {
        await svc.from("entries").update({ payment_status: "paid", paid_at: now() }).eq("id", pi.metadata.entry_id);
      }
    } else if (event.type === "checkout.session.completed") {
      // Hosted Checkout finished — link Stripe refs + activate the entitlement.
      const s = event.data.object;
      const entId = s.metadata?.entitlement_id;
      if (entId) {
        const patch: any = { updated_at: now() };
        if (s.subscription) patch.stripe_subscription_id = s.subscription;
        if (s.customer) patch.stripe_customer_id = s.customer;
        if (s.payment_intent) patch.stripe_payment_intent_id = s.payment_intent;
        await svc.from("entry_entitlements").update(patch).eq("id", entId);
        if (s.mode === "subscription" || s.payment_status === "paid") await activateEntitlement(entId);
      }
      // SPONSOR subscription — link Stripe refs + grant the tier's offerings.
      // Status stays 'pending' until staff moderate the ad/products, then → active.
      if (s.metadata?.kind === "sponsor" && s.metadata.sponsor_id) {
        const sp: any = { updated_at: now() };
        if (s.subscription) sp.stripe_subscription_id = s.subscription;
        if (s.customer) sp.stripe_customer_id = s.customer;
        await svc.from("sponsors").update(sp).eq("id", s.metadata.sponsor_id);
        // grant what was actually purchased: a bundle tier and/or à-la-carte offerings
        if (s.metadata.tier_id) await svc.rpc("grant_tier_entitlements", { p_sponsor: s.metadata.sponsor_id });
        if (s.metadata.offerings) await svc.rpc("grant_offering_entitlements", { p_sponsor: s.metadata.sponsor_id, p_codes: String(s.metadata.offerings).split(",").filter(Boolean) });
        if (!s.metadata.tier_id && !s.metadata.offerings) await svc.rpc("grant_tier_entitlements", { p_sponsor: s.metadata.sponsor_id });
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const next = subToEnt(sub.status);
      if (next) {
        const patch: any = { status: next, updated_at: now() };
        if (next === "canceled") patch.canceled_at = now();
        await svc.from("entry_entitlements").update(patch).eq("stripe_subscription_id", sub.id);
      }
      // a sponsor whose subscription goes bad drops out of rotation
      if (sub.status === "past_due" || sub.status === "unpaid" || sub.status === "canceled" || sub.status === "incomplete_expired") {
        await svc.from("sponsors").update({ status: "lapsed", updated_at: now() }).eq("stripe_subscription_id", sub.id);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      await svc.from("entry_entitlements").update({ status: "canceled", canceled_at: now(), updated_at: now() }).eq("stripe_subscription_id", sub.id);
      await svc.from("sponsors").update({ status: "lapsed", updated_at: now() }).eq("stripe_subscription_id", sub.id);
    } else if (event.type === "invoice.payment_succeeded") {
      // Recurring monthly renewal — keep the entitlement active.
      const inv = event.data.object;
      if (inv.subscription) {
        await svc.from("entry_entitlements").update({ status: "active", updated_at: now() }).eq("stripe_subscription_id", inv.subscription).neq("status", "canceled");
        // recover a previously-lapsed sponsor (staff-approved ones return to active)
        await svc.from("sponsors").update({ status: "active", updated_at: now() }).eq("stripe_subscription_id", inv.subscription).eq("status", "lapsed");
      }
    } else if (event.type === "invoice.payment_failed") {
      const inv = event.data.object;
      if (inv.subscription) {
        await svc.from("entry_entitlements").update({ status: "past_due", updated_at: now() }).eq("stripe_subscription_id", inv.subscription);
        await svc.from("sponsors").update({ status: "lapsed", updated_at: now() }).eq("stripe_subscription_id", inv.subscription);
      }
    }
  } catch (e: any) {
    console.error("webhook handler error:", e?.message || e);
    // still 200 so Stripe doesn't retry forever on a data issue
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
