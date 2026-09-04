// =====================================================================
// EDGE FUNCTION: annual-earnings-report  (§1099 — reconciliation)
// Per calendar-year PAID totals for every ambassador AND judge, so staff can
// reconcile against Stripe's 1099-NEC filings and see who crosses the $600
// reporting threshold. Read-only. The ACTUAL 1099 forms are filed + delivered by
// Stripe Connect (tax reporting), not here.
// AUTH: Verify JWT = ON. NMAO staff only.
// POST { year? = current UTC year } -> { ok, year, threshold_cents, ambassadors[], judges[] }
// Deploy: name = annual-earnings-report, Verify JWT ON.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const THRESHOLD = 60000; // $600 — 1099-NEC reporting threshold
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const year = Number(body.year) || new Date().getUTCFullYear();
    const start = `${year}-01-01T00:00:00Z`;
    const end = `${year + 1}-01-01T00:00:00Z`;

    // ---- Ambassadors: paid entry overrides + paid school overrides ----
    const amb: Record<string, number> = {};
    const { data: pe } = await svc.from("partner_event_payouts")
      .select("partner_id, amount_cents").eq("status", "paid").gte("paid_at", start).lt("paid_at", end);
    for (const r of (pe || [])) amb[(r as any).partner_id] = (amb[(r as any).partner_id] || 0) + ((r as any).amount_cents || 0);
    const { data: ps } = await svc.from("partner_school_payouts")
      .select("partner_id, amount_cents").eq("status", "paid").gte("paid_at", start).lt("paid_at", end);
    for (const r of (ps || [])) amb[(r as any).partner_id] = (amb[(r as any).partner_id] || 0) + ((r as any).amount_cents || 0);

    let ambassadors: any[] = [];
    const ambIds = Object.keys(amb);
    if (ambIds.length) {
      const { data: partners } = await svc.from("partners").select("id, name, email").in("id", ambIds);
      const byId: Record<string, any> = {}; for (const p of (partners || [])) byId[(p as any).id] = p;
      ambassadors = ambIds.map((id) => ({
        partner_id: id, name: byId[id]?.name || "(unknown)", email: byId[id]?.email || null,
        total_cents: amb[id], needs_1099: amb[id] >= THRESHOLD,
      })).sort((a, b) => b.total_cents - a.total_cents);
    }

    // ---- Judges: paid judge_payments ----
    const jmap: Record<string, number> = {};
    const { data: jp } = await svc.from("judge_payments")
      .select("judge_id, amount_cents").eq("status", "paid").gte("paid_at", start).lt("paid_at", end);
    for (const r of (jp || [])) jmap[(r as any).judge_id] = (jmap[(r as any).judge_id] || 0) + ((r as any).amount_cents || 0);

    let judges: any[] = [];
    const jIds = Object.keys(jmap);
    if (jIds.length) {
      const { data: jrows } = await svc.from("judges").select("id, first_name, last_name, email").in("id", jIds);
      const byId: Record<string, any> = {}; for (const j of (jrows || [])) byId[(j as any).id] = j;
      judges = jIds.map((id) => ({
        judge_id: id,
        name: [byId[id]?.first_name, byId[id]?.last_name].filter(Boolean).join(" ") || "(unknown)",
        email: byId[id]?.email || null, total_cents: jmap[id], needs_1099: jmap[id] >= THRESHOLD,
      })).sort((a, b) => b.total_cents - a.total_cents);
    }

    return json({ ok: true, year, threshold_cents: THRESHOLD, ambassadors, judges });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
