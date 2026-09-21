// =====================================================================
// EDGE FUNCTION: sync-directory-tournament-stats
// Directory flywheel (Part A). Reads per-school tournament signals from the
// Tournament DB (directory_school_stats RPC) and writes them onto the matching
// Membership directory_listings so each listing can show live league activity
// ("N athletes compete via NMAO", "Active this season"). Listings are matched by
// their linked school_id when set, else by normalized name (+ state when both
// have one). Every listing is reset first, so stale stats never linger.
//
// AUTH: Verify JWT = OFF (machine-to-machine). Gated by the shared cron secret
// posted as x-cron-secret (Vault 'tournament_cron_secret' + function CRON_SECRET),
// same as the other tournament crons.
// Requires env: CRON_SECRET, MEMBERSHIP_SUPABASE_URL, MEMBERSHIP_SERVICE_ROLE_KEY.
// POST (x-cron-secret header) -> { ok, schools, matched, updated }
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const clean = (s?: string | null) => (s || "").trim().replace(/^["']|["']$/g, "");

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  if (clean(req.headers.get("x-cron-secret")) !== clean(Deno.env.get("CRON_SECRET"))) return json({ ok: false, error: "unauthorized" }, 401);

  // Strip ALL whitespace — a stored secret can carry an embedded newline, which
  // is an invalid HTTP header value when the client sends it as the auth token.
  const MU = clean(Deno.env.get("MEMBERSHIP_SUPABASE_URL")).replace(/\s+/g, "");
  const MK = clean(Deno.env.get("MEMBERSHIP_SERVICE_ROLE_KEY")).replace(/\s+/g, "");
  if (!MU || !MK) return json({ ok: false, error: "Membership DB not configured." }, 500);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const mem = createClient(MU, MK, { auth: { persistSession: false } });

  try {
    // 1. Tournament signals per school.
    const { data: stats, error: sErr } = await svc.rpc("directory_school_stats");
    if (sErr) return json({ ok: false, error: sErr.message }, 500);
    const schools = ((stats ?? []) as any[]).filter((s) => s.competitors > 0 || s.season_active);

    // 2. All directory listings (for matching).
    const { data: listings, error: lErr } = await mem.from("directory_listings")
      .select("id, name, state, school_id").is("removed_at", null);
    if (lErr) return json({ ok: false, error: lErr.message }, 500);
    const byId = new Map<string, any>();
    const byName = new Map<string, any[]>();
    for (const l of (listings ?? []) as any[]) {
      if (l.school_id) byId.set(String(l.school_id), l);
      const k = norm(l.name);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(l);
    }

    // 3. Reset all listings, then set matched.
    await mem.from("directory_listings").update({ tournament_competitors: 0, tournament_active: false, tournament_medals: 0 }).not("id", "is", null);

    let matched = 0, updated = 0;
    for (const s of schools) {
      // Prefer the linked listing (claimed → school_id = external_member_school_id).
      let listing = s.external_member_school_id ? byId.get(String(s.external_member_school_id)) : null;
      if (!listing) {
        const cands = byName.get(norm(s.name)) || [];
        if (cands.length === 1) listing = cands[0];
        else if (cands.length > 1 && s.state) {
          const byState = cands.filter((c) => (c.state || "").toUpperCase() === String(s.state).toUpperCase());
          if (byState.length === 1) listing = byState[0];
        }
      }
      if (!listing) continue;
      matched++;
      const { error: uErr } = await mem.from("directory_listings")
        .update({ tournament_competitors: s.competitors, tournament_active: !!s.season_active, tournament_medals: s.medals || 0 })
        .eq("id", listing.id);
      if (!uErr) updated++;
    }

    return json({ ok: true, schools: schools.length, matched, updated });
  } catch (e: any) {
    console.error("sync-directory-tournament-stats error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
