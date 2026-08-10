// =====================================================================
// EDGE FUNCTION: claim-pod  (Judge app — pull/claim judging model)
// An available judge claims an open seat on a pod from the shared pool. Judging
// is pull-based: pods sit in a pool, whoever's available grabs one. Claiming
// creates the judge's assignments across ALL entries in the pod (they score the
// whole pod). First-come-first-served + race-checked so two judges can't take
// the last seat.
//
// Eligibility mirrors assign_judges: judge active + cleared, NOT from any
// competitor's own school in the pod (conflict of interest), pod not full, and
// the judge isn't already on it.
//
// AUTH: Verify JWT = ON.
// POST { pod_id } -> { ok, claimed, entries } | { ok:false, error }
// Deploy (editor-safe, no _shared): function name = claim-pod, Verify JWT ON.
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
  const authClient = createClient(URL_, ANON, {
    global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false },
  });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const podId = String(body.pod_id || "").trim();
    if (!podId) return json({ ok: false, error: "pod_id is required." }, 400);

    const { data: judge } = await svc.from("judges")
      .select("id, school_id, status, background_check_status").eq("auth_user_id", uid).maybeSingle();
    if (!judge) return json({ ok: false, error: "Not authorized — judges only." }, 403);
    if ((judge as any).status !== "active" || (judge as any).background_check_status !== "cleared") {
      return json({ ok: false, error: "Your judge account is not active/cleared." }, 403);
    }
    const judgeId = (judge as any).id;
    const judgeSchool = (judge as any).school_id ?? null;

    const { data: pod } = await svc.from("pods").select("id, judge_count, state, division_id").eq("id", podId).maybeSingle();
    if (!pod) return json({ ok: false, error: "Pod not found." }, 404);
    if ((pod as any).state === "resolved") return json({ ok: false, error: "This pod is already resolved." }, 409);

    // entries in the pod + their competitors' schools (conflict source)
    const { data: entries } = await svc.from("entries")
      .select("id, competitor_id, competitors(school_id)").eq("pod_id", podId).eq("status", "valid");
    const rows = (entries ?? []) as any[];
    if (!rows.length) return json({ ok: false, error: "No entries to judge in this pod." }, 409);

    const entrySchools = new Set(rows.map((e) => e.competitors?.school_id ?? null));
    if (judgeSchool && entrySchools.has(judgeSchool)) {
      return json({ ok: false, error: "Conflict of interest — a competitor is from your school." }, 403);
    }

    // current distinct judges on the pod (capacity + already-claimed check)
    const { data: existing } = await svc.from("judge_assignments").select("judge_id").eq("pod_id", podId);
    const judges = new Set(((existing ?? []) as any[]).map((r) => r.judge_id));
    if (judges.has(judgeId)) return json({ ok: false, error: "You've already claimed this pod." }, 409);
    if (judges.size >= ((pod as any).judge_count ?? 1)) {
      return json({ ok: false, error: "This pod is already fully claimed." }, 409);
    }

    const role = ((pod as any).judge_count ?? 1) > 1 ? "panel" : "sole";
    const insertRows = rows.map((e) => ({ pod_id: podId, entry_id: e.id, judge_id: judgeId, role, state: "assigned" }));
    const { error: insErr } = await svc.from("judge_assignments").insert(insertRows);
    if (insErr) { console.error("claim insert:", insErr); return json({ ok: false, error: "Could not claim — it may have just filled." }, 409); }

    return json({ ok: true, claimed: podId, entries: rows.length }, 200);
  } catch (e: any) {
    console.error("claim-pod error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
