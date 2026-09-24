"use client";
import { neutrals, hues, spectrum, metal } from "@nmao/design-tokens";

// First-run guided tour for the School Portal. It doesn't overlay/blank the
// UI — instead the parent switches the real `section` on each step so the
// owner sees the live tab behind this floating coach card. Dismissible,
// re-triggerable ("Show me around"), and completion is remembered per-owner
// (localStorage, keyed by school id) — see page.tsx.
export type TourStep = {
  icon: string;
  title: string;
  body: React.ReactNode;
  // Portal tab to reveal while this step is showing.
  section: "dashboard" | "roster" | "controls" | "entries" | "inhouse" | "payouts" | "settings";
};

export default function Walkthrough({
  steps, index, onBack, onNext, onSkip,
}: {
  steps: TourStep[];
  index: number;
  onBack: () => void;
  onNext: () => void;   // advances, or finishes on the last step
  onSkip: () => void;
}) {
  const step = steps[index];
  if (!step) return null;
  const first = index === 0;
  const last = index === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Portal tour — ${step.title}`}
      style={{
        position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)",
        zIndex: 70, width: "calc(100% - 32px)", maxWidth: 440,
        background: neutrals.surface, border: `1px solid ${neutrals.border}`,
        borderRadius: 16, boxShadow: "0 18px 48px rgba(0,0,0,0.6)", overflow: "hidden",
      }}
    >
      {/* Signature spectrum accent — same lockup as the sidebar. */}
      <div style={{ height: 3, background: spectrum }} />
      <div style={{ padding: "18px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: neutrals.muted2 }}>
            Getting started · {index + 1} of {steps.length}
          </span>
          <button
            onClick={onSkip}
            style={{ background: "transparent", border: "none", color: neutrals.muted2, cursor: "pointer", fontSize: 12 }}
          >
            {last ? "Close" : "Skip tour"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{step.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: neutrals.text, marginBottom: 5 }}>{step.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: neutrals.muted }}>{step.body}</div>
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 5, margin: "16px 0 14px" }}>
          {steps.map((_, i) => (
            <span key={i} style={{
              height: 4, flex: 1, borderRadius: 99,
              background: i <= index ? hues.gold.base : neutrals.surface2,
            }} />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button
            onClick={onBack}
            disabled={first}
            style={{
              border: `1px solid ${neutrals.border}`, background: "transparent",
              color: first ? neutrals.muted2 : neutrals.text, borderRadius: 9,
              padding: "8px 16px", fontSize: 13, fontWeight: 600,
              cursor: first ? "default" : "pointer", opacity: first ? 0.4 : 1,
            }}
          >
            Back
          </button>
          <button
            onClick={onNext}
            style={{
              border: "none", cursor: "pointer", fontWeight: 700, color: "#141210",
              borderRadius: 10, padding: "9px 22px", fontSize: 13, background: metal("gold"),
            }}
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
