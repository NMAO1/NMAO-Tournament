"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues } from "@nmao/design-tokens";

// Landing page for the password-reset / first-time email link. The link carries a
// recovery token (implicit flow — a hash token the browser client parses on load),
// which signs the user in with a recovery session. Here they actually SET a
// password, then continue to the queue. Without this page the link dropped users
// on /judge already-signed-in but with no password, locking them out next visit.
export default function JudgeSetPassword() {
  const supabase = createClient();
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let settled = false;
    const mark = () => { settled = true; setReady("ok"); };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) mark(); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) mark(); });
    const t = setTimeout(() => { if (!settled) setReady((r) => (r === "checking" ? "no-session" : r)); }, 2500);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [supabase]);

  async function save() {
    setMsg("");
    if (pw.length < 8) return setMsg("Use at least 8 characters.");
    if (pw !== pw2) return setMsg("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    setDone(true);
    setTimeout(() => router.push("/judge"), 1200);
  }

  const input: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${neutrals.border}`, background: "#0e0e11", color: neutrals.text, fontSize: 16, marginBottom: 12 };
  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ height: 4, width: 160, borderRadius: 99, background: spectrum, margin: "0 auto 18px" }} />
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, textAlign: "center", margin: "0 0 4px" }}>Set your password</h1>

        {ready === "checking" && <p style={{ color: neutrals.muted, textAlign: "center", fontSize: 13, marginTop: 16 }}>Verifying your link…</p>}

        {ready === "no-session" && (
          <>
            <p style={{ color: neutrals.muted, textAlign: "center", fontSize: 13, margin: "0 0 16px" }}>This link has expired or was already used. Request a fresh one from the sign-in page.</p>
            <button onClick={() => router.push("/login")} style={{ width: "100%", padding: 13, borderRadius: 11, border: `1px solid ${neutrals.border}`, background: "none", color: neutrals.text, cursor: "pointer", fontWeight: 700 }}>Back to sign in</button>
          </>
        )}

        {ready === "ok" && !done && (
          <>
            <p style={{ color: neutrals.muted, textAlign: "center", fontSize: 13, margin: "0 0 20px" }}>Choose a password for your judge account.</p>
            <label style={{ fontSize: 12, color: neutrals.muted }}>New password</label>
            <input style={input} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <label style={{ fontSize: 12, color: neutrals.muted }}>Confirm password</label>
            <input style={input} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
            <button onClick={save} disabled={busy}
              style={{ width: "100%", padding: 13, borderRadius: 11, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210",
                background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Set password & continue"}
            </button>
          </>
        )}

        {done && <p style={{ color: "#5DCAA5", textAlign: "center", fontSize: 14, marginTop: 16 }}>Password set — taking you in…</p>}
        {msg && <p style={{ color: "#E07070", fontSize: 13, marginTop: 10, textAlign: "center" }}>{msg}</p>}
      </div>
    </main>
  );
}
