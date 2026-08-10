// =====================================================================
// EDGE FUNCTION: register-entry  (School Portal — pre-register / flow #2)
// A school owner pre-registers one of their athletes into the open round. This
// creates an UNPAID entry (no payment here — schools never pay). The entry lands
// in the guardian/competitor's app as "awaiting payment"; they pay via
// create-entry-payment, which activates it.
//
// AUTH: Verify JWT = ON. Caller must OWN the athlete's school.
// POST { competitor_id, event } -> { ok, entry_id, awaiting_payment: true }
// Deploy (editor-safe, no _shared): name = register-entry, Verify JWT ON.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
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

    // Caller must own the athlete's school.
    const { data: comp } = await svc.from("competitors").select("school_id, dob, declared_rank").eq("id", competitorId).maybeSingle();
    if (!comp) return json({ ok: false, error: "Athlete not found." }, 404);
    const { data: owned } = await svc.from("schools").select("id").eq("auth_user_id", uid);
    const ownedIds = new Set(((owned ?? []) as any[]).map((r) => r.id));
    if (!ownedIds.has((comp as any).school_id)) return json({ ok: false, error: "Not your athlete." }, 403);

    const { data: et } = await svc.from("event_types").select("code").eq("code", event).maybeSingle();
    if (!et) return json({ ok: false, error: "Unknown event." }, 400);

    const { data: open } = await svc.from("rounds").select("id, closes_at").in("state", ACCEPTING).order("opens_at", { ascending: false }).limit(1).maybeSingle();
    if (!open) return json({ ok: false, error: "No round is open for entries right now." }, 409);
    const roundId = (open as any).id;

    const rankRaw = (comp as any).declared_rank as string | null;
    if (!rankRaw) return json({ ok: false, error: "Set this athlete's rank on their profile first." }, 409);
    const rank = SCHEME_TIERS.includes(rankRaw) ? rankRaw : rankRaw === "black_belt" ? "advanced" : rankRaw;
    const age = ageOn((comp as any).dob, new Date());
    const { data: brackets } = await svc.from("age_brackets").select("code, min_age, max_age");
    const bracket = (brackets ?? []).find((b: any) => age >= b.min_age && (b.max_age == null || age <= b.max_age));
    if (!bracket) return json({ ok: false, error: `No age bracket for age ${age}.` }, 409);
    const { data: sr } = await svc.from("skill_ratings").select("rating").eq("competitor_id", competitorId).maybeSingle();
    const ratingAtEntry = sr ? Number((sr as any).rating) : 50;

    // 48h to pay, or round close — whichever is sooner.
    const in48 = new Date(Date.now() + 48 * 3600 * 1000);
    const closes = (open as any).closes_at ? new Date((open as any).closes_at) : null;
    const expires = closes && closes < in48 ? closes : in48;

    const { data: entry, error: eerr } = await svc.from("entries").upsert({
      round_id: roundId, competitor_id: competitorId, event,
      age_bracket: (bracket as any).code, declared_rank: rank, rating_at_entry: ratingAtEntry,
      status: "submitted", pay_expires_at: expires.toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "round_id,competitor_id,event" }).select("id, payment_status").single();
    if (eerr) { console.error("register-entry upsert:", eerr); return json({ ok: false, error: "Could not register." }, 500); }

    return json({ ok: true, entry_id: (entry as any).id, awaiting_payment: (entry as any).payment_status !== "paid" }, 200);
  } catch (e: any) {
    console.error("register-entry error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
