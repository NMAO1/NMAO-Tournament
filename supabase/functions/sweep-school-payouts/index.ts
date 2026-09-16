// sweep-school-payouts — pays out school_payouts rows that were accrued as
// 'pending' because the school had no Stripe Connect account at charge time.
// The stripe-webhook creates the row + logs "accrued" but never retries the
// transfer, so a school that finishes Connect onboarding AFTER its athletes paid
// would otherwise be permanently underpaid. This sweeper (cron-driven) finds
// pending rows for schools that now have a connected account with transfers
// enabled, verifies the underlying purchase is still valid (not refunded), and
// issues the transfer. Idempotent + safe to re-run.
//
// Auth: x-cron-secret header === CRON_SECRET (same pattern as the other crons).
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!STRIPE_KEY) return json({ ok: false, error: "Stripe not configured." }, 500);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const stripe = new Stripe(STRIPE_KEY, { httpClient: Stripe.createFetchHttpClient() });

  // pending rows that were never transferred
  const { data: rows, error } = await svc.from("school_payouts")
    .select("id, school_id, amount_cents, entry_id, payment_intent_id, status, stripe_transfer_id")
    .eq("status", "pending").is("stripe_transfer_id", null)
    .limit(300);
  if (error) return json({ ok: false, error: error.message }, 500);

  const acctCache = new Map<string, string | null>();      // school_id -> connect acct (null = none/not ready)
  let paid = 0, skipped_no_acct = 0, skipped_refunded = 0, skipped_amount = 0, failed = 0;

  for (const r of (rows ?? []) as any[]) {
    if (!r.amount_cents || r.amount_cents <= 0) { skipped_amount++; continue; }

    // 1. resolve + validate the school's connected account (transfers capability active)
    let acct = acctCache.get(r.school_id);
    if (acct === undefined) {
      const { data: sch } = await svc.from("schools").select("stripe_connect_account_id").eq("id", r.school_id).maybeSingle();
      const a = (sch as any)?.stripe_connect_account_id as string | null;
      acct = null;
      if (a) {
        try { const acctObj = await stripe.accounts.retrieve(a); if ((acctObj as any)?.capabilities?.transfers === "active") acct = a; }
        catch (_) { acct = null; }
      }
      acctCache.set(r.school_id, acct);
    }
    if (!acct) { skipped_no_acct++; continue; }

    // 2. verify the underlying purchase is still valid (a refund/dispute un-pays it)
    let valid = false;
    if (r.entry_id) {
      const { data: e } = await svc.from("entries").select("payment_status").eq("id", r.entry_id).maybeSingle();
      valid = (e as any)?.payment_status === "paid";
    } else if (r.payment_intent_id) {
      const { data: ent } = await svc.from("entry_entitlements").select("status").eq("stripe_payment_intent_id", r.payment_intent_id).maybeSingle();
      valid = (ent as any)?.status === "active";
    }
    if (!valid) { skipped_refunded++; continue; }

    // 3. transfer, then mark paid. Idempotency keyed on the row so a concurrent
    //    run can't double-send; the pre-update re-check guards the DB write.
    try {
      const transfer = await stripe.transfers.create(
        { amount: r.amount_cents, currency: "usd", destination: acct,
          metadata: { school_payout_id: r.id, school_id: r.school_id, entry_id: r.entry_id ?? "", swept: "1" } },
        { idempotencyKey: "school-payout-sweep-" + r.id });
      const { data: upd } = await svc.from("school_payouts")
        .update({ status: "paid", stripe_transfer_id: transfer.id })
        .eq("id", r.id).eq("status", "pending").is("stripe_transfer_id", null)
        .select("id");
      if ((upd ?? []).length) paid++;
    } catch (te: any) {
      failed++;
      console.error("sweep transfer failed -> left pending", r.id, te?.message || te);
    }
  }

  return json({ ok: true, scanned: (rows ?? []).length, paid, skipped_no_acct, skipped_refunded, skipped_amount, failed });
});
