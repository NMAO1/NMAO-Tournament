// =====================================================================
// EDGE FUNCTION: inhouse-self-enter  (Competitor app — self sign-up)
// A confirmed school member enters themselves (or a guardian enters a ward)
// into one of their school's OPEN in-house tournaments from inside the app.
// Mirrors the web self-registration (inhouse-register-pay) field convention:
// event = tournament.name, division = [age_group, skill_division] joined.
// Creates the ih_entrant as unpaid (paid events) or paid (free events); the
// app then surfaces payment via my-inhouse-dues -> inhouse-checkout.
//
// AUTH: Verify JWT = ON. Gated to the caller's competitor set + school match.
// POST { competitor_id, tournament_id, age_group?, skill_division? }
//   -> { ok, entrant_id, needs_payment, entry_fee_cents }
// Deploy (editor-safe, no _shared): name = inhouse-self-enter, Verify JWT ON.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

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

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const competitorId = String(body.competitor_id || "").trim();
  const tournamentId = String(body.tournament_id || "").trim();
  const ageGroup = String(body.age_group || "").trim() || null;
  const skillDivision = String(body.skill_division || "").trim() || null;
  if (!competitorId || !tournamentId) return json({ ok: false, error: "competitor_id and tournament_id required." }, 400);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    // ---- Gate: competitor must be in the caller's set (own or guardian ward). ----
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const ids = new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]);
    if (!ids.has(competitorId)) return json({ ok: false, error: "Not your competitor." }, 403);

    const { data: comp } = await svc.from("competitors").select("id, school_id, first_name, last_name").eq("id", competitorId).maybeSingle();
    if (!comp) return json({ ok: false, error: "Competitor not found." }, 404);
    const schoolId = (comp as any).school_id ?? null;
    if (!schoolId) return json({ ok: false, error: "Join your school first." }, 409);

    // ---- Load + validate the tournament. ----
    const { data: t } = await svc.from("in_house_tournaments")
      .select("id, name, school_id, state, registration_open, entry_fee_cents, division_ages, division_ranks")
      .eq("id", tournamentId).maybeSingle();
    if (!t) return json({ ok: false, error: "Tournament not found." }, 404);
    if ((t as any).school_id !== schoolId) return json({ ok: false, error: "Not your school's tournament." }, 403);
    const state = (t as any).state;
    if (!(t as any).registration_open || state === "complete" || state === "draft")
      return json({ ok: false, error: "Registration is closed for this tournament." }, 409);

    // ---- Division validation mirrors the web flow. ----
    const ages: string[] = (t as any).division_ages ?? [];
    const ranks: string[] = (t as any).division_ranks ?? [];
    if (ages.length > 0 && !ageGroup) return json({ ok: false, error: "Please select an age group." }, 400);
    if (ranks.length > 0 && !skillDivision) return json({ ok: false, error: "Please select a division." }, 400);
    if (ageGroup && ages.length > 0 && !ages.includes(ageGroup)) return json({ ok: false, error: "Invalid age group." }, 400);
    if (skillDivision && ranks.length > 0 && !ranks.includes(skillDivision)) return json({ ok: false, error: "Invalid division." }, 400);

    // ---- Already entered? (idempotent) ----
    const { data: already } = await svc.from("ih_entrants")
      .select("id, payment_status")
      .eq("tournament_id", tournamentId).eq("competitor_id", competitorId).maybeSingle();
    const fee = Number((t as any).entry_fee_cents || 0);
    if (already) {
      const paid = (already as any).payment_status === "paid" || (already as any).payment_status === "waived";
      return json({ ok: true, entrant_id: (already as any).id, needs_payment: fee > 0 && !paid, entry_fee_cents: fee, already: true });
    }

    const displayName = `${(comp as any).first_name ?? ""} ${(comp as any).last_name ?? ""}`.trim() || "Competitor";
    const division = [ageGroup, skillDivision].filter(Boolean).join(" · ") || null;
    const free = fee <= 0;

    const { data: ent, error: ierr } = await svc.from("ih_entrants").insert({
      tournament_id: tournamentId,
      competitor_id: competitorId,
      display_name: displayName,
      event: (t as any).name,
      division,
      age_group: ageGroup,
      skill_division: skillDivision,
      self_registered: true,
      payment_status: free ? "paid" : "unpaid",
      paid_at: free ? new Date().toISOString() : null,
    }).select("id").single();
    if (ierr) { console.error("self-enter insert:", ierr); return json({ ok: false, error: "Could not register." }, 500); }

    return json({ ok: true, entrant_id: (ent as any).id, needs_payment: !free, entry_fee_cents: fee });
  } catch (e: any) {
    console.error("inhouse-self-enter error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
