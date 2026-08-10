"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Tournament = { name: string; event_date: string | null; entry_fee_cents: number | null; registration_open: boolean; state: string; format: string; school_name: string | null };
const SUGGESTED = ["Traditional Forms", "Traditional Weapons", "Open Forms", "Open Weapons", "Board Breaking", "Sparring", "Fitness Challenge", "Creative"];
// TODO: set NEXT_PUBLIC_APP_URL to the real App Store / TestFlight link once the app ships.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nmao.us/app";
const FN = (n: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${n}`;
const HEADERS = { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` };
const dollars = (c: number | null | undefined) => (c == null ? "0.00" : (c / 100).toFixed(2));

export default function PublicRegister() {
  const token = String(useParams().token || "");
  const paid = useSearchParams().get("paid") === "1";
  const [t, setT] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [form, setForm] = useState({ athlete: "", event: "", division: "", video: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(FN("inhouse-public-get"), { method: "POST", headers: HEADERS, body: JSON.stringify({ token }) });
      const j = await res.json();
      if (!j.ok) { setLoadErr(j.error || "Tournament not found."); setLoading(false); return; }
      setT(j.tournament);
    } catch { setLoadErr("Could not load this tournament."); }
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!form.athlete.trim()) { setErr("Please enter the athlete's name."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch(FN("inhouse-register-pay"), {
        method: "POST", headers: HEADERS,
        body: JSON.stringify({ token, athlete_name: form.athlete, event: form.event, division: form.division, video_url: form.video, payer_email: form.email }),
      });
      const j = await res.json();
      if (!j.ok || !j.url) { setErr(j.error || "Could not start checkout."); setBusy(false); return; }
      window.location.href = j.url; // Stripe-hosted checkout
    } catch { setErr("Network error. Please try again."); setBusy(false); }
  }

  const wrap: React.CSSProperties = { minHeight: "100vh", background: "#0b0b0d", color: "#ececec", display: "flex", justifyContent: "center", padding: "48px 20px", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" };
  const cardS: React.CSSProperties = { width: "100%", maxWidth: 440, background: "#161619", border: "1px solid #26262b", borderRadius: 18, padding: 28 };
  const inp: React.CSSProperties = { width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid #2c2c32", background: "#0e0e11", color: "#ececec", fontSize: 15, marginTop: 6 };
  const label: React.CSSProperties = { fontSize: 13, color: "#9a9aa2", display: "block", marginTop: 16 };
  const gold: React.CSSProperties = { width: "100%", marginTop: 24, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 12, padding: "13px", fontSize: 16, background: "linear-gradient(160deg, #FFE39A, #E8B84B 55%, #A67C1F)" };

  if (loading) return <div style={wrap}><div style={{ ...cardS, textAlign: "center", color: "#9a9aa2" }}>Loading…</div></div>;
  if (loadErr) return <div style={wrap}><div style={{ ...cardS, textAlign: "center" }}><div style={{ fontSize: 40 }}>🥋</div><p style={{ color: "#9a9aa2", marginTop: 12 }}>{loadErr}</p></div></div>;

  if (paid) return (
    <div style={wrap}><div style={{ ...cardS, textAlign: "center" }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <h1 style={{ fontSize: 22, margin: "14px 0 6px" }}>You&apos;re registered!</h1>
      <p style={{ color: "#9a9aa2", fontSize: 15 }}>Your entry to <b style={{ color: "#ececec" }}>{t?.name}</b> is confirmed. See you on the mat.</p>
      <a href={APP_URL} style={{ ...gold, display: "inline-block", width: "auto", textDecoration: "none", padding: "12px 22px", marginTop: 20 }}>Get the NMAO Compete app</a>
      <p style={{ color: "#66666e", fontSize: 12, marginTop: 10 }}>Track results, reveals, and future events.</p>
    </div></div>
  );

  const open = t?.registration_open;
  return (
    <div style={wrap}>
      <div style={cardS}>
        {t?.school_name && <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#E8B84B" }}>{t.school_name}</div>}
        <h1 style={{ fontSize: 24, margin: "6px 0 4px" }}>{t?.name}</h1>
        <p style={{ color: "#9a9aa2", fontSize: 14, margin: 0 }}>
          {t?.event_date ? new Date(t.event_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Date TBA"}
          {t?.format === "video" ? " · Video submission" : " · In-person"}
          {t?.entry_fee_cents ? ` · $${dollars(t.entry_fee_cents)} entry` : " · Free entry"}
        </p>

        {!open ? (
          <p style={{ color: "#E8B84B", marginTop: 24, fontSize: 15 }}>Registration for this tournament is closed.</p>
        ) : (
          <>
            <label style={label}>Athlete&apos;s full name
              <input style={inp} value={form.athlete} onChange={(e) => setForm({ ...form, athlete: e.target.value })} placeholder="e.g. Maya Ortiz" />
            </label>
            <label style={label}>Event / challenge
              <input style={inp} list="ev-suggest" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} placeholder="e.g. Traditional Forms, Board Breaking" />
              <datalist id="ev-suggest">{SUGGESTED.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <label style={label}>Division <span style={{ color: "#66666e" }}>(optional)</span>
              <input style={inp} value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} placeholder="e.g. Ages 10–12 · Advanced" />
            </label>
            {t?.format === "video" && (
              <label style={label}>Video link <span style={{ color: "#66666e" }}>(optional — you can add it later)</span>
                <input style={inp} value={form.video} onChange={(e) => setForm({ ...form, video: e.target.value })} placeholder="YouTube / Google Drive link" />
              </label>
            )}
            <label style={label}>Your email <span style={{ color: "#66666e" }}>(for the receipt)</span>
              <input style={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
            </label>
            {err && <p style={{ color: "#ff8080", fontSize: 13, marginTop: 14 }}>{err}</p>}
            <button onClick={submit} disabled={busy} style={{ ...gold, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Starting checkout…" : t?.entry_fee_cents ? `Finalize registration · $${dollars(t?.entry_fee_cents)}` : "Register"}
            </button>
            <p style={{ color: "#66666e", fontSize: 12, marginTop: 12, textAlign: "center" }}>Secure payment by Stripe. Your entry is confirmed once payment completes.</p>
          </>
        )}
        <div style={{ borderTop: "1px solid #26262b", marginTop: 18, paddingTop: 14, textAlign: "center" }}>
          <a href={APP_URL} style={{ color: "#E8B84B", fontSize: 13, textDecoration: "none" }}>New to NMAO? Get the Compete app →</a>
        </div>
      </div>
    </div>
  );
}
