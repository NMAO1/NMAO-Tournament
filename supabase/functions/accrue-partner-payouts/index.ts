// =====================================================================
// EDGE FUNCTION: accrue-partner-payouts  (§AMBASSADOR — Phase 3)
// Scan PAID entries whose competitor's school is attributed to an ambassador and
// write one pending $1 payout row per entry (idempotent on entry_id). Pure DB —
// no money moves here (that's pay-partners). Refund reconciliation also lives in
// pay-partners.
// AUTH: Verify JWT = ON. NMAO staff only (same gate as pay-judges).
// POST { round_id? }  ->  { ok, accrued, scanned }
// Deploy: name = accrue-partner-payouts, Verify JWT ON.
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
    const roundId = body.round_id ? String(body.round_id) : null;

    // 1) active attributions: membership school id -> partner id
    const { data: attrs } = await svc.from("partner_school_attributions")
      .select("member_school_id, partner_id").eq("active", true);
    if (!attrs?.length) return json({ ok: true, accrued: 0, scanned: 0, note: "no active attributions" });
    const memToPartner: Record<string, string> = {};
    for (const a of attrs) memToPartner[a.member_school_id] = a.partner_id;

    // 2) tournament schools that map to those membership schools
    const { data: tsch } = await svc.from("schools")
      .select("id, external_member_school_id").in("external_member_school_id", Object.keys(memToPartner));
    const tsInfo: Record<string, { partner_id: string; member_school_id: string }> = {};
    for (const s of (tsch || [])) {
      const pid = memToPartner[(s as any).external_member_school_id];
      if (pid) tsInfo[(s as any).id] = { partner_id: pid, member_school_id: (s as any).external_member_school_id };
    }
    const tsIds = Object.keys(tsInfo);
    if (!tsIds.length) return json({ ok: true, accrued: 0, scanned: 0, note: "no bridged schools for attributed partners" });

    // 3) paid entries; join competitor to get its school; filter in JS to the attributed set
    let q = svc.from("entries").select("id, competitor_id, event, round_id, competitors!inner(school_id)").eq("payment_status", "paid");
    if (roundId) q = q.eq("round_id", roundId);
    const { data: entries } = await q;

    let accrued = 0;
    for (const e of (entries || [])) {
      const tsid = (e as any).competitors?.school_id;
      const info = tsInfo[tsid];
      if (!info) continue;
      const r = await svc.from("partner_event_payouts").upsert(
        { partner_id: info.partner_id, entry_id: (e as any).id, competitor_id: (e as any).competitor_id,
          member_school_id: info.member_school_id, round_id: (e as any).round_id, event: (e as any).event, amount_cents: 100 },
        { onConflict: "entry_id", ignoreDuplicates: true }).select("id");
      if (r.data && r.data.length) accrued++;
    }
    return json({ ok: true, accrued, scanned: (entries || []).length });
  } catch (e: any) {
    console.error("accrue-partner-payouts error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
