# NMAO Tournament — Brand Tokens (v1)

*The tournament app's visual identity: **metallic and vibrant** — a red→purple→blue spectrum with gold and black. Distinct from the member platform's flat black-and-gold; the tournament is the celebratory, competitive surface. Derived from the WKC-era logo.*

Last updated: 2026-08-06

## Principle: metallic, not flat

Every brand color is rendered as a **3-stop metallic gradient** (bright highlight → saturated base → deep shadow), usually with a thin top sheen (`inset 0 1px 0 rgba(255,255,255,.4)`). Flat fills are reserved for text and hairlines. This is what makes it read as **polished metal** rather than plain color.

## Core palette (v2 — vibrant)

| Token | Base hex | Metallic gradient (highlight → base → shadow) |
|---|---|---|
| **Ruby** (red) | `#FF2E3B` | `#FF7A82 → #FF2E3B → #B10D1E` |
| **Amethyst** (purple) | `#A32BF7` | `#C982FF → #A32BF7 → #6712C4` |
| **Sapphire** (blue) | `#1F7BFF` | `#66A9FF → #1F7BFF → #0B3FD6` |
| **Gold** (accent) | `#E6B93F` | `#FFE488 → #E6B93F → #9C7A22` |

*Vibrance tip:* on chips/medals, add a soft same-hue glow (`box-shadow: 0 0 18px rgba(<hue>,.35)`) beneath the sheen so the metal looks lit, not painted.

### Neutrals
`--bg #080808` (page) · `--surface #141414` (cards) · `--surface-2 #1b1b1d` · `--border #222222` · `--text #F5F0E8` · `--muted #B8B0A4` · `--muted-2 #7A7060`

### The Spectrum (signature gradient)
```
--spectrum: linear-gradient(90deg, #FF2E3B 0%, #C22DE0 40%, #A32BF7 52%, #4B6BFF 74%, #1F7BFF 100%);
```
The hero identity element — logo lockup, section headers, the reveal energy burst, the rating-gauge glow, key dividers.

## CSS custom properties (drop-in)

```css
:root {
  /* neutrals */
  --bg:#080808; --surface:#141414; --surface-2:#1b1b1d; --border:#222;
  --text:#F5F0E8; --muted:#B8B0A4; --muted-2:#7A7060; --gold-ink:#080808;

  /* base hues (v2 — vibrant) */
  --ruby:#FF2E3B; --amethyst:#A32BF7; --sapphire:#1F7BFF; --gold:#E6B93F;

  /* metallic gradients */
  --metal-ruby:     linear-gradient(160deg,#FF7A82 0%,#FF2E3B 46%,#B10D1E 100%);
  --metal-amethyst: linear-gradient(160deg,#C982FF 0%,#A32BF7 46%,#6712C4 100%);
  --metal-sapphire: linear-gradient(160deg,#66A9FF 0%,#1F7BFF 46%,#0B3FD6 100%);
  --metal-gold:     linear-gradient(160deg,#FFE488 0%,#E6B93F 55%,#9C7A22 100%);

  /* signature spectrum */
  --spectrum: linear-gradient(90deg,#FF2E3B 0%,#C22DE0 40%,#A32BF7 52%,#4B6BFF 74%,#1F7BFF 100%);

  /* metallic sheen to layer on any gradient chip/button */
  --sheen: inset 0 1px 0 rgba(255,255,255,.45), inset 0 -2px 4px rgba(0,0,0,.35);

  /* status (kept muted so they don't fight the brand) */
  --success:#5A9A6A; --danger:#E07070; --info:#7DAAD4;
}
```

## Roles (how the colors mean something)

- **Black** is the canvas — everything sits on `--bg` / `--surface`.
- **Gold** = **achievement & action**: medals, primary CTAs, the yin-yang's earned segments, rank rings. Gold is the "you did it" color.
- **The Spectrum (Ruby / Amethyst / Sapphire)** = **energy & identity**: the logo, headers, the reveal burst, celebratory moments, and — proposed — **rank tiers**:
  - **Sapphire → Beginner**, **Amethyst → Intermediate**, **Ruby → Advanced** (cool → hot as skill rises) — **LOCKED**. Gives the spectrum a functional, intuitive job alongside its brand role.
- **Type:** serif display (Georgia / a refined serif) for headings; clean sans (Inter/system) for UI. Ceremonial, generous spacing.

## Usage notes

- Prefer gradients + `--sheen` for anything that should feel like metal (buttons, chips, medals, the spectrum bar). Keep body text and hairlines flat.
- Don't put the vibrant hues behind large bodies of text — use them as accents, edges, and moments. Gold and the spectrum are seasoning, black is the plate.
- Accessibility: keep text on `--bg`/`--surface` at AA contrast (the warm `--text` passes); use gold/white text on the vibrant chips, never vibrant-on-vibrant.

## Season colors (medallion enamel + digital constellation) — LOCKED, first 10 years

Each season has a signature gemstone color used for **both** the physical
collectible medal's enamel (`physical-medal.md` §5) and the digital Imprint /
lifetime-constellation medallion (`competitor-growth-and-badges.md` §3b). Fixed and
global — "a Season 3 Ruby medallion" means the same for everyone. Rendered as a
3-stop metallic gradient on the black core with the gold rim.

| Season | Gemstone | Highlight | Base | Shadow |
|---|---|---|---|---|
| 1 | Sapphire | `#66A9FF` | `#1F7BFF` | `#0B3FD6` |
| 2 | Amethyst | `#C982FF` | `#A32BF7` | `#6712C4` |
| 3 | Ruby | `#FF7A82` | `#FF2E3B` | `#B10D1E` |
| 4 | Emerald | `#7DE0C0` | `#2BC79A` | `#0E7A5C` |
| 5 | Coral | `#FF9E7A` | `#FF6A2B` | `#C43C0C` |
| 6 | Topaz | `#FFDA7A` | `#F2B520` | `#B57E08` |
| 7 | Rose | `#FF9DD0` | `#F0369B` | `#B01268` |
| 8 | Turquoise | `#8DE8F0` | `#22C7D6` | `#0B7E8C` |
| 9 | Peridot | `#D6F07A` | `#A7E22B` | `#6E9612` |
| 10 | Platinum | `#F2F4F7` | `#CDD2D9` | `#8A9099` |

Note: Season 6 (Topaz) sits nearest the gold rim — the physical medal that year may
want a cooler/silver rim or a brighter amber enamel for contrast. After year 10 the
rotation can extend (Onyx, Garnet, Aquamarine, Citrine…) or restart with a marker.

## Reconcile with the frontend handoff

`docs/frontend-handoff.md` §3 lists the base black + gold tokens; **this file extends them** with the metallic red/purple/blue spectrum. Where they overlap (bg, surface, border, gold, text), the values match. Treat this file as the source of truth for the tournament app's color.
