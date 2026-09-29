// =====================================================================
// EDGE FUNCTION: bridge-school-status  (Membership -> Tournament bridge, READ)
// Returns a small status summary for one Tournament school: athletes joined,
// the next tournament round, and the most recent payout. Verifies the same
// HS256 bridge token as bridge-provision-school (shared TOURNAMENT_BRIDGE_SECRET),
// integrity-checks the body via body_sha256. Read-only.
//
// DEPLOY: name = bridge-school-status, Verify JWT OFF (verifies the bridge token).
// POST { token, school_id }  (school_id = tournament_school_id)
//   -> { ok, joined, next_round:{seq,closes_at}|null, last_payout:{amount_cents,status}|null }
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
  const token = body?.token; const schoolId = String(body?.school_id || "");
  if (!token || !schoolId) return json({ ok: false, error: "Missing token/school_id" }, 400);

  const payload = await verifyJwt(token);
  const now = Math.floor(Date.now() / 1000);
  if (!payload) return json({ ok: false, error: "Invalid token signature" }, 401);
  if (payload.iss !== "nmao-membership" || payload.aud !== "nmao-tournament" || payload.action !== "school_status") return json({ ok: false, error: "Token claims mismatch" }, 401);
  if (!payload.exp || payload.exp < now) return json({ ok: false, error: "Token expired" }, 401);
  if (!payload.body_sha256 || payload.body_sha256 !== await sha256hex(canon({ school_id: schoolId }))) return json({ ok: false, error: "Body integrity check failed" }, 401);

  try {
    const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const [{ count: joined }, roundRes, payoutRes] = await Promise.all([
      svc.from("competitors").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active").or("is_test.is.null,is_test.eq.false"),
      svc.from("rounds").select("seq, closes_at").lt("seq", 900).gt("closes_at", new Date().toISOString()).order("closes_at", { ascending: true }).limit(1).maybeSingle(),
      svc.from("school_payouts").select("amount_cents, status, created_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const nr = (roundRes as any)?.data;
    const lp = (payoutRes as any)?.data;
    return json({
      ok: true,
      joined: joined ?? 0,
      next_round: nr ? { seq: nr.seq, closes_at: nr.closes_at } : null,
      last_payout: lp ? { amount_cents: lp.amount_cents, status: lp.status } : null,
    });
  } catch (e: any) {
    console.error("bridge-school-status:", e?.message || e);
    return json({ ok: false, error: "Status query failed." }, 500);
  }
});
