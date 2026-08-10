// =====================================================================
// EDGE FUNCTION: available-pods  (Judge app — the judging pool)
// Returns the pods the calling judge can CLAIM: in a round being judged, not yet
// full, and free of conflict (judge not from any competitor's own school in the
// pod, and not already on it). Powers the "Available to judge" pool view.
//
// AUTH: Verify JWT = ON.
// POST {} -> { ok, pods: [{ pod_id, event, age_key, rank_key, entries, judge_count, seats_left }] }
// Deploy (editor-safe, no _shared): function name = available-pods, Verify JWT ON.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const JUDGING_STATES = ["podded", "judging"]; // round states where claiming is open

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
    const { data: judge } = await svc.from("judges")
      .select("id, school_id, status, background_check_status").eq("auth_user_id", uid).maybeSingle();
    if (!judge) return json({ ok: false, error: "Not authorized — judges only." }, 403);
    if ((judge as any).status !== "active" || (judge as any).background_check_status !== "cleared") {
      return json({ ok: true, pods: [] }); // not eligible to judge right now
    }
    const judgeId = (judge as any).id;
    const judgeSchool = (judge as any).school_id ?? null;

    const { data: pods } = await svc.from("pods")
      .select("id, judge_count, state, divisions!inner(event, age_key, rank_key, round_id, rounds!inner(state))")
      .neq("state", "resolved");
    const podRows = ((pods ?? []) as any[]).filter((p) => JUDGING_STATES.includes(p.divisions?.rounds?.state));
    if (!podRows.length) return json({ ok: true, pods: [] });

    const podIds = podRows.map((p) => p.id);
    const [{ data: entries }, { data: asn }] = await Promise.all([
      svc.from("entries").select("pod_id, competitors(school_id)").in("pod_id", podIds).eq("status", "valid"),
      svc.from("judge_assignments").select("pod_id, judge_id").in("pod_id", podIds),
    ]);

    const schoolsByPod = new Map<string, Set<string>>();
    const countByPod = new Map<string, number>();
    for (const e of (entries ?? []) as any[]) {
      if (!schoolsByPod.has(e.pod_id)) schoolsByPod.set(e.pod_id, new Set());
      const s = e.competitors?.school_id ?? null;
      if (s) schoolsByPod.get(e.pod_id)!.add(s);
      countByPod.set(e.pod_id, (countByPod.get(e.pod_id) ?? 0) + 1);
    }
    const judgesByPod = new Map<string, Set<string>>();
    for (const a of (asn ?? []) as any[]) {
      if (!judgesByPod.has(a.pod_id)) judgesByPod.set(a.pod_id, new Set());
      judgesByPod.get(a.pod_id)!.add(a.judge_id);
    }

    const out = podRows
      .map((p) => {
        const judges = judgesByPod.get(p.id) ?? new Set();
        const schools = schoolsByPod.get(p.id) ?? new Set();
        const seatsLeft = (p.judge_count ?? 1) - judges.size;
        const conflicted = judgeSchool && schools.has(judgeSchool);
        const alreadyOn = judges.has(judgeId);
        if (seatsLeft <= 0 || conflicted || alreadyOn) return null;
        const d = p.divisions;
        return {
          pod_id: p.id, event: d.event, age_key: d.age_key, rank_key: d.rank_key,
          entries: countByPod.get(p.id) ?? 0, judge_count: p.judge_count ?? 1, seats_left: seatsLeft,
        };
      })
      .filter(Boolean);

    return json({ ok: true, pods: out });
  } catch (e: any) {
    console.error("available-pods error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
