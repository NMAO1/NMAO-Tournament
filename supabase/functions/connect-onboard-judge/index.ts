// =====================================================================
// EDGE FUNCTION: connect-onboard-judge  (Judge app — Payouts / bank + tax)
// Stripe Connect EXPRESS for individual contractor judges: Stripe hosts the
// onboarding and collects bank details + W-9/taxpayer info + identity, and can
// issue 1099-NEC — keeping SSNs off NMAO. (Schools use STANDARD via connect-
// onboard; judges use EXPRESS here.)
//   action=link   -> create/reuse the Express account, return a hosted link
//   action=status -> refresh payouts_enabled from Stripe; activate if fully onboarded
//
// AUTH: Verify JWT = ON. Caller must be a judge. Requires STRIPE_SECRET_KEY.
// POST { action, return_url? } -> { ok, url? , payouts_enabled?, judge_status? }
// Deploy: name = connect-onboard-judge, Verify JWT ON.
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

// A judge is "active" once bg cleared + IC + creed + payouts are all satisfied.
async function refreshJudgeStatus(svc: any, judgeId: string): Promise<string> {
  const { data: j } = await svc.from("judges").select("status, background_check_status, ic_agreement_accepted_at, creed_accepted_at, payouts_enabled").eq("id", judgeId).single();
  if (!j) return "";
  const ready = j.status !== "rejected" && j.background_check_status === "cleared" && !!j.ic_agreement_accepted_at && !!j.creed_accepted_at && !!j.payouts_enabled;
  if (ready && j.status !== "active") { await svc.from("judges").update({ status: "active" }).eq("id", judgeId); return "active"; }
  return j.status;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ ok: false, error: "Stripe not configured." }, 500);
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "link");
    const returnUrl = String(body.return_url || "").trim() || "https://example.com/judge";

    const { data: judge } = await svc.from("judges").select("id, email, status, stripe_connect_account_id").eq("auth_user_id", uid).maybeSingle();
    if (!judge) return json({ ok: false, error: "Not authorized — judges only." }, 403);
    const judgeId = (judge as any).id;

    let acct = (judge as any).stripe_connect_account_id as string | null;
    // Request BOTH transfers + card_payments — a standard Express account, which
    // clears Stripe's "transfers without card_payments" platform-approval gate.
    // card_payments is never used (judges don't charge); it just satisfies the default.
    const caps = { transfers: { requested: true }, card_payments: { requested: true } };
    if (!acct) {
      const created = await stripe.accounts.create({
        type: "express",
        email: (judge as any).email || undefined,
        business_type: "individual",
        capabilities: caps,
        business_profile: { product_description: "Independent judge scoring martial-arts tournament videos for NMAO." },
        metadata: { judge_id: judgeId },
      });
      acct = created.id;
      await svc.from("judges").update({ stripe_connect_account_id: acct }).eq("id", judgeId);
    } else {
      // Existing account created transfers-only earlier — add card_payments so it
      // clears the same gate. Best-effort; ignore if already requested.
      try { await stripe.accounts.update(acct, { capabilities: caps }); } catch (_e) { /* already set */ }
    }

    if (action === "status") {
      const a = await stripe.accounts.retrieve(acct!);
      // Judges are transfers-only recipients (no card_payments), so charges_enabled
      // is never true — readiness is payouts_enabled + details_submitted only.
      const enabled = !!a.payouts_enabled && !!a.details_submitted;
      await svc.from("judges").update({ payouts_enabled: enabled }).eq("id", judgeId);
      const jstatus = await refreshJudgeStatus(svc, judgeId);
      return json({ ok: true, payouts_enabled: enabled, details_submitted: !!a.details_submitted, judge_status: jstatus });
    }

    const link = await stripe.accountLinks.create({ account: acct!, refresh_url: returnUrl, return_url: returnUrl, type: "account_onboarding" });
    return json({ ok: true, url: link.url });
  } catch (e: any) {
    console.error("connect-onboard-judge error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
