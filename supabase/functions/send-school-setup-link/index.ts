// =====================================================================
// EDGE FUNCTION: send-school-setup-link
// Emails a school OWNER a scanner-safe password setup / sign-in link.
// The link goes straight to school.nmao.us/school/set-password carrying a
// token_hash which the page verifies in JS (email scanners can't burn it).
//
// Two modes:
//   { school_id }  — internal/staff. Requires the service-role key in the
//                    Authorization header. Ensures the owner's auth account,
//                    links it, emails the link, and RETURNS setup_link.
//   { email }      — public (the school login "email me a link" button).
//                    Resolves the school by contact_email and, if found, sends.
//                    ALWAYS returns a generic ok (never reveals existence).
//
// Deploy: name = send-school-setup-link, **Verify JWT OFF** (public email mode;
// school_id mode is gated by the service-role key check).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), RESEND_API_KEY, EMAIL_FROM,
//      SCHOOL_URL (default https://school.nmao.us).
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") || "NMAO Tournament <noreply@nmao.us>";
const SCHOOL = (Deno.env.get("SCHOOL_URL") || "https://school.nmao.us").replace(/\/$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[<>&]/g, "");

async function emailLink(to: string, name: string, link: string): Promise<boolean> {
  if (!RESEND || !link) return false;
  try {
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#222">` +
      `<h2 style="margin:0 0 10px">Your NMAO school portal</h2>` +
      `<p>Hi ${esc(name) || "there"}, here's your sign-in link for the NMAO Tournament school portal.</p>` +
      `<p>Set your password to manage your roster, ranks, and payouts:</p>` +
      `<p><a href="${link}" style="display:inline-block;background:#C89B3C;color:#141210;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:10px">Set your password</a></p>` +
      `<p style="color:#888;font-size:12px">Or paste this into your browser:<br>${link}</p>` +
      `<p style="color:#888;font-size:12px">Single-use and expires soon. Request a fresh one from the sign-in page if it lapses.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject: "Your NMAO school portal — set your password", html }),
    });
    if (!r.ok) console.error("school setup email failed", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e: any) { console.error("school setup email threw", e?.message || e); return false; }
}

async function buildAndSend(svc: any, school: any): Promise<{ ok: boolean; setup_link?: string | null; emailed?: boolean; error?: string }> {
  const email = String(school.contact_email || "").trim();
  if (!email) return { ok: false, error: "This school has no owner email on file." };
  // Ensure a Tournament auth account exists for the owner, and link it.
  let authId = school.auth_user_id as string | null;
  if (!authId) {
    const { data: created } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: "school_owner" } });
    if (created?.user) { authId = created.user.id; await svc.from("schools").update({ auth_user_id: authId }).eq("id", school.id); }
  }
  const { data: linkData, error: lErr } = await svc.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${SCHOOL}/school/set-password` } });
  if (lErr) { console.error("school generateLink", lErr); return { ok: false, error: "Could not generate the setup link." }; }
  const hashed = (linkData as any)?.properties?.hashed_token as string | undefined;
  const link = hashed
    ? `${SCHOOL}/school/set-password?token_hash=${encodeURIComponent(hashed)}&type=recovery`
    : ((linkData as any)?.properties?.action_link ?? null);
  const emailed = link ? await emailLink(email, school.contact_name || school.name, link) : false;
  return { ok: true, setup_link: link, emailed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const body = (await req.json().catch(() => null)) as any;
  if (!body) return json({ ok: false, error: "Bad body" }, 400);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const cols = "id, name, contact_email, contact_name, auth_user_id";

  // Internal/staff mode: by school_id, gated by the service-role key. Returns the link.
  if (body.school_id) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (bearer !== SERVICE) return json({ ok: false, error: "Not authorized." }, 401);
    const { data: school } = await svc.from("schools").select(cols).eq("id", body.school_id).maybeSingle();
    if (!school) return json({ ok: false, error: "School not found." }, 404);
    return json(await buildAndSend(svc, school));
  }

  // Public mode: by email (the school login "email me a link" button). Generic response.
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "A valid email is required." }, 400);
  const { data: school } = await svc.from("schools").select(cols).ilike("contact_email", email).maybeSingle();
  if (school) { await buildAndSend(svc, school); } // fire-and-forget; never reveal existence
  return json({ ok: true }); // always generic
});
