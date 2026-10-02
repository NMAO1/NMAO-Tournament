// =====================================================================
// EDGE FUNCTION: list-my-inhouse-tournaments  (Competitor app — self sign-up)
// Returns the OPEN in-house tournaments at the signed-in competitor's school
// that they haven't entered yet, so the app can offer in-app registration.
// Only CONFIRMED school members see tournaments: a competitor's school_id is
// set only by owner approval (pending competitors keep school_id NULL), so
// filtering by competitors.school_id is the membership gate.
//
// AUTH: Verify JWT = ON. Gated to the caller's competitor set.
// POST { competitor_id } -> { ok, school_id, school:{ id, name, join_code },
//        tournaments: [{ id, name, event_date, entry_fee_cents, format,
//        scoring_mode, prize, division_ages, division_ranks, upload_deadline, state }] }
// Deploy (editor-safe, no _shared): name = list-my-inhouse-tournaments, Verify JWT ON.
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
  if (!competitorId) return json({ ok: false, error: "competitor_id required." }, 400);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    // ---- Gate: competitor must be in the caller's set (own or guardian ward). ----
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const ids = new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]);
    if (!ids.has(competitorId)) return json({ ok: false, error: "Not your competitor." }, 403);

    // ---- Resolve the competitor's confirmed school. ----
    const { data: comp } = await svc.from("competitors").select("id, school_id").eq("id", competitorId).maybeSingle();
    const schoolId = (comp as any)?.school_id ?? null;
    if (!schoolId) return json({ ok: true, school_id: null, school: null, tournaments: [] });

    // School identity — also powers the in-app "invite a friend" code (no extra round-trip).
    const { data: school } = await svc.from("schools").select("id, name, join_code").eq("id", schoolId).maybeSingle();
    const schoolOut = school ? { id: (school as any).id, name: (school as any).name, join_code: (school as any).join_code ?? null } : null;

    // ---- Open tournaments at that school (created + accepting registration). ----
    const { data: tours } = await svc.from("in_house_tournaments")
      .select("id, name, event_date, entry_fee_cents, format, scoring_mode, prize, division_ages, division_ranks, upload_deadline, state, registration_open")
      .eq("school_id", schoolId)
      .eq("registration_open", true);
    const live = (s: string) => s !== "complete" && s !== "draft";
    const open = ((tours ?? []) as any[]).filter((t) => live(t.state));
    if (open.length === 0) return json({ ok: true, school_id: schoolId, school: schoolOut, tournaments: [] });

    // ---- Drop ones this competitor has already entered. ----
    const tids = open.map((t) => t.id);
    const { data: mine } = await svc.from("ih_entrants")
      .select("tournament_id").eq("competitor_id", competitorId).in("tournament_id", tids);
    const entered = new Set(((mine ?? []) as any[]).map((e) => e.tournament_id));

    const tournaments = open
      .filter((t) => !entered.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        event_date: t.event_date,
        entry_fee_cents: Number(t.entry_fee_cents || 0),
        format: t.format,
        scoring_mode: t.scoring_mode ?? null,
        prize: t.prize ?? null,
        division_ages: t.division_ages ?? [],
        division_ranks: t.division_ranks ?? [],
        upload_deadline: t.upload_deadline ?? null,
        state: t.state,
      }));

    return json({ ok: true, school_id: schoolId, school: schoolOut, tournaments });
  } catch (e: any) {
    console.error("list-my-inhouse-tournaments error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
