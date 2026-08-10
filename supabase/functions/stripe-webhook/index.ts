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

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const entryId = pi.metadata?.entry_id;
      if (entryId) {
        const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
        await svc.from("entries").update({ payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", entryId);
      }
    }
  } catch (e: any) {
    console.error("webhook handler error:", e?.message || e);
    // still 200 so Stripe doesn't retry forever on a data issue
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
