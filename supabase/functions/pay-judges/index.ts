// =====================================================================
// EDGE FUNCTION: pay-judges  (Staff — disburse judge pay for a round)
// Per-video model: each judge earns rate × videos they scored (app_settings
// .judge_video_rate_cents, default $1.25). Records earnings per (judge, round)
// in judge_payments, then sends a Stripe TRANSFER to each payout-ready judge's
// connected account and marks it paid. Judges without payouts connected stay
// 'pending' and get paid on a later re-run. Idempotent — never re-pays a
// settled row. (Transfers require the platform's transfers-only approval; until
// then the recording still works and transfers just no-op/err safely.)
//
// AUTH: Verify JWT = ON. Caller must be NMAO staff. Requires STRIPE_SECRET_KEY.
// POST { round_id } -> { ok, recorded, paid, pending, total_cents }
// Deploy: name = pay-judges, Verify JWT ON.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ ok: false, error: "Stripe not configured." }, 500);
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  // Confirm the caller is staff.
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const roundId = String(body.round_id || "").trim();
    if (!roundId) return json({ ok: false, error: "round_id is required." }, 400);

    // 1) Record/refresh this round's earnings for every judge who scored.
    const { error: recErr } = await svc.rpc("record_round_judge_payments", { p_round: roundId });
    if (recErr) { console.error("record earnings:", recErr); return json({ ok: false, error: "Could not compute earnings." }, 500); }

    // 2) Pull the pending payments + each judge's payout account.
    const { data: rows } = await svc
      .from("judge_payments")
      .select("id, judge_id, amount_cents, currency, status, judges!inner(payouts_enabled, stripe_connect_account_id)")
      .eq("round_id", roundId)
      .eq("status", "pending");

    let paid = 0, pending = 0, totalPaid = 0;
    for (const p of (rows ?? []) as any[]) {
      const j = p.judges;
      if (!j?.payouts_enabled || !j?.stripe_connect_account_id || p.amount_cents <= 0) { pending++; continue; }
      try {
        const tr = await stripe.transfers.create({
          amount: p.amount_cents, currency: p.currency || "usd",
          destination: j.stripe_connect_account_id,
          metadata: { judge_id: p.judge_id, round_id: roundId, judge_payment_id: p.id },
        });
        await svc.from("judge_payments").update({ status: "paid", stripe_transfer_id: tr.id, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", p.id);
        paid++; totalPaid += p.amount_cents;
      } catch (e: any) {
        console.error("transfer failed for judge_payment", p.id, e?.message || e);
        await svc.from("judge_payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", p.id);
      }
    }

    const { data: allRound } = await svc.from("judge_payments").select("amount_cents").eq("round_id", roundId);
    const totalRound = (allRound ?? []).reduce((s: number, r: any) => s + Number(r.amount_cents), 0);
    return json({ ok: true, recorded: (rows ?? []).length + paid, paid, pending, total_paid_cents: totalPaid, total_round_cents: totalRound });
  } catch (e: any) {
    console.error("pay-judges error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
