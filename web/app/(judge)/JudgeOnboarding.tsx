"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status as st } from "@nmao/design-tokens";

type Checklist = { bg_consent: boolean; bg_cleared: boolean; ic_agreement: boolean; creed: boolean; payouts: boolean };
type DocKind = "bg" | "ic" | "creed";

// Placeholder legal copy — replaced by counsel-approved language. Acceptance is
// recorded server-side (accept-judge-terms) with a timestamp regardless of copy.
const DOCS: Record<DocKind, { title: string; body: string[]; accept: string; field: "bg_consent" | "ic" | "creed" }> = {
  bg: {
    title: "Background check — disclosure & authorization",
    field: "bg_consent",
    accept: "I authorize the background check",
    body: [
      "Because judges review videos of minors, NMAO requires a background check before your first assignment and periodically thereafter.",
      "You are being told that a consumer report — a background check — may be obtained for judging-eligibility purposes from a consumer reporting agency. You will be provided a summary of your rights under the Fair Credit Reporting Act.",
      "[FINAL FCRA DISCLOSURE & AUTHORIZATION LANGUAGE PENDING LEGAL REVIEW. This is a placeholder.]",
    ],
  },
  ic: {
    title: "Independent Contractor Agreement",
    field: "ic",
    accept: "I agree to the Independent Contractor Agreement",
    body: [
      "You will provide judging services to NMAO as an independent contractor, not an employee. You are responsible for your own taxes; NMAO does not withhold taxes and does not provide employee benefits.",
      "You will keep competitors' videos and personal information confidential, will not download or redistribute them, and will judge impartially and free of conflicts.",
      "Compensation is per assignment at the rate NMAO sets. [FINAL INDEPENDENT CONTRACTOR AGREEMENT — INCLUDING TAX, CONFIDENTIALITY, IP, TERM/TERMINATION, INDEMNIFICATION, AND DISPUTE-RESOLUTION TERMS — PENDING LEGAL REVIEW.]",
    ],
  },
  creed: {
    title: "Judge Creed & Code of Conduct",
    field: "creed",
    accept: "I accept the Judge Creed",
    body: [
      "I will judge every competitor fairly, by the rubric alone, without favoritism or bias.",
      "I will recuse myself from any competitor or school where I have a conflict of interest.",
      "I will protect the privacy and dignity of every competitor, especially minors, and hold their performances in confidence.",
      "[FINAL CODE OF CONDUCT LANGUAGE PENDING LEGAL REVIEW.]",
    ],
  },
};

export default function JudgeOnboarding({ onActive }: { onActive: () => void }) {
  const supabase = createClient();
  const [cl, setCl] = useState<Checklist | null>(null);
  const [busy, setBusy] = useState("");
  const [doc, setDoc] = useState<DocKind | null>(null);
  const [err, setErr] = useState("");

  const headers = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    return sess.session ? { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${sess.session.access_token}` } : null;
  }, [supabase]);

  const call = useCallback(async (fn: string, body: unknown) => {
    const h = await headers(); if (!h) return null;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: h, body: JSON.stringify(body) });
    return res.json();
  }, [headers]);

  const refresh = useCallback(async () => {
    // Sync payouts from Stripe first (in case they just returned from onboarding), then read the checklist.
    await call("connect-onboard-judge", { action: "status" }).catch(() => null);
    const j = await call("accept-judge-terms", {});
    if (j?.ok) { setCl(j.checklist as Checklist); if (j.judge_status === "active") onActive(); }
  }, [call, onActive]);

  useEffect(() => { refresh(); }, [refresh]);

  async function accept(kind: DocKind) {
    setBusy(kind); setErr("");
    const j = await call("accept-judge-terms", { [DOCS[kind].field === "ic" ? "ic" : DOCS[kind].field === "creed" ? "creed" : "bg_consent"]: true });
    setBusy(""); setDoc(null);
    if (!j?.ok) return setErr(j?.error || "Could not save.");
    setCl(j.checklist as Checklist);
    if (j.judge_status === "active") onActive();
  }

  async function setupPayouts() {
    setBusy("payouts"); setErr("");
    const j = await call("connect-onboard-judge", { action: "link", return_url: location.origin + "/judge" });
    setBusy("");
    if (j?.ok && j.url) { location.href = j.url; return; }
    setErr(j?.error || "Could not start payout setup.");
  }

  const items = cl ? [
    { key: "bg_consent", label: "Background-check consent", desc: "Authorize your background check (FCRA).", done: cl.bg_consent, action: () => setDoc("bg"), cta: "Review & authorize" },
    { key: "ic", label: "Independent Contractor Agreement", desc: "Review and sign your contractor agreement.", done: cl.ic_agreement, action: () => setDoc("ic"), cta: "Review & sign" },
    { key: "creed", label: "Judge Creed", desc: "Accept the code of conduct.", done: cl.creed, action: () => setDoc("creed"), cta: "Review & accept" },
    { key: "payouts", label: "Payout setup", desc: "Add your bank & tax info via Stripe (secure).", done: cl.payouts, action: setupPayouts, cta: busy === "payouts" ? "Opening…" : "Set up payouts" },
    { key: "bg_cleared", label: "Background check clearance", desc: cl.bg_cleared ? "Cleared." : "Under review by NMAO — no action needed.", done: cl.bg_cleared, action: null, cta: "" },
  ] : [];
  const remaining = items.filter((i) => !i.done && i.key !== "bg_cleared").length;

  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, fontFamily: "Inter, system-ui, sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ height: 4, width: 160, borderRadius: 99, background: spectrum, margin: "0 auto 18px" }} />
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, textAlign: "center", margin: "0 0 6px" }}>Finish your judge onboarding</h1>
        <p style={{ color: neutrals.muted, textAlign: "center", fontSize: 14, margin: "0 0 24px" }}>
          {cl ? (remaining === 0 ? "All steps complete — your clearance is being finalized." : `${remaining} step${remaining === 1 ? "" : "s"} left before you can judge.`) : "Loading…"}
        </p>

        {items.map((it) => (
          <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", marginBottom: 10, borderRadius: 14, background: neutrals.surface, border: `1px solid ${it.done ? "#3f7a52" : neutrals.border}` }}>
            <span style={{ flex: "none", width: 26, height: 26, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, background: it.done ? "#3f7a52" : "transparent", border: it.done ? "none" : `2px solid ${neutrals.border}`, color: it.done ? "#fff" : neutrals.muted2 }}>{it.done ? "✓" : ""}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{it.label}</div>
              <div style={{ color: neutrals.muted, fontSize: 12.5, marginTop: 2 }}>{it.desc}</div>
            </div>
            {!it.done && it.action && (
              <button onClick={it.action} disabled={!!busy} style={{ flex: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 9, padding: "8px 14px", fontSize: 13, background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: busy ? 0.6 : 1 }}>{it.cta}</button>
            )}
          </div>
        ))}
        {err && <p style={{ color: st.danger, fontSize: 13, textAlign: "center", marginTop: 12 }}>{err}</p>}
      </div>

      {doc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,6,8,0.82)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setDoc(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "82vh", overflowY: "auto", background: neutrals.surface, border: `1px solid ${neutrals.border}`, borderRadius: 16, padding: 24 }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, margin: "0 0 12px" }}>{DOCS[doc].title}</h2>
            {DOCS[doc].body.map((p, i) => <p key={i} style={{ color: p.startsWith("[") ? hues.gold.hi : neutrals.muted, fontSize: 13.5, lineHeight: 1.65, margin: "0 0 10px", fontStyle: p.startsWith("[") ? "italic" : "normal" }}>{p}</p>)}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setDoc(null)} style={{ flex: 1, background: "transparent", border: `1px solid ${neutrals.border}`, color: neutrals.text, borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={() => accept(doc)} disabled={!!busy} style={{ flex: 2, border: "none", cursor: "pointer", fontWeight: 800, color: "#141210", borderRadius: 10, padding: "11px", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : DOCS[doc].accept}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
