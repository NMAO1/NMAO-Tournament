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
    await svc.from("entry_entitlements").update({ status: "active", updated_at: now() }).eq("id", entitlementId).neq("status", "canceled").throwOnError();
    // Only pay entries if the entitlement is ACTIVE now. A canceled (refunded /
    // disputed) entitlement stays canceled (guard above) and must NOT have its
    // entries re-paid by a webhook redelivery or out-of-order event.
    const { data: ent } = await svc.from("entry_entitlements").select("status").eq("id", entitlementId).maybeSingle();
    if ((ent as any)?.status === "active") {
      await svc.from("entries").update({ payment_status: "paid", paid_at: now() }).eq("entitlement_id", entitlementId).neq("payment_status", "paid").throwOnError();
    }
  }
  // Refund / chargeback: revoke access bought by this PaymentIntent — both the
  // entitlement-scoped purchase (cancel entitlement + un-pay its entries) AND a
  // flat single-entry charge (the entry records the PI directly).
  async function revokeByPaymentIntent(pi: string) {
    const { data: ents } = await svc.from("entry_entitlements").select("id").eq("stripe_payment_intent_id", pi).throwOnError();
    for (const e of (ents ?? []) as any[]) {
      await svc.from("entry_entitlements").update({ status: "canceled", canceled_at: now(), updated_at: now() }).eq("id", e.id).throwOnError();
      await svc.from("entries").update({ payment_status: "unpaid", paid_at: null }).eq("entitlement_id", e.id).throwOnError();
    }
    // Flat single-entry charges (create-entry-checkout): the entry itself carries
    // the PaymentIntent — un-pay it so a refunded single entry can't stay live.
    await svc.from("entries").update({ payment_status: "unpaid", paid_at: null }).eq("payment_intent_id", pi).eq("payment_status", "paid").throwOnError();
    return (ents ?? []).length;
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      // New model: entitlement-scoped payment (à la carte / full / monthly first invoice).
      if (pi.metadata?.entitlement_id) await activateEntitlement(pi.metadata.entitlement_id);
      // Flat single-entry PI. Record the PaymentIntent on the entry so a later
      // refund/dispute can find and un-pay exactly this entry.
      if (pi.metadata?.entry_id) {
        await svc.from("entries").update({ payment_status: "paid", paid_at: now(), payment_intent_id: pi.id }).eq("id", pi.metadata.entry_id).throwOnError();
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
        await svc.from("entry_entitlements").update(patch).eq("id", entId).throwOnError();
        if (s.mode === "subscription" || s.payment_status === "paid") await activateEntitlement(entId);
      }
      // SPONSOR subscription — link Stripe refs + grant the tier's offerings.
      // Status stays 'pending' until staff moderate the ad/products, then → active.
      if (s.metadata?.kind === "sponsor" && s.metadata.sponsor_id) {
        const sp: any = { updated_at: now() };
        if (s.subscription) sp.stripe_subscription_id = s.subscription;
        if (s.customer) sp.stripe_customer_id = s.customer;
        await svc.from("sponsors").update(sp).eq("id", s.metadata.sponsor_id).throwOnError();
        // grant what was actually purchased: a bundle tier and/or à-la-carte offerings
        if (s.metadata.tier_id) await svc.rpc("grant_tier_entitlements", { p_sponsor: s.metadata.sponsor_id }).throwOnError();
        if (s.metadata.offerings) await svc.rpc("grant_offering_entitlements", { p_sponsor: s.metadata.sponsor_id, p_codes: String(s.metadata.offerings).split(",").filter(Boolean) }).throwOnError();
        if (!s.metadata.tier_id && !s.metadata.offerings) await svc.rpc("grant_tier_entitlements", { p_sponsor: s.metadata.sponsor_id }).throwOnError();
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const next = subToEnt(sub.status);
      if (next) {
        const patch: any = { status: next, updated_at: now() };
        if (next === "canceled") patch.canceled_at = now();
        await svc.from("entry_entitlements").update(patch).eq("stripe_subscription_id", sub.id).throwOnError();
      }
      // a sponsor whose subscription goes bad drops out of rotation
      if (sub.status === "past_due" || sub.status === "unpaid" || sub.status === "canceled" || sub.status === "incomplete_expired") {
        await svc.from("sponsors").update({ status: "lapsed", updated_at: now() }).eq("stripe_subscription_id", sub.id).throwOnError();
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      await svc.from("entry_entitlements").update({ status: "canceled", canceled_at: now(), updated_at: now() }).eq("stripe_subscription_id", sub.id).throwOnError();
      await svc.from("sponsors").update({ status: "lapsed", updated_at: now() }).eq("stripe_subscription_id", sub.id).throwOnError();
    } else if (event.type === "invoice.payment_succeeded") {
      // Recurring monthly renewal — keep the entitlement active.
      const inv = event.data.object;
      if (inv.subscription) {
        await svc.from("entry_entitlements").update({ status: "active", updated_at: now() }).eq("stripe_subscription_id", inv.subscription).neq("status", "canceled").throwOnError();
        // Monthly entry pass: each paid invoice adds a rolling credit (idempotent by
        // invoice id; a no-op for sponsor subscriptions, which aren't entitlements).
        const { data: refillCfg } = await svc.from("app_settings").select("value").eq("key", "monthly_credit_refill").maybeSingle();
        const refill = refillCfg ? Number((refillCfg as any).value) : 1;
        await svc.rpc("add_subscription_credits", { p_subscription_id: String(inv.subscription), p_n: refill, p_invoice_id: inv.id ? String(inv.id) : null }).throwOnError();
        // recover a previously-lapsed sponsor (staff-approved ones return to active)
        await svc.from("sponsors").update({ status: "active", updated_at: now() }).eq("stripe_subscription_id", inv.subscription).eq("status", "lapsed").throwOnError();
      }
    } else if (event.type === "invoice.payment_failed") {
      const inv = event.data.object;
      if (inv.subscription) {
        await svc.from("entry_entitlements").update({ status: "past_due", updated_at: now() }).eq("stripe_subscription_id", inv.subscription).throwOnError();
        await svc.from("sponsors").update({ status: "lapsed", updated_at: now() }).eq("stripe_subscription_id", inv.subscription).throwOnError();
      }
    } else if (event.type === "charge.refunded") {
      // Only a FULL refund revokes access. A partial refund (e.g. a small goodwill
      // credit on a $350 season pass) must NOT cancel the pass or un-pay claimed
      // entries. charge.refunded fires for partials too, so check the amounts.
      const ch = event.data.object;
      const fullyRefunded = ch.refunded === true ||
        (typeof ch.amount_refunded === "number" && typeof ch.amount === "number" && ch.amount_refunded >= ch.amount);
      if (fullyRefunded) {
        if (ch.payment_intent) await revokeByPaymentIntent(String(ch.payment_intent));
        // a sponsor whose charge is fully refunded drops out of rotation
        if (ch.customer) await svc.from("sponsors").update({ status: "lapsed", updated_at: now() }).eq("stripe_customer_id", ch.customer).throwOnError();
      }
    } else if (event.type === "charge.dispute.created") {
      // Chargeback opened — pull access immediately (don't wait for the outcome).
      const d = event.data.object;
      let pi: string | null = d.payment_intent ? String(d.payment_intent) : null;
      if (!pi && d.charge) { try { const c: any = await stripe.charges.retrieve(String(d.charge)); pi = c.payment_intent ? String(c.payment_intent) : null; } catch (_) { /* ignore */ } }
      if (pi) await revokeByPaymentIntent(pi);
    }
  } catch (e: any) {
    // FAIL CLOSED: a real DB/RPC failure (not just "0 rows matched" — that's a
    // success) returns 5xx so Stripe RETRIES with backoff (~3 days). Otherwise a
    // transient write failure would silently leave a paid entry unactivated, or
    // a refund without access revoked. Idempotent handlers make retries safe.
    console.error("webhook handler error:", e?.message || e);
    return new Response(JSON.stringify({ error: "handler_failed", message: e?.message || "error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
