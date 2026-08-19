// =====================================================================
// EDGE FUNCTION: sponsor-checkout  (STAFF — Verify JWT = ON, staff-gated)
// Turns a sponsor's cart — à-la-carte offerings and/or a bundle tier — into a
// Stripe subscription Checkout link that staff send to the sponsor. On payment
// the webhook grants exactly the purchased offerings (metadata.offerings) or the
// tier's bundle (metadata.tier_id). Recurring monthly items only (one-off items
// like a single prize are handled outside the cart).
// POST { sponsor_id, offering_codes?: string[], tier_id?: string, origin? }
//   -> { ok, url }
// Requires: STRIPE_SECRET_KEY, SITE_URL (fallback origin).
// =====================================================================
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ ok: false, error: "Billing not configured." }, 500);

  // staff gate
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  if (!u?.user?.id) return json({ ok: false, error: "Invalid session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", u.user.id).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const b = await req.json().catch(() => ({}));
    if (!b.sponsor_id) return json({ ok: false, error: "sponsor_id required" }, 400);
    const { data: sponsor } = await svc.from("sponsors").select("id, contact_email, company_name").eq("id", b.sponsor_id).maybeSingle();
    if (!sponsor) return json({ ok: false, error: "Sponsor not found." }, 404);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line_items: any[] = [];
    const codes: string[] = Array.isArray(b.offering_codes) ? b.offering_codes.filter((c: unknown) => typeof c === "string") : [];

    if (b.tier_id) {
      const { data: tier } = await svc.from("sponsor_tiers").select("name, stripe_price_id, monthly_price_cents").eq("id", b.tier_id).maybeSingle();
      if (tier && (tier.stripe_price_id || Number(tier.monthly_price_cents) > 0)) {
        line_items.push(tier.stripe_price_id
          ? { price: tier.stripe_price_id, quantity: 1 }
          : { quantity: 1, price_data: { currency: "usd", unit_amount: Number(tier.monthly_price_cents), recurring: { interval: "month" }, product_data: { name: `NMAO ${tier.name} Sponsorship` } } });
      }
    }
    if (codes.length) {
      const { data: offs } = await svc.from("sponsor_offerings").select("code, name, default_price_cents, billing").in("code", codes);
      for (const o of (offs ?? [])) {
        if (o.billing !== "monthly" || !(Number(o.default_price_cents) > 0)) continue; // recurring, priced only
        line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: Number(o.default_price_cents), recurring: { interval: "month" }, product_data: { name: `NMAO — ${o.name}` } } });
      }
    }
    if (!line_items.length) return json({ ok: false, error: "Cart is empty (pick a priced monthly item or bundle)." }, 400);

    const origin = (typeof b.origin === "string" && /^https?:\/\//.test(b.origin)) ? b.origin.replace(/\/$/, "") : (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    const meta: Record<string, string> = { kind: "sponsor", sponsor_id: String(b.sponsor_id) };
    if (b.tier_id) meta.tier_id = String(b.tier_id);
    if (codes.length) meta.offerings = codes.join(",");

    const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items,
      customer_email: sponsor.contact_email || undefined,
      subscription_data: { metadata: meta },
      metadata: meta,
      success_url: `${origin}/sponsor/return?status=paid`,
      cancel_url: `${origin}/sponsor?canceled=1`,
    });
    return json({ ok: true, url: session.url });
  } catch (e) {
    console.error("sponsor-checkout error:", (e as Error)?.message || e);
    return json({ ok: false, error: (e as Error)?.message || "server_error" }, 500);
  }
});
