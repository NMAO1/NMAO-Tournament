// =====================================================================
// EDGE FUNCTION: geocode-school  (School Portal — Settings)
// Geocodes the caller's own school address to lat/lng (via OpenStreetMap
// Nominatim — free, no API key) so the geo-location radius can match on real
// distances between schools. Called by the owner after saving their address.
//
// AUTH: Verify JWT = ON. Caller must own a school (schools.auth_user_id).
// POST {} -> { ok, lat, lng } | { ok:true, geocoded:false } | { ok:false, error }
// Deploy (editor-safe, no _shared): name = geocode-school, Verify JWT ON.
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
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const { data: school } = await svc.from("schools").select("id, address, country").eq("auth_user_id", uid).maybeSingle();
    if (!school) return json({ ok: false, error: "No school for this account." }, 403);

    const a = ((school as any).address ?? {}) as Record<string, string>;
    const parts = [a.line1, a.city, a.state, a.postal, a.country ?? (school as any).country ?? "US"].filter(Boolean);
    if (!parts.length) return json({ ok: true, geocoded: false, reason: "No address to geocode." });

    const q = encodeURIComponent(parts.join(", "));
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "User-Agent": "NMAO-Tournament/1.0 (schools geocoding)", "Accept": "application/json" },
    });
    if (!res.ok) return json({ ok: true, geocoded: false, reason: `Geocoder returned ${res.status}` });
    const hits = await res.json().catch(() => []);
    if (!Array.isArray(hits) || !hits.length) return json({ ok: true, geocoded: false, reason: "Address not found." });

    const lat = Number(hits[0].lat), lng = Number(hits[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ ok: true, geocoded: false, reason: "Bad coordinates." });

    await svc.from("schools").update({ lat, lng }).eq("id", (school as any).id);
    return json({ ok: true, geocoded: true, lat, lng });
  } catch (e: any) {
    console.error("geocode-school error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
