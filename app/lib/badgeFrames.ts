import type { FrameRarity } from "../components/BadgeFrame";

// ── "Living frames" — per-badge Arena borders that EVOLVE with the competitor's
// badge tier. A frame = a base rarity border + motif ELEMENTS placed on a "shelf"
// (the thick bottom band, which may spill up into the video) that appear at set
// tiers, each with optional motion. Elements are reusable across badges.
//
// Placement: x,y are the element's CENTER as a fraction of the shelf box
// (x: 0=left … 1=right; y: 0=top of shelf … 1=bottom/band). Elements may extend
// above the shelf into the video — fine, since the competitor sits center-frame.

export type ElementAnim = "flicker" | "float" | "write";
export type FrameElement = { img: string; x: number; y: number; scale: number; rotate?: number; tier: number; anim?: ElementAnim };
export type BadgeFrameSpec = { base: FrameRarity; label?: string; tierLabels?: string[]; elements: FrameElement[] };

export const FRAME_SPECS: Record<string, BadgeFrameSpec> = {
  // Pilot: the journaling badge grows candle → candles → book → writing quill.
  journal_keeper: {
    base: "rare",
    label: "Journal Keeper",
    tierLabels: ["5 entries", "25 entries", "50 entries", "75 entries"],
    elements: [
      // candlestick = steady; flame = a separate element pinned to the wick, flickering.
      { img: "candlestick", x: 0.10, y: 0.60, scale: 1.35, tier: 1 },
      { img: "flame",       x: 0.10, y: 0.28, scale: 0.85, tier: 1, anim: "flicker" },
      { img: "candlestick", x: 0.90, y: 0.60, scale: 1.35, tier: 2 },
      { img: "flame",       x: 0.90, y: 0.28, scale: 0.85, tier: 2, anim: "flicker" },
      { img: "book",  x: 0.50, y: 0.66, scale: 2.3, tier: 3 },
      // quill nib rides the top-left of the open page; feather sweeps up-right.
      { img: "quill", x: 0.52, y: 0.40, scale: 1.9, rotate: 10, tier: 4, anim: "write" },
    ],
  },
};

export function elementsForTier(spec: BadgeFrameSpec, tier: number): FrameElement[] {
  return spec.elements.filter((e) => e.tier <= tier);
}

// Placeholder glyphs until the real art lands in the badge-frames bucket.
export const ELEMENT_GLYPH: Record<string, string> = {
  candle: "🕯️", candlestick: "🕯️", flame: "🔥", book: "📖", quill: "🪶",
  laurel: "🌿", crown: "👑", gem: "💎", sword: "⚔️", star: "⭐", medal: "🏅", chain: "⛓️",
};

// Real element art from the public badge-frames bucket (?v bumps to bust the
// image cache when a file is re-uploaded); null → renderer uses the glyph.
export function frameElementUrl(img: string): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/badge-frames/${img}.png?v=4`;
}
