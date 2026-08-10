// =====================================================================
// EDGE FUNCTION: create-entry-checkout  (Championship entry — BROWSER pay)
// Browser-based replacement for create-entry-payment's native PaymentSheet.
// Registers an entry (unpaid) for the open round and returns a Stripe-hosted
// Checkout URL. The competitor app opens this in the device browser — keeping
// the purchase OFF Apple's in-app-purchase rails (no 30% cut). This is a
// PLATFORM charge (NMAO's own revenue, not a school's connected account).
// The existing stripe-webhook flips the entry to 'paid' on payment_intent
// .succeeded (we stamp entry_id into payment_intent_data.metadata).
//
// AUTH: Verify JWT = ON. Gated to the competitor / guardian (never the school).
// Requires env: STRIPE_SECRET_KEY, SITE_URL.
// POST { competitor_id, event } -> { ok, url, entry_id }
// Deploy (editor-safe, no _shared): name = create-entry-checkout, Verify JWT ON.
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
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ ok: false, error: "Stripe not configured." }, 500);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { httpClient: Stripe.createFetchHttpClient() });

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
    const event = String(body.event || "").trim();
    if (!competitorId || !event) return json({ ok: false, error: "competitor_id and event are required." }, 400);

    // Caller must be the competitor or their guardian.
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const allowed = new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]);
    if (!allowed.has(competitorId)) return json({ ok: false, error: "Not your competitor profile." }, 403);

    const { data: et } = await svc.from("event_types").select("code").eq("code", event).maybeSingle();
    if (!et) return json({ ok: false, error: "Unknown event." }, 400);

    const { data: open } = await svc.from("rounds").select("id, state").in("state", ACCEPTING).order("opens_at", { ascending: false }).limit(1).maybeSingle();
    if (!open) return json({ ok: false, error: "No round is open for entries right now." }, 409);
    const roundId = (open as any).id;

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

    // Upsert the (unpaid) entry.
    const { data: entry, error: eerr } = await svc.from("entries").upsert({
      round_id: roundId, competitor_id: competitorId, event,
      age_bracket: (bracket as any).code, declared_rank: rank, rating_at_entry: ratingAtEntry,
      status: "submitted", updated_at: new Date().toISOString(),
    }, { onConflict: "round_id,competitor_id,event" }).select("id, payment_status").single();
    if (eerr) { console.error("entry upsert:", eerr); return json({ ok: false, error: "Could not register entry." }, 500); }
    if ((entry as any).payment_status === "paid") return json({ ok: false, error: "This entry is already paid." }, 409);
    const entryId = (entry as any).id;

    // Entry fee from settings.
    const { data: fee } = await svc.from("app_settings").select("value").eq("key", "entry_fee_cents").maybeSingle();
    const amount = fee ? Number((fee as any).value) : 4500;
    const { data: cur } = await svc.from("app_settings").select("value").eq("key", "currency").maybeSingle();
    const currency = (cur ? String((cur as any).value).replace(/"/g, "") : "usd") || "usd";

    const meta = { entry_id: entryId, competitor_id: competitorId, round_id: roundId };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: { currency, unit_amount: amount, product_data: { name: "NMAO Championship — Entry", description: event } },
      }],
      payment_intent_data: { metadata: meta }, // existing stripe-webhook keys off entry_id here
      metadata: meta,
      success_url: `${SITE}/pay/return?status=paid`,
      cancel_url: `${SITE}/pay/return?status=canceled`,
    });

    return json({ ok: true, url: session.url, entry_id: entryId });
  } catch (e: any) {
    console.error("create-entry-checkout error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
