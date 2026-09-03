// =====================================================================
// EDGE FUNCTION: list-partners  (§AMBASSADOR — Phase 1)
// List ambassadors + their active attributed schools, for Mission Control.
// AUTH: Verify JWT = ON. Caller must be NMAO staff (same gate as pay-judges).
// POST {} -> { ok, partners: [{ ...partner, schools:[...], referral_links }] }
// Deploy: name = list-partners, Verify JWT ON.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
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
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const { data: partners } = await svc.from("partners")
      .select("id, name, email, slug, tier, status, payouts_enabled, created_at")
      .order("created_at", { ascending: false });

    const ids = (partners || []).map((p: any) => p.id);
    let attrs: any[] = [];
    if (ids.length) {
      const r = await svc.from("partner_school_attributions")
        .select("partner_id, member_school_id, school_name, attributed_at")
        .eq("active", true).in("partner_id", ids);
      attrs = r.data || [];
    }
    const byP: Record<string, any[]> = {};
    for (const a of attrs) (byP[a.partner_id] = byP[a.partner_id] || []).push(a);

    // earnings summary (competitor $1/entry override) per partner
    const { data: pe } = await svc.from("partner_event_payouts").select("partner_id, amount_cents, status");
    const earn: Record<string, { paid: number; pending: number }> = {};
    for (const r of (pe || [])) {
      const e = earn[(r as any).partner_id] = earn[(r as any).partner_id] || { paid: 0, pending: 0 };
      if ((r as any).status === "paid") e.paid += (r as any).amount_cents || 0;
      else if ((r as any).status === "pending") e.pending += (r as any).amount_cents || 0;
    }

    // school override (10% of collected platform fee) earnings per partner
    const { data: ps } = await svc.from("partner_school_payouts").select("partner_id, amount_cents, status");
    const searn: Record<string, { paid: number; pending: number }> = {};
    for (const r of (ps || [])) {
      const e = searn[(r as any).partner_id] = searn[(r as any).partner_id] || { paid: 0, pending: 0 };
      if ((r as any).status === "paid") e.paid += (r as any).amount_cents || 0;
      else if ((r as any).status === "pending") e.pending += (r as any).amount_cents || 0;
    }

    const out = (partners || []).map((p: any) => ({
      ...p,
      schools: byP[p.id] || [],
      earnings: earn[p.id] || { paid: 0, pending: 0 },
      school_earnings: searn[p.id] || { paid: 0, pending: 0 },
      referral_links: {
        member:     "https://join.nmao.us/?p=" + p.slug,
        tournament: "https://league.nmao.us/?p=" + p.slug,
      },
    }));
    return json({ ok: true, partners: out });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
