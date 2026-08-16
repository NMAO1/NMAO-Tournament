// =====================================================================
// EDGE FUNCTION: get-invite  (Membership → Tournament bridge, redeem side)
// Resolves an opaque invite token (from the deep-link ?t=) to prefill data for
// the competitor-app redeem screen. Rank is SCHOOL-set and READ-ONLY here — the
// guardian only completes consent + season + payment (via onboard-competitor).
//
// DEPLOY: name = get-invite, **Verify JWT OFF** (a guardian may open the link
// before they have a Tournament account). The opaque token is the secret.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const body = await req.json().catch(() => ({})) as any;
  const t = String(body.t || "").trim();
  if (!t) return json({ ok: false, error: "Missing invite token", status: "invalid" }, 400);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: p } = await svc
    .from("bridge_pending_athletes")
    .select("school_id, external_member_student_id, first_name, last_name, dob, belt_name, declared_rank, status, expires_at, schools(name)")
    .eq("invite_token", t)
    .maybeSingle();

  if (!p) return json({ ok: false, error: "This invite could not be found.", status: "invalid" }, 404);

  let status = (p as any).status as string;
  if (status === "pending" && (p as any).expires_at && new Date((p as any).expires_at) < new Date()) status = "expired";
  if (status !== "pending") return json({ ok: false, error: `This invite is ${status}.`, status });

  return json({
    ok: true,
    invite: {
      status,
      expires_at: (p as any).expires_at,
      school: { tournament_school_id: (p as any).school_id, name: (p as any).schools?.name ?? null },
      competitor: {
        external_member_student_id: (p as any).external_member_student_id,
        first_name: (p as any).first_name,
        last_name: (p as any).last_name,
        dob: (p as any).dob,           // editable at redeem only if null
        belt_name: (p as any).belt_name, // context only, not editable
        rank: (p as any).declared_rank,  // SCHOOL-set, READ-ONLY to guardian (may be null)
      },
    },
  });
});
