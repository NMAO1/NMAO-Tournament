// =====================================================================
// EDGE FUNCTION: setup-pricing  (admin, one-time / idempotent)
// Creates a Stripe Product + Price for each pricing_tiers row that doesn't
// have one yet, and writes back stripe_product_id / stripe_price_id. Safe to
// re-run — existing tiers are skipped. Creates CATALOG objects only (no charge).
//
// Gated by a shared secret (SETUP_PRICING_SECRET) since it writes to Stripe.
// Deploy: verify_jwt OFF. POST { secret } -> { ok, created:[…], skipped:[…] }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const LANE_NAME: Record<string, string> = { alacarte: "À la carte", monthly: "Monthly", full: "Season Pass" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const secret = Deno.env.get("SETUP_PRICING_SECRET");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret || !stripeKey) return json({ ok: false, error: "Not configured." }, 500);

  const body = await req.json().catch(() => ({}));
  if (String(body.secret || "") !== secret) return json({ ok: false, error: "unauthorized" }, 401);

  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const live = stripeKey.startsWith("sk_live_");

  const { data: tiers } = await svc.from("pricing_tiers").select("*").eq("active", true).order("lane").order("event_slots");
  const created: any[] = []; const skipped: any[] = [];
  for (const t of (tiers ?? []) as any[]) {
    if (t.stripe_price_id) { skipped.push({ lane: t.lane, event_slots: t.event_slots, price_id: t.stripe_price_id }); continue; }
    const evLabel = `${t.event_slots} event${t.event_slots > 1 ? "s" : ""}`;
    const product = await stripe.products.create({
      name: `NMAO Tournament — ${LANE_NAME[t.lane]} (${evLabel})`,
      metadata: { lane: t.lane, event_slots: String(t.event_slots) },
    });
    const priceParams: any = { product: product.id, unit_amount: t.unit_amount_cents, currency: "usd", metadata: { lane: t.lane, event_slots: String(t.event_slots) } };
    if (t.bill_interval === "month") priceParams.recurring = { interval: "month" };
    const price = await stripe.prices.create(priceParams);
    await svc.from("pricing_tiers").update({ stripe_product_id: product.id, stripe_price_id: price.id, updated_at: new Date().toISOString() }).eq("id", t.id);
    created.push({ lane: t.lane, event_slots: t.event_slots, amount: t.unit_amount_cents / 100, recurring: t.bill_interval === "month", price_id: price.id });
  }
  return json({ ok: true, mode: live ? "LIVE" : "test", created, skipped });
});
