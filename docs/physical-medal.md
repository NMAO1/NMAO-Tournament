# NMAO — Physical Collectible Medal (Season Yin-Yang)

*The physical twin of the competitor app's Yin-Yang Imprint. Over a season a competitor collects pieces that interlock into a single yin-yang medal; each piece's finish records how they placed that event, so the assembled medal is a visual map of their journey.*

Last updated: 2026-08-07
Related: `docs/competitor-app.md` (§5 the imprint mechanic), `docs/brand-tokens.md` (color).

---

## 1. Concept

A competitor receives **one piece per event**. The pieces seat into a gold frame and together form a **yin-yang**. The **finish of each piece encodes that event's result** — gold (1st), silver (2nd), bronze (3rd), or the **season color** (competed, didn't place). A fully assembled, mixed-finish medal is the season's story at a glance. It is the physical mirror of the on-screen imprint that fills segment-by-segment on reveal day.

## 2. Season structure → 12 pieces

Twelve events across the season, twelve pieces:

| # | Event | Piece it awards |
|---|---|---|
| 1–8 | Qualifying rounds 1–8 | Field piece (×8) |
| 9 | Qualifying round 9 | S-seam piece |
| 10 | Semi-final | S-seam piece |
| 11 | Grand finale | Center eye |
| 12 | **Sponsor tournament** (after the grand finale; random prize to one of the winners) | Center eye |

The two **center eyes** — the pieces Bradley wanted to preserve as the yin-yang's two circles — are the final two, so the symbol's "soul" completes only at the championship stage. (Mapping of piece *type* to event is a proposal; the counts are fixed.)

## 3. Piece anatomy — 3 dies, 12 pieces

The cost driver for an enamel medal is the number of **dies (tools)**, not the number of pieces. A yin-yang has 180° rotational symmetry, so the black swirl and the pearl swirl are the **same shapes** — one tool strikes both halves. And **finish/color is plating and enamel, never geometry**, so a gold piece and a season-color piece come off the *same* die.

| Master die | Struck | Notes |
|---|---|---|
| **Field piece** | ×8 | The repeated body shape; four per half, halves congruent by symmetry. |
| **S-seam piece** | ×2 | Hugs the S-curve; gives the true yin-yang swirl (vs. a flat half-and-half disc). |
| **Center eye** | ×2 | The two circles; gem/enamel center in a gold bezel. |

**Three dies produce all twelve pieces.** SKUs are `shape × plating × colorway` applied downstream — no extra tooling. Cost ladder if ever needed: **2 dies** (drop the S-seam, ten identical field pieces — cheapest, reads as a straight split), **3 dies** (this — keeps the S-curve, recommended), **6 dies** (five uniquely-sculpted body shapes per half — premium).

## 4. Assembly — frame-and-seat + puzzle-interlock edges

A hybrid that's both stylish and functional:

- **Frame / tray.** The gold rim + bail is a tray the pieces seat into. The frame carries all the tolerance, so twelve independently-plated pieces always align — critical because separately-struck enamel pieces never mate edge-to-edge tightly enough on their own.
- **Puzzle-interlock edges.** Pieces keep the flame-tab interlocking silhouette for the "these twelve lock together" feel and to aid registration as they drop in.
- **Retention.** Thin rare-earth magnet (or micro-snap) holds each seated piece.
- **Partial seasons still display well** — an incomplete yin-yang sits proudly in the tray; empty seats read as "still to earn," not broken.

## 5. Finish = placement

| Finish | Meaning |
|---|---|
| Gold plate | 1st that event |
| Silver plate | 2nd |
| Bronze plate | 3rd |
| **Season color** (enamel, changes each season) | Competed, didn't place — honors the effort |

Same die for all four; only the plating/enamel changes. This is what keeps 12 collectible pieces from becoming 12+ tools.

## 6. Open items to decide

- **Completion vs. inclusivity.** With eyes gated to the grand finale + sponsor tournament, only competitors who advance complete the full symbol. Earlier design leaned inclusive ("nobody's yin-yang stays empty," best-6-of-9). Decide: is the near-complete framed medal an acceptable keepsake for non-finalists, or should participation alone complete the body (eyes still special)?
- **Sponsor-tournament piece (12th).** Does every sponsor-tournament participant receive the 12th piece, or only the random-prize recipient?
- **Season color per season** — pull from `brand-tokens.md` spectrum (e.g. a different metallic hue each year), TBD per season.
- **Dimensions, weight, gem material** (enamel vs. resin vs. cut stone for the eyes), and vendor/tooling quotes.
- **Frame ships when** — with round 1, or as a starter kit before the season.

## 7. Digital ↔ physical parity

Every physical piece has a mirror segment in the app's Yin-Yang Imprint (`docs/competitor-app.md` §5–6). Earning a piece in the mail and lighting its segment on reveal day are the same moment in two places. Keep the twelve-piece map, finishes, and event order identical across both so the twin never diverges.
