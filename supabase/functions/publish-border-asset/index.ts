// =====================================================================
// EDGE FUNCTION: publish-border-asset   (Verify JWT = OFF — does its own auth)
//
// Lets a DESIGNER-role staffer (or their Claude, acting with a designer JWT)
// publish one Arena-border art file — a ring tier (ring_oracle_2) or a motif
// (candlestick) — directly into the public `badge-frames` bucket, and bumps a
// per-key version in `badge-frames/_manifest.json`. The Compete app reads that
// manifest to cache-bust each key (see app/lib/badgeFrames.ts frameElementUrl),
// so a re-upload goes LIVE with no code deploy.
//
// This is the ONE narrow capability the border illustrator's workflow needs:
// it can only write image files into badge-frames under a validated key — never
// the codebase, the database, or any other bucket. Gate = staff_can_uid('badges').
//
// POST { key, png_base64 }  (Authorization: Bearer <designer JWT>)
//   key        e.g. "ring_oracle_2" | "candlestick" | "coin_gold"
//   png_base64 the PNG file bytes, base64-encoded (send it already sized to spec:
//              ring tiers ~1200x1600, motifs ~512, transparent)
// -> { ok, key, version, url }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "badge-frames";
const MANIFEST = "_manifest.json";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB ceiling per asset

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Valid keys: a ring tier (ring_<name>_<n>) or a single-frame ring (ring_<name>)
// or a motif slug. Lowercase letters/digits/underscore, no leading underscore
// (so the manifest itself can't be overwritten as a "key").
const KEY_RE = /^[a-z][a-z0-9_]{1,48}$/;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  // ── auth: a signed-in staffer with the badges (designer) capability ──
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);
  const { data: cap } = await svc.rpc("staff_can_uid", { p_uid: uid, p_slice: "badges", p_level: "view" });
  if (!cap) return json({ ok: false, error: "Not authorized — publishing Arena-border art needs the Designer role." }, 403);

  // ── validate input ──
  const body = await req.json().catch(() => ({}));
  const key = String(body.key || "").trim();
  const b64 = String(body.png_base64 || "").replace(/^data:image\/png;base64,/, "").trim();
  if (!KEY_RE.test(key)) return json({ ok: false, error: "Invalid key. Use lowercase letters/digits/underscore, e.g. ring_oracle_2 or candlestick." }, 400);
  if (!b64) return json({ ok: false, error: "png_base64 required." }, 400);

  let bytes: Uint8Array;
  try { bytes = b64ToBytes(b64); } catch { return json({ ok: false, error: "png_base64 is not valid base64." }, 400); }
  if (bytes.length > MAX_BYTES) return json({ ok: false, error: `Image too large (${(bytes.length / 1048576).toFixed(1)} MB, max 8 MB).` }, 413);
  if (bytes.length < 8 || !PNG_SIG.every((b, i) => bytes[i] === b)) {
    return json({ ok: false, error: "File is not a PNG. Export a transparent PNG." }, 400);
  }

  // ── upload the art (overwrites the same key) ──
  const { error: upErr } = await svc.storage.from(BUCKET).upload(`${key}.png`, bytes, { contentType: "image/png", upsert: true });
  if (upErr) return json({ ok: false, error: "Upload failed: " + upErr.message }, 500);

  // ── bump the per-key version in the manifest (best-effort, never blocks the upload) ──
  const version = Date.now();
  let manifest: Record<string, number> = {};
  try {
    const dl = await svc.storage.from(BUCKET).download(MANIFEST);
    if (dl.data) manifest = JSON.parse(await dl.data.text());
  } catch { /* first publish — start fresh */ }
  manifest[key] = version;
  const { error: mErr } = await svc.storage.from(BUCKET).upload(
    MANIFEST,
    new Blob([JSON.stringify(manifest)], { type: "application/json" }),
    { contentType: "application/json", upsert: true, cacheControl: "0" },
  );
  if (mErr) console.error("publish-border-asset: manifest write failed:", mErr.message);

  const url = svc.storage.from(BUCKET).getPublicUrl(`${key}.png`).data.publicUrl + `?v=${version}`;
  return json({ ok: true, key, version, url, manifest_written: !mErr });
});
