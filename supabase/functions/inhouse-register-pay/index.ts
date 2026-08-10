// =====================================================================
// EDGE FUNCTION: inhouse-register-pay  (public self-registration + pay)
// A parent opens the tournament's public link, enters their athlete, and pays.
// We create the entrant (unpaid) and a Stripe Checkout Session as a DIRECT
// CHARGE on the school's connected account, taking application_fee_amount as
// the platform cut. inhouse-webhook flips the entrant to 'paid' on completion.
//
// AUTH: Verify JWT = OFF (public — payer has no NMAO account).
// Requires env: STRIPE_SECRET_KEY, SITE_URL (e.g. https://tournament.nmao.us).
// POST { token, athlete_name, event, division?, payer_email }
//   -> { ok, url }   (Stripe-hosted checkout URL to redirect to)
// Deploy (editor-safe, no _shared): name = inhouse-register-pay, Verify JWT OFF.
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
    const token = String(body.token || "").trim();
    const athlete = String(body.athlete_name || "").trim();
    const event = String(body.event || "").trim() || null;
    const division = String(body.division || "").trim() || null;
    const videoUrl = String(body.video_url || "").trim() || null;
    const payerEmail = String(body.payer_email || "").trim() || null;
    if (!token || !athlete) return json({ ok: false, error: "Athlete name is required." }, 400);

    const { data: t } = await svc.from("in_house_tournaments")
      .select("id, name, entry_fee_cents, platform_fee_bps, registration_open, state, visibility, school_id, public_token")
      .eq("public_token", token).maybeSingle();
    if (!t) return json({ ok: false, error: "Tournament not found." }, 404);
    if ((t as any).visibility !== "public") return json({ ok: false, error: "This tournament isn't open to public registration." }, 403);
    if (!(t as any).registration_open || (t as any).state === "complete") return json({ ok: false, error: "Registration is closed for this tournament." }, 409);
    const fee = Number((t as any).entry_fee_cents || 0);
    if (fee <= 0) return json({ ok: false, error: "This tournament has no entry fee set." }, 409);

    const { data: school } = await svc.from("schools").select("stripe_connect_account_id, name").eq("id", (t as any).school_id).maybeSingle();
    const acct = school ? (school as any).stripe_connect_account_id as string | null : null;
    if (!acct) return json({ ok: false, error: "This school hasn't finished its payment setup yet. Please check back soon." }, 409);
    const acctInfo = await stripe.accounts.retrieve(acct);
    if (!(acctInfo as any).charges_enabled) return json({ ok: false, error: "This school hasn't finished its payment setup yet. Please check back soon." }, 409);

    // Create the entrant (unpaid) first so we can tie the checkout to its id.
    const { data: ent, error: ierr } = await svc.from("ih_entrants").insert({
      tournament_id: (t as any).id, display_name: athlete, event, division, video_url: videoUrl,
      payer_email: payerEmail, self_registered: true, payment_status: "unpaid",
    }).select("id").single();
    if (ierr) { console.error("entrant insert:", ierr); return json({ ok: false, error: "Could not register." }, 500); }
    const entrantId = (ent as any).id;

    const appFee = Math.round((fee * Number((t as any).platform_fee_bps || 0)) / 10000);
    const meta = { kind: "inhouse", entrant_id: entrantId, tournament_id: (t as any).id };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: payerEmail || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: fee,
          product_data: { name: `${(t as any).name} — Entry`, description: athlete + (division ? ` · ${division}` : "") },
        },
      }],
      payment_intent_data: { application_fee_amount: appFee, metadata: meta },
      metadata: meta,
      success_url: `${SITE}/inhouse/${(t as any).public_token}?paid=1`,
      cancel_url: `${SITE}/inhouse/${(t as any).public_token}?canceled=1`,
    }, { stripeAccount: acct });

    await svc.from("ih_entrants").update({ checkout_session_id: session.id }).eq("id", entrantId);
    return json({ ok: true, url: session.url });
  } catch (e: any) {
    console.error("inhouse-register-pay error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
