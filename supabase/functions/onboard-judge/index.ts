// =====================================================================
// EDGE FUNCTION: onboard-judge  (public — judge application intake)
// Creates a PENDING judge record from a public application. No auth account is
// created here — approval, the password setup-link, the IC agreement/creed, and
// Stripe Connect payouts all come later in the flow. This is just the front door.
//
// AUTH: Verify JWT = OFF (applicants have no account yet).
// POST { first_name, last_name, email, phone?, dob, address?, styles?[],
//        years_experience?, rank?, notable_mentions?, affiliation?, references?,
//        consent_accuracy, consent_eligibility } -> { ok, judge_id }
// Deploy: name = onboard-judge, Verify JWT OFF.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const norm = (s: string) => s.trim().toLowerCase();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function ageOn(dob: string, on: Date): number {
  const d = new Date(dob + "T00:00:00Z");
  let a = on.getUTCFullYear() - d.getUTCFullYear();
  const m = on.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    const b = await req.json().catch(() => ({}));
    const first = String(b.first_name || "").trim();
    const last = String(b.last_name || "").trim();
    const email = String(b.email || "").trim();
    const dob = String(b.dob || "").trim();

    if (!first || !last) return json({ ok: false, error: "Your first and last name are required." }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "A valid email is required." }, 400);
    if (!isDate(dob)) return json({ ok: false, error: "A valid date of birth (YYYY-MM-DD) is required." }, 400);
    if (ageOn(dob, new Date()) < 18) return json({ ok: false, error: "Judges must be at least 18 years old." }, 400);
    if (!b.consent_accuracy || !b.consent_eligibility) return json({ ok: false, error: "Please confirm the eligibility and accuracy statements." }, 400);

    // One application per email.
    const { data: existing } = await svc.from("judges").select("id, status").eq("email_norm", norm(email)).maybeSingle();
    if (existing) return json({ ok: false, error: "An application with this email already exists. If you need help, contact NMAO." }, 409);

    const styles: string[] = Array.isArray(b.styles) ? b.styles.map((s: any) => String(s)).filter(Boolean).slice(0, 12) : [];
    const yrs = Number.isFinite(Number(b.years_experience)) ? Math.max(0, Math.min(80, Math.floor(Number(b.years_experience)))) : null;

    const application = {
      phone: b.phone ? String(b.phone).trim() : null,
      dob,
      address: b.address ? String(b.address).trim() : null,
      rank: b.rank ? String(b.rank).trim() : null,
      affiliation: b.affiliation ? String(b.affiliation).trim() : null,
      references: b.references ? String(b.references).trim() : null,
      consent_accuracy: !!b.consent_accuracy,
      consent_eligibility: !!b.consent_eligibility,
      submitted_at: new Date().toISOString(),
    };

    const { data: judge, error } = await svc.from("judges").insert({
      first_name: first, last_name: last, email,
      styles: styles.length ? styles : null,
      years_experience: yrs,
      notable_mentions: b.notable_mentions ? String(b.notable_mentions).trim() : null,
      status: "pending",
      background_check_status: "pending", // CHECK: pending | cleared | rejected
      hourly_rate_cents: 0, // NMAO sets the rate on approval
      application,
      applied_at: new Date().toISOString(),
    }).select("id").single();
    if (error || !judge) { console.error("judge insert:", error); return json({ ok: false, error: "Could not submit your application." }, 500); }

    return json({ ok: true, judge_id: (judge as any).id });
  } catch (e: any) {
    console.error("onboard-judge error:", e?.message || e);
    return json({ ok: false, error: e?.message || "Something went wrong." }, 500);
  }
});
