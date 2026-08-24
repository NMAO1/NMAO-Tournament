import type { Metadata, Viewport } from "next";

// Distinct browser-tab title for the Judge app (judge.nmao.us).
export const metadata: Metadata = {
  title: "Judge",
};

// iPhone-safe: extend under the notch/home-bar and expose the safe-area insets,
// so headers, controls, and the submit bar never sit under the status bar or
// home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function JudgeGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0b0b0f",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {children}
    </div>
  );
}
