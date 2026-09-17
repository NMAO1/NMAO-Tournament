import type { FrameRarity } from "../components/BadgeFrame";
import { SUPABASE_URL } from "./env";

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
  // coin STACK: one coin per `stackPer` of the value, piled into columns of
  // `perCol` (each new coin sits `coinDy` higher), columns spread by `colStep`,
  // centered — a growing "bank" of medals. Capped at `stackMax` coins.
  stackPer?: number; stackMax?: number; perCol?: number; colStep?: number; coinDy?: number;
  // SERIES: place `value` items in a centered row, each a DIFFERENT image from
  // `series` in order (e.g. a season gem per season completed). rowStep spacing.
  series?: string[];
};

// border = the base frame material for this badge (overrides the rarity gradient).
// fx: master on/off (default on). Pass an object to disable individual effects
// (e.g. { glint: false } keeps glow/sparkle/stack-in but drops the rolling shine).
export type FxConfig = { glint?: boolean; glow?: boolean; sparkle?: boolean; stackIn?: boolean };

// A picture-frame RING: a Firefly image (or a tint gradient placeholder) masked to
// the border margin around the video, with STAGED progression. `tints`/`images` are
// tiers cross-faded as the value passes each of `stops` (tier 0 is the base, tier i
// activates at stops[i-1]). Perimeter motifs accrete around the ring; glow + sparkle
// intensity ramp with the value. Set on a spec as `ring`.
export type RingConfig = {
  tints: string[];                 // per-tier ring gradient (base + one per stop). Always rendered (placeholder + under art).
  images?: string[];               // optional Firefly tier art (same length as tints); shown over the tint when present.
  stops: number[];                 // value thresholds; tier i (i>=1) activates when value >= stops[i-1].
  thickness?: number;              // ring thickness as a fraction of min(w,h) (default 0.15).
  glow?: string;
  perimeter?: { img: string; per: number; max?: number };  // one motif per `per` of the value, placed around the ring.
  // forged 5-bar TALLY (vector-drawn, no art needed): one chisel notch per `per` of the
  // value, grouped into gates of `groupPer` (the 5th strikes across the prior four).
  tally?: { per: number; groupPer?: number; max?: number; color?: string };
  // crownGems: a centered row of PROMINENT gems along the top border — one per `value`,
  // each the next image in the series (season-colored). For "a gem per season won".
  crownGems?: string[];
  flourishAt?: number;             // at value >= this, an elite flourish animates over the ring.
  flourishKind?: "shooting-star" | "gold-rain";            // which flourish (default shooting-star).
};
export type BadgeFrameSpec = { base: FrameRarity; label?: string; border?: { colors: string[]; glow?: string; texture?: string }; elements: SpecElement[]; fx?: boolean | FxConfig; ring?: RingConfig };

export const FRAME_SPECS: Record<string, BadgeFrameSpec> = {
  journal_keeper: {
    base: "rare",
    label: "Journal Keeper",
    // aged/old wood — a tiled walnut grain texture (falls back to the color gradient)
    border: { texture: "wood", colors: ["#2e1c0e", "#6b451f", "#8a5c30", "#4a2f18", "#2e1c0e"], glow: "#3a2410" },
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

  // ── DUELIST · the dueling border, driven by DUEL WINS (badge code `duelist`).
  // Earn rules: 1 win → crossed swords · 5 wins → shield completes the crest ·
  // 20 wins → first star, +1 star every 20 wins after (40→2 … 200→10, capped).
  duelist: {
    base: "epic",
    label: "Dedicated Duelist",
    fx: { glint: false, glow: false, sparkle: false },   // steel border: only the stack-in entrance, no shine/glow/sparkle
    // forged steel — a tiled brushed-gunmetal grain (falls back to the gradient)
    border: { texture: "steel", colors: ["#20242b", "#4a515d", "#79828f", "#333a43", "#1b1e23"], glow: "#6d7f9c" },
    // PICTURE-FRAME RING (gritty · worn · noble · earned): the wear transmutes into earned
    // prestige as wins climb. Steel-based throughout — gold appears only as honor inlay and
    // veins, never a gold frame (keeps it distinct from the all-gold Sovereign's Crown). The
    // BASE tier IS the 1-win look — there is no dormant state (the frame requires a win).
    ring: {
      tints: ["#2b2f37", "#3a2f2a", "#4a3524", "#5a4326", "#6a4a1e"],  // tempered→battle-worn→distinguished→honored→living-legend
      images: ["ring_duelist_0", "ring_duelist_1", "ring_duelist_2", "ring_duelist_3", "ring_duelist_4"],
      stops: [10, 25, 100, 200],   // 1 tempered · 10 battle-worn · 25 distinguished · 100 honored · 200 living legend
      flourishAt: 200,             // living legend → golden ember storm
      flourishKind: "gold-rain",   // reuses the gold-rain FX as a golden ember storm
      thickness: 0.16, glow: "#c98a3a",
      tally: { per: 5, groupPer: 5, max: 40, color: "#e6a552" },  // forged tally: one chisel notch per 5 wins, 5-bar gates (1 full gate = 25 wins), up to 200
    },
    elements: [
      // crossed-swords anchor — earned at the first win (drawn first = behind the shield)
      { img: "sword", x: 0.50, y: 0.60, scale: 2.3, showAt: 1 },
      // the warrior's shield completes the crest at 5 wins, riding over the blades' cross
      { img: "shield", x: 0.50, y: 0.62, scale: 1.5, showAt: 5 },
      // a rank star for every 20 wins, in a centered row beneath the crest (up to 10)
      { img: "star", y: 0.90, scale: 0.40, repeatPer: 20, repeatMax: 10, rowStep: 0.072 },
    ],
  },

  // ── MEDAL PATH · bronze → silver → gold (badge codes first-bronze/silver/gold).
  // Each accrues that metal's medals (levels 1/5/10/25/50/100). The border is a
  // growing "bank": one coin per medal, piled into stacks — show off your haul.
  "first-gold": {
    base: "epic", label: "Gold-Bound",
    border: { colors: ["#3a2c08", "#7a5c15", "#c9a12e", "#f0d878", "#3a2c08"], glow: "#e8c766" },
    elements: [
      { img: "coin_gold", y: 0.90, scale: 0.52, stackPer: 1, stackMax: 40, perCol: 8, colStep: 0.095, coinDy: 0.036 },
    ],
  },
  "first-silver": {
    base: "rare", label: "Silver-Bound",
    border: { colors: ["#24272c", "#585d66", "#9aa0ab", "#cdd2da", "#24272c"], glow: "#c2c8d2" },
    elements: [
      { img: "coin_silver", y: 0.90, scale: 0.52, stackPer: 1, stackMax: 40, perCol: 8, colStep: 0.095, coinDy: 0.036 },
    ],
  },
  "first-bronze": {
    base: "rare", label: "Bronze-Bound",
    border: { colors: ["#2c1b0e", "#6b3f1c", "#a5652f", "#d1965a", "#2c1b0e"], glow: "#c08a4e" },
    elements: [
      { img: "coin_bronze", y: 0.90, scale: 0.52, stackPer: 1, stackMax: 40, perCol: 8, colStep: 0.095, coinDy: 0.036 },
    ],
  },

  // ── FIRST STEPS · the common onboarding badges everyone earns first. One-time
  // (no growth): a shared carved-JADE border + a single central emblem per badge.
  // Common tier = just a colored border (no elements, no FX). The equipped-badge
  // corner crest still shows which badge it is.
  "first-step": {
    base: "common", label: "The Initiate", fx: false,
    border: { colors: ["#123723", "#1f5230", "#2e7d47", "#1f5230", "#123723"], glow: "#2e6b3f" },
    elements: [],
  },
  "first-duel": {
    base: "common", label: "The Challenger", fx: false,
    border: { colors: ["#3a1114", "#6e1f24", "#a12f37", "#6e1f24", "#3a1114"], glow: "#b23a42" },
    elements: [],
  },
  "first-bow": {
    base: "common", label: "The Newly Sworn", fx: false,
    border: { colors: ["#14122e", "#272357", "#3d379a", "#272357", "#14122e"], glow: "#4b45b8" },
    elements: [],
  },
  "first-reveal": {
    base: "common", label: "The Awakened", fx: false,
    border: { colors: ["#3a1c06", "#6e3a10", "#c26a1e", "#6e3a10", "#3a1c06"], glow: "#e08a34" },
    elements: [],
  },
  "first-reflection": {
    base: "common", label: "The Introspect", fx: false,
    border: { colors: ["#08302e", "#12595a", "#1e8a86", "#12595a", "#08302e"], glow: "#3ab5ad" },
    elements: [],
  },
  "first-vote": {
    base: "common", label: "The Voter", fx: false,
    border: { colors: ["#3a0e33", "#6e1d60", "#a92f92", "#6e1d60", "#3a0e33"], glow: "#c94bb0" },
    elements: [],
  },
  "teammate": {
    base: "common", label: "The Ally", fx: false,
    border: { colors: ["#0a2438", "#134a6e", "#2080b0", "#134a6e", "#0a2438"], glow: "#3aa0d8" },
    elements: [],
  },

  // ── GEM SERIES · a season gem per season completed (badge codes gem-s1…gem-s10).
  // Shared across all gem-sN codes: a growing collection, one colored gem per
  // season in order, on a dark jewel-box border so the colors pop.
  "gem-series": {
    base: "epic", label: "Gem Keeper",
    border: { colors: ["#100c1c", "#241f3a", "#3a3258", "#241f3a", "#100c1c"], glow: "#9a8ae0" },
    elements: [
      { img: "gem", y: 0.84, scale: 0.54, rowStep: 0.089,
        series: ["gem_sapphire", "gem_amethyst", "gem_ruby", "gem_emerald", "gem_coral", "gem_onyx", "gem_rose", "gem_turquoise", "gem_peridot", "gem_platinum"] },
    ],
  },

  // ── ORACLE · a night-sky border where each CORRECT VOTE lights a star; the sky
  // fills into constellations and a North Star blazes at high accuracy (badge `oracle`).
  oracle: {
    base: "epic", label: "The Oracle",
    border: { colors: ["#08082a", "#161654", "#2a2a8a", "#4a3aa0", "#08082a"], glow: "#8a7aff" },
    fx: { glint: true, glow: true, sparkle: true },
    // PICTURE-FRAME RING: night → starfield → constellation → aurora, cross-fading by
    // VOTING ACCURACY (60s / 70s / 80s), + a shooting star at 90%+ — a hard frame to
    // earn and keep (accuracy is a running ratio; a slump drops you a tier).
    ring: {
      tints: ["#0a0a24", "#141452", "#33228c", "#1f6a86"],   // night · starfield · constellation · aurora
      images: ["ring_oracle_0", "ring_oracle_1", "ring_oracle_2", "ring_oracle_3"],
      stops: [60, 70, 80],          // 60-69 → starfield · 70-79 → constellation · 80-89 → aurora
      flourishAt: 90,               // 90%+ → shooting star (the elite tier)
      thickness: 0.16, glow: "#8a7aff",
      perimeter: { img: "starlet", per: 6, max: 16 },
    },
    elements: [
      // one star per 5 correct votes, packed across the sky
      { img: "starlet", y: 0.62, scale: 0.42, repeatPer: 5, repeatMax: 14, rowStep: 0.062 },
      // the North Star ignites once you're a proven seer
      { img: "north_star", x: 0.5, y: 0.38, scale: 1.7, showAt: 50 },
    ],
  },

  // ── PRECISION · a target on aged paper; arrows land TIGHTER to center as your
  // tournament SKILL RATING climbs, gold bullseye at the top (badge `precision`).
  precision: {
    base: "rare", label: "Bullseye",
    border: { colors: ["#241a12", "#6b4a2a", "#b03a2a", "#e8dcc0", "#241a12"], glow: "#d05a3a" },
    fx: { glint: true, glow: true, sparkle: false },
    elements: [
      { img: "target", x: 0.5, y: 0.60, scale: 2.5, showAt: 0 },
      { img: "arrow", x: 0.33, y: 0.50, scale: 1.0, rotate: 22, showAt: 40 },
      { img: "arrow", x: 0.63, y: 0.45, scale: 1.0, rotate: -16, showAt: 55 },
      { img: "arrow", x: 0.45, y: 0.58, scale: 1.0, rotate: 38, showAt: 70 },
      { img: "arrow_gold", x: 0.5, y: 0.55, scale: 1.15, rotate: 0, showAt: 85 },  // dead-center
    ],
  },

  // ── ASCENT · a mountain ridge; summit flags plant HIGHER as you climb the ranks,
  // snowcap aurora crowns the peak at elite rating (badge `ascent`).
  ascent: {
    base: "rare", label: "Summit Seeker",
    border: { colors: ["#0e1830", "#243a66", "#4a6aa0", "#c8d8f0", "#0e1830"], glow: "#7aa0e0" },
    fx: { glint: true, glow: true, sparkle: true },
    // PICTURE-FRAME RING: the season-long CLIMB, driven by tournament SKILL RATING. Cross-
    // fades UP the mountain as rating rises (valley dusk → alpine → high summit → aurora).
    // Reflects CURRENT altitude — Elo can fall, so the four tiers ARE the readout and the
    // summit flags live in the tier art. Aurora/shooting-star beacon at the summit.
    ring: {
      tints: ["#16202e", "#294056", "#5e7488", "#356b62"],  // valley dusk · alpine · high summit · aurora
      images: ["ring_ascent_0", "ring_ascent_1", "ring_ascent_2", "ring_ascent_3"],
      stops: [45, 60, 75],   // rating 45 alpine · 60 high summit · 75 aurora approach
      flourishAt: 88,        // summit reached → aurora beacon (shooting star over the peak)
      flourishKind: "shooting-star",
      thickness: 0.16, glow: "#7fe0c0",
    },
    elements: [
      { img: "peak", x: 0.5, y: 0.70, scale: 2.7, showAt: 0 },
      { img: "flag", x: 0.38, y: 0.60, scale: 0.7, showAt: 45 },
      { img: "flag", x: 0.56, y: 0.48, scale: 0.78, showAt: 60 },
      { img: "flag", x: 0.5, y: 0.38, scale: 0.9, showAt: 75 },   // summit
      { img: "aurora", x: 0.5, y: 0.26, scale: 2.3, showAt: 88 },
    ],
  },

  // ── PODIUM · a laurel wreath that grows a leaf per PODIUM finish, closing into a
  // gilded crown when the garland fills (badge `podium`).
  podium: {
    base: "rare", label: "Top Tier",
    border: { colors: ["#16330f", "#2e5c1c", "#8a7a1e", "#e8c766", "#16330f"], glow: "#d8c060" },
    fx: { glint: true, glow: true, sparkle: false },
    elements: [
      { img: "laurel_leaf", y: 0.66, scale: 0.5, repeatPer: 1, repeatMax: 14, rowStep: 0.06 },
      { img: "laurel_clasp", x: 0.5, y: 0.40, scale: 1.2, showAt: 12 },   // wreath complete
    ],
  },

  // ── MASTER OF ARMS · a dojo weapon rack that fills in — one discipline at a time
  // (bō, nunchaku, sword, kama, open-hand) as you compete across EVENTS (badge `weapon-master`).
  "weapon-master": {
    base: "rare", label: "Master of Arms",
    border: { texture: "wood", colors: ["#241505", "#5a3a15", "#8a5c25", "#3a2410", "#241505"], glow: "#a5702f" },
    fx: { glint: true, glow: true, sparkle: false },
    elements: [
      { img: "weapon", y: 0.60, scale: 1.5, rowStep: 0.17,
        series: ["wpn_bo", "wpn_nunchaku", "wpn_sword", "wpn_kama", "wpn_wraps"] },
    ],
  },

  // ── ZEN · a raked sand garden; an ink ENSŌ draws itself, ripples spread and a stone
  // cairn rises with your REFLECTIONS — the calm frame (badge `zen`).
  zen: {
    base: "epic", label: "The Serene",
    border: { colors: ["#1a1a18", "#3a3a34", "#6a6a60", "#c8c4b0", "#1a1a18"], glow: "#a09a80" },
    fx: { glint: false, glow: true, sparkle: false, stackIn: true },   // calm — glow + gentle stack only
    elements: [
      { img: "enso", x: 0.5, y: 0.48, scale: 2.7, showAt: 0 },
      { img: "ripple", x: 0.5, y: 0.72, scale: 2.9, showAt: 30 },
      { img: "stone", y: 0.90, scale: 0.5, stackPer: 5, stackMax: 12, perCol: 4, colStep: 0.1, coinDy: 0.05 },
    ],
  },

  // ── SOVEREIGN'S CROWN · a jeweled crown that gains a season-colored gem per
  // CHAMPIONSHIP won — the apex flex (badge `grand-champion`; season-champion-sN map here).
  "grand-champion": {
    base: "legendary", label: "The Grand Champion",
    border: { colors: ["#1e0a2e", "#4a1560", "#7a2a90", "#e8c766", "#1e0a2e"], glow: "#d8a0f0" },
    fx: { glint: true, glow: true, sparkle: true },
    // PICTURE-FRAME RING (Sovereign's Crown): a FULL ornate gold champion's frame from
    // title #1 (you only hold this as a season grand champion). The growth is the GEMS —
    // one prominent season-colored gem across the top per season won (most win 1, a rare
    // few 2-5). A dynasty (3+) earns a royal gold rain.
    ring: {
      tints: ["#c9a24a"],           // single radiant gold — the frame is always the champion's, from title #1
      images: ["ring_crown"],       // one ornate gold champion frame
      stops: [],                    // no base tiers — the frame never "levels"; the gems do
      crownGems: ["gem_sapphire", "gem_amethyst", "gem_ruby", "gem_emerald", "gem_coral", "gem_onyx", "gem_rose", "gem_turquoise", "gem_peridot", "gem_platinum"],
      flourishAt: 3, flourishKind: "gold-rain",   // 3+ titles → a dynasty's gold rain
      thickness: 0.18, glow: "#f0d878",
    },
    elements: [
      { img: "crown_base", x: 0.5, y: 0.52, scale: 2.9, showAt: 0 },
      { img: "gem", y: 0.40, scale: 0.34, rowStep: 0.058,
        series: ["gem_sapphire", "gem_amethyst", "gem_ruby", "gem_emerald", "gem_coral", "gem_onyx", "gem_rose", "gem_turquoise", "gem_peridot", "gem_platinum"] },
    ],
  },

  // ── THE ASCENDANT · a pre-dawn sky that brightens toward sunrise as you set new
  // PERSONAL-BEST scores; a comet climbs the ring and a star is added per PB, cresting
  // in a shooting star at the tenth (badge `rising-star`). Nearly everyone earns tier 1
  // early — the joy is the ten-step climb.
  "rising-star": {
    base: "rare", label: "The Ascendant",
    border: { colors: ["#0b1030", "#1a2360", "#5a3a8a", "#e88a4a", "#0b1030"], glow: "#ffb066" },
    fx: { glint: true, glow: true, sparkle: true },
    // PICTURE-FRAME RING: pre-dawn night → first light → twilight climb → golden sunrise,
    // cross-fading as PERSONAL BESTS accrue (1 / 4 / 7), one star added per PB around the
    // ring, and a shooting star at the tenth — the summit.
    ring: {
      tints: ["#0b1030", "#152a6e", "#6a2f8a", "#e0913c"],   // pre-dawn · first light · twilight climb · sunrise
      images: ["ring_risingstar_0", "ring_risingstar_1", "ring_risingstar_2", "ring_risingstar_3"],
      stops: [1, 4, 7],           // 1 PB → first light · 4 → twilight climb · 7 → golden sunrise
      flourishAt: 10,             // the tenth personal best → shooting star (maxed)
      flourishKind: "shooting-star",
      thickness: 0.16, glow: "#ffb066",
      perimeter: { img: "starlet", per: 1, max: 10 },   // one star earned per personal best
    },
    elements: [
      // band fallback: a comet that appears once you're climbing + a star per PB
      { img: "comet", x: 0.5, y: 0.48, scale: 1.5, showAt: 1 },
      { img: "starlet", y: 0.62, scale: 0.44, repeatPer: 1, repeatMax: 10, rowStep: 0.06 },
    ],
  },

  // ── BATCH A · SINGLE-TIER "duel drama" frames (one-time epic moments). No progression:
  //    a themed border + one always-on signature motif (showAt 0). Glyph now, Firefly later.
  clutch: {
    base: "epic", label: "Clutch",
    border: { colors: ["#1a0f3a", "#5b2fd6", "#9a5cff", "#38e0ff", "#1a0f3a"], glow: "#8f6bff" },  // electric violet ⇄ cyan
    fx: { glint: true, glow: true, sparkle: true },
    elements: [{ img: "clutch", x: 0.5, y: 0.55, scale: 2.4, showAt: 0 }],
  },
  "flawless-victory": {
    base: "epic", label: "Flawless Victory",
    border: { colors: ["#2a2440", "#7a6fd6", "#e0b0ff", "#fff0c0", "#2a2440"], glow: "#ffe6a0" },  // iridescent prism
    fx: { glint: true, glow: true, sparkle: true },
    elements: [{ img: "flawless", x: 0.5, y: 0.55, scale: 2.3, showAt: 0 }],
  },
  "giant-slayer": {
    base: "epic", label: "Giant-Slayer",
    border: { colors: ["#2a0810", "#c01838", "#ff5a3c", "#ffcf4a", "#2a0810"], glow: "#ff8a3a" },  // crimson→gold sunburst
    fx: { glint: true, glow: true, sparkle: true },
    elements: [{ img: "slayer", x: 0.5, y: 0.55, scale: 2.4, showAt: 0 }],
  },
  deadlock: {
    base: "epic", label: "Deadlock",
    border: { colors: ["#0e2a6a", "#2f9fe0", "#ff6a2a", "#e02818", "#0e2a6a"], glow: "#ff7a3a" },  // clashing fire ⇄ ice
    fx: { glint: true, glow: true, sparkle: false },
    elements: [{ img: "deadlock", x: 0.5, y: 0.55, scale: 2.3, showAt: 0 }],
  },
  sweep: {
    base: "epic", label: "Clean Sweep",
    border: { colors: ["#06281a", "#12a05a", "#4fe08a", "#ffe07a", "#06281a"], glow: "#8fe0a0" },  // luminous emerald→gold
    fx: { glint: true, glow: true, sparkle: true },
    elements: [{ img: "broom", x: 0.5, y: 0.55, scale: 2.3, showAt: 0 }],
  },
  "undefeated-duelist": {
    base: "epic", label: "Undefeated",
    border: { colors: ["#0a1250", "#2f4fd0", "#5f8fff", "#ffd24a", "#0a1250"], glow: "#7fa0ff" },  // royal sapphire→gold
    fx: { glint: true, glow: true, sparkle: true },
    elements: [{ img: "shield", x: 0.5, y: 0.55, scale: 2.2, showAt: 0 }],
  },
};

// Expand a spec against a progress value into concrete positioned elements.
export function resolveElements(spec: BadgeFrameSpec, value: number): PlacedElement[] {
  const out: PlacedElement[] = [];
  for (const el of spec.elements) {
    if (el.series) {
      const n = Math.min(value, el.series.length);
      const step = el.rowStep ?? 0.09;
      const startX = 0.5 - (n - 1) * step / 2;
      for (let i = 0; i < n; i++) {
        const x = n <= 1 ? 0.5 : startX + i * step;
        out.push({ img: el.series[i], x, y: el.y, scale: el.scale, rotate: el.rotate });
      }
    } else if (el.stackPer) {
      const total = Math.min(Math.floor(value / el.stackPer), el.stackMax ?? 40);
      const perCol = el.perCol ?? 8;
      const cols = Math.max(1, Math.ceil(total / perCol));
      const colStep = el.colStep ?? 0.18;
      const coinDy = el.coinDy ?? 0.072;
      const startX = 0.5 - (cols - 1) * colStep / 2;
      for (let i = 0; i < total; i++) {
        const col = Math.floor(i / perCol);       // fill a column, then start the next
        const row = i % perCol;                   // higher row = higher up = drawn on top
        const x = cols <= 1 ? 0.5 : startX + col * colStep;
        out.push({ img: el.img, x, y: el.y - row * coinDy, scale: el.scale });
      }
    } else if (el.repeatPer) {
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
  laurel: "🌿", crown: "👑", gem: "💎", sword: "⚔️", shield: "🛡️", star: "⭐", medal: "🏅", chain: "⛓️",
  gold_medal: "🥇", silver_medal: "🥈", bronze_medal: "🥉",
  coin_gold: "🪙", coin_silver: "🪙", coin_bronze: "🪙",
  footprints: "👣", fist: "👊", bow: "🙏", sunrise: "🌅", lotus: "🪷", ballot: "🗳️", allies: "🤝",
  // new batch (2026-09-04): oracle / precision / ascent / podium / weapon-master / zen / grand-champion
  starlet: "✨", north_star: "🌟", comet: "☄️", target: "🎯", arrow: "🏹", arrow_gold: "🎯",
  peak: "⛰️", flag: "🚩", aurora: "🌌", laurel_leaf: "🌿", laurel_clasp: "🏆",
  weapon: "🗡️", wpn_bo: "🥢", wpn_nunchaku: "⛓️", wpn_sword: "🗡️", wpn_kama: "🪓", wpn_wraps: "🥊",
  enso: "⭕", stone: "🪨", ripple: "🌊", crown_base: "👑", ember: "🔥",
  gem_sapphire: "💎", gem_amethyst: "💎", gem_ruby: "💎", gem_emerald: "💎", gem_coral: "💎",
  gem_onyx: "💎", gem_rose: "💎", gem_turquoise: "💎", gem_peridot: "💎", gem_platinum: "💎",
  // Batch A single-tier motifs (Firefly art can replace these later)
  clutch: "⚡", flawless: "💯", slayer: "🗡️", deadlock: "🔒", broom: "🧹",
};

// Real element art from the public badge-frames bucket (?v busts the image cache
// when a file is re-uploaded); null → renderer uses the glyph.
export function frameElementUrl(img: string): string | null {
  const base = SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/badge-frames/${img}.png?v=16`;
}
