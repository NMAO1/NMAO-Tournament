import { neutrals, spectrum, hues } from "@nmao/design-tokens";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: neutrals.bg,
        color: neutrals.text,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Georgia, serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ height: 4, width: 220, borderRadius: 99, background: spectrum, marginBottom: 22 }} />
      <h1 style={{ fontSize: 40, fontWeight: 600, margin: 0 }}>NMAO Championship Tournament</h1>
      <p style={{ color: neutrals.muted, marginTop: 10, fontFamily: "Inter, system-ui, sans-serif" }}>
        Mission Control · School Portal · Judge · Public results
      </p>
      <div
        style={{
          marginTop: 26,
          padding: "10px 20px",
          borderRadius: 12,
          fontWeight: 700,
          color: "#141210",
          fontFamily: "Inter, sans-serif",
          background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`,
        }}
      >
        Phase 0 — foundation online
      </div>
    </main>
  );
}
