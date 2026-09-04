// =====================================================================
// EDGE FUNCTION: partner-dashboard  (§AMBASSADOR — partner-facing v1)
// Read-only self-serve dashboard for an ambassador. Auth = their private
// dashboard_token (partner.html?t=<token>) — no login, no PII beyond their own
// school names + earnings, no money movement. Rotating the token revokes a link.
// AUTH: Verify JWT = OFF (public, token-gated). Deploy with --no-verify-jwt.
// POST { token } -> { ok, partner:{name,tier,status,payouts_enabled,slug},
//                     referral_links, schools[], earnings, school_earnings }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    if (token.length < 20) return json({ ok: false, error: "Invalid link." }, 400);

    const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const { data: p } = await svc.from("partners")
      .select("id, name, slug, tier, status, payouts_enabled")
      .eq("dashboard_token", token).maybeSingle();
    if (!p) return json({ ok: false, error: "This dashboard link is invalid or has been reset." }, 404);

    const { data: attrs } = await svc.from("partner_school_attributions")
      .select("member_school_id, school_name, attributed_at").eq("partner_id", p.id).eq("active", true)
      .order("attributed_at", { ascending: false });

    // competitor $1/entry override
    const { data: pe } = await svc.from("partner_event_payouts").select("amount_cents, status").eq("partner_id", p.id);
    const earn = { paid: 0, pending: 0 };
    for (const r of (pe || [])) { const c = (r as any).amount_cents || 0; if ((r as any).status === "paid") earn.paid += c; else if ((r as any).status === "pending") earn.pending += c; }

    // 10% school override
    const { data: ps } = await svc.from("partner_school_payouts").select("amount_cents, status").eq("partner_id", p.id);
    const searn = { paid: 0, pending: 0 };
    for (const r of (ps || [])) { const c = (r as any).amount_cents || 0; if ((r as any).status === "paid") searn.paid += c; else if ((r as any).status === "pending") searn.pending += c; }

    return json({
      ok: true,
      partner: { name: p.name, tier: p.tier, status: p.status, payouts_enabled: p.payouts_enabled, slug: p.slug },
      referral_links: { member: "https://app.nmao.us/?p=" + p.slug, tournament: "https://league.nmao.us/?p=" + p.slug },
      schools: attrs || [],
      earnings: earn,
      school_earnings: searn,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
