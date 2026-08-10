// =====================================================================
// EDGE FUNCTION: connect-status  (School Portal — Payouts)
// Reports the owner school's Stripe Connect status so the UI can show
// "connect bank" vs "setup incomplete" vs "payouts enabled".
//
// AUTH: Verify JWT = ON. Requires env: STRIPE_SECRET_KEY.
// POST {} -> { ok, connected, payouts_enabled, details_submitted, disabled_reason }
// Deploy (editor-safe, no _shared): name = connect-status, Verify JWT ON.
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
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const { data: school } = await svc.from("schools").select("stripe_connect_account_id").eq("auth_user_id", uid).maybeSingle();
    if (!school) return json({ ok: false, error: "No school for this account." }, 403);
    const acct = (school as any).stripe_connect_account_id as string | null;
    if (!acct) return json({ ok: true, connected: false, payouts_enabled: false, details_submitted: false });
    if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ ok: true, connected: true, payouts_enabled: false, details_submitted: false, disabled_reason: "stripe_not_configured" });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { httpClient: Stripe.createFetchHttpClient() });
    const a = await stripe.accounts.retrieve(acct);
    return json({
      ok: true, connected: true,
      payouts_enabled: !!a.payouts_enabled,
      details_submitted: !!a.details_submitted,
      disabled_reason: a.requirements?.disabled_reason ?? null,
    });
  } catch (e: any) {
    console.error("connect-status error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
