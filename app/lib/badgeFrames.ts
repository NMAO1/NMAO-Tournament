import type { FrameRarity } from "../components/BadgeFrame";

// ── "Living frames" — per-badge Arena borders that EVOLVE with the competitor's
// badge tier. A frame = a base rarity border + motif ELEMENTS that appear at set
// tiers + optional per-element animation. Elements are reusable across badges;
// each badge just declares which elements show at which tier. Badges without a
// spec fall back to the plain rarity frame, so this ships incrementally.

export type FramePos =
  | "top-left" | "top-center" | "top-right"
  | "bottom-left" | "bottom-center" | "bottom-right" | "center";
export type ElementAnim = "flicker" | "float" | "write";
export type FrameElement = { img: string; pos: FramePos; tier: number; anim?: ElementAnim; scale?: number };
export type BadgeFrameSpec = { base: FrameRarity; label?: string; tierLabels?: string[]; elements: FrameElement[] };

// Composition specs keyed by badge_code. Grows as we author badges.
export const FRAME_SPECS: Record<string, BadgeFrameSpec> = {
  // Brad's pilot: the journaling badge grows candle → candles → book → writing quill.
  journal_keeper: {
    base: "rare",
    label: "Journal Keeper",
    tierLabels: ["5 entries", "25 entries", "50 entries", "75 entries"],
    elements: [
      { img: "candle", pos: "bottom-left",   tier: 1, anim: "flicker" },
      { img: "candle", pos: "bottom-right",  tier: 2, anim: "flicker" },
      { img: "book",   pos: "bottom-center", tier: 3, scale: 1.3 },
      { img: "quill",  pos: "bottom-center", tier: 4, anim: "write", scale: 0.95 },
    ],
  },
};

// Elements visible at (or below) a given tier.
export function elementsForTier(spec: BadgeFrameSpec, tier: number): FrameElement[] {
  return spec.elements.filter((e) => e.tier <= tier);
}

// Placeholder glyphs until the real Firefly PNGs land in the badge-frames bucket.
export const ELEMENT_GLYPH: Record<string, string> = {
  candle: "🕯️", book: "📖", quill: "🪶", laurel: "🌿", crown: "👑",
  flame: "🔥", gem: "💎", sword: "⚔️", star: "⭐", medal: "🏅", chain: "⛓️",
};

// Once assets exist, return the public bucket URL; null → renderer uses the glyph.
// e.g. `${EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/badge-frames/<img>.png`
export function frameElementUrl(_img: string): string | null {
  return null;
}
