# Badges — Implementation Handoff (for Claude Code)

*Everything needed to wire the badge system into the app: seed the badges, attach each
to its trigger, award on the condition, and test. Art for 93 of 100 is final and
versioned; the rest is spec.*

Last updated: 2026-08-10

---

## Current state

- **92 / 100 badge medallions are final** — cropped, transparent-background PNGs in
  `docs/badge-art/final/<n>-<slug>.png` (1024², medallion only, no background).
- **8 pending art** (spec exists, art not yet made — safe to seed as rows now, art drops
  in later at the same filename): `71-podium-season`, `41-sponsors-champion`,
  `48-gem-s4-emerald`, `56-consistent-journaler`, `81-dojo-pride`, `87-mentor`,
  `90-globetrotter`, `70-trailblazer` (torch — earlier render was off-center, redo).
- **One asset to regenerate:** `72-gold-medallion-nmao-dragon.png` still has baked-in
  "Perfect-Season Champion" text (predates the text-free rule) — will be replaced in
  place; no code impact.
- Ten **season champion** medallions (`season-champion-s1..s10.png`) are final and
  lettered ("S# · SEASON CHAMPION").

## The files

| What | Where | Use |
|---|---|---|
| **Badge manifest (data)** | `docs/badge-manifest.csv` | Seed source — one row per badge |
| Manifest (editable / shareable) | `docs/badge-manifest.docx` · `.pdf` | Human-editable copy; CSV is source of truth |
| **Earn-rules detail** | `docs/badge-earn-rules.md` | Trigger-event glossary + per-badge conditions |
| **Final art** | `docs/badge-art/final/*.png` | Transparent medallions, filenames = manifest |
| Art variants | `docs/badge-art/variants/*.png` | Extra generations (e.g. grandmaster-alt2) — ignore for seed |
| Pipeline scripts | `scripts/rename_badges.py`, `scripts/crop_medallion.py`, `scripts/letter_champion.py` | Naming/cropping/lettering new art |

## Manifest columns (`badge-manifest.csv`)

`file_name, art_status(ready|pending), code, name, category, rarity, tiered, hidden,
trigger_event, earn_rule, notes`

- **`code`** = permanent key → `badges.code` / `emblem_key`, `badge_awards.badge_code`,
  pin `sku`. Never renumber (catalog had number collisions; slugs are collision-free).
- **`art_status`** = `ready` (art in `final/`) or `pending` (seed the row; art later).

## What to build

1. **Schema** — add `badges` and `badge_awards` (ship with RLS). Suggested:
   `badges(code pk, name, category, rarity, tiered bool, tiers jsonb, hidden bool,
   emblem_key, art_file, trigger_event, earn_rule, sku, active bool)` ·
   `badge_awards(id, competitor_id, badge_code, tier, round_id?, season_id?, awarded_at,
   seen bool default false)` with `unique(competitor_id, badge_code, tier)`.
2. **Seed** from `badge-manifest.csv` (all 100 rows; `pending` art is fine — the grid
   shows locked silhouettes until earned anyway).
3. **Award engine** — evaluate a badge's check on its `trigger_event` (glossary in
   `badge-earn-rules.md` §"Trigger-event glossary"), insert into `badge_awards` **only if
   absent** (idempotent). Tiered badges award per tier and store `tier`.
4. **Reveal** — `seen=false` drives the earn animation on next open (light-sweep →
   ignite → particle burst → toast), per `badge-catalog.md`.
5. **Hidden badges** (`zen`, `ghost`) render as "?" until earned.
6. **Tests** — unit-test each trigger's condition against seed/demo data; keep
   `npm run validate` green.

## Thresholds to finalize (pick concrete numbers)

A few earn rules carry a tunable `N`/`X` — set these with the product owner before tests:
`undefeated` win streak, `warpath`/`daily-voter`/`voice-of-the-people` counts,
`giant-slayer` rating gap, tiered thresholds (already suggested in the manifest, e.g.
On the Mat 3/6/9, Duelist 5/15/30, Voice 25/100/500).

## Feature-gated triggers (wire when the feature exists)

`on_cheer_sent` (Encourager, Mentor), `on_school_milestone` (Dojo Pride),
`on_scheduled` (Anniversary). Seed the rows; leave the check dormant until the feature
lands.

## Adding more badges later (the set is meant to grow)

New badge = one manifest row (`code`, `trigger_event`, `earn_rule`) + one medallion PNG
run through `crop_medallion.py`. No new plumbing. The 4 rows tagged `NEW - proposed`
(Mentor, Anniversary, Well-Rounded, Globetrotter) can be kept or cut.
