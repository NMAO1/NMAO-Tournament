// =====================================================================
// EDGE FUNCTION: join-school-by-code
// A competitor (or their guardian) attaches to a school by entering the
// school's join code. The link is created as membership_status = 'pending';
// the instructor must approve it (school portal) before the competitor can
// compete. Enforcement lives in create-entry-checkout (active-only).
//
// AUTH: Verify JWT = ON. Gated to the caller's own competitor / ward.
// POST { join_code, competitor_id? } -> { ok, school:{id,name}, status }
// Deploy: name = join-school-by-code, Verify JWT ON.
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

const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

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
    const rawCode = String(body.join_code || "").trim();
    let competitorId = String(body.competitor_id || "").trim();
    if (!rawCode) return json({ ok: false, error: "Enter your school's join code." }, 400);

    // Caller must be the competitor or their guardian.
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const ownIds = ((own ?? []) as any[]).map((r) => r.id);
    const wardIds = ((wards ?? []) as any[]).map((r) => r.competitor_id);
    const allowed = new Set<string>([...ownIds, ...wardIds]);
    if (!competitorId) {
      if (ownIds.length === 1) competitorId = ownIds[0];
      else return json({ ok: false, error: "Which competitor is joining? (competitor_id required)" }, 400);
    }
    if (!allowed.has(competitorId)) return json({ ok: false, error: "Not your competitor profile." }, 403);

    // Resolve the school by join code (forgiving: ignore case + punctuation).
    const target = normCode(rawCode);
    const { data: schools } = await svc.from("schools").select("id, name, join_code, status").not("join_code", "is", null);
    const school = ((schools ?? []) as any[]).find((s) => normCode(String(s.join_code)) === target);
    if (!school) return json({ ok: false, error: "That code didn't match a school. Double-check with your instructor." }, 404);
    if (school.status && school.status !== "active") return json({ ok: false, error: "This school isn't active yet." }, 409);

    // Current affiliation state. A confirmed member has school_id set (only the
    // owner-approval RPC sets it); a pending competitor keeps school_id NULL plus
    // a row in school_affiliation_requests. We mirror that model here.
    const { data: comp } = await svc.from("competitors").select("id, school_id").eq("id", competitorId).maybeSingle();
    if (!comp) return json({ ok: false, error: "Competitor not found." }, 404);

    if ((comp as any).school_id === school.id) {
      return json({ ok: true, school: { id: school.id, name: school.name }, status: "active", already: true });
    }
    if ((comp as any).school_id) {
      return json({ ok: false, error: "You're already a member of another school. Ask your instructor to move you." }, 409);
    }

    // Create (or repoint) the single pending affiliation request → instructor approves.
    const { data: existing } = await svc.from("school_affiliation_requests")
      .select("id, school_id").eq("competitor_id", competitorId).eq("status", "pending").maybeSingle();
    if (existing) {
      if ((existing as any).school_id === school.id) {
        return json({ ok: true, school: { id: school.id, name: school.name }, status: "pending", already: true });
      }
      const { error: uErr } = await svc.from("school_affiliation_requests").update({ school_id: school.id }).eq("id", (existing as any).id);
      if (uErr) return json({ ok: false, error: uErr.message }, 500);
    } else {
      const { error: iErr } = await svc.from("school_affiliation_requests").insert({ competitor_id: competitorId, school_id: school.id });
      if (iErr) return json({ ok: false, error: iErr.message }, 500);
    }

    return json({ ok: true, school: { id: school.id, name: school.name }, status: "pending" });
  } catch (e: any) {
    console.error("join-school-by-code error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
