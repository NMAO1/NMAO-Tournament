// =====================================================================
// EDGE FUNCTION: connect-onboard  (School Portal — Payouts / "add bank")
// Creates (or reuses) a Stripe Connect STANDARD account for the owner's school
// and returns a Stripe-hosted onboarding link. STANDARD = the school bears its
// own loss liability (negative balances / refunds / disputes), not the platform.
// The owner enters bank details on STRIPE'S page — our app never sees them.
//
// AUTH: Verify JWT = ON. Caller must own a school.
// Requires env: STRIPE_SECRET_KEY.
// POST { return_url } -> { ok, url }
// Deploy (editor-safe, no _shared): name = connect-onboard, Verify JWT ON.
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
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ ok: false, error: "Stripe not configured (STRIPE_SECRET_KEY missing)." }, 500);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { httpClient: Stripe.createFetchHttpClient() });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const returnUrl = String(body.return_url || "").trim() || "https://example.com/school";

    const { data: school } = await svc.from("schools")
      .select("id, name, contact_email, country, stripe_connect_account_id").eq("auth_user_id", uid).maybeSingle();
    if (!school) return json({ ok: false, error: "No school for this account." }, 403);

    let acct = (school as any).stripe_connect_account_id as string | null;
    if (!acct) {
      // STANDARD account → the school (connected account) is liable for its own
      // negative balances / refunds / disputes, NOT the platform.
      const created = await stripe.accounts.create({
        type: "standard",
        email: (school as any).contact_email || undefined,
        metadata: { school_id: (school as any).id, school_name: (school as any).name },
      });
      acct = created.id;
      await svc.from("schools").update({ stripe_connect_account_id: acct }).eq("id", (school as any).id);
    }

    const link = await stripe.accountLinks.create({
      account: acct!,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return json({ ok: true, url: link.url });
  } catch (e: any) {
    console.error("connect-onboard error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
