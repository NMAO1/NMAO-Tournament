// =====================================================================
// EDGE FUNCTION: sponsor-signup  (PUBLIC — Verify JWT = OFF)
// A brand signs up to sponsor NMAO. Creates a PENDING sponsor + its ad + products
// (UNAPPROVED — approved_at stays null until staff moderate), then a Stripe
// subscription Checkout for the chosen tier. On payment the webhook links the
// subscription + grants the tier's offerings; staff approval flips status→active.
// Requires: STRIPE_SECRET_KEY, SITE_URL (fallback origin).
// POST { company_name, contact_email, tier_id, accepted_guidelines, ...,
//        ad?:{video_url,tagline,click_url}, products?:[{...}], origin? }
//   -> { ok, url, sponsor_id }
// =====================================================================
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ ok: false, error: "Billing not configured." }, 500);

  try {
    const b = await req.json().catch(() => ({}));
    if (!b.company_name?.trim()) return json({ ok: false, error: "Company name is required." }, 400);
    if (!b.contact_email?.trim()) return json({ ok: false, error: "A contact email is required." }, 400);
    if (!b.tier_id) return json({ ok: false, error: "Choose a plan." }, 400);
    if (!b.accepted_guidelines) return json({ ok: false, error: "Please accept the content guidelines." }, 400);

    const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

    const { data: tier } = await svc.from("sponsor_tiers").select("id, stripe_price_id, name, monthly_price_cents").eq("id", b.tier_id).maybeSingle();
    if (!tier || (!tier.stripe_price_id && !(Number(tier.monthly_price_cents) > 0))) return json({ ok: false, error: "That plan isn't priced yet." }, 400);
    // Inline dynamic price (from the MC dollar amount) unless a fixed Stripe price id is set.
    const lineItem: any = tier.stripe_price_id
      ? { price: tier.stripe_price_id, quantity: 1 }
      : { quantity: 1, price_data: { currency: "usd", unit_amount: Number(tier.monthly_price_cents), recurring: { interval: "month" }, product_data: { name: `NMAO ${tier.name} Sponsorship` } } };

    // pending sponsor
    const { data: sp, error: se } = await svc.from("sponsors").insert({
      company_name: b.company_name, tagline: b.tagline ?? null, contact_name: b.contact_name ?? null,
      contact_email: b.contact_email, contact_phone: b.contact_phone ?? null, website: b.website ?? null,
      logo_url: b.logo_url ?? null, tier_id: b.tier_id, status: "pending", notes: "self-serve signup",
    }).select("id").single();
    if (se) return json({ ok: false, error: se.message }, 500);
    const sponsorId = sp.id as string;

    // ad + products go in UNAPPROVED (approved_at null) — staff moderate before they serve
    if (b.ad?.video_url) {
      await svc.from("duel_sponsors").insert({
        sponsor_id: sponsorId, name: b.company_name, tagline: b.ad.tagline ?? b.tagline ?? null,
        video_url: b.ad.video_url, click_url: b.ad.click_url ?? b.website ?? null,
        weight: 1, min_seconds: 3, active: true, placement: "arena", is_house: false,
      });
    }
    for (const p of (Array.isArray(b.products) ? b.products : []).slice(0, 20)) {
      if (!p?.name || !p?.product_url) continue;
      await svc.from("sponsor_products").insert({
        sponsor_id: sponsorId, name: p.name, description: p.description ?? null, image_url: p.image_url ?? null,
        price_display: p.price_display ?? null, product_url: p.product_url, active: true,
      });
    }

    const origin = (typeof b.origin === "string" && /^https?:\/\//.test(b.origin)) ? b.origin.replace(/\/$/, "") : (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
    const meta = { kind: "sponsor", sponsor_id: sponsorId, tier_id: String(b.tier_id) };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [lineItem],
      customer_email: b.contact_email,
      subscription_data: { metadata: meta },
      metadata: meta,
      success_url: `${origin}/sponsor/return?status=paid`,
      cancel_url: `${origin}/sponsor?canceled=1`,
    });

    return json({ ok: true, url: session.url, sponsor_id: sponsorId });
  } catch (e) {
    console.error("sponsor-signup error:", (e as Error)?.message || e);
    return json({ ok: false, error: (e as Error)?.message || "server_error" }, 500);
  }
});
