// =====================================================================
// EDGE FUNCTION: growth-boost-admin
// Mission Control view of school boost requests (the paid local-ads queue).
// Schools request/pause/cancel a boost from their member dashboard (stored on
// their Membership school row); this staff-gated Tournament EF reads that queue
// and lets NMAO staff advance the status (requested → active → paused / declined).
//
// Reads/writes the Membership project via the service key already configured for
// the bridge EFs; enriches each row with the tier price (Tournament tiers table).
// Env: MEMBERSHIP_SUPABASE_URL, MEMBERSHIP_SERVICE_ROLE_KEY.
// Auth: Tournament staff with the Social role.
// POST { action:'list' } | { action:'set', member_school_id, status }
// DEPLOY: name = growth-boost-admin, Verify JWT OFF (does its own auth).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MEM_URL = Deno.env.get("MEMBERSHIP_SUPABASE_URL") || "";
const MEM_SERVICE = Deno.env.get("MEMBERSHIP_SERVICE_ROLE_KEY") || "";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const STATES = ["requested", "active", "paused", "declined", "cancelled"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const auth = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return json({ ok: false, error: "Invalid session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", u.user.id).maybeSingle();
  if (!staff) return json({ ok: false, error: "Staff only." }, 403);
  const { data: cap } = await svc.rpc("staff_can_uid", { p_uid: u.user.id, p_slice: "social", p_level: "full" });
  if (!cap) return json({ ok: false, error: "Not authorized — requires the Social role." }, 403);

  if (!MEM_URL || !MEM_SERVICE) return json({ ok: false, code: "not_configured", error: "Membership connection isn't configured." }, 200);
  const mem = createClient(MEM_URL, MEM_SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");

    if (action === "set") {
      const id = String(body.member_school_id || "").trim();
      const status = String(body.status || "").trim();
      if (!id || !STATES.includes(status)) return json({ ok: false, error: "member_school_id and a valid status are required." }, 400);
      const { error } = await mem.from("schools").update({ growth_boost_status: status }).eq("id", id);
      if (error) return json({ ok: false, error: error.message }, 200);
      return json({ ok: true });
    }

    // list
    const { data: rows, error } = await mem.from("schools")
      .select("id, name, growth_boost_tier, growth_boost_status, growth_boost_note, growth_boost_requested_at")
      .in("growth_boost_status", ["requested", "active", "paused"])
      .order("growth_boost_requested_at", { ascending: false });
    if (error) return json({ ok: false, error: "Couldn't load the boost queue." }, 200);

    const { data: tiers } = await svc.from("growth_boost_tiers").select("id, name, monthly_price_cents");
    const tierMap: Record<string, any> = {};
    (tiers || []).forEach((t: any) => { tierMap[t.id] = t; });

    const queue = (rows || []).map((r: any) => ({
      member_school_id: r.id, school: r.name,
      tier_id: r.growth_boost_tier,
      tier_name: tierMap[r.growth_boost_tier]?.name || r.growth_boost_tier || "—",
      monthly_price_cents: tierMap[r.growth_boost_tier]?.monthly_price_cents ?? null,
      status: r.growth_boost_status, note: r.growth_boost_note || "",
      requested_at: r.growth_boost_requested_at,
    }));
    return json({ ok: true, queue });
  } catch (e: any) {
    console.error("growth-boost-admin:", e?.message || e);
    return json({ ok: false, error: "Boost admin failed." }, 500);
  }
});
