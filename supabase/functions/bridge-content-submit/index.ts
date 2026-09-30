// =====================================================================
// EDGE FUNCTION: bridge-content-submit  (Membership → Tournament bridge)
// A school submits content from the member-dashboard Growth Engine. The member
// side runs AI vision + hosts the media, signs an HS256 bridge token, and calls
// this. We verify the token + body integrity (jti idempotent) and insert a
// PENDING social_posts draft into NMAO's Mission Control queue, tagged to the
// promoted school. Nothing publishes — NMAO staff review/approve it.
//
// DEPLOY: name = bridge-content-submit, Verify JWT OFF (verifies the bridge token).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("TOURNAMENT_BRIDGE_SECRET")!;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const enc = new TextEncoder(); const dec = new TextDecoder();
function b64urlToBytes(s: string): Uint8Array { s = s.replace(/-/g, "+").replace(/_/g, "/"); const pad = s.length % 4; if (pad) s += "=".repeat(4 - pad); const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
function canon(v: any): string { if (v === null) return "null"; if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]"; if (typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"; return JSON.stringify(v); }
async function hmacKey() { return await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); }
async function verifyJwt(token: string): Promise<any | null> { const parts = token.split("."); if (parts.length !== 3) return null; const [h, p, s] = parts; let header: any, payload: any; try { header = JSON.parse(dec.decode(b64urlToBytes(h))); payload = JSON.parse(dec.decode(b64urlToBytes(p))); } catch { return null; } if (header.alg !== "HS256") return null; const ok = await crypto.subtle.verify("HMAC", await hmacKey(), b64urlToBytes(s), enc.encode(h + "." + p)); return ok ? payload : null; }
async function sha256hex(str: string): Promise<string> { const d = await crypto.subtle.digest("SHA-256", enc.encode(str)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const body = await req.json().catch(() => null) as any;
  if (!body || !body.token || !body.draft) return json({ ok: false, error: "Missing token/draft" }, 400);
  const { token, draft } = body;

  const payload = await verifyJwt(String(token));
  if (!payload) return json({ ok: false, error: "Invalid token signature" }, 401);
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== "nmao-membership" || payload.aud !== "nmao-tournament" || payload.action !== "content_submit") return json({ ok: false, error: "Token claims mismatch" }, 401);
  if (!payload.exp || payload.exp < now) return json({ ok: false, error: "Token expired" }, 401);
  if (!payload.jti || !payload.body_sha256) return json({ ok: false, error: "Token missing jti/body_sha256" }, 401);
  if ((await sha256hex(canon({ draft }))) !== payload.body_sha256) return json({ ok: false, error: "Body integrity check failed" }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: prior } = await svc.from("bridge_provisions").select("response").eq("jti", payload.jti).maybeSingle();
  if (prior) return json((prior as any).response);

  const isImage = draft.media_type === "image";
  const tSchool = String(draft.tournament_school_id || "") || null;
  const { data: post, error } = await svc.from("social_posts").insert({
    sort_order: 0, pillar: draft.pillar || "School Spotlight", title: String(draft.title || "School submission").slice(0, 160),
    format: isImage ? "Post" : "Reel",
    platforms: isImage ? ["Instagram"] : ["Instagram", "TikTok", "YouTube"],
    hook: "Straight from the mat.",
    caption: String(draft.caption || "").slice(0, 900), hashtags: String(draft.hashtags || "").slice(0, 400),
    media_note: String(draft.media_note || "Submitted by the school via the Growth Engine. Confirm the signed media release (parent/guardian for a minor) before publishing.").slice(0, 500),
    cta_url: draft.cta_url || null, media_url: draft.media_url || null,
    needs_consent: draft.needs_consent !== false, status: "pending",
    source_event: "growth_submit:" + payload.jti, promoted_school_id: tSchool,
  }).select("id").single();

  const response = error ? { ok: false, error: "Could not create draft." } : { ok: true, post_id: (post as any).id };
  try { await svc.from("bridge_provisions").insert({ jti: payload.jti, response }); } catch { /* best-effort idempotency */ }
  return json(response);
});
