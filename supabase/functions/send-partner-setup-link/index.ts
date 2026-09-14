// =====================================================================
// EDGE FUNCTION: send-partner-setup-link
// Emails an AMBASSADOR (partner) a scanner-safe password setup / sign-in link
// for the portal at amb.nmao.us/partner/set-password (token_hash verified in JS
// so email scanners can't burn the single-use token). Ensures a Tournament auth
// account for the partner and links it to public.partners.user_id.
//
// Mirrors send-school-setup-link. Two modes:
//   { partner_id } — internal/staff. Requires the service-role key in the
//                    Authorization header. Ensures + links the auth account,
//                    emails the link, and RETURNS setup_link.
//   { email }      — public (the amb.nmao.us "email me a link" button). Resolves
//                    the partner by email; ALWAYS returns a generic ok.
//
// Deploy: name = send-partner-setup-link, **Verify JWT OFF** (public email mode;
// partner_id mode is gated by the service-role key check).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), RESEND_API_KEY, EMAIL_FROM,
//      AMB_URL (default https://amb.nmao.us).
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") || "NMAO Tournament <noreply@nmao.us>";
const AMB = (Deno.env.get("AMB_URL") || "https://amb.nmao.us").replace(/\/$/, "");

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
      `<h2 style="margin:0 0 10px">Your NMAO Ambassador portal</h2>` +
      `<p>Hi ${esc(name) || "there"}, here's your sign-in link for the NMAO Ambassador portal.</p>` +
      `<p>Set your password to get your referral link, media kit, and referrals:</p>` +
      `<p><a href="${link}" style="display:inline-block;background:#C89B3C;color:#141210;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:10px">Set your password</a></p>` +
      `<p style="color:#888;font-size:12px">Or paste this into your browser:<br>${link}</p>` +
      `<p style="color:#888;font-size:12px">Single-use and expires soon. Request a fresh one from the sign-in page if it lapses.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject: "Your NMAO Ambassador portal — set your password", html }),
    });
    if (!r.ok) console.error("partner setup email failed", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e: any) { console.error("partner setup email threw", e?.message || e); return false; }
}

async function buildAndSend(svc: any, partner: any): Promise<{ ok: boolean; setup_link?: string | null; emailed?: boolean; error?: string }> {
  const email = String(partner.email || "").trim();
  if (!email) return { ok: false, error: "This ambassador has no email on file." };
  // Ensure a Tournament auth account exists for the ambassador, and link it.
  let authId = partner.user_id as string | null;
  if (!authId) {
    const { data: created } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: "partner" } });
    if (created?.user) authId = created.user.id; // if the email already has an auth user, resolved below from generateLink
  }
  const { data: linkData, error: lErr } = await svc.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${AMB}/partner/set-password` } });
  if (lErr) { console.error("partner generateLink", lErr); return { ok: false, error: "Could not generate the setup link." }; }
  if (!authId && (linkData as any)?.user?.id) authId = (linkData as any).user.id;
  if (authId && authId !== partner.user_id) await svc.from("partners").update({ user_id: authId }).eq("id", partner.id);
  const hashed = (linkData as any)?.properties?.hashed_token as string | undefined;
  const link = hashed
    ? `${AMB}/partner/set-password?token_hash=${encodeURIComponent(hashed)}&type=recovery`
    : ((linkData as any)?.properties?.action_link ?? null);
  const emailed = link ? await emailLink(email, partner.name, link) : false;
  return { ok: true, setup_link: link, emailed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const body = (await req.json().catch(() => null)) as any;
  if (!body) return json({ ok: false, error: "Bad body" }, 400);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const cols = "id, name, email, user_id";

  // Internal/staff mode: by partner_id, gated by the service-role key. Returns the link.
  if (body.partner_id) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (bearer !== SERVICE) return json({ ok: false, error: "Not authorized." }, 401);
    const { data: partner } = await svc.from("partners").select(cols).eq("id", body.partner_id).maybeSingle();
    if (!partner) return json({ ok: false, error: "Ambassador not found." }, 404);
    return json(await buildAndSend(svc, partner));
  }

  // Public mode: by email (the amb.nmao.us "email me a link" button). Generic response.
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "A valid email is required." }, 400);
  // `_` and `%` are LIKE wildcards and are legal in emails — escape before ilike so
  // e.g. "a_b@x.com" can't also match "aXb@x.com" and mail the wrong ambassador.
  const emailLike = email.replace(/[\\%_]/g, "\\$&");
  const { data: partner } = await svc.from("partners").select(cols).ilike("email", emailLike).maybeSingle();
  if (partner) { await buildAndSend(svc, partner); } // fire-and-forget; never reveal existence
  return json({ ok: true }); // always generic
});
