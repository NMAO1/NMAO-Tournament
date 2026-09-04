// =====================================================================
// EDGE FUNCTION: accrue-partner-school-payouts  (§AMBASSADOR — Phase 4)
// Monthly 10% school override. For each attributed school, read the fee NMAO
// actually collected that month from the MEMBERSHIP project (platform_fee_usage,
// cross-project) and accrue 10% as a pending payout. FLAG-GATED: does nothing
// unless app_settings.partner_school_override_enabled = true.
// AUTH: Verify JWT = ON. NMAO staff only.
// Env (Tournament): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//   + MEMBERSHIP_SUPABASE_URL, MEMBERSHIP_SERVICE_ROLE_KEY (the ykioz project).
// POST { period? = 'YYYY-MM' (default last completed month) } -> { ok, period, accrued, schools }
// Deploy: name = accrue-partner-school-payouts, Verify JWT ON.
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

function lastCompletedMonth(): string {
  const n = new Date();
  const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  // AUTH: staff JWT (Mission Control) OR x-cron-secret (the automated cron).
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  if (!isCron) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
    const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
    const { data: u } = await authClient.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
    const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
    if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);
  }

  try {
    // Flag gate (launch timing).
    const { data: flag } = await svc.from("app_settings").select("value").eq("key", "partner_school_override_enabled").maybeSingle();
    if ((flag as any)?.value !== true) return json({ ok: true, disabled: true, note: "School override is OFF (app_settings.partner_school_override_enabled)." });

    const body = await req.json().catch(() => ({}));
    const period = String(body.period || "").trim() || lastCompletedMonth();

    const { data: attrs } = await svc.from("partner_school_attributions").select("member_school_id, partner_id").eq("active", true);
    if (!attrs?.length) return json({ ok: true, period, accrued: 0, schools: 0, note: "no active attributions" });
    // Only accrue for ACTIVE ambassadors — suspended/terminated partners stop earning new overrides.
    const { data: actP } = await svc.from("partners").select("id").eq("status", "active");
    const activePartner = new Set<string>((actP || []).map((p: any) => p.id));
    const memToPartner: Record<string, string> = {};
    for (const a of attrs) if (activePartner.has(a.partner_id)) memToPartner[a.member_school_id] = a.partner_id;

    // Cross-project read of Membership billing.
    // Strip ANY non-printable/non-ASCII gremlins a copy-paste may have injected
    // (zero-width chars, stray whitespace) — keys/URLs are always printable ASCII.
    const clean = (s: string | undefined) => (s || "").replace(/[^\x21-\x7E]/g, "");
    const MU = clean(Deno.env.get("MEMBERSHIP_SUPABASE_URL"));
    const MK = clean(Deno.env.get("MEMBERSHIP_SERVICE_ROLE_KEY"));
    if (!MU || !MK) return json({ ok: false, error: "Membership DB not configured — set MEMBERSHIP_SUPABASE_URL + MEMBERSHIP_SERVICE_ROLE_KEY secrets." }, 500);
    const mem = createClient(MU, MK, { auth: { persistSession: false } });
    const { data: usage, error: uerr } = await mem.from("platform_fee_usage")
      .select("school_id, accrued_fee_cents").eq("period", period).in("school_id", Object.keys(memToPartner));
    if (uerr) return json({ ok: false, error: "Membership read failed: " + uerr.message }, 500);

    let accrued = 0;
    for (const row of (usage || [])) {
      const cents = (row as any).accrued_fee_cents || 0;
      if (cents <= 0) continue;
      const pid = memToPartner[(row as any).school_id];
      if (!pid) continue;
      const amount = Math.round(cents * 0.10);
      if (amount <= 0) continue;
      const r = await svc.from("partner_school_payouts").upsert(
        { partner_id: pid, member_school_id: (row as any).school_id, period, collected_fee_cents: cents, rate: 0.10, amount_cents: amount },
        { onConflict: "partner_id,member_school_id,period", ignoreDuplicates: true }).select("id");
      if (r.data && r.data.length) accrued++;
    }
    return json({ ok: true, period, accrued, schools: (usage || []).length });
  } catch (e: any) {
    console.error("accrue-partner-school-payouts error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
