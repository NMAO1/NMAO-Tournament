// =====================================================================
// EDGE FUNCTION: team-invite-staff  (Mission Control — owner Team page)
// Owner-only. Creates (or links) a login for a new staff member and inserts
// their staff row with a role, then emails sign-in instructions. The new hire
// signs in at mc.nmao.us with "Email me a code" (OTP) — no password needed.
//
// AUTH: Verify JWT = ON. Caller must hold the `team` capability (owner).
// POST { email, first_name, last_name, role } -> { ok, staff_id }
// DEPLOY: supabase functions deploy team-invite-staff --project-ref oxzuavpyoetchwebdejp
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), SUPABASE_ANON_KEY,
//      RESEND_API_KEY (optional), EMAIL_FROM (optional), MC_URL (default mc.nmao.us).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") || "NMAO Mission Control <noreply@nmao.us>";
const MC = (Deno.env.get("MC_URL") || "https://mc.nmao.us").replace(/\/$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const esc = (s: string) => String(s ?? "").replace(/[<>&]/g, "");
const ROLES = ["owner", "admin", "organizer", "tournament", "growth", "designer", "community"];
const ROLE_LABEL: Record<string, string> = {
  tournament: "Tournament & Operations", growth: "Growth & Sponsorship",
  designer: "Badge & Brand Designer", community: "Community & Support",
  owner: "Owner", admin: "Admin", organizer: "Organizer",
};

async function findUserByEmail(svc: any, email: string): Promise<string | null> {
  // Paginate admin.listUsers to find an existing auth user (small user base).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const hit = (data.users || []).find((u: any) => (u.email || "").toLowerCase() === email);
    if (hit) return hit.id;
    if ((data.users || []).length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: canTeam } = await svc.rpc("staff_can_uid", { p_uid: uid, p_slice: "team", p_level: "full" });
  if (!canTeam) return json({ ok: false, error: "Owner only." }, 403);

  try {
    const b = await req.json().catch(() => ({}));
    const email = clean(b.email, 200).toLowerCase();
    const first = clean(b.first_name, 80);
    const last = clean(b.last_name, 80);
    const role = clean(b.role, 20);
    if (!isEmail(email)) return json({ ok: false, error: "Enter a valid email." }, 200);
    if (!first) return json({ ok: false, error: "Enter the person's name." }, 200);
    if (!ROLES.includes(role)) return json({ ok: false, error: "Pick a valid role." }, 200);

    // Ensure an auth login exists for this email.
    let authUserId: string | null = null;
    const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, email_confirm: true });
    if (created?.user) authUserId = created.user.id;
    else {
      // Already registered (or create failed) — look it up.
      authUserId = await findUserByEmail(svc, email);
      if (!authUserId) { console.error("team-invite create/find failed:", cErr); return json({ ok: false, error: "Could not create the login. Try again." }, 200); }
    }

    // Upsert the staff row (one per auth user).
    const { data: existing } = await svc.from("staff").select("id").eq("auth_user_id", authUserId).maybeSingle();
    let staffId: string;
    if (existing) {
      await svc.from("staff").update({ first_name: first, last_name: last, email, role }).eq("id", (existing as any).id);
      staffId = (existing as any).id;
    } else {
      const { data: ins, error: iErr } = await svc.from("staff")
        .insert({ auth_user_id: authUserId, first_name: first, last_name: last, email, role }).select("id").single();
      if (iErr || !ins) { console.error("staff insert:", iErr); return json({ ok: false, error: "Could not save the staff member." }, 200); }
      staffId = (ins as any).id;
    }

    // Email sign-in instructions (OTP — no password to set).
    if (RESEND) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM, to: [email],
            subject: "You've been added to NMAO Mission Control",
            html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#222">
              <h2 style="margin:0 0 10px">Welcome to NMAO Mission Control</h2>
              <p>Hi ${esc(first) || "there"}, you've been added to the NMAO team as <b>${esc(ROLE_LABEL[role] || role)}</b>.</p>
              <p>To sign in, go to <a href="${MC}">${MC.replace(/^https?:\/\//, "")}</a>, enter this email, and choose <b>"Email me a code instead"</b>. Use the code we send to finish signing in.</p>
              <p><a href="${MC}" style="display:inline-block;background:#C89B3C;color:#141210;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:10px">Open Mission Control</a></p>
            </div>`,
          }),
        });
      } catch (_e) { /* non-fatal */ }
    }

    return json({ ok: true, staff_id: staffId, emailed: !!RESEND });
  } catch (e: any) {
    console.error("team-invite-staff:", e?.message || e);
    return json({ ok: false, error: "Could not complete. Try again." }, 500);
  }
});
