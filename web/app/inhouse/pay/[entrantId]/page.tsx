"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

const FN = (n: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${n}`;
const HEADERS = { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` };

// A school-shared pay link: mint a FRESH Stripe checkout for this entrant and
// redirect. Kept as our own URL (not a raw Stripe link) so it never expires.
export default function EntrantPay() {
  const entrantId = String(useParams().entrantId || "");
  const canceled = useSearchParams().get("canceled") === "1";
  const [msg, setMsg] = useState("Preparing secure checkout…");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState<{ athlete: string; tournament: string; amount: number } | null>(null);

  const go = useCallback(async () => {
    try {
      const res = await fetch(FN("inhouse-checkout"), { method: "POST", headers: HEADERS, body: JSON.stringify({ entrant_id: entrantId }) });
      const j = await res.json();
      if (!j.ok || !j.url) { setErr(j.error || "This payment link is no longer valid."); return; }
      setInfo({ athlete: j.athlete, tournament: j.tournament, amount: j.amount });
      setMsg("Redirecting to secure checkout…");
      window.location.href = j.url;
    } catch { setErr("Network error. Please try again."); }
  }, [entrantId]);
  useEffect(() => { if (!canceled) go(); else setErr(""); }, [go, canceled]);

  const wrap: React.CSSProperties = { minHeight: "100vh", background: "#0b0b0d", color: "#ececec", display: "flex", justifyContent: "center", alignItems: "center", padding: 20, fontFamily: "var(--font-geist-sans), system-ui, sans-serif" };
  const cardS: React.CSSProperties = { width: "100%", maxWidth: 400, background: "#161619", border: "1px solid #26262b", borderRadius: 18, padding: 28, textAlign: "center" };
  const gold: React.CSSProperties = { marginTop: 20, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 12, padding: "12px 24px", fontSize: 15, background: "linear-gradient(160deg, #FFE39A, #E8B84B 55%, #A67C1F)" };

  return (
    <div style={wrap}>
      <div style={cardS}>
        {err ? (
          <>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <p style={{ color: "#9a9aa2", marginTop: 12 }}>{err}</p>
          </>
        ) : canceled ? (
          <>
            <div style={{ fontSize: 40 }}>🥋</div>
            <p style={{ color: "#9a9aa2", marginTop: 12 }}>Payment canceled. Your spot isn&apos;t confirmed yet.</p>
            <button onClick={go} style={gold}>Try again</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40 }}>🥋</div>
            {info && <p style={{ marginTop: 12, fontSize: 15 }}>Entry for <b>{info.athlete}</b> — {info.tournament}</p>}
            <p style={{ color: "#9a9aa2", marginTop: 8 }}>{msg}</p>
          </>
        )}
      </div>
    </div>
  );
}
