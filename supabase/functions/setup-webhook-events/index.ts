// =====================================================================
// EDGE FUNCTION: setup-webhook-events  (admin, one-time / idempotent)
// Adds the entitlement-model events to the existing Stripe webhook endpoint
// (the one pointing at /stripe-webhook), so hosted Checkout + subscription
// lifecycle activate entitlements. Safe to re-run. Secret-gated.
// Deploy: verify_jwt OFF. POST { secret } -> { ok, endpoint, enabled_events }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@16";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const WANT = [
  "payment_intent.succeeded",
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const secret = Deno.env.get("SETUP_PRICING_SECRET");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret || !stripeKey) return json({ ok: false, error: "Not configured." }, 500);
  const body = await req.json().catch(() => ({}));
  if (String(body.secret || "") !== secret) return json({ ok: false, error: "unauthorized" }, 401);

  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
  const eps = await stripe.webhookEndpoints.list({ limit: 100 });
  const target = eps.data.find((e: any) => (e.url || "").includes("/stripe-webhook"));
  if (!target) return json({ ok: false, error: "No /stripe-webhook endpoint found in Stripe.", urls: eps.data.map((e: any) => e.url) }, 404);

  const current: string[] = (target as any).enabled_events || [];
  if (current.includes("*")) return json({ ok: true, endpoint: target.url, enabled_events: ["*"], note: "already receives all events" });
  const merged = Array.from(new Set([...current, ...WANT]));
  const updated = await stripe.webhookEndpoints.update(target.id, { enabled_events: merged as any });
  return json({ ok: true, endpoint: target.url, added: WANT.filter((e) => !current.includes(e)), enabled_events: updated.enabled_events });
});
