// =====================================================================
// Shared: notify a school owner that a competitor created a PENDING join
// request. Best-effort email via the project Resend pattern (same shape as
// capture-school-lead / register-school). NEVER throws — callers await it but
// a failure must not break the signup. Honors schools.notify_join_requests
// (owner mute toggle) and only sends when an owner contact email exists.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") || "NMAO Tournament <noreply@nmao.us>";
const PORTAL = "https://school.nmao.us/school";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function notifyOwnerOfJoinRequest(
  svc: SupabaseClient,
  schoolId: string,
  competitorId: string,
): Promise<void> {
  try {
    if (!RESEND) return; // email not configured in this environment
    const { data: school } = await svc
      .from("schools")
      .select("name, contact_email, notify_join_requests")
      .eq("id", schoolId)
      .maybeSingle();
    if (!school) return;
    const s = school as any;
    if (s.notify_join_requests === false) return; // owner muted these alerts
    if (!s.contact_email) return; // nowhere to send

    const { data: comp } = await svc
      .from("competitors")
      .select("first_name, last_name")
      .eq("id", competitorId)
      .maybeSingle();
    const c = (comp ?? {}) as any;
    const who = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "A new competitor";
    const schoolName = s.name || "your school";

    const html =
      `<h2 style="margin:0 0 10px">New competitor wants to join ${esc(schoolName)}</h2>` +
      `<p style="font-size:15px"><b>${esc(who)}</b> entered your join code and is waiting for you to approve them.</p>` +
      `<p style="margin:18px 0"><a href="${PORTAL}" style="background:#E6B93F;color:#141210;font-weight:700;text-decoration:none;border-radius:8px;padding:10px 18px;display:inline-block">Review &amp; approve →</a></p>` +
      `<p style="color:#888;font-size:12px;line-height:1.5">You're getting this because new-join-request alerts are on. ` +
      `Turn them off in School Portal → Settings → “Email me about new join requests”.</p>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: s.contact_email, subject: `New join request: ${who} → ${schoolName}`, html }),
    });
    if (!r.ok) console.error("join notify email failed", r.status, await r.text().catch(() => ""));
  } catch (e) {
    console.error("join notify threw", (e as Error).message);
  }
}
