// =====================================================================
// EDGE FUNCTION: create-entitlement-checkout  (Competitor app — BROWSER pay)
// Buys the right to enter 1–2 events per round via one of three lanes and
// returns a Stripe-HOSTED Checkout URL. The app opens it in the device browser
// — keeping the purchase OFF Apple's in-app-purchase rails (no 30% cut).
//   alacarte → mode=payment, scoped to the open round
//   full     → mode=payment, whole season
//   monthly  → mode=subscription (recurring)
// GATED to the competitor / guardian. The webhook activates the entitlement +
// marks any staged round entries paid. Prices come from pricing_tiers.
//
// AUTH: Verify JWT = ON. Requires STRIPE_SECRET_KEY, SITE_URL.
// POST { competitor_id, lane, event_slots, events?[] } -> { ok, url, entitlement_id, amount, lane }
// Deploy (editor-safe): name = create-entitlement-checkout, Verify JWT ON.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = (Deno.env.get("SITE_URL") || "https://example.com").replace(/\/$/, "");
const ACCEPTING = ["open", "collecting"];
const SCHEME_TIERS = ["beginner", "intermediate", "advanced"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

function ageOn(dob: string, on: Date): number {
  const d = new Date(dob + "T00:00:00Z");
  let a = on.getUTCFullYear() - d.getUTCFullYear();
  const m = on.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ ok: false, error: "Stripe not configured." }, 500);
  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  const email = u?.user?.email || undefined;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const competitorId = String(body.competitor_id || "").trim();
    const lane = String(body.lane || "").trim();
    const eventSlots = Number(body.event_slots || 0);
    const events: string[] = Array.isArray(body.events) ? body.events.map((e: any) => String(e)) : [];
    const topupCredits = Math.floor(Number(body.credits || 0));
    if (!competitorId) return json({ ok: false, error: "competitor_id is required." }, 400);
    if (!["alacarte", "monthly", "full", "topup"].includes(lane)) return json({ ok: false, error: "Invalid lane." }, 400);
    if (lane === "topup") {
      if (!(topupCredits >= 1 && topupCredits <= 50)) return json({ ok: false, error: "credits must be between 1 and 50." }, 400);
    } else {
      if (![1, 2].includes(eventSlots)) return json({ ok: false, error: "event_slots must be 1 or 2." }, 400);
      if (events.length > eventSlots) return json({ ok: false, error: `Pick at most ${eventSlots} event${eventSlots > 1 ? "s" : ""}.` }, 400);
    }

    // Caller must be the competitor or their guardian.
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const allowed = new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]);
    if (!allowed.has(competitorId)) return json({ ok: false, error: "Not your competitor profile." }, 403);

    // How many credits this purchase grants, and the price.
    const { data: passCfg } = await svc.from("app_settings").select("value").eq("key", "season_pass_credits").maybeSingle();
    const passCredits = passCfg ? Number((passCfg as any).value) : 9;
    let amount = 0;
    let priceId: string | null = null;
    let creditsGranted = 0;
    if (lane === "topup") {
      // Buy N credits at the season-pass per-entry rate (full price ÷ season length).
      const { data: fullTier } = await svc.from("pricing_tiers").select("unit_amount_cents").eq("lane", "full").eq("active", true).order("unit_amount_cents", { ascending: true }).limit(1).maybeSingle();
      if (!fullTier) return json({ ok: false, error: "Season pass pricing isn't set up yet." }, 400);
      const perCredit = Math.round(Number((fullTier as any).unit_amount_cents) / Math.max(1, passCredits));
      amount = perCredit * topupCredits;
      creditsGranted = topupCredits;
    } else {
      const { data: tier } = await svc.from("pricing_tiers").select("*").eq("lane", lane).eq("event_slots", eventSlots).eq("active", true).maybeSingle();
      if (!tier || !(tier as any).stripe_price_id) return json({ ok: false, error: "That plan isn't set up yet." }, 400);
      amount = Number((tier as any).unit_amount_cents);
      priceId = (tier as any).stripe_price_id;
      // full = a full season bucket, alacarte = 1 entry, monthly = credits arrive via invoices.
      creditsGranted = lane === "full" ? passCredits : lane === "alacarte" ? 1 : 0;
    }

    // Season + open round context. (Season lives in season_enrollments, not on competitors.)
    const { data: comp } = await svc.from("competitors").select("dob, declared_rank").eq("id", competitorId).single();
    if (!comp) return json({ ok: false, error: "Competitor not found." }, 404);
    let seasonId: string | null = null;
    const { data: se } = await svc.from("season_enrollments").select("season_id").eq("competitor_id", competitorId).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
    seasonId = se ? (se as any).season_id : null;
    if (!seasonId) {
      const { data: activeSeason } = await svc.from("seasons").select("id").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
      seasonId = activeSeason ? (activeSeason as any).id : null;
    }
    const { data: open } = await svc.from("rounds").select("id, seq, state").in("state", ACCEPTING).order("opens_at", { ascending: false }).limit(1).maybeSingle();
    const roundId = open ? (open as any).id : null;
    const roundNo = open ? Number((open as any).seq ?? 1) : null;
    if (lane === "alacarte" && !roundId) return json({ ok: false, error: "No round is open for entries right now." }, 409);

    // Entitlement (incomplete until the webhook confirms payment). credits_total is
    // set now; the webhook only flips status to active — and for monthly, each paid
    // invoice adds a credit (see add_subscription_credits in stripe-webhook).
    const { data: ent, error: entErr } = await svc.from("entry_entitlements").insert({
      competitor_id: competitorId, season_id: seasonId, lane, event_slots: lane === "topup" ? 1 : eventSlots,
      round_id: lane === "alacarte" ? roundId : null,
      valid_from_round: lane === "alacarte" ? null : roundNo,
      credits_total: creditsGranted, credits_used: 0,
      status: "incomplete",
    }).select("id").single();
    if (entErr || !ent) { console.error("entitlement insert:", entErr); return json({ ok: false, error: "Could not start checkout." }, 500); }
    const entitlementId = (ent as any).id;

    // No entry staging: credits are the source of truth. After payment the competitor
    // claims each event for the round via claim_round_entry (spends 1 credit, marks paid).

    // Hosted Checkout — browser, not in-app. Metadata carries entitlement_id so the
    // webhook can activate it (payment_intent for one-time, subscription for monthly).
    const meta = { entitlement_id: entitlementId, competitor_id: competitorId, lane };
    const common = {
      metadata: meta,
      success_url: `${SITE}/pay/return?status=paid`,
      cancel_url: `${SITE}/pay/return?status=canceled`,
    } as const;
    const lineItem: any = lane === "topup"
      ? { quantity: 1, price_data: { currency: "usd", unit_amount: amount, product_data: { name: "NMAO Entry Credits", description: `${creditsGranted} entry credit${creditsGranted === 1 ? "" : "s"}` } } }
      : { price: priceId as string, quantity: 1 };
    const session = lane === "monthly"
      ? await stripe.checkout.sessions.create({
          mode: "subscription", line_items: [{ price: priceId as string, quantity: 1 }],
          subscription_data: { metadata: meta }, customer_email: email, ...common,
        })
      : await stripe.checkout.sessions.create({
          mode: "payment", line_items: [lineItem],
          payment_intent_data: { metadata: meta }, customer_email: email, ...common,
        });

    return json({ ok: true, url: session.url, entitlement_id: entitlementId, amount, lane });
  } catch (e: any) {
    console.error("create-entitlement-checkout error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
