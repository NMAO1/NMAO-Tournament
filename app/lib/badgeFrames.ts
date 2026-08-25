import type { FrameRarity } from "../components/BadgeFrame";

// ── "Living frames" — per-badge Arena borders that grow with the competitor's
// progress VALUE (e.g. journal entries). A frame = a base rarity border + motif
// elements placed on a "shelf" (the thick bottom band, which may spill up into
// the video). Elements can be FIXED (appear at a threshold) or REPEAT (one per
// N of the value, arranged in a row) — e.g. a lit candle per 20 journal entries.
//
// Placement: x,y = element CENTER as a fraction of the shelf box (x 0=left…1=right,
// y 0=top…1=bottom/band). Elements may extend above the shelf into the video.

export type ElementAnim = "flicker" | "float" | "write";

// A concrete, positioned element ready to render.
export type PlacedElement = { img: string; x: number; y: number; scale: number; rotate?: number; anim?: ElementAnim };

// A spec element: FIXED (optional showAt threshold) or REPEATing across a row.
export type SpecElement = {
  img: string; x?: number; y: number; scale: number; rotate?: number; anim?: ElementAnim;
  showAt?: number;                                             // fixed: appears when value >= showAt
  repeatPer?: number; repeatMax?: number; rowStep?: number;    // repeat: one per `repeatPer`, packed by rowStep (overlaps if < element width), centered
  withFlame?: boolean; flameScale?: number; flameY?: number;   // a flickering flame rides each repeat
};

// border = the base frame material for this badge (overrides the rarity gradient).
export type BadgeFrameSpec = { base: FrameRarity; label?: string; border?: { colors: string[]; glow?: string }; elements: SpecElement[] };

export const FRAME_SPECS: Record<string, BadgeFrameSpec> = {
  journal_keeper: {
    base: "rare",
    label: "Journal Keeper",
    // aged/old wood — warm dark walnut tones with lighter grain highlights
    border: { colors: ["#2e1c0e", "#6b451f", "#8a5c30", "#4a2f18", "#2e1c0e"], glow: "#3a2410" },
    elements: [
      // a lit candle (steady candlestick + flickering flame) for every 20 entries,
      // packed with overlap for depth so many candles fit
      { img: "candlestick", y: 0.66, scale: 0.82, repeatPer: 20, repeatMax: 9,
        rowStep: 0.10, withFlame: true, flameScale: 0.5, flameY: 0.46 },
      // the journal appears at 50 entries, the writing quill at 75
      { img: "book",  x: 0.50, y: 0.62, scale: 2.05, showAt: 50 },
      { img: "quill", x: 0.52, y: 0.39, scale: 1.8, rotate: 10, anim: "write", showAt: 75 },
    ],
  },
};

// Expand a spec against a progress value into concrete positioned elements.
export function resolveElements(spec: BadgeFrameSpec, value: number): PlacedElement[] {
  const out: PlacedElement[] = [];
  for (const el of spec.elements) {
    if (el.repeatPer) {
      const n = Math.min(Math.floor(value / el.repeatPer), el.repeatMax ?? 7);
      const step = el.rowStep ?? 0.12;
      const startX = 0.5 - (n - 1) * step / 2;   // centered, packed row (overlaps if step < element width)
      for (let i = 0; i < n; i++) {
        const x = n <= 1 ? 0.5 : startX + i * step;
        out.push({ img: el.img, x, y: el.y, scale: el.scale, rotate: el.rotate });
        if (el.withFlame) out.push({ img: "flame", x, y: el.flameY ?? el.y - 0.3, scale: el.flameScale ?? 0.6, anim: "flicker" });
      }
    } else if (el.showAt === undefined || value >= el.showAt) {
      out.push({ img: el.img, x: el.x ?? 0.5, y: el.y, scale: el.scale, rotate: el.rotate, anim: el.anim });
    }
  }
  return out;
}

// Placeholder glyphs until element art lands in the badge-frames bucket.
export const ELEMENT_GLYPH: Record<string, string> = {
  candle: "🕯️", candlestick: "🕯️", flame: "🔥", book: "📖", quill: "🪶",
  laurel: "🌿", crown: "👑", gem: "💎", sword: "⚔️", star: "⭐", medal: "🏅", chain: "⛓️",
};

// Real element art from the public badge-frames bucket (?v busts the image cache
// when a file is re-uploaded); null → renderer uses the glyph.
export function frameElementUrl(img: string): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/badge-frames/${img}.png?v=4`;
}
