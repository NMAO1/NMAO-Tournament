# NMAO Badge Art Direction — Style Bible & Prompt Pack

*The single source of truth for producing all ~90 badge emblems at collectible,
"Hearthstone / Genshin-grade" quality. Use this to generate hero art in an AI image
model (Midjourney or Adobe Firefly recommended) **or** to brief a human illustrator.
Every badge is rendered against the same style bible so the full set feels like one
coherent, collectible line.*

Companion to `badge-catalog.md` (names, earn rules, rarity) and
`badge-emblems-*.html` (the vector frame system these illustrations drop into).

Last updated: 2026-08-09

---

## 1. The vision in one line

> **Premium collectible battle-emblems for a modern martial-arts league** — each one
> a small painted trophy that makes a kid (and their parent) *want* to earn it, own
> the pin, and complete the set.

The feeling we're chasing: **awe, honor, and "I need the whole collection."** Think the
moment a card-game legendary flips over — light, depth, and a creature or symbol with
real presence.

---

## 2. Style bible (applies to every badge)

**Medium & rendering.** Painterly digital illustration — the polished, semi-realistic
"key art" look of premium collectible card games and gacha RPGs (Hearthstone, Legends
of Runeterra, Genshin Impact, Honkai). Rich brushwork, soft-but-crisp edges, visible
form and volume. **Not** flat vector, **not** cartoon-flat, **not** 3D-render-plastic,
**not** photorealistic.

**Lighting.** Cinematic and dramatic. A strong key light plus **rim/edge lighting** to
separate the subject from a dark background, warm glow on metal, a subtle inner glow on
the hero element. Light should make the emblem feel like it's *ignniting* — this maps
to the in-app "reveal" moment.

**Composition.** **Centered, symmetrical, iconic.** One dominant hero subject filling
~70% of the disc, bold silhouette readable at a glance. Circular medallion format.
Breathing room around the subject so it survives shrinking to a 1" pin.

**Color.** NMAO "dojo-luxe" palette — deep near-black backgrounds, **gold** as the
signature metal, and the brand spectrum accents: **ruby #FF2E3B, amethyst #A32BF7,
sapphire #1F7BFF**, plus warm **gold #E6B93F**. Each badge leans on 2–4 saturated
enamel colors + metal, never muddy. Vibrant but controlled — jewel tones, not neon.

**The frame.** A **circular metallic medallion border** (beveled, dimensional, with a
highlight sweep) — the "original colored border," **no starburst spikes**. The frame
metal encodes rarity (see §4). Optional thin inner keyline. The hero art sits inside a
recessed enamel field with a soft vignette for depth.

**Background.** Dark, atmospheric, subtle — a hint of dojo, sky, water, or energy
appropriate to the subject, with gentle bokeh or particle motes. Never busy; the hero
must pop.

**Finish cues.** Enamel sheen, metallic speculars, tasteful glow/particles. A single
catch-light on eyes/gems. Legendary pieces get a faint radiant aura and a gem accent.

**Consistency rules (non-negotiable):**

- Same frame, same disc proportions, same lighting direction (upper-left key) on all 90.
- Same painterly finish level across the set — no mixing flat and painted.
- Subject always centered and symmetric enough to read as a "seal/crest."
- Martial-arts soul in every piece: honor, discipline, energy — never violent or grim.

**Audience & tone.** Youth-and-family martial-arts league. Fierce and awe-inspiring is
great; **gore, real weapons pointed at a viewer, fear, or menace toward people is not.**
Dragons and tigers are noble and powerful, not scary.

---

## 3. Reference anchors

Pull 3–4 of these into your image tool as **style references** (Midjourney `--sref`,
Firefly "reference image") to lock the look before generating the set:

- Hearthstone card gem/hero frames and legendary card art.
- Legends of Runeterra region crests and card frames.
- Genshin Impact / Honkai character "namecard" emblems and elemental sigils.
- High-end **enamel pin** and **challenge-coin** photography (for the metal + enamel
  material read).
- Ornate **medal / medallion** product shots (for bezel and rim lighting).

Keep these constant for the whole run so batch-to-batch drift doesn't creep in.

---

## 4. Rarity = finish (frame + treatment modifiers)

Rarity is shown by the **frame metal and treatment** (digital and on the physical pin).
Append the matching modifier to every prompt:

| Rarity | Frame / treatment modifier to append |
|---|---|
| **Common** | `antique bronze medallion frame, warm patina, soft matte enamel, subtle glow` |
| **Uncommon** | `brushed silver medallion frame, cool sheen, clean enamel, gentle rim light` |
| **Rare** | `polished gold medallion frame, warm radiant glow, glossy enamel, strong rim light` |
| **Epic** | `iridescent spectrum enamel frame, prismatic metallic sheen, glowing particles, dramatic lighting` |
| **Legendary** | `platinum and black-nickel frame with a single inset gemstone, radiant divine aura, ornate detailing, numbered limited-edition feel` |

Tiered badges (Bronze/Silver/Gold levels) step the frame metal up the same ladder.

---

## 5. Master prompt template

Fill in `[SUBJECT]` from §7 and `[RARITY MODIFIER]` from §4.

**Midjourney (v6+):**

```
[SUBJECT], centered circular emblem, painterly collectible card-game key art
(Hearthstone, Genshin Impact style), dramatic cinematic rim lighting, rich enamel and
metal, [RARITY MODIFIER], dark dojo-luxe background with subtle bokeh, bold symmetrical
silhouette, martial-arts honor, high detail, glowing accents, trophy medallion design
--ar 1:1 --style raw --v 6
```

**Adobe Firefly (recommended for commercial/merch rights):** same prompt as a sentence;
set Content Type = **Art**, aspect **1:1**, and add a style reference image from §3.
Firefly's output is designed to be commercially safe for products you'll sell.

**DALL·E / other:** same prompt, add "digital painting, ornate medallion, symmetrical,
no text, no words."

**Global settings for the whole run:** square 1:1, high resolution, no text/lettering,
consistent upper-left light source, same style-reference set.

---

## 6. Negative prompts / guardrails

Append (or set as negative prompt where supported):

```
--no text, letters, watermark, signature, flat vector, cartoon, 3d plastic render,
photorealistic photo, cluttered background, gore, blood, realistic firearms, menacing
faces, extra frames, busy edges, low contrast, washed-out colors
```

Youth-safety: keep creatures **noble, not frightening**; weapons are **stylized and
never aimed at the viewer**; no injury, no blood, no fear.

---

## 7. Per-badge prompt pack (all ~90)

Each line gives the badge, its rarity, and the `[SUBJECT]` to drop into the template.
Subjects are written to convey **emotion and awe**, not just depict an object.

### First steps & milestones

1. **First Step** *(Common)* — a single bare foot stepping onto a glowing dojo mat, dawn light, a first-journey feeling, soft dust motes.
2. **First Bow** *(Common)* — a young martial artist bowing in silhouette, respectful, warm backlight, a beam of light from above.
3. **First Reveal** *(Common)* — a yin-yang symbol splitting open with light pouring through the seam, sense of discovery.
4. **First Reflection** *(Common)* — an ink brush and an open journal page with a glowing first character, quiet and contemplative.
5. **First Medal** *(Uncommon)* — a ribboned medal catching its first light, proud and gleaming, particle sparkle.
6. **First Gold** *(Rare)* — a radiant gold star-medal at the moment of triumph, bright burst behind it.

### Effort & consistency

7. **On the Mat** *(tiered)* — a training mat with glowing tally marks and a worn, honored surface, steady discipline.
8. **Nine Bows** *(Rare)* — nine points of light arranged in a perfect circle around a bowing figure, completion and devotion.
9. **Back on the Mat** *(Uncommon)* — a single glowing footprint turning back toward the mat, resilience and return.
10. **Early Bird** *(Uncommon)* — an elegant crane taking flight against a sunrise, first-light gold, serene power.
11. **Deadline Warrior** *(tiered)* — a dramatic hourglass with glowing sand and sparks, urgency and resolve.
12. **Iron Will** *(Rare)* — a glowing anvil struck with a burst of sparks, unbreakable determination.
13. **Perfect Attendance** *(Rare)* — a radiant calendar disc with every day lit, dedication, warm glow.

### Growth & improvement

14. **Rising Star** *(Uncommon)* — a shooting star arcing upward with a luminous trail, aspiration.
15. **New Heights** *(Uncommon)* — a mountain peak with a planted flag catching alpine sunrise, achievement.
16. **Steady Climb** *(Rare)* — glowing ascending stone steps rising into light, patient progress.
17. **Comeback** *(Uncommon)* — a phoenix rising from embers into brilliant flame, rebirth and hope.
18. **Breakthrough** *(Rare)* — a wooden board shattering with an explosive burst of light, power unleashed.
19. **Rising Floor** *(Uncommon)* — a glowing tide line lifting on calm water, quiet steady rise.
20. **Full Circle** *(Epic)* — a luminous hexagonal radar mastery diagram fully filled, prismatic, complete and balanced.

### Mastery — per criterion (each tiered Bronze/Silver/Gold)

21. **Precision** *(Technical)* — a glowing target with an arrow dead-center, sharp focus, laser accuracy.
22. **Kime** *(Power)* — a focused fist wreathed in crackling lightning, explosive contained power.
23. **Rooted** *(Balance)* — a mighty tree's roots gripping a mountain base, immovable stability, earthy glow.
24. **Flow** *(Timing)* — a vibrant curling tsunami wave, Hokusai-inspired, dynamic motion and grace.
25. **Spirit** *(Presentation)* — a fierce tiger's eye with living fire burning inside the iris, blazing inner spirit.
26. **Innovator** *(Difficulty/Creative)* — a lotus made of light and sparks blooming, creative genius, prismatic energy.
27. **Grandmaster** *(Legendary)* — a golden crown resting over a radiant yin-yang, supreme mastery, divine aura, inset gem.

### Events & exploration

28. **Both Hands** *(Uncommon)* — a fist and a martial weapon crossed in balance, versatility, metallic glint.
29. **Open Mind** *(Uncommon)* — a lifelike lotus opening in full color, magenta-to-violet petals over still water, gold center, enlightenment.
30. **Traditionalist** *(Rare)* — a serene martial artist seated in lotus meditation posture inside a glowing ensō ring, timeless discipline.
31. **Weapon Master** *(Rare)* — a crossed bo staff and sai gleaming, mastery of arms, dramatic highlight.
32. **Style Explorer** *(Uncommon)* — an ornate compass with a martial motif, curiosity and journey, glowing needle.
33. **Fearless Challenger** *(Uncommon)* — a fierce noble tiger's eye, amber and gold with a cat-slit pupil, courage and intensity (not frightening).
34. **Podium** *(Uncommon)* — a three-step podium bathed in spotlight, triumph, confetti motes.
35. **Gold Rush** *(tiered)* — a stack of gleaming gold bars radiating light, abundance of victory.
36. **Sweep** *(Epic)* — a clean luminous crescent arc sweeping across multiple medals, dominance, spectrum sheen.
37. **Undefeated** *(Rare)* — a fierce golden dragon face, noble and powerful, guardian of an unbroken streak, radiant.

### Placement & podium (season flagships)

71. **Podium Season** *(Epic)* — a laurel wreath woven from medals encircling a glowing center, a season of consistent excellence, spectrum enamel.
72. **Gold Medallion** *(Legendary — flagship)* — the NMAO dragon coiled into a radiant medallion, rendered in ruby-amethyst-sapphire spectrum scales on a solid gold field with a platinum rim and gem accent, the perfect season, the rarest and most coveted emblem, divine aura. *(Use the official NMAO dragon mark as the base if available.)*

### Championship & advancement

38. **Semifinalist** *(Rare)* — a tournament bracket with a glowing star node, rising through the ranks.
39. **Finalist** *(Epic)* — two bracket paths converging on a crown, the final stage, spectrum glow.
40. **Grand Champion** *(Legendary)* — a laurel crown over a radiant yin-yang, ultimate victory, divine golden aura, inset gem.
41. **Sponsor's Champion** *(Legendary)* — a starred championship ribbon with regal detailing, prestige, gem accent.
42. **Giant Slayer** *(Epic)* — a small determined figure silhouetted against a towering opponent, courage overcoming odds, dramatic backlight.

### Imprint & the Gem Series (color-matched to the medals)

43. **Imprint Complete** *(Rare)* — a fully assembled glowing yin-yang medallion, wholeness, earned by everyone who shows up all season.
44. **Season Keepsake** *(Rare)* — an assembled multi-segment medallion catching the light, a treasured keepsake.
45–54. **The Gem Series (S1–S10)** *(flagship line)* — a gem-cut yin-yang carved from a single jewel, faceted and luminous, one per season in its locked color: **S1 Sapphire, S2 Amethyst, S3 Ruby, S4 Emerald, S5 Coral, S6 Onyx (iridescent black), S7 Rose, S8 Turquoise, S9 Peridot, S10 Platinum.** Each: `a faceted [GEM]-cut yin-yang medallion, brilliant gemstone facets, radiant [GEM] glow, collectible jewel`.
55. **Decade of Dedication** *(Legendary)* — a platinum yin-yang ringed by ten glowing stars, a decade of devotion, divine aura, gem accent.

### Journal & reflection

56. **Consistent Journaler** *(tiered)* — an open book with a glowing quill and softly lit pages, reflection as practice.
57. **Reflective Warrior** *(Rare)* — a warrior seated in calm meditation, sword laid to rest before them, inner peace, warm glow.
58. **Goal Keeper** *(Uncommon)* — an arrow buried in a bullseye's gold center, intention fulfilled.

### Dueling series

59. **First Duel** *(Common)* — two crossed swords catching first light, the beginning of rivalry, honorable.
60. **Duelist** *(tiered)* — two mirrored warrior silhouettes facing off, poised and respectful.
61. **First Blood** *(Uncommon)* — a single decisive strike-flash of light, first victory (stylized, no gore).
62. **Warpath** *(Rare)* — a rising blade wreathed in momentum lines and sparks, an unstoppable run.
63. **People's Champion** *(Rare)* — raised triumphant hands lifted by a glow of community support, beloved victor.
64. **Road Warrior** *(Rare)* — a glowing map dotted with location pins connected by a path, a traveled challenger.
65. **Rivalry** *(Uncommon)* — two interlocked glowing rings/blades, destined rematch, balanced tension.
66. **Undefeated Duelist** *(Epic)* — an unbroken radiant blade with a spectrum aura, flawless streak.
67. **Iron Duelist** *(Rare)* — an hourglass fused with a blade, relentless weekly discipline, sparks.
68. **Duel Legend** *(Legendary)* — a crowned blade radiating divine light, #1 of the tier, gem accent.
80. **Deadlock** *(Epic)* — two blades locked edge-to-edge in perfect equal tension, a true draw, charged energy between them.

### Voting

73. **First Vote** *(Common)* — a glowing ballot dropping into a box, the community's first voice.
74. **Voice of the People** *(tiered)* — a radiant megaphone emitting light-waves, the crowd's voice amplified.
75. **Daily Voter** *(Uncommon)* — a calendar with a steady flame, daily devotion.
76. **Sharp Eye** *(Rare)* — a keen open eye with a glowing iris, discernment and accuracy.
77. **Kingmaker** *(Rare)* — a crown passing between two hands on a beam of light, the deciding vote.
78. **Fair Witness** *(Uncommon)* — perfectly balanced glowing scales, impartial judgment.
79. **Trusted Voter** *(Epic)* — an ornate wax seal glowing with authority, proven trust, spectrum sheen.

### Community & dojo

63b. **Dojo Pride** *(Uncommon)* — a proud school crest/banner catching the light, collective honor. *(Note: catalog #63 is duplicated between Dueling and Community — assign a unique code.)*
64b. **Teammate** *(Common)* — two friendly figures training side by side, camaraderie, warm glow.
65b. **Encourager** *(Uncommon)* — an open hand cupping a glowing heart, kindness and support.

### Legendary, hidden & charter (the chase)

66c. **Perfect Score** *(Legendary)* — a radiant ensō circle framing a glowing "100," flawless mastery, divine aura, gem.
67c. **Zen** *(Epic, hidden)* — a single serene ensō brushstroke with a soft inner glow, effortless composure.
68c. **Ghost** *(Rare, hidden)* — a faint luminous silhouette dissolving into mist, a secret earned.
69. **Charter Member** *(Legendary, limited)* — an "S1" wax seal with regal detailing and a gem, founding honor.
70. **Trailblazer** *(Legendary, limited)* — a blazing torch held high against the dark, a first pioneer, radiant flame, gem accent.

> **Catalog cleanup flag:** the source catalog reuses numbers **63/64/65** (Dueling vs
> Community) and **66/67/68** (Dueling vs Legendary/Hidden). Assign each its own unique
> `code`/`emblem_key` before production so pins and SKUs don't collide.

---

## 8. Production workflow

1. **Lock the look.** Generate the **7 hero pieces first** — Undefeated (dragon),
   Fearless & Spirit (tiger eyes), Open Mind (lotus), Traditionalist (meditator),
   Flow (tsunami), Gold Medallion (NMAO dragon). Iterate until one style-reference set
   nails the feel; freeze those `--sref` / reference images.
2. **Batch the rest** in groups of ~10, reusing the frozen references so all 90 match.
3. **Select** the best generation per badge (aim for centered, clean silhouette,
   on-palette).
4. **Assemble.** Composite each hero illustration into the shared medallion frame with
   the correct rarity metal; add the vignette, keyline, and gloss. (I can do this step
   and keep the frame identical across the set.)
5. **Vectorize for pins.** Trace/redraw the selected art to clean vector at
   manufacturing spec (bold silhouette, ≤4 enamel colors + metal, legible at 1–1.25",
   die-struck soft/hard enamel). Deliver a print-ready file per SKU.
6. **Locked & hidden states.** Also export each as a **dark embossed silhouette**
   (locked) and a **"?"** plate (hidden) for the in-app grid.

**Rights note:** if these will be **sold** as merch, prefer **Adobe Firefly** (trained
for commercial safety) or a commissioned illustrator with a work-for-hire/assignment of
rights. Confirm the commercial-use terms of whatever generator you choose before selling
pins. Keep the **NMAO dragon** as your own registered mark on the flagship medallion.

---

## 9. One-page illustrator brief (if you commission a human)

**Project:** ~90 collectible martial-arts achievement badges (digital + enamel pins).
**Look:** premium collectible card-game key art (Hearthstone / Genshin grade) — painterly,
dramatic rim lighting, dark dojo-luxe backgrounds, gold-forward with ruby/amethyst/
sapphire accents. Circular medallion frame (metal = rarity), centered iconic hero,
bold silhouette, enamel + metal finish, tasteful glow. Noble and honorable, youth-safe
(no gore, no menace).
**Deliverables per badge:** (a) full-color hero illustration on transparent/dark, 2048px
square; (b) production-ready vector for enamel-pin manufacture (≤4 colors + metal,
legible at 1"); (c) locked dark-silhouette version.
**Consistency:** one frame system, one lighting direction, one finish level across all 90;
rarity encoded by frame metal per the table in §4.
**Source:** subjects, names, and rarity in this document (§7) + `badge-catalog.md`.
**Style refs:** §3. **Guardrails:** §6.
**Flagship pieces to nail first:** Gold Medallion (NMAO dragon), Grandmaster, the Gem
Series, Undefeated (dragon), Spirit/Fearless (tiger eyes).
