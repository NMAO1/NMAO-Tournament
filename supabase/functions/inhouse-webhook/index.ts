// =====================================================================
// EDGE FUNCTION: inhouse-webhook  (in-house payment confirmation)
// Stripe calls this when an in-house Checkout completes. Because in-house
// charges are DIRECT charges on the school's CONNECTED account, this endpoint
// must be registered with "Listen to events on Connected accounts" ENABLED —
// the event's `account` field is the school's Stripe account. On
// checkout.session.completed we flip the entrant (from metadata) to 'paid'.
//
// This is a SEPARATE endpoint from stripe-webhook (which watches the platform
// account for championship PaymentIntents) so the two never interfere.
//
// AUTH: Verify JWT = OFF. Security = Stripe signature vs INHOUSE_STRIPE_WEBHOOK_SECRET.
// Requires env: STRIPE_SECRET_KEY, INHOUSE_STRIPE_WEBHOOK_SECRET.
// Deploy (editor-safe, no _shared): name = inhouse-webhook, Verify JWT OFF.
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
  const whsec = Deno.env.get("INHOUSE_STRIPE_WEBHOOK_SECRET");
  const sig = req.headers.get("stripe-signature");
  if (!secret || !whsec) return new Response("Stripe not configured", { status: 500 });
  if (!sig) return new Response("Missing signature", { status: 400 });

  const stripe = new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() });
  const raw = await req.text();

  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, whsec, undefined, cryptoProvider);
  } catch (e: any) {
    console.error("inhouse-webhook signature error:", e?.message || e);
    return new Response(`Bad signature: ${e?.message || ""}`, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const s = event.data.object;
      const entrantId = s.metadata?.entrant_id;
      const kind = s.metadata?.kind;
      if (kind === "inhouse" && entrantId && s.payment_status === "paid") {
        const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
        await svc.from("ih_entrants")
          .update({ payment_status: "paid", paid_at: new Date().toISOString(), checkout_session_id: s.id })
          .eq("id", entrantId)
          .throwOnError();
      }
    }
  } catch (e: any) {
    // FAIL CLOSED: return 5xx so Stripe retries a real write failure (~3 days of
    // backoff). "0 rows matched" is a success and won't throw, so a stale/unknown
    // entrant won't retry forever — only genuine DB errors do. Update is idempotent.
    console.error("inhouse-webhook handler error:", e?.message || e);
    return new Response(JSON.stringify({ error: "handler_failed", message: e?.message || "error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
