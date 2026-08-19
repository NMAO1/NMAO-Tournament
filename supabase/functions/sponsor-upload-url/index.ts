// =====================================================================
// EDGE FUNCTION: sponsor-upload-url  (PUBLIC — Verify JWT = OFF)
// Issues a short-lived signed UPLOAD url so an anonymous sponsor applicant can
// upload their logo / ad video / product image directly to storage (the buckets
// are staff-write only, so anon can't upload without this). Returns the token +
// the eventual public URL. The client uploads via storage.uploadToSignedUrl().
// POST { kind: 'video'|'logo'|'product', ext?: string } -> { ok, bucket, path, token, publicUrl }
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  try {
    const { kind, ext } = await req.json().catch(() => ({}));
    const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    // per-IP rate limit FIRST (public endpoint) — cap volume regardless of payload.
    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const { data: rateOk } = await svc.rpc("rate_ok", { p_bucket: "sponsor_upload", p_key: ip, p_max: 40, p_window_secs: 600 });
    if (rateOk === false) return json({ ok: false, error: "Too many uploads — please try again shortly." }, 429);
    if (!["video", "logo", "product"].includes(String(kind))) return json({ ok: false, error: "bad kind" }, 400);
    const bucket = kind === "video" ? "sponsor-videos" : "sponsor-assets";
    const clean = String(ext || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `signup/${crypto.randomUUID()}.${clean}`;
    const { data, error } = await svc.storage.from(bucket).createSignedUploadUrl(path);
    if (error) return json({ ok: false, error: error.message }, 500);
    const publicUrl = svc.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return json({ ok: true, bucket, path, token: data.token, publicUrl });
  } catch (e) {
    return json({ ok: false, error: (e as Error)?.message || "server_error" }, 500);
  }
});
