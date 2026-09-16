// EDGE FUNCTION: sweep-school-payouts  (recovery cron)
// -----------------------------------------------------------------------------
// When an entry/season-pass is paid but the buyer's school has not yet finished
// Stripe Connect onboarding, the webhook accrues a school_payouts row as
// status='pending' (no transfer). Nothing else ever pays those out — so once the
// school connects, the money would sit on the platform forever. This sweeper runs
// on a cron: it finds pending rows for schools that NOW have a connected account
// and issues the transfer, mirroring the webhook's payout (same idempotency key
// for entry rows, so it can never double-pay one the webhook already sent).
//
// Guards: only pays rows whose underlying purchase is still valid (entry still
// 'paid' / entitlement still 'active') so a refunded/disputed purchase that left
// a pending row behind is never paid out.
//
// AUTH: x-cron-secret == CRON_SECRET. verify_jwt = false (called by pg_cron).
import Stripe from "npm:stripe@16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ ok: false, error: "Stripe not configured." }, 500);
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  const paid: string[] = []; const skipped: string[] = []; const failed: string[] = [];
  try {
    // Pending rows only — cap the batch so a huge backlog can't time out.
    const { data: rows } = await svc.from("school_payouts")
      .select("id, school_id, entry_id, payment_intent_id, amount_cents, status, stripe_transfer_id")
      .eq("status", "pending").is("stripe_transfer_id", null).limit(200);

    for (const r of (rows ?? []) as any[]) {
      if (!r.amount_cents || r.amount_cents <= 0) { skipped.push(r.id); continue; }

      // School must now have an active connected account.
      const { data: school } = await svc.from("schools").select("stripe_connect_account_id, status").eq("id", r.school_id).maybeSingle();
      const acct = (school as any)?.stripe_connect_account_id as string | null;
      if (!acct || (school as any)?.status === "suspended") { skipped.push(r.id); continue; }

      // Underlying purchase must still be valid (not refunded/disputed).
      if (r.entry_id) {
        const { data: e } = await svc.from("entries").select("payment_status").eq("id", r.entry_id).maybeSingle();
        if ((e as any)?.payment_status !== "paid") { skipped.push(r.id); continue; }
      } else if (r.payment_intent_id) {
        const { data: ent } = await svc.from("entry_entitlements").select("status").eq("stripe_payment_intent_id", r.payment_intent_id).maybeSingle();
        if (ent && (ent as any).status !== "active") { skipped.push(r.id); continue; }
      }

      // Re-read to guard against a concurrent sweep/webhook having paid it.
      const { data: fresh } = await svc.from("school_payouts").select("status, stripe_transfer_id").eq("id", r.id).maybeSingle();
      if (!fresh || (fresh as any).status !== "pending" || (fresh as any).stripe_transfer_id) { skipped.push(r.id); continue; }

      // Entry rows reuse the webhook's idempotency key so a late webhook can't double-pay.
      const idem = r.entry_id ? ("school-payout-" + r.entry_id) : ("school-sweep-" + r.id);
      try {
        const transfer = await stripe.transfers.create(
          { amount: r.amount_cents, currency: "usd", destination: acct,
            metadata: { school_id: r.school_id, entry_id: r.entry_id ?? "", payment_intent: r.payment_intent_id ?? "", swept: "true" } },
          { idempotencyKey: idem });
        await svc.from("school_payouts").update({ status: "paid", stripe_transfer_id: transfer.id }).eq("id", r.id);
        paid.push(r.id);
      } catch (te: any) {
        console.error("sweep transfer failed -> left pending", r.id, te?.message || te);
        failed.push(r.id);
      }
    }
    return json({ ok: true, paid: paid.length, skipped: skipped.length, failed: failed.length });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
