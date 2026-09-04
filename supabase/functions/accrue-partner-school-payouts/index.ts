// =====================================================================
// EDGE FUNCTION: accrue-partner-school-payouts  (§AMBASSADOR — Phase 4)
// Monthly 10% school override. For each attributed school, read the fee NMAO
// actually collected that month from the MEMBERSHIP project (platform_fee_usage,
// cross-project) and accrue 10% as a pending payout. FLAG-GATED: does nothing
// unless app_settings.partner_school_override_enabled = true.
// ALSO RECONCILES late refunds: re-reads the last 3 periods' collected fees and trues
// up any drift — pending rows edited in place, over-paid rows get a partial Stripe
// reversal down to the correct 10%. Needs STRIPE_SECRET_KEY for the paid clawback.
// AUTH: staff JWT OR x-cron-secret. Verify JWT = OFF (cron-callable).
// Env (Tournament): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, CRON_SECRET,
//   STRIPE_SECRET_KEY + MEMBERSHIP_SUPABASE_URL, MEMBERSHIP_SERVICE_ROLE_KEY (the ykioz project).
// POST { period? } -> { ok, period, accrued, schools, reconciled, clawed_cents }
// Deploy: name = accrue-partner-school-payouts, --no-verify-jwt.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16";

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
// The target period plus the (n-1) months before it, e.g. ['2026-08','2026-07','2026-06'].
function periodsBack(end: string, n: number): string[] {
  const [y, m] = end.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) { const d = new Date(Date.UTC(y, (m - 1) - i, 1)); out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); }
  return out;
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
    // ---- RECONCILE recent periods against CURRENT Membership fees (late refunds) ----
    // A refund landing AFTER we accrued (or paid) reduces that month's collected fee.
    // Re-read the fee for the last few periods and true up: pending rows are edited in
    // place; over-paid rows get a PARTIAL Stripe reversal (clawback) down to the right 10%.
    const RECON = periodsBack(period, 3);
    const { data: existing } = await svc.from("partner_school_payouts")
      .select("id, member_school_id, period, amount_cents, status, stripe_transfer_id")
      .in("period", RECON).in("status", ["pending", "paid"]);
    let reconciled = 0, clawed_cents = 0;
    if (existing?.length) {
      const schoolIds = [...new Set((existing as any[]).map((r) => r.member_school_id))];
      const { data: feeRows } = await mem.from("platform_fee_usage")
        .select("school_id, period, accrued_fee_cents").in("period", RECON).in("school_id", schoolIds);
      const feeMap: Record<string, number> = {};
      for (const f of (feeRows || [])) feeMap[(f as any).school_id + "|" + (f as any).period] = (f as any).accrued_fee_cents || 0;

      let stripe: Stripe | null = null;
      const sk = Deno.env.get("STRIPE_SECRET_KEY");
      for (const r of existing as any[]) {
        const fee = feeMap[r.member_school_id + "|" + r.period] || 0;
        const correct = Math.round(fee * 0.10);
        if (correct === r.amount_cents) continue;                    // already in sync
        if (r.status === "pending") {
          await svc.from("partner_school_payouts")
            .update({ amount_cents: correct, collected_fee_cents: fee, ...(correct <= 0 ? { status: "reversed" } : {}) }).eq("id", r.id);
          reconciled++;
        } else if (r.status === "paid" && correct < r.amount_cents && r.stripe_transfer_id) {
          const back = r.amount_cents - correct;                     // over-payment to claw back
          if (!stripe && sk) stripe = new Stripe(sk, { httpClient: Stripe.createFetchHttpClient() });
          if (!stripe) continue;                                     // no Stripe key -> can't reverse; leave as-is
          try {
            await stripe.transfers.createReversal(r.stripe_transfer_id, { amount: back }, { idempotencyKey: "psclaw-" + r.id + "-" + correct });
          } catch (te: any) { console.error("school clawback reversal failed", r.id, te?.message || te); continue; }
          await svc.from("partner_school_payouts")
            .update({ amount_cents: correct, collected_fee_cents: fee, ...(correct <= 0 ? { status: "reversed" } : {}) }).eq("id", r.id);
          clawed_cents += back; reconciled++;
        }
      }
    }

    return json({ ok: true, period, accrued, schools: (usage || []).length, reconciled, clawed_cents });
  } catch (e: any) {
    console.error("accrue-partner-school-payouts error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
