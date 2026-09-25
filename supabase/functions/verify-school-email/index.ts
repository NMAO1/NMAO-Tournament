// =====================================================================
// EDGE FUNCTION: verify-school-email
// Confirms a school owner's email from the link in the register-school
// confirmation email. On success: sets schools.email_verified=true, clears the
// token, and triggers send-school-setup-link (the deferred password-setup link).
// Returns a friendly HTML page (this is opened in a browser from an email click).
//
// GET  /functions/v1/verify-school-email?token=<uuid>
// DEPLOY: name = verify-school-email, **Verify JWT OFF** (public email click).
//   supabase functions deploy verify-school-email --no-verify-jwt --project-ref oxzuavpyoetchwebdejp
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPIRY_DAYS = 30;

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
    <style>body{margin:0;background:#0b0b0d;color:#F5F0E8;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
    .card{max-width:440px;text-align:center;background:#141416;border:1px solid #26262b;border-radius:16px;padding:34px 28px}
    .yy{width:34px;height:34px;border-radius:50%;background:conic-gradient(#F5F0E8 0 50%,#141210 0 100%);border:1px solid #E6B93F;margin:0 auto 16px}
    h1{font-size:20px;margin:0 0 10px} p{color:#9a938a;font-size:14px;line-height:1.6;margin:0 0 8px}
    a{color:#E6B93F}</style></head>
    <body><div class="card"><div class="yy"></div>${body}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

async function sendSetupLink(schoolId: string) {
  try {
    await fetch(`${URL_}/functions/v1/send-school-setup-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ school_id: schoolId }),
    });
  } catch (e) { console.error("setup-link (non-fatal):", (e as Error).message); }
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token")?.trim() || "";
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) {
    return page("Invalid link", `<h1>That link looks incomplete</h1><p>Please open the confirmation link from your email again, or re-register at <a href="https://join.nmao.us">join.nmao.us</a>.</p>`, 400);
  }

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: school } = await svc.from("schools")
    .select("id, name, email_verified, email_verify_sent_at, contact_email")
    .eq("email_verify_token", token).maybeSingle();

  if (!school) {
    // Token not found — most likely already confirmed (token cleared) or superseded.
    return page("Already confirmed", `<h1>You're all set</h1><p>This email is already confirmed, or the link has been replaced by a newer one. If you still need your setup link, use “Email me a link” on the <a href="https://school.nmao.us">school sign-in page</a>.</p>`);
  }

  const s = school as any;
  const sentAt = s.email_verify_sent_at ? new Date(s.email_verify_sent_at).getTime() : 0;
  if (sentAt && Date.now() - sentAt > EXPIRY_DAYS * 864e5) {
    return page("Link expired", `<h1>That link has expired</h1><p>Confirmation links are good for ${EXPIRY_DAYS} days. Please re-register at <a href="https://join.nmao.us">join.nmao.us</a> to get a fresh one.</p>`, 410);
  }

  await svc.from("schools")
    .update({ email_verified: true, email_verified_at: new Date().toISOString(), email_verify_token: null })
    .eq("id", s.id);

  // Now send the deferred password-setup link.
  await sendSetupLink(s.id);

  return page("Email confirmed", `<h1>Email confirmed 🎉</h1><p><b>${String(s.name || "Your school")}</b> is confirmed.</p><p>We just emailed a link to <b>set your password</b> and finish setup. Check your inbox — then sign in at <a href="https://school.nmao.us">school.nmao.us</a>.</p>`);
});
