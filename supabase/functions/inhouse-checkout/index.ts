// =====================================================================
// EDGE FUNCTION: inhouse-checkout  (pay link for a school-added entrant)
// The school pre-adds an entrant, then shares a link like
// /inhouse/pay/<entrant_id>. That page calls this to mint a FRESH Stripe
// Checkout Session (direct charge on the school's connected account, platform
// application fee) and redirect — so the shared link never goes stale.
//
// AUTH: Verify JWT = OFF (the parent clicking the link has no NMAO account).
// Only ever creates a payment TO the school for a real unpaid entrant, so it
// leaks nothing. Requires env: STRIPE_SECRET_KEY, SITE_URL.
// POST { entrant_id } -> { ok, url, athlete, tournament, amount }
// Deploy (editor-safe, no _shared): name = inhouse-checkout, Verify JWT OFF.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = (Deno.env.get("SITE_URL") || "https://example.com").replace(/\/$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ ok: false, error: "Payments not configured." }, 500);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { httpClient: Stripe.createFetchHttpClient() });

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => ({}));
    const entrantId = String(body.entrant_id || "").trim();
    if (!entrantId) return json({ ok: false, error: "Missing entrant." }, 400);

    const { data: ent } = await svc.from("ih_entrants")
      .select("id, display_name, division, payment_status, tournament_id").eq("id", entrantId).maybeSingle();
    if (!ent) return json({ ok: false, error: "Entry not found." }, 404);
    if ((ent as any).payment_status === "paid") return json({ ok: false, error: "This entry is already paid." }, 409);

    const { data: t } = await svc.from("in_house_tournaments")
      .select("id, name, entry_fee_cents, platform_fee_bps, state, school_id, public_token").eq("id", (ent as any).tournament_id).maybeSingle();
    if (!t) return json({ ok: false, error: "Tournament not found." }, 404);
    if ((t as any).state === "complete") return json({ ok: false, error: "This tournament is closed." }, 409);
    const fee = Number((t as any).entry_fee_cents || 0);
    if (fee <= 0) return json({ ok: false, error: "This tournament has no entry fee set." }, 409);

    const { data: school } = await svc.from("schools").select("stripe_connect_account_id").eq("id", (t as any).school_id).maybeSingle();
    const acct = school ? (school as any).stripe_connect_account_id as string | null : null;
    if (!acct) return json({ ok: false, error: "This school hasn't finished its payment setup yet." }, 409);
    const acctInfo = await stripe.accounts.retrieve(acct);
    if (!(acctInfo as any).charges_enabled) return json({ ok: false, error: "This school hasn't finished its payment setup yet." }, 409);

    const appFee = Math.round((fee * Number((t as any).platform_fee_bps || 0)) / 10000);
    const athlete = (ent as any).display_name || "Entry";
    const div = (ent as any).division;
    const meta = { kind: "inhouse", entrant_id: entrantId, tournament_id: (t as any).id };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: fee,
          product_data: { name: `${(t as any).name} — Entry`, description: athlete + (div ? ` · ${div}` : "") },
        },
      }],
      payment_intent_data: { application_fee_amount: appFee, metadata: meta },
      metadata: meta,
      success_url: `${SITE}/inhouse/${(t as any).public_token}?paid=1`,
      cancel_url: `${SITE}/inhouse/pay/${entrantId}?canceled=1`,
    }, { stripeAccount: acct });

    await svc.from("ih_entrants").update({ checkout_session_id: session.id }).eq("id", entrantId);
    return json({ ok: true, url: session.url, athlete, tournament: (t as any).name, amount: fee });
  } catch (e: any) {
    console.error("inhouse-checkout error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
