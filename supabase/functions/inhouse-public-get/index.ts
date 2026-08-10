// =====================================================================
// EDGE FUNCTION: inhouse-public-get  (public self-registration page)
// Given a tournament's public_token, returns just enough to render the
// parent-facing registration page. No auth, no secrets, no roster leak.
//
// AUTH: Verify JWT = OFF (public page, no login).
// POST { token } -> { ok, tournament:{ name, event_date, entry_fee_cents,
//        registration_open, state, school_name } }
// Deploy (editor-safe, no _shared): name = inhouse-public-get, Verify JWT OFF.
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
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    if (!token) return json({ ok: false, error: "Missing token." }, 400);

    const { data: t } = await svc.from("in_house_tournaments")
      .select("id, name, event_date, entry_fee_cents, registration_open, state, visibility, format, school_id")
      .eq("public_token", token).maybeSingle();
    if (!t) return json({ ok: false, error: "Tournament not found." }, 404);
    if ((t as any).visibility !== "public") return json({ ok: false, error: "This tournament isn't open to public registration." }, 403);

    const { data: s } = await svc.from("schools").select("name").eq("id", (t as any).school_id).maybeSingle();

    return json({
      ok: true,
      tournament: {
        name: (t as any).name,
        event_date: (t as any).event_date,
        entry_fee_cents: (t as any).entry_fee_cents,
        registration_open: (t as any).registration_open && (t as any).state !== "complete",
        state: (t as any).state,
        format: (t as any).format,
        school_name: s ? (s as any).name : null,
      },
    });
  } catch (e: any) {
    console.error("inhouse-public-get error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
