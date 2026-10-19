// =====================================================================
// EDGE FUNCTION: bridge-accreditation-audit  (Membership -> Tournament bridge, READ)
// Returns every Tournament school linked to a Membership school with its accreditation
// state, so the Membership-side reconciler (reconcile-accreditation) can detect cross-DB
// drift. Same HS256 bridge token as the other bridge fns (shared TOURNAMENT_BRIDGE_SECRET);
// body_sha256 integrity-checks canon({}) (no params). Read-only.
//
// DEPLOY: name = bridge-accreditation-audit, Verify JWT OFF (verifies the bridge token).
// POST { token }
//   -> { ok, count, schools: [{ member_school_id, tournament_school_id, accredited, payout_tier, payout_tier_override }] }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("TOURNAMENT_BRIDGE_SECRET")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const enc = new TextEncoder(); const dec = new TextDecoder();
function b64urlToBytes(s: string): Uint8Array { s = s.replace(/-/g, "+").replace(/_/g, "/"); const pad = s.length % 4; if (pad) s += "=".repeat(4 - pad); const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
function canon(v: any): string { if (v === null) return "null"; if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]"; if (typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"; return JSON.stringify(v); }
async function hmacKey() { return await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); }
async function verifyJwt(token: string): Promise<any | null> { const parts = token.split("."); if (parts.length !== 3) return null; const [h, p, s] = parts; let payload: any, header: any; try { header = JSON.parse(dec.decode(b64urlToBytes(h))); payload = JSON.parse(dec.decode(b64urlToBytes(p))); } catch { return null; } if (header.alg !== "HS256") return null; const ok = await crypto.subtle.verify("HMAC", await hmacKey(), b64urlToBytes(s), enc.encode(h + "." + p)); return ok ? payload : null; }
async function sha256hex(str: string): Promise<string> { const d = await crypto.subtle.digest("SHA-256", enc.encode(str)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const token = body?.token;
  if (!token) return json({ ok: false, error: "Missing token" }, 400);

  const payload = await verifyJwt(token);
  const now = Math.floor(Date.now() / 1000);
  if (!payload) return json({ ok: false, error: "Invalid token signature" }, 401);
  if (payload.iss !== "nmao-membership" || payload.aud !== "nmao-tournament" || payload.action !== "accreditation_audit") return json({ ok: false, error: "Token claims mismatch" }, 401);
  if (!payload.exp || payload.exp < now) return json({ ok: false, error: "Token expired" }, 401);
  if (!payload.body_sha256 || payload.body_sha256 !== await sha256hex(canon({}))) return json({ ok: false, error: "Body integrity check failed" }, 401);

  try {
    const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const { data, error } = await svc.from("schools")
      .select("id, external_member_school_id, accredited, payout_tier, payout_tier_override")
      .not("external_member_school_id", "is", null);
    if (error) return json({ ok: false, error: error.message }, 500);
    const schools = (data || []).map((r: any) => ({
      member_school_id: String(r.external_member_school_id),
      tournament_school_id: r.id,
      accredited: r.accredited === true,
      payout_tier: r.payout_tier,
      payout_tier_override: r.payout_tier_override,
    }));
    return json({ ok: true, count: schools.length, schools });
  } catch (e: any) {
    console.error("bridge-accreditation-audit:", e?.message || e);
    return json({ ok: false, error: "Audit query failed." }, 500);
  }
});
