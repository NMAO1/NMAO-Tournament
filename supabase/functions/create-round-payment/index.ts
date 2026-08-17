// =====================================================================
// EDGE FUNCTION: create-round-payment  (Competitor app — à la carte entry)
// The new slot-based entry payment: pay for 1 or 2 event SLOTS in the open
// round. Prices come from tournament_pricing (lane='alacarte'). Creates the
// (unpaid) entries for the chosen events + a Stripe PaymentIntent for the
// slot price; the webhook (stripe-webhook, kind='alacarte') flips the entries
// to paid and writes a paid round_slots row.
// GATED TO THE COMPETITOR / GUARDIAN — schools never pay.
//
// AUTH: Verify JWT = ON. Requires STRIPE_SECRET_KEY.
// POST { competitor_id, events: string[1..2] }
//   -> { ok, clientSecret, amount, event_slots, entry_ids, round_id }
// Deploy: name = create-round-payment, Verify JWT ON.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ACCEPTING = ["open", "collecting"];
const SCHEME_TIERS = ["beginner", "intermediate", "advanced"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ ok: false, error: "Stripe not configured." }, 500);
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const competitorId = String(body.competitor_id || "").trim();
    const rawEvents: string[] = Array.isArray(body.events) ? body.events.map((e: any) => String(e).trim()).filter(Boolean) : [];
    const events = [...new Set(rawEvents)]; // distinct
    if (!competitorId) return json({ ok: false, error: "competitor_id is required." }, 400);
    if (events.length < 1 || events.length > 2) return json({ ok: false, error: "Choose 1 or 2 events." }, 400);

    // Caller must be the competitor or their guardian.
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const allowed = new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]);
    if (!allowed.has(competitorId)) return json({ ok: false, error: "Not your competitor profile." }, 403);

    // Events must all be real.
    const { data: ets } = await svc.from("event_types").select("code").in("code", events);
    if ((ets ?? []).length !== events.length) return json({ ok: false, error: "Unknown event in selection." }, 400);

    // Open round.
    const { data: open } = await svc.from("rounds").select("id, state, closes_at").in("state", ACCEPTING).order("opens_at", { ascending: false }).limit(1).maybeSingle();
    if (!open) return json({ ok: false, error: "No round is open for entries right now." }, 409);
    const roundId = (open as any).id;

    // Already have a paid slot this round? Don't double-charge.
    const { data: existingSlot } = await svc.from("round_slots").select("id, status, slots").eq("competitor_id", competitorId).eq("round_id", roundId).maybeSingle();
    if (existingSlot && (existingSlot as any).status === "paid") {
      return json({ ok: false, error: "You've already paid to enter this round." }, 409);
    }

    // Rank + age bracket + rating (same derivation as register/entry).
    const { data: comp } = await svc.from("competitors").select("dob, declared_rank").eq("id", competitorId).single();
    if (!comp) return json({ ok: false, error: "Competitor not found." }, 404);
    const rankRaw = (comp as any).declared_rank as string | null;
    if (!rankRaw) return json({ ok: false, error: "Set your rank on your profile first." }, 409);
    const rank = SCHEME_TIERS.includes(rankRaw) ? rankRaw : rankRaw === "black_belt" ? "advanced" : rankRaw;
    const age = ageOn((comp as any).dob, new Date());
    const { data: brackets } = await svc.from("age_brackets").select("code, min_age, max_age");
    const bracket = (brackets ?? []).find((b: any) => age >= b.min_age && (b.max_age == null || age <= b.max_age));
    if (!bracket) return json({ ok: false, error: `No age bracket for age ${age}.` }, 409);
    const { data: sr } = await svc.from("skill_ratings").select("rating").eq("competitor_id", competitorId).maybeSingle();
    const ratingAtEntry = sr ? Number((sr as any).rating) : 50;

    // Price from config (à la carte, by slot count).
    const { data: price } = await svc.from("tournament_pricing").select("amount_cents").eq("lane", "alacarte").eq("event_slots", events.length).eq("active", true).maybeSingle();
    if (!price) return json({ ok: false, error: "Pricing not configured." }, 500);
    const amount = Number((price as any).amount_cents);
    const { data: cur } = await svc.from("app_settings").select("value").eq("key", "currency").maybeSingle();
    const currency = (cur ? String((cur as any).value).replace(/"/g, "") : "usd") || "usd";

    // Create/refresh the (unpaid) entries for each chosen event.
    const in48 = new Date(Date.now() + 48 * 3600 * 1000);
    const closes = (open as any).closes_at ? new Date((open as any).closes_at) : null;
    const expires = (closes && closes < in48 ? closes : in48).toISOString();
    const entryIds: string[] = [];
    for (const event of events) {
      const { data: entry, error: eerr } = await svc.from("entries").upsert({
        round_id: roundId, competitor_id: competitorId, event,
        age_bracket: (bracket as any).code, declared_rank: rank, rating_at_entry: ratingAtEntry,
        status: "submitted", pay_expires_at: expires, updated_at: new Date().toISOString(),
      }, { onConflict: "round_id,competitor_id,event" }).select("id, payment_status").single();
      if (eerr || !entry) { console.error("entry upsert:", eerr); return json({ ok: false, error: "Could not register entries." }, 500); }
      if ((entry as any).payment_status === "paid") return json({ ok: false, error: "One of these entries is already paid." }, 409);
      entryIds.push((entry as any).id);
    }

    // One PaymentIntent for the slot price; webhook grants the slot + flips entries.
    const pi = await stripe.paymentIntents.create({
      amount, currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        kind: "alacarte", competitor_id: competitorId, round_id: roundId,
        event_slots: String(events.length), entry_ids: entryIds.join(","),
      },
    });

    // Pending slot grant — the webhook flips it to 'paid'.
    await svc.from("round_slots").upsert({
      competitor_id: competitorId, round_id: roundId, slots: events.length,
      source: "alacarte", status: "pending", stripe_payment_intent_id: pi.id,
      amount_cents: amount, updated_at: new Date().toISOString(),
    }, { onConflict: "competitor_id,round_id" });

    return json({ ok: true, clientSecret: pi.client_secret, amount, event_slots: events.length, entry_ids: entryIds, round_id: roundId });
  } catch (e: any) {
    console.error("create-round-payment error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
