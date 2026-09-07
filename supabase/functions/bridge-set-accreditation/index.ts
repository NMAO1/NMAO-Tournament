// =====================================================================
// EDGE FUNCTION: bridge-set-accreditation  (Membership → Tournament bridge)
// Syncs a school's ACCREDITED flag from the Membership Platform. Verifies the
// same custom HS256 bridge token as bridge-provision-school (shared secret
// TOURNAMENT_BRIDGE_SECRET), integrity-checks the body via body_sha256, then sets
// schools.accredited for the school whose external_member_school_id matches. The
// schools payout-tier trigger recomputes payout_tier automatically (15/25/35).
// Idempotent — setting the same value is a no-op. No school match = harmless ok.
//
// DEPLOY: name = bridge-set-accreditation, **Verify JWT OFF** (machine-to-machine;
// it verifies the custom bridge token itself — no Supabase auth header).
// POST { token, member_school_id, accredited }  ->  { ok, matched, accredited, payout_tier }
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
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4; if (pad) s += "=".repeat(4 - pad);
  const bin = atob(s); const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
// Recursive canonicalizer — MUST match the Membership minter byte-for-byte.
function canon(v: any): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
async function hmacKey() { return await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); }
async function verifyJwt(token: string): Promise<any | null> {
  const parts = token.split("."); if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header: any, payload: any;
  try { header = JSON.parse(dec.decode(b64urlToBytes(h))); payload = JSON.parse(dec.decode(b64urlToBytes(p))); } catch { return null; }
  if (header.alg !== "HS256") return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), b64urlToBytes(s), enc.encode(h + "." + p));
  return ok ? payload : null;
}
async function sha256hex(str: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== "object") return json({ ok: false, error: "Bad body" }, 400);
  const { token } = body;
  const memberSchoolId = String(body.member_school_id || "").trim();
  const accredited = body.accredited;
  if (!token || !memberSchoolId || typeof accredited !== "boolean") {
    return json({ ok: false, error: "Missing token/member_school_id/accredited" }, 400);
  }

  // ---- verify the bridge token ----
  const payload = await verifyJwt(String(token));
  if (!payload) return json({ ok: false, error: "Invalid token signature" }, 401);
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== "nmao-membership" || payload.aud !== "nmao-tournament" || payload.action !== "set_accreditation") {
    return json({ ok: false, error: "Token claims mismatch" }, 401);
  }
  if (!payload.exp || payload.exp < now) return json({ ok: false, error: "Token expired" }, 401);
  if (!payload.body_sha256) return json({ ok: false, error: "Token missing body_sha256" }, 401);
  const computed = await sha256hex(canon({ member_school_id: memberSchoolId, accredited }));
  if (computed !== payload.body_sha256) return json({ ok: false, error: "Body integrity check failed" }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  // Set accredited on the matching tournament school; the trigger recomputes payout_tier.
  const { data: rows, error } = await svc.from("schools")
    .update({ accredited }).eq("external_member_school_id", memberSchoolId)
    .select("id, payout_tier");
  if (error) return json({ ok: false, error: error.message }, 500);
  const matched = (rows || []).length;
  const payout_tier = matched ? (rows as any[])[0].payout_tier : null;
  return json({ ok: true, matched, accredited, payout_tier });
});
