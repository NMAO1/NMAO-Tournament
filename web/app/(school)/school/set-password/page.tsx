"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status } from "@nmao/design-tokens";

// Landing page for the password-reset / first-time email link (implicit-flow
// recovery token). The owner sets a password here, then continues to the roster.
// Without this the reset link dropped them on /school signed-in but password-less,
// locking them out on their next visit.
export default function SchoolSetPassword() {
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

    // Scanner-safe flow: verify a token_hash in JS (email scanners can't burn it).
    const params = new URLSearchParams(window.location.search);
    const token_hash = params.get("token_hash");
    const type = (params.get("type") || "recovery") as "recovery" | "invite" | "email";
    if (token_hash) {
      supabase.auth.verifyOtp({ type, token_hash }).then(({ data, error }) => {
        if (data?.session && !error) mark();
        window.history.replaceState({}, "", window.location.pathname);
      }).catch(() => {});
    } else {
      supabase.auth.getSession().then(({ data }) => { if (data.session) mark(); });
    }

    const t = setTimeout(() => { if (!settled) setReady((r) => (r === "checking" ? "no-session" : r)); }, 5000);
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
    setTimeout(() => router.push("/school"), 1200);
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
            <button onClick={() => router.push("/school/login")} style={{ width: "100%", padding: 13, borderRadius: 11, border: `1px solid ${neutrals.border}`, background: "none", color: neutrals.text, cursor: "pointer", fontWeight: 700 }}>Back to sign in</button>
          </>
        )}

        {ready === "ok" && !done && (
          <>
            <p style={{ color: neutrals.muted, textAlign: "center", fontSize: 13, margin: "0 0 20px" }}>Choose a password for your school account.</p>
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

        {done && <p style={{ color: status.success, textAlign: "center", fontSize: 14, marginTop: 16 }}>Password set — taking you in…</p>}
        {msg && <p style={{ color: status.danger, fontSize: 13, marginTop: 10, textAlign: "center" }}>{msg}</p>}
      </div>
    </main>
  );
}
