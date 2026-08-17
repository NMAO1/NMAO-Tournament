"use client";
import { useState } from "react";
import { neutrals, spectrum, hues, status as st } from "@nmao/design-tokens";

type Form = {
  first_name: string; last_name: string; email: string; phone: string; dob: string; address: string;
  styles: string; years_experience: string; rank: string; notable_mentions: string; affiliation: string; references: string;
};
const EMPTY: Form = { first_name: "", last_name: "", email: "", phone: "", dob: "", address: "", styles: "", years_experience: "", rank: "", notable_mentions: "", affiliation: "", references: "" };

export default function JudgeApply() {
  const [f, setF] = useState<Form>(EMPTY);
  const [cEli, setCEli] = useState(false);
  const [cAcc, setCAcc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setErr("");
    if (!f.first_name.trim() || !f.last_name.trim()) return setErr("Your name is required.");
    if (!f.email.trim()) return setErr("Your email is required.");
    if (!f.dob) return setErr("Your date of birth is required (judges must be 18+).");
    if (!cEli || !cAcc) return setErr("Please confirm both statements at the bottom.");
    setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/onboard-judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({
          ...f,
          years_experience: f.years_experience ? Number(f.years_experience) : null,
          styles: f.styles ? f.styles.split(",").map((s) => s.trim()).filter(Boolean) : [],
          consent_eligibility: cEli, consent_accuracy: cAcc,
        }),
      });
      const j = await res.json();
      setBusy(false);
      if (!j.ok) return setErr(j.error || "Could not submit your application.");
      setDone(true);
    } catch { setBusy(false); setErr("Network error — please try again."); }
  }

  const input: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 10, border: `1px solid ${neutrals.border}`, background: "#0e0e11", color: neutrals.text, fontSize: 15, marginBottom: 4 };
  const lbl: React.CSSProperties = { fontSize: 12, color: neutrals.muted, marginBottom: 4, display: "block", marginTop: 12 };
  const Field = ({ label, k, type = "text", ph, half }: { label: string; k: keyof Form; type?: string; ph?: string; half?: boolean }) => (
    <div style={{ flex: half ? 1 : undefined, width: half ? undefined : "100%" }}>
      <label style={lbl}>{label}</label>
      <input style={input} type={type} placeholder={ph} value={f[k]} onChange={set(k)} />
    </div>
  );

  if (done) {
    return (
      <Shell>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🥋</div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, margin: "0 0 10px" }}>Application received</h1>
          <p style={{ color: neutrals.muted, fontSize: 14, lineHeight: 1.6 }}>
            Thank you for applying to judge for NMAO. We&apos;ll review your background and reach out by email with the next steps —
            a background-check consent, your independent-contractor agreement, and payout setup. Watch your inbox.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <div style={{ height: 4, width: 160, borderRadius: 99, background: spectrum, margin: "0 auto 16px" }} />
      <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, textAlign: "center", margin: "0 0 4px" }}>Become an NMAO Judge</h1>
      <p style={{ color: neutrals.muted, textAlign: "center", fontSize: 13, margin: "0 0 6px" }}>
        Score competitors&apos; performance videos on your own schedule, from anywhere. Paid per assignment.
      </p>
      <p style={{ color: neutrals.muted2, textAlign: "center", fontSize: 12, margin: "0 0 20px" }}>
        Judges are independent contractors (18+) and complete a background check before their first assignment.
      </p>

      <Section title="About you" />
      <div style={{ display: "flex", gap: 10 }}><Field label="First name" k="first_name" half /><Field label="Last name" k="last_name" half /></div>
      <div style={{ display: "flex", gap: 10 }}><Field label="Email" k="email" type="email" half /><Field label="Phone" k="phone" type="tel" half /></div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={lbl}>Date of birth (must be 18+)</label><input style={input} type="date" value={f.dob} onChange={set("dob")} /></div>
        <Field label="Mailing address" k="address" ph="City, State" half />
      </div>

      <Section title="Martial-arts background" />
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Years of experience" k="years_experience" type="number" ph="e.g. 12" half />
        <Field label="Rank / certifications" k="rank" ph="e.g. 3rd Dan, certified referee" half />
      </div>
      <Field label="Styles you can judge (comma-separated)" k="styles" ph="Karate, Taekwondo, Kung Fu" />
      <label style={lbl}>Notable achievements / titles (optional)</label>
      <textarea style={{ ...input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} value={f.notable_mentions} onChange={set("notable_mentions")} />
      <Field label="Current school / affiliation (for conflict-of-interest checks)" k="affiliation" ph="Your dojo or 'independent'" />
      <label style={lbl}>References (optional)</label>
      <textarea style={{ ...input, minHeight: 50, resize: "vertical", fontFamily: "inherit" }} value={f.references} onChange={set("references")} placeholder="Name + how to reach them" />

      <Section title="Confirm" />
      <Check on={cEli} set={setCEli} label="I am at least 18 years old and legally authorized to work in the United States." />
      <Check on={cAcc} set={setCAcc} label="The information above is accurate, and I understand a background check is required before I can judge." />

      {err && <p style={{ color: st.danger, fontSize: 13, marginTop: 12, textAlign: "center" }}>{err}</p>}
      <button onClick={submit} disabled={busy}
        style={{ width: "100%", marginTop: 16, padding: 14, borderRadius: 11, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210",
          background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: busy ? 0.6 : 1, fontSize: 15 }}>
        {busy ? "Submitting…" : "Submit application"}
      </button>
      <p style={{ color: neutrals.muted2, fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
        By submitting, you agree we may contact you and begin the onboarding steps. Background-check consent and the
        independent-contractor agreement are presented before you start.
      </p>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: wide ? 520 : 400, padding: "28px 0" }}>{children}</div>
    </main>
  );
}
function Section({ title }: { title: string }) {
  return <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: hues.gold.base, margin: "22px 0 2px", borderBottom: `1px solid ${neutrals.border}`, paddingBottom: 6 }}>{title}</div>;
}
function Check({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => set(!on)} style={{ display: "flex", gap: 10, alignItems: "flex-start", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "8px 0", color: neutrals.text }}>
      <span style={{ flex: "none", width: 20, height: 20, borderRadius: 6, marginTop: 1, border: `1.5px solid ${on ? hues.gold.base : neutrals.border}`, background: on ? hues.gold.base : "transparent", color: "#141210", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? "✓" : ""}</span>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: neutrals.muted }}>{label}</span>
    </button>
  );
}
