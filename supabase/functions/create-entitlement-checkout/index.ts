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
    if (!competitorId) return json({ ok: false, error: "competitor_id is required." }, 400);
    if (!["alacarte", "monthly", "full"].includes(lane)) return json({ ok: false, error: "Invalid lane." }, 400);
    if (![1, 2].includes(eventSlots)) return json({ ok: false, error: "event_slots must be 1 or 2." }, 400);
    if (events.length > eventSlots) return json({ ok: false, error: `Pick at most ${eventSlots} event${eventSlots > 1 ? "s" : ""}.` }, 400);

    // Caller must be the competitor or their guardian.
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const allowed = new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]);
    if (!allowed.has(competitorId)) return json({ ok: false, error: "Not your competitor profile." }, 403);

    // Price for this (lane, slots).
    const { data: tier } = await svc.from("pricing_tiers").select("*").eq("lane", lane).eq("event_slots", eventSlots).eq("active", true).maybeSingle();
    if (!tier || !(tier as any).stripe_price_id) return json({ ok: false, error: "That plan isn't set up yet." }, 400);
    const amount = Number((tier as any).unit_amount_cents);
    const priceId = (tier as any).stripe_price_id;

    // Season + open round context.
    const { data: comp } = await svc.from("competitors").select("dob, declared_rank, season_id").eq("id", competitorId).single();
    if (!comp) return json({ ok: false, error: "Competitor not found." }, 404);
    let seasonId: string | null = (comp as any).season_id ?? null;
    if (!seasonId) {
      const { data: se } = await svc.from("season_enrollments").select("season_id").eq("competitor_id", competitorId).order("enrolled_at", { ascending: false }).limit(1).maybeSingle();
      seasonId = se ? (se as any).season_id : null;
    }
    if (!seasonId) {
      const { data: activeSeason } = await svc.from("seasons").select("id").eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
      seasonId = activeSeason ? (activeSeason as any).id : null;
    }
    const { data: open } = await svc.from("rounds").select("id, seq, state").in("state", ACCEPTING).order("opens_at", { ascending: false }).limit(1).maybeSingle();
    const roundId = open ? (open as any).id : null;
    const roundNo = open ? Number((open as any).seq ?? 1) : null;
    if (lane === "alacarte" && !roundId) return json({ ok: false, error: "No round is open for entries right now." }, 409);

    // Entitlement (incomplete until the webhook confirms payment).
    const { data: ent, error: entErr } = await svc.from("entry_entitlements").insert({
      competitor_id: competitorId, season_id: seasonId, lane, event_slots: eventSlots,
      round_id: lane === "alacarte" ? roundId : null,
      valid_from_round: lane === "alacarte" ? null : roundNo,
      status: "incomplete",
    }).select("id").single();
    if (entErr || !ent) { console.error("entitlement insert:", entErr); return json({ ok: false, error: "Could not start checkout." }, 500); }
    const entitlementId = (ent as any).id;

    // Stage the round's chosen (unpaid) entries now, if a round is open.
    if (events.length && roundId) {
      const rankRaw = (comp as any).declared_rank as string | null;
      const rank = rankRaw ? (SCHEME_TIERS.includes(rankRaw) ? rankRaw : rankRaw === "black_belt" ? "advanced" : rankRaw) : null;
      const age = ageOn((comp as any).dob, new Date());
      const { data: brackets } = await svc.from("age_brackets").select("code, min_age, max_age");
      const bracket = (brackets ?? []).find((b: any) => age >= b.min_age && (b.max_age == null || age <= b.max_age));
      const { data: sr } = await svc.from("skill_ratings").select("rating").eq("competitor_id", competitorId).maybeSingle();
      const ratingAtEntry = sr ? Number((sr as any).rating) : 50;
      const { data: known } = await svc.from("event_types").select("code");
      const valid = new Set((known ?? []).map((e: any) => e.code));
      for (const ev of events.slice(0, eventSlots)) {
        if (!valid.has(ev)) continue;
        await svc.from("entries").upsert({
          round_id: roundId, competitor_id: competitorId, event: ev,
          age_bracket: bracket ? (bracket as any).code : null, declared_rank: rank, rating_at_entry: ratingAtEntry,
          status: "submitted", payment_status: "unpaid", entitlement_id: entitlementId, updated_at: new Date().toISOString(),
        }, { onConflict: "round_id,competitor_id,event" });
      }
    }

    // Hosted Checkout — browser, not in-app. Metadata carries entitlement_id so the
    // webhook can activate it (payment_intent for one-time, subscription for monthly).
    const meta = { entitlement_id: entitlementId, competitor_id: competitorId, lane };
    const common = {
      metadata: meta,
      success_url: `${SITE}/pay/return?status=paid`,
      cancel_url: `${SITE}/pay/return?status=canceled`,
    } as const;
    const session = lane === "monthly"
      ? await stripe.checkout.sessions.create({
          mode: "subscription", line_items: [{ price: priceId, quantity: 1 }],
          subscription_data: { metadata: meta }, customer_email: email, ...common,
        })
      : await stripe.checkout.sessions.create({
          mode: "payment", line_items: [{ price: priceId, quantity: 1 }],
          payment_intent_data: { metadata: meta }, customer_email: email, ...common,
        });

    return json({ ok: true, url: session.url, entitlement_id: entitlementId, amount, lane });
  } catch (e: any) {
    console.error("create-entitlement-checkout error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
