// =====================================================================
// EDGE FUNCTION: pay-partners  (§AMBASSADOR — Phase 3 · disburse $1/entry)
// (1) RECONCILE: any accrued payout whose entry is no longer paid (refund) is
//     reversed — pending -> reversed; paid -> Stripe transfer reversal + reversed.
// (2) PAY: pending rows for payout-ready ambassadors -> one Stripe transfer per
//     entry (idempotencyKey per entry, like school_payouts), mark paid.
// (3) SCHOOL OVERRIDE (Phase 4): pending partner_school_payouts (10% of monthly
//     collected fee) -> one transfer per row (idempotencyKey partner-school-<id>).
//     No reversal loop — refunds are already netted into collected_fee_cents.
// Ambassadors who haven't finished Connect stay 'pending' and get paid on a re-run.
// AUTH: Verify JWT = ON. NMAO staff only. Requires STRIPE_SECRET_KEY.
// POST {}  ->  { ok, paid, pending, reversed, skipped, school_paid, school_pending, school_skipped }
// Deploy: name = pay-partners, Verify JWT ON.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import Stripe from "npm:stripe@16";
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
const nowIso = () => new Date().toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ ok: false, error: "Stripe not configured." }, 500);
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

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
    const { data: rows } = await svc.from("partner_event_payouts")
      .select("id, entry_id, partner_id, amount_cents, currency, status, stripe_transfer_id, partners!inner(payouts_enabled, stripe_connect_account_id)")
      .in("status", ["pending", "paid"]);
    const list = rows || [];
    if (!list.length) return json({ ok: true, paid: 0, pending: 0, reversed: 0, skipped: 0 });

    // Which of these entries are still paid? (refund reconciliation)
    const entryIds = [...new Set(list.map((r: any) => r.entry_id))];
    const paidSet = new Set<string>();
    for (let i = 0; i < entryIds.length; i += 500) {
      const { data: es } = await svc.from("entries").select("id, payment_status").in("id", entryIds.slice(i, i + 500));
      for (const e of (es || [])) if ((e as any).payment_status === "paid") paidSet.add((e as any).id);
    }

    let paid = 0, pending = 0, reversed = 0, skipped = 0;
    for (const r of list as any[]) {
      const stillPaid = paidSet.has(r.entry_id);
      if (!stillPaid) {
        if (r.status === "paid" && r.stripe_transfer_id) {
          try { await stripe.transfers.createReversal(r.stripe_transfer_id, {}, { idempotencyKey: "partner-rev-" + r.entry_id }); } catch (_e) { /* may already be reversed */ }
        }
        await svc.from("partner_event_payouts").update({ status: "reversed", reversed_at: nowIso(), reversal_reason: "entry no longer paid" }).eq("id", r.id);
        reversed++; continue;
      }
      if (r.status !== "pending") continue; // already paid, still valid
      const p = r.partners;
      if (!p?.payouts_enabled || !p?.stripe_connect_account_id || r.amount_cents <= 0) { pending++; continue; }
      try {
        const tr = await stripe.transfers.create(
          { amount: r.amount_cents, currency: r.currency || "usd", destination: p.stripe_connect_account_id,
            metadata: { entry_id: r.entry_id, partner_id: r.partner_id, kind: "ambassador_competitor_override" } },
          { idempotencyKey: "partner-payout-" + r.entry_id });
        await svc.from("partner_event_payouts").update({ status: "paid", stripe_transfer_id: tr.id, paid_at: nowIso() }).eq("id", r.id);
        paid++;
      } catch (te: any) { console.error("partner transfer failed -> left pending", r.entry_id, te?.message || te); skipped++; }
    }
    // ---- School override (10%) payouts: pay pending; refunds already netted in
    //      accrued_fee_cents so no reversal reconciliation is needed here. ----
    let schoolPaid = 0, schoolPending = 0, schoolSkipped = 0;
    const { data: srows } = await svc.from("partner_school_payouts")
      .select("id, partner_id, amount_cents, period, partners!inner(payouts_enabled, stripe_connect_account_id)")
      .eq("status", "pending");
    for (const r of (srows || []) as any[]) {
      const p = r.partners;
      if (!p?.payouts_enabled || !p?.stripe_connect_account_id || r.amount_cents <= 0) { schoolPending++; continue; }
      try {
        const tr = await stripe.transfers.create(
          { amount: r.amount_cents, currency: "usd", destination: p.stripe_connect_account_id,
            metadata: { partner_school_payout_id: r.id, partner_id: r.partner_id, period: r.period, kind: "ambassador_school_override" } },
          { idempotencyKey: "partner-school-" + r.id });
        await svc.from("partner_school_payouts").update({ status: "paid", stripe_transfer_id: tr.id, paid_at: nowIso() }).eq("id", r.id);
        schoolPaid++;
      } catch (te: any) { console.error("partner school transfer failed -> left pending", r.id, te?.message || te); schoolSkipped++; }
    }

    return json({ ok: true, paid, pending, reversed, skipped, school_paid: schoolPaid, school_pending: schoolPending, school_skipped: schoolSkipped });
  } catch (e: any) {
    console.error("pay-partners error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
