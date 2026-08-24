"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status } from "@nmao/design-tokens";

export default function SchoolLogin() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    router.push("/school");
  }
  async function reset() {
    if (!email.trim()) return setMsg("Enter your email first.");
    setBusy(true);
    // Route through our function: creates the owner account if needed, sends a
    // scanner-safe link via Resend. Generic response — never reveals existence.
    try { await supabase.functions.invoke("send-school-setup-link", { body: { email: email.trim() } }); } catch { /* ignore */ }
    setBusy(false);
    setMsg("If that email is on file, we've emailed you a link to set your password.");
  }

  const input: React.CSSProperties = {
    width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${neutrals.border}`,
    background: "#0e0e11", color: neutrals.text, fontSize: 16, marginBottom: 12,
  };
  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ height: 4, width: 160, borderRadius: 99, background: spectrum, margin: "0 auto 18px" }} />
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, textAlign: "center", margin: "0 0 4px" }}>NMAO School Portal</h1>
        <p style={{ color: neutrals.muted, textAlign: "center", fontSize: 13, margin: "0 0 20px" }}>Sign in to manage your athletes.</p>
        <label style={{ fontSize: 12, color: neutrals.muted }}>Email</label>
        <input style={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label style={{ fontSize: 12, color: neutrals.muted }}>Password</label>
        <input style={input} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} />
        <button onClick={signIn} disabled={busy}
          style={{ width: "100%", padding: 13, borderRadius: 11, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210",
            background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Signing in…" : "Sign In"}
        </button>
        <button onClick={reset} style={{ width: "100%", marginTop: 8, padding: 8, background: "none", border: "none", color: neutrals.muted, cursor: "pointer", fontSize: 13 }}>
          First time here, or forgot your password? Email me a link
        </button>
        {msg && <p style={{ color: msg.startsWith("Check") ? status.success : status.danger, fontSize: 13, marginTop: 10, textAlign: "center" }}>{msg}</p>}
      </div>
    </main>
  );
}
