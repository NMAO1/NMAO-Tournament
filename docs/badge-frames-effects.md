# Badge Frames & Effects — "collect the look"

*A second life for badges: every badge also unlocks a **signature visual effect** — a
border color, glow, animated motif, or particle aura — that wraps a competitor's video
in the **dueling arena** (side-by-side, exactly like judging) and on their profile. You
collect badges not only for the badge, but for the effect it lets you wear. Rarer badge =
rarer aura = a flex everyone sees in the arena.*

Companion to `badge-catalog.md`, `badge-manifest.csv`, `BADGES-HANDOFF.md`.

Status: design / mapping. Not yet built. Phase-2+ (rides on the dueling feature).

---

## Why this works

Duels are watched — two videos side by side, community voting. That's the most-seen
surface in the product, so it's the right place to **show off**. Tying a cosmetic frame
to each badge turns the whole 100-badge set into a wardrobe: earning a badge unlocks its
look, and the look is visible precisely where competitors most want to stand out. It
adds a collection motive with **zero pay-to-win** (cosmetic only) and **zero content
risk** (no text, COPPA-safe).

## Where a frame shows

1. **Dueling arena (primary):** the animated frame wraps each competitor's video, both
   sides visible at once. Some effects are *interaction effects* between the two frames.
2. **Profile card / avatar ring:** your equipped frame rings your profile.
3. **Reveal moment:** your active frame flourishes as scores reveal.
4. **Leaderboards:** a slim version rings your row avatar.
5. **Badge detail sheet:** a live preview of the effect (earned = play; locked = teased).

## Equip model

- Earning a badge (`badge_awards`) **unlocks its frame**. Frames are cosmetic and
  permanent once earned.
- A competitor **equips one active frame** (their "look") shown in duels/profile.
  Optional second slot later (e.g. an "accent" or entrance flourish).
- Default: newest competitors show the simple Common frame; equipping is a deliberate,
  fun choice ("wear your rarest, or your favorite").
- Guardian controls apply as elsewhere; nothing here exposes identity or free text.

## Effect taxonomy (buildable, not 100 bespoke shaders)

Most frames are **parametric** — assembled from a few primitives keyed off the badge's
theme and rarity. Only the **flagships** get hand-authored signature motifs. This keeps
100+ effects maintainable.

**Primitives**

- **Border style:** solid · beveled-metal · rope-laurel · gemstone-facet · spectrum.
- **Glow:** none · soft pulse · strong pulse · radiant.
- **Animation:** none · shimmer-sweep · rotating-conic · breathing · flame-flicker ·
  ripple · lightning.
- **Particles:** none · embers · bubbles · petals · sparkles (color-tunable).
- **Color source:** rarity metal · badge theme · season gem.

**Signature overlays (flagships only, ~10–14 hand-made):** an animated motif layered on
the frame — e.g. a golden dragon coiling the border (Undefeated / Gold Medallion), a
laurel that grows (Grand Champion), a torch flame (Trailblazer), the season-gem shine
(Season Champions).

## Locked principle: escalate with rarity

**Common badges are plain; ornamentation and animation increase with rarity.** A Common
frame is a flat colored border with no motion; each tier up adds glow, then movement,
then particles, then a full aura with a signature motif at Legendary. Rarity is legible
at a glance from the frame alone.

The recipe for every badge is generated to this rule and lives in **`badge-frames.csv`**
(editable, joins on `code`) and **`badge-frames.json`** (seed-ready `frame_spec`). Fields:
`border, glow, anim, particle_{kind,color,count}, motif`. Tweak any row; Common rows stay
intentionally empty of effects.

## Rarity → effect ladder (the read-at-a-glance tier)

| Rarity | Frame recipe |
|---|---|
| **Common** | solid bronze border, no motion |
| **Uncommon** | brushed-silver border, soft glow |
| **Rare** | gold border, shimmer-sweep or slow rotating shine |
| **Epic** | iridescent **spectrum** border, rotating + sparkles |
| **Legendary** | full **aura** — radiant glow, particles, signature motif, entrance flourish |

Tiered badges step the frame up the same ladder as their plating (Bronze→Silver→Gold).

## Starter mapping (theme-matched frames)

| Badge | Frame effect |
|---|---|
| First Step *(C)* | plain bronze border |
| Fearless *(U)* | amber tiger pulse |
| Undefeated *(R)* | gold border + coiling-dragon shimmer + gold sparks |
| Spirit *(R)* | flame-flicker border, rising embers |
| Flow *(R)* | blue ripple border, rising bubbles |
| Rooted *(R)* | earthy green border, slow steady breathing |
| Sweep / Full Circle *(Epic)* | rotating spectrum border + prismatic sparkles |
| Season Champion S# *(Legendary)* | that season's **gem** border, radiant pulse, gem sparkles |
| Grand Champion *(Legendary)* | platinum aura, growing laurel, gold particle rain |
| Gold Medallion *(Legendary)* | gold aura + NMAO-dragon coil, entrance flare |
| Zen *(Epic, hidden)* | calm green breathing glow, minimal |

*(Full per-badge `frame_spec` lives with the seed — see data model.)*

## Interaction effects (the arena is two frames at once)

Because duels render both videos together, some frames can **react to the matchup**:

- **Deadlock** *(Epic)* — when a duel ends in a true deadlock draw, both frames snap to
  an electric-blue charge and a lightning arc crosses the gap between the videos.
- **Rivalry** — a rematch subtly links the two frames (twin rings).
- **Clash telegraph** — two Legendary auras facing off intensify slightly (a "title
  fight" feel). Purely cosmetic, tasteful, capped.

These are opt-in polish, not required for MVP.

## Collection & progression hooks

- **Preview to chase:** the badges page plays each frame; locked ones show a dimmed
  teaser ("earn to unlock this aura").
- **Set bonuses:** completing a set (e.g. all six Mastery badges) unlocks a combined
  **prismatic mastery** frame you can't get any other way.
- **Seasonal flex:** Season Champion frames are the rarest, color-coded per year —
  collectors chase the full decade.
- **Equip loadout:** picking your look is a small, repeatable dopamine loop.

## Technical implementation

- Render as an **overlay layer** around the HTML5 `<video>` (a positioned frame element
  + optional particle layer). CSS-first: border, `box-shadow` glow, `conic-gradient`
  rotation, keyframes; a tiny `<canvas>` only for richer particle/flame flagships.
- **Signature motifs** ship as lightweight animated SVG/Lottie overlays (a small,
  curated library, lazy-loaded per equipped frame).
- **Performance budget:** GPU-friendly props only (`transform`, `opacity`); cap
  concurrent particles; only the two equipped frames animate in an arena, not the whole
  grid. Degrade to static borders on low-power/battery-saver.
- **Accessibility:** honor `prefers-reduced-motion` → static colored border, no
  particles. Never rely on motion to convey required info.
- **COPPA/safety:** cosmetic only; no text, no identity leak; guardian sharing rules
  unchanged.

## Data model additions

- `badges.frame_spec jsonb` — the recipe: `{tier, border, glow, anim, particle:{kind,
  color,count}, motif?}`. Seed alongside `badge-manifest.csv`.
- `competitors.equipped_frame_badge_code` (FK → `badges.code`; null = default Common).
- Unlocks derive from existing `badge_awards` (no new unlock table needed).
- Optional later: `frame_loadout` (active + accent + entrance) if we add slots.

## Build phases

1. **MVP** — `frame_spec` on badges; equip one frame; render the parametric
   border+glow+particles around the arena videos and the profile ring. Rarity ladder +
   ~6 theme frames (Undefeated, Spirit, Flow, a Season gem, an Epic spectrum, Common).
   Respect reduced-motion.
2. **Phase 2** — full per-badge parametric coverage (all 100), badges-page previews +
   locked teasers, leaderboard + reveal placements.
3. **Phase 3** — signature flagship motifs (dragon coil, laurel, gem shine),
   interaction effects (Deadlock lightning, rivalry links), set-bonus frames, entrance
   flourishes.

## Open questions

- One equipped frame, or a small loadout (frame + entrance)?
- Auto-equip the rarest earned, or always the competitor's manual pick?
- Do frames also appear in the seasonal (non-duel) reveal, or duel + profile only at
  first?
- How curated should signature motifs be (cost vs. wow) — start with ~6 flagships?
