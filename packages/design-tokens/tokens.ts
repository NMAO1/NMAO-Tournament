// =====================================================================
// NMAO Tournament — shared design tokens (single source of truth for the
// Next.js web app AND the Expo/React-Native competitor app).
// Derived from docs/brand-tokens.md. Identity = "metallic and vibrant":
// every hue is a 3-stop gradient (highlight → base → shadow), not a flat fill.
// =====================================================================

export const hues = {
  ruby:     { hi: '#FF7A82', base: '#FF2E3B', shadow: '#B10D1E' }, // red
  amethyst: { hi: '#C982FF', base: '#A32BF7', shadow: '#6712C4' }, // purple
  sapphire: { hi: '#66A9FF', base: '#1F7BFF', shadow: '#0B3FD6' }, // blue
  gold:     { hi: '#FFE488', base: '#E6B93F', shadow: '#9C7A22' }, // accent / CTA / medals
  emerald:  { hi: '#6FE3A8', base: '#17B368', shadow: '#0B7A43' }, // green — uncommon rarity
} as const;
export type Hue = keyof typeof hues;

// LOCKED tier mapping — cool → hot as skill rises.
export const tierHue = {
  beginner:     'sapphire',
  intermediate: 'amethyst',
  advanced:     'ruby',
} as const;

export const neutrals = {
  bg:       '#080808', // page
  surface:  '#141414', // cards
  surface2: '#1b1b1d',
  border:   '#222222',
  text:     '#F5F0E8',
  muted:    '#B8B0A4',
  muted2:   '#7A7060',
} as const;

// The signature spectrum — logo lockup, headers, reveal energy burst,
// rating-gauge glow, key dividers, and Mission Control's pipeline line.
export const spectrum =
  'linear-gradient(90deg, #FF2E3B 0%, #C22DE0 40%, #A32BF7 52%, #4B6BFF 74%, #1F7BFF 100%)';

/** The signature spectrum as stops for RN <LinearGradient> (use horizontal start/end). */
export const spectrumStops = ['#FF2E3B', '#C22DE0', '#A32BF7', '#4B6BFF', '#1F7BFF'] as const;

export const status = { success: '#5A9A6A', danger: '#E07070', info: '#7DAAD4' } as const;

export const font = {
  display: 'Georgia, "Times New Roman", serif', // ceremonial headings
  ui:      'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

/** A metallic linear-gradient for a hue (CSS string; RN uses expo-linear-gradient colors). */
export function metal(h: Hue, deg = 160): string {
  const { hi, base, shadow } = hues[h];
  return `linear-gradient(${deg}deg, ${hi}, ${base} 55%, ${shadow})`;
}
/** The three stops as an array (for expo-linear-gradient / <LinearGradient colors>). */
export function metalStops(h: Hue): [string, string, string] {
  const { hi, base, shadow } = hues[h];
  return [hi, base, shadow];
}
/** Same-hue glow beneath the metal so it reads as lit, not painted. */
export function glow(h: Hue, alpha = 0.35): string {
  const n = parseInt(hues[h].base.slice(1), 16);
  return `0 0 18px rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---------------------------------------------------------------------
// Rarity → collectible-frame / medal treatment (dueling).
// common uses a neutral "steel"; rare/epic/legendary map to the hue set.
// ---------------------------------------------------------------------
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const rarityHue = { uncommon: 'emerald', rare: 'sapphire', epic: 'amethyst', legendary: 'gold' } as const;
export const steel = { hi: '#D7D2C7', base: '#8E877A', shadow: '#4B463D' } as const;

/** The 3 metal stops for a rarity (expo-linear-gradient colors). */
export function rarityStops(r: Rarity): [string, string, string] {
  if (r === 'common') return [steel.hi, steel.base, steel.shadow];
  return metalStops(rarityHue[r]);
}
/** The base color of a rarity — used for the frame's glow. */
export function rarityBase(r: Rarity): string {
  if (r === 'common') return steel.base;
  return hues[rarityHue[r]].base;
}

/** Tournament medal metals — asset-swappable placeholder gradients (gold/silver/bronze/participation). */
export const medalMetal = {
  gold:          ['#FFF7D6', '#E4AE3C', '#6E4E12'],
  silver:        ['#FFFFFF', '#C2CAD1', '#5C646B'],
  bronze:        ['#FBE3C4', '#C57F35', '#552F10'],
  participation: ['#F2F5F7', '#9BA7AF', '#454C52'],
} as const;
export type MedalType = keyof typeof medalMetal;

export const tokens = { hues, tierHue, neutrals, spectrum, status, font, rarityHue, medalMetal } as const;
export default tokens;
