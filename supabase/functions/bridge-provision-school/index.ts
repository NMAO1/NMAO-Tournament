// =====================================================================
// EDGE FUNCTION: bridge-provision-school  (Membership → Tournament bridge)
// One-click, FREE school provision. Verifies a custom HS256 bridge token
// (shared secret TOURNAMENT_BRIDGE_SECRET), integrity-checks the POST body via
// body_sha256, is idempotent per jti, creates/links the Tournament school
// (owner = member email if that auth user exists), and seeds the roster as
// PENDING athletes (rank UNSET — the school owner assigns it). Returns a
// per-athlete opaque invite URL. Nothing is charged/committed here; a guardian
// later redeems each invite (consent + season + payment).
//
// DEPLOY: name = bridge-provision-school, **Verify JWT OFF** (machine-to-machine;
// it verifies the custom bridge token itself — no Supabase auth header).
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("TOURNAMENT_BRIDGE_SECRET")!;
const INVITE_BASE = "https://compete.nmao.us/invite";
const INVITE_TTL_DAYS = 30;

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
// Recursive canonicalizer — MUST match the Membership minter byte-for-byte:
// object keys sorted at every level, arrays in order, null preserved, minimal
// separators, UTF-8. Proven against a shared test vector (ab7b6bc8…56b7).
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
function opaqueToken(): string {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== "object") return json({ ok: false, error: "Bad body" }, 400);
  const { token, school, roster } = body;
  if (!token || !school || !Array.isArray(roster)) return json({ ok: false, error: "Missing token/school/roster" }, 400);

  // ---- verify the bridge token ----
  const payload = await verifyJwt(String(token));
  if (!payload) return json({ ok: false, error: "Invalid token signature" }, 401);
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== "nmao-membership" || payload.aud !== "nmao-tournament" || payload.action !== "provision_school") return json({ ok: false, error: "Token claims mismatch" }, 401);
  if (!payload.exp || payload.exp < now) return json({ ok: false, error: "Token expired" }, 401);
  if (!payload.jti) return json({ ok: false, error: "Token missing jti" }, 401);
  if (!payload.body_sha256) return json({ ok: false, error: "Token missing body_sha256" }, 401);
  const computed = await sha256hex(canon({ school, roster }));
  if (computed !== payload.body_sha256) return json({ ok: false, error: "Body integrity check failed" }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  // ---- idempotency: a replayed jti returns the exact prior response ----
  const { data: prior } = await svc.from("bridge_provisions").select("response").eq("jti", payload.jti).maybeSingle();
  if (prior) return json((prior as any).response);

  const extSchool = String(school.external_member_school_id || "").trim();
  if (!extSchool || !school.name) return json({ ok: false, error: "School missing id/name" }, 400);

  // resolve owner auth user (reuse existing Tournament login if present)
  let ownerAuthId: string | null = null;
  if (school.owner_email) {
    const { data: uid } = await svc.rpc("bridge_auth_uid_by_email", { p_email: String(school.owner_email) });
    ownerAuthId = (uid as any) || null;
  }

  // ---- create/link school ----
  let tournamentSchoolId: string, created = false, ownerLinked = false;
  const { data: existSchool } = await svc.from("schools").select("id, auth_user_id").eq("external_member_school_id", extSchool).maybeSingle();
  if (existSchool) {
    tournamentSchoolId = (existSchool as any).id;
    const upd: any = { name: school.name };
    if (ownerAuthId && !(existSchool as any).auth_user_id) { upd.auth_user_id = ownerAuthId; ownerLinked = true; }
    else if ((existSchool as any).auth_user_id) ownerLinked = true;
    await svc.from("schools").update(upd).eq("id", tournamentSchoolId);
  } else {
    const ins: any = { name: school.name, external_member_school_id: extSchool };
    if (ownerAuthId) { ins.auth_user_id = ownerAuthId; ownerLinked = true; }
    const { data: newSchool, error: sErr } = await svc.from("schools").insert(ins).select("id").single();
    if (sErr || !newSchool) return json({ ok: false, error: "Could not create school" }, 500);
    tournamentSchoolId = (newSchool as any).id; created = true;
  }

  // ---- stamp owner contact + auto-email a scanner-safe setup/sign-in link ----
  if (school.owner_email) {
    try {
      const upd: any = { contact_email: String(school.owner_email) };
      if (school.owner_name) upd.contact_name = String(school.owner_name);
      await svc.from("schools").update(upd).eq("id", tournamentSchoolId);
      await fetch(`${URL_}/functions/v1/send-school-setup-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
        body: JSON.stringify({ school_id: tournamentSchoolId }),
      });
    } catch (e) { console.error("school owner setup-link (non-fatal)", (e as Error).message); }
  }

  // ---- seed roster as PENDING athletes (rank UNSET) ----
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000).toISOString();
  let seeded = 0, already = 0;
  const invites: any[] = [];
  for (const a of roster) {
    const extStu = String(a.external_member_student_id || "").trim();
    if (!extStu || !a.first_name || !a.last_name) continue;
    const { data: existC } = await svc.from("competitors").select("id").eq("external_member_student_id", extStu).maybeSingle();
    if (existC) { already++; continue; } // already a live competitor
    const { data: existP } = await svc.from("bridge_pending_athletes").select("invite_token").eq("school_id", tournamentSchoolId).eq("external_member_student_id", extStu).maybeSingle();
    if (existP) {
      already++;
      invites.push({ external_member_student_id: extStu, invite_url: `${INVITE_BASE}?t=${(existP as any).invite_token}`, expires_at: expiresAt });
      continue;
    }
    const tok = opaqueToken();
    const { error: pErr } = await svc.from("bridge_pending_athletes").insert({
      school_id: tournamentSchoolId, external_member_student_id: extStu,
      first_name: String(a.first_name).trim(), last_name: String(a.last_name).trim(),
      email: a.email ? String(a.email).trim() : null,
      dob: a.dob || null, belt_name: a.belt_name ? String(a.belt_name).trim() : null,
      invite_token: tok, status: "pending", expires_at: expiresAt,
    });
    if (pErr) continue;
    seeded++;
    invites.push({ external_member_student_id: extStu, invite_url: `${INVITE_BASE}?t=${tok}`, expires_at: expiresAt });
  }

  const response = { ok: true, school: { tournament_school_id: tournamentSchoolId, created, owner_linked: ownerLinked }, athletes: { seeded, already, invites } };
  await svc.from("bridge_provisions").insert({ jti: payload.jti, external_member_school_id: extSchool, response });
  return json(response);
});
