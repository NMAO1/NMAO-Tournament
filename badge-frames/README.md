# Badge Frames — effects kit (for Claude Code)

Drop-in implementation of the "collect the look" system (`docs/badge-frames-effects.md`).
Wraps a competitor's video / avatar in the animated frame unlocked by their equipped
badge. Effects **escalate with rarity**: Common = flat border, Legendary = full aura +
signature motif. Everything is driven by a per-badge `frame_spec`.

## Files

| File | What |
|---|---|
| `badge-frames.css` | All borders, glows, animations, particles, keyframes, reduced-motion. |
| `badge-frames.js` | Runtime: `applyFrame(el, spec)`, `createFrame(media, spec)`, `MOTIFS`. ES module + `window.BadgeFrames`. |
| `BadgeFrame.tsx` | React wrapper for the Next.js app. |
| `frame-spec.ts` | `FrameSpec` types. |
| `preview.html` | Self-contained gallery of **all 100** frames — open in a browser to verify. |
| `../docs/badge-frames.json` | The data: `frame_spec` keyed by badge `code` (seed source). |
| `../docs/badge-frames.csv` | Same data, editable/joinable on `code`. |

## Integrate (Next.js / React)

1. Copy this folder into the app (e.g. `components/badge-frames/`) and import the CSS
   once in the arena layout: `import "./badge-frames.css";`
2. Load the specs (`docs/badge-frames.json`) — bundle it, or serve `frame_spec` from the
   `badges` table.
3. Wrap the video:

   ```tsx
   import { BadgeFrame } from "@/components/badge-frames/BadgeFrame";
   import frames from "@/data/badge-frames.json"; // FrameSpecMap

   <BadgeFrame spec={frames[competitor.equippedFrameBadgeCode ?? "first-step"]}>
     <video src={duel.videoUrl} muted playsInline loop />
   </BadgeFrame>
   ```

Vanilla (no React): give an element `.bf` containing `.bf__inner`, then
`BadgeFrames.applyFrame(el, spec)`.

## How a spec maps to visuals

`frame_spec = { tier, border, glow, anim, particle, motif }`

- **border** → the ring fill (`gold`, `spectrum`, `gemstone`, `flame`, `ripple`, …).
- **glow** → `none | soft | strong | radiant` box-shadow (color = accent).
- **anim** → ring rotation or glow pulse/breathe/flicker.
- **particle** → `{ kind: ember|bubble|sparkle, color, count }` rising/twinkling.
- **motif** → flagship-only signature overlay (dragon-coil, laurel, gem-shine, …).
- **accent** color = `particle.color` if set, else a per-border default.

Editing an effect = editing that badge's row in `badge-frames.csv` / `.json`. Common
rows are intentionally empty of effects.

## Interaction effects

`clash-lightning` (Deadlock) and `twin-rings` (Rivalry) are motifs that read best when
both arena frames show them together. For the full cross-frame Deadlock arc (lightning
spanning the gap between the two videos), render a shared overlay between the two
`BadgeFrame`s — see `docs/badge-frames-effects.md` § interaction effects.

## Performance & accessibility

- Only the equipped frame(s) on screen animate; use GPU-friendly props (transform,
  opacity, box-shadow). Cap particle counts (already tuned per rarity).
- `prefers-reduced-motion: reduce` disables all animation and pins particles static.
- Cosmetic only — no text, no identity, COPPA-safe.

## Motif status

Borders, glows, animations, and particles are production-ready for all 100. The
**signature motifs** (`MOTIFS` in `badge-frames.js`) are a tasteful **first pass** —
stylized SVG overlays. Polish or swap them for richer animated SVG/Lottie later without
touching the rest of the system.

## Preview

Open `preview.html` in any browser (double-click — it's self-contained) to see every
badge's frame around a placeholder video, grouped by rarity tier so the escalation is
obvious.
