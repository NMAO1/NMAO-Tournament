// =====================================================================
// EDGE FUNCTION: fill-unclaimed-pods  (Judging pool — HYBRID safety-net)
// Backfills pods that still have open seats after the pull/claim window, so no
// pod goes unjudged. Same eligibility as claim/assign: active + cleared judges,
// NOT from any competitor's own school in the pod, load-balanced (fewest current
// assignments in the round win), no double-assigning a judge already on the pod.
//
// Two modes:
//   • Staff button (Mission Control): POST { round_id }  -> fill that round now.
//   • Cron (near judging_deadline): POST {} with header x-cron-secret -> auto-fill
//     every round in a judging state whose judging_deadline has passed.
//
// AUTH: staff JWT  OR  header x-cron-secret == env CRON_SECRET.
// Deploy (editor-safe, no _shared): name = fill-unclaimed-pods, Verify JWT OFF
//   (it does its own auth so cron can call it; JWT off is required for the
//    cron-secret path). Set a CRON_SECRET env var for the cron path.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const JUDGING_STATES = ["podded", "judging"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Fill one round's unclaimed pods; returns per-pod fill counts + any shortfalls.
async function fillRound(svc: any, roundId: string) {
  const { data: pods } = await svc.from("pods")
    .select("id, judge_count, state, divisions!inner(round_id)")
    .eq("divisions.round_id", roundId).neq("state", "resolved");
  const podRows = (pods ?? []) as any[];
  if (!podRows.length) return { round_id: roundId, filled: [], shortfalls: [] };
  const podIds = podRows.map((p) => p.id);

  const [{ data: entries }, { data: asn }, { data: pool }] = await Promise.all([
    svc.from("entries").select("id, pod_id, competitors(school_id)").in("pod_id", podIds).eq("status", "valid"),
    svc.from("judge_assignments").select("judge_id, entries!inner(round_id)").eq("entries.round_id", roundId),
    svc.from("judges").select("id, school_id").eq("status", "active").eq("background_check_status", "cleared"),
  ]);

  const entriesByPod = new Map<string, any[]>();
  const schoolsByPod = new Map<string, Set<string>>();
  for (const e of (entries ?? []) as any[]) {
    if (!entriesByPod.has(e.pod_id)) entriesByPod.set(e.pod_id, []);
    entriesByPod.get(e.pod_id)!.push(e);
    if (!schoolsByPod.has(e.pod_id)) schoolsByPod.set(e.pod_id, new Set());
    if (e.competitors?.school_id) schoolsByPod.get(e.pod_id)!.add(e.competitors.school_id);
  }
  // current distinct judges per pod (query fresh — pod-scoped)
  const { data: podAsn } = await svc.from("judge_assignments").select("pod_id, judge_id").in("pod_id", podIds);
  const judgesByPod = new Map<string, Set<string>>();
  for (const a of (podAsn ?? []) as any[]) {
    if (!judgesByPod.has(a.pod_id)) judgesByPod.set(a.pod_id, new Set());
    judgesByPod.get(a.pod_id)!.add(a.judge_id);
  }
  // running load across the round (for fair distribution)
  const load: Record<string, number> = {};
  for (const j of (pool ?? []) as any[]) load[j.id] = 0;
  for (const a of (asn ?? []) as any[]) load[a.judge_id] = (load[a.judge_id] ?? 0) + 1;

  const filled: any[] = [];
  const shortfalls: any[] = [];
  for (const p of podRows) {
    const onPod = judgesByPod.get(p.id) ?? new Set<string>();
    const need = (p.judge_count ?? 1) - onPod.size;
    if (need <= 0) continue;
    const podSchools = schoolsByPod.get(p.id) ?? new Set<string>();
    const eligible = ((pool ?? []) as any[])
      .filter((j) => !onPod.has(j.id) && !(j.school_id && podSchools.has(j.school_id)))
      .sort((a, b) => (load[a.id] ?? 0) - (load[b.id] ?? 0) || String(a.id).localeCompare(String(b.id)));
    const pick = eligible.slice(0, need);
    const podEntries = entriesByPod.get(p.id) ?? [];
    const role = (p.judge_count ?? 1) > 1 ? "panel" : "sole";
    const rows: any[] = [];
    for (const j of pick) {
      for (const e of podEntries) rows.push({ pod_id: p.id, entry_id: e.id, judge_id: j.id, role, state: "assigned" });
      load[j.id] = (load[j.id] ?? 0) + 1;
    }
    if (rows.length) { await svc.from("judge_assignments").insert(rows); filled.push({ pod_id: p.id, added: pick.length }); }
    if (pick.length < need) shortfalls.push({ pod_id: p.id, still_short: need - pick.length });
  }
  return { round_id: roundId, filled, shortfalls };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  // ---- auth: cron secret OR staff JWT ----
  let authed = false;
  const cronSecret = req.headers.get("x-cron-secret");
  const envSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && envSecret && cronSecret === envSecret) authed = true;
  if (!authed) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
      const { data: u } = await authClient.auth.getUser();
      if (u?.user?.id) {
        const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", u.user.id).maybeSingle();
        if (staff) authed = true;
      }
    }
  }
  if (!authed) return json({ ok: false, error: "Not authorized — staff or cron only." }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    let roundIds: string[] = [];
    if (body.round_id) {
      roundIds = [String(body.round_id)];
    } else {
      // auto mode: rounds in a judging state whose deadline has passed
      const nowIso = new Date().toISOString();
      const { data: due } = await svc.from("rounds").select("id, state, judging_deadline")
        .in("state", JUDGING_STATES).lte("judging_deadline", nowIso);
      roundIds = ((due ?? []) as any[]).map((r) => r.id);
    }
    const results = [];
    for (const rid of roundIds) results.push(await fillRound(svc, rid));
    return json({ ok: true, rounds: results }, 200);
  } catch (e: any) {
    console.error("fill-unclaimed-pods error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
