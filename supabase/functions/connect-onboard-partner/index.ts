// =====================================================================
// EDGE FUNCTION: connect-onboard-partner  (§AMBASSADOR — Phase 2 · payouts)
// Stripe Connect EXPRESS for an Ambassador (referral partner). Staff generates
// a hosted onboarding link to SEND to the ambassador (ambassadors have no login),
// then refreshes payout readiness. Mirrors connect-onboard-judge.
//   action=link   -> create/reuse the Express account, return a hosted link
//   action=status -> refresh payouts_enabled from Stripe
// AUTH: Verify JWT = ON. Caller must be NMAO staff (same gate as pay-judges).
// POST { partner_id (required), action?, return_url? }
//   -> { ok, url? , payouts_enabled?, details_submitted? }
// Deploy: name = connect-onboard-partner, Verify JWT ON.
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
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const partnerId = String(body.partner_id || "").trim();
    if (!partnerId) return json({ ok: false, error: "partner_id is required." }, 400);
    const action = String(body.action || "link");
    const returnUrl = String(body.return_url || "").trim() || "https://league.nmao.us/";

    const { data: partner } = await svc.from("partners")
      .select("id, name, email, stripe_connect_account_id").eq("id", partnerId).maybeSingle();
    if (!partner) return json({ ok: false, error: "Partner not found." }, 404);

    let acct = (partner as any).stripe_connect_account_id as string | null;
    // Request transfers + card_payments (card_payments is never used; it just clears
    // Stripe's "transfers without card_payments" platform-approval gate) — same as judges.
    const caps = { transfers: { requested: true }, card_payments: { requested: true } };
    if (!acct) {
      const created = await stripe.accounts.create({
        type: "express",
        email: (partner as any).email || undefined,
        business_type: "individual",
        capabilities: caps,
        business_profile: { product_description: "NMAO Ambassador — referral partner receiving commission payouts." },
        metadata: { partner_id: partnerId },
      });
      acct = created.id;
      await svc.from("partners").update({ stripe_connect_account_id: acct }).eq("id", partnerId);
    } else {
      try { await stripe.accounts.update(acct, { capabilities: caps }); } catch (_e) { /* already set */ }
    }

    if (action === "status") {
      const a = await stripe.accounts.retrieve(acct!);
      const enabled = !!a.payouts_enabled && !!a.details_submitted;
      await svc.from("partners").update({ payouts_enabled: enabled }).eq("id", partnerId);
      return json({ ok: true, payouts_enabled: enabled, details_submitted: !!a.details_submitted });
    }

    const link = await stripe.accountLinks.create({ account: acct!, refresh_url: returnUrl, return_url: returnUrl, type: "account_onboarding" });
    return json({ ok: true, url: link.url });
  } catch (e: any) {
    console.error("connect-onboard-partner error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
