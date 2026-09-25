// =====================================================================
// EDGE FUNCTION: register-school
// Self-serve OFFICIAL signup for the join.nmao.us form — HARDENED against
// fake/spam schools (approve-only model; see migration 20260924170000).
//
// Requires: school name, owner/contact name, email, PHONE, and a structured
// US shipping address (line1, city, state, ZIP) — the address medals actually
// ship to. The address is structurally validated (address_valid), and the
// school is created EMAIL-UNVERIFIED with a confirm token. We email a
// confirmation link (verify-school-email); the password-setup link is DEFERRED
// until the email is confirmed, so a bad/typo email never gets an account.
// Staff review + OK/Flag/Remove happens in Mission Control (schools.html).
//
// DEPLOY: name = register-school, **Verify JWT OFF** (public form).
//   supabase functions deploy register-school --no-verify-jwt --project-ref oxzuavpyoetchwebdejp
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), RESEND_API_KEY (optional),
//      EMAIL_FROM (optional), LEADS_NOTIFY_EMAIL (optional; default support@nmao.us).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") || "NMAO Tournament <noreply@nmao.us>";
const NOTIFY = Deno.env.get("LEADS_NOTIFY_EMAIL") || "support@nmao.us";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const digits = (s: string) => s.replace(/\D/g, "");

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI GU AS MP".split(" "),
);
// Structural (deliverability-shaped) validation. NOTE: this checks shape, not
// real deliverability — drop in USPS / SmartyStreets here later (set address_valid
// from the API result) without touching callers.
function validAddress(a: { line1: string; city: string; state: string; postal: string }): boolean {
  if (!a.line1 || a.line1.length < 4 || !/\d/.test(a.line1)) return false; // wants a street number
  if (!a.city || a.city.length < 2) return false;
  if (!US_STATES.has(a.state)) return false;
  if (!/^\d{5}(-\d{4})?$/.test(a.postal)) return false;
  return true;
}

// Confirm-email link → verify-school-email EF (flips email_verified, then sends
// the password-setup link). Scanner-safe enough for a low-stakes confirm step.
async function sendConfirm(to: string, name: string, token: string): Promise<boolean> {
  if (!RESEND) return false;
  const link = `${URL_}/functions/v1/verify-school-email?token=${encodeURIComponent(token)}`;
  try {
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#222">` +
      `<h2 style="margin:0 0 10px">Confirm your NMAO school</h2>` +
      `<p>Hi ${esc(name) || "there"}, thanks for registering your school with the NMAO Tournament League.</p>` +
      `<p>Confirm this email to finish — we'll then send your link to set a password and complete setup:</p>` +
      `<p><a href="${link}" style="display:inline-block;background:#C89B3C;color:#141210;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:10px">Confirm my email</a></p>` +
      `<p style="color:#888;font-size:12px">Or paste this into your browser:<br>${link}</p>` +
      `<p style="color:#888;font-size:12px">If you didn't register a school with NMAO, you can ignore this email.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject: "Confirm your NMAO school email", html }),
    });
    if (!r.ok) console.error("confirm email failed", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e: any) { console.error("confirm email threw", e?.message || e); return false; }
}

async function sendSetupLink(schoolId: string) {
  try {
    await fetch(`${URL_}/functions/v1/send-school-setup-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ school_id: schoolId }),
    });
  } catch (e) { console.error("setup-link (non-fatal):", (e as Error).message); }
}

async function notify(name: string, email: string, phone: string, addr: string, isNew: boolean) {
  if (!RESEND) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [NOTIFY],
        subject: `${isNew ? "New school registered" : "School re-requested confirmation"}: ${clean(name, 120)}`,
        html: `<p><strong>${esc(name)}</strong> ${isNew ? "registered" : "re-requested confirmation"} via join.nmao.us.</p>
               <p>Email: ${esc(email)}<br>Phone: ${esc(phone) || "—"}<br>Ship to: ${esc(addr) || "—"}</p>
               <p>Review it in Mission Control → School review.</p>`,
      }),
    });
  } catch (_e) { /* non-fatal */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const name = clean(body.school_name ?? body.name, 160);
    const contactName = clean(body.contact_name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phoneRaw = clean(body.phone, 40);
    const addr = {
      line1: clean(body.address_line1 ?? body.line1, 160),
      city: clean(body.city, 80),
      state: clean(body.state, 4).toUpperCase(),
      postal: clean(body.postal ?? body.zip, 12),
      country: "US",
    };

    if (!name) return json({ ok: false, error: "Please enter your school name." }, 200);
    if (!contactName) return json({ ok: false, error: "Please enter your name (the owner or head instructor)." }, 200);
    if (!isEmail(email)) return json({ ok: false, error: "Please enter a valid email address." }, 200);
    if (digits(phoneRaw).length < 10) return json({ ok: false, error: "Please enter a valid phone number." }, 200);
    if (!validAddress(addr)) return json({ ok: false, error: "Please enter a complete U.S. mailing address (street, city, 2-letter state, ZIP) — this is where medals ship." }, 200);
    const phone = phoneRaw;

    // Honeypot: the hidden 'website' field is invisible to real users; if it's
    // filled, this is a bot — pretend success and do nothing.
    if (clean((body as any).website)) {
      return json({ ok: true, message: "Almost there — check your email to confirm and finish setup." });
    }

    const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

    // Rate-limit this public, unauthenticated endpoint (fail-open on infra error).
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || (req.headers.get("x-real-ip") || "");
    const rlOk = async (bucket: string, ident: string, limit: number, win: number): Promise<boolean> => {
      if (!ident) return true;
      try {
        const { data, error } = await svc.rpc("rate_limit_hit", { p_bucket: bucket, p_ident: ident, p_limit: limit, p_window_secs: win });
        return error ? true : data !== false;
      } catch { return true; }
    };
    if (!(await rlOk("register-school:ip", ip, 6, 600)) || !(await rlOk("register-school:email", email, 4, 3600))) {
      return json({ ok: false, error: "Too many attempts — please wait a few minutes and try again." }, 429);
    }

    const token = crypto.randomUUID();
    const addrStr = [addr.line1, `${addr.city}, ${addr.state} ${addr.postal}`].filter(Boolean).join(", ");

    // Dedupe by contact email — never create a second school for the same owner.
    const { data: existing } = await svc.from("schools")
      .select("id, name, join_code, email_verified").eq("contact_email_norm", email).maybeSingle();

    if (existing) {
      const ex = existing as any;
      if (ex.email_verified) {
        // Already confirmed — just re-send the account setup link.
        await sendSetupLink(ex.id);
        await notify(name, email, phone, addrStr, false);
        return json({ ok: true, already: true, join_code: ex.join_code ?? null,
          message: "You're already registered — we've re-sent your setup link. Check your email." });
      }
      // Not yet confirmed — refresh the token and re-send the confirmation email.
      await svc.from("schools").update({ email_verify_token: token, email_verify_sent_at: new Date().toISOString() }).eq("id", ex.id);
      await sendConfirm(email, contactName, token);
      await notify(name, email, phone, addrStr, false);
      return json({ ok: true, already: true, pending: true,
        message: "We've re-sent your confirmation email — check your inbox to finish." });
    }

    // Create the school EMAIL-UNVERIFIED (join_code auto by trigger;
    // contact_email_norm is generated — do NOT set it).
    const { data: created, error: cErr } = await svc.from("schools")
      .insert({
        name, contact_name: contactName, contact_email: email, phone,
        address: addr, address_valid: true,
        email_verified: false, email_verify_token: token, email_verify_sent_at: new Date().toISOString(),
      })
      .select("id, join_code").single();
    if (cErr || !created) { console.error("register-school insert:", cErr); return json({ ok: false, error: "Could not create your school. Please try again." }, 200); }

    await sendConfirm(email, contactName, token);
    await notify(name, email, phone, addrStr, true);

    return json({ ok: true, school_id: (created as any).id, join_code: (created as any).join_code ?? null, pending: true,
      message: "Almost there — check your email to confirm. We'll then send your link to set a password and finish setup." });
  } catch (e) {
    console.error("register-school:", (e as any)?.message || e);
    return json({ ok: false, error: "Could not complete signup. Please try again." }, 500);
  }
});
