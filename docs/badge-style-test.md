# NMAO Badges — Style Test Sheet (run these first)

*Goal: burn the fewest generations to **lock one look**, then reuse it across all 90.
Run the 5 prompts below, pick the winner, extract its style reference, and freeze it.
Everything after that just swaps the subject line.*

Companion to `badge-art-direction.md`. Do this **before** batching the collection.

---

## Why these 5

They're the five hardest, most different subjects. If one style holds across all of
them, it will hold across the whole set:

1. **Undefeated** — a fierce creature (dragon) → tests faces/scales.
2. **Spirit** — an eye with inner fire → tests glow + organic detail.
3. **Open Mind** — a colorful lotus → tests botanical form + color range.
4. **Gold Medallion** — the flagship → tests gold + platinum + spectrum metal treatment.
5. **Traditionalist** — a seated figure → tests human form + calm mood.

---

## How to run (settings)

- **Midjourney:** paste the prompt as-is. Generate 2–3 variations of each. Keep
  `--ar 1:1 --style raw --v 6` (already in each prompt).
- **Adobe Firefly** *(recommended if you'll sell pins)*: paste the sentence part,
  set **Content type = Art**, **Aspect = Square (1:1)**, **Effects/Style = none extra**.
  Firefly output is built to be commercially safe for merch.
- Generate **all 5 in one sitting** so they share model conditions.
- Don't chase perfection yet — you're judging **style**, not final art.

---

## The 5 prompts (copy-paste ready)

### 1 — Undefeated (Rare · dragon)

```
A fierce but noble golden dragon face, front-facing, glowing amber eyes, ornate
horns and whiskers, centered circular emblem, painterly collectible card-game key art
(Hearthstone, Genshin Impact style), dramatic cinematic rim lighting, rich enamel and
metal, polished gold medallion frame, warm radiant glow, glossy enamel, dark dojo-luxe
background with subtle bokeh, bold symmetrical silhouette, martial-arts honor, high
detail, glowing accents, trophy medallion design --ar 1:1 --style raw --v 6
```

### 2 — Spirit (Rare · fire in a tiger's eye)

```
A fierce tiger's eye with living fire burning inside the amber iris, cat-slit pupil,
tiger-fur stripes, blazing inner spirit, centered circular emblem, painterly
collectible card-game key art (Hearthstone, Genshin Impact style), dramatic cinematic
rim lighting, rich enamel and metal, polished gold medallion frame, warm radiant glow,
glossy enamel, dark dojo-luxe background with subtle bokeh, bold symmetrical silhouette,
martial-arts honor, high detail, glowing accents, trophy medallion design
--ar 1:1 --style raw --v 6
```

### 3 — Open Mind (Uncommon · lotus)

```
A lifelike lotus flower opening in full bloom, magenta-to-violet petals over still
water, glowing gold center, serene enlightenment, centered circular emblem, painterly
collectible card-game key art (Hearthstone, Genshin Impact style), dramatic cinematic
rim lighting, rich enamel and metal, brushed silver medallion frame, cool sheen, clean
enamel, gentle rim light, dark dojo-luxe background with subtle bokeh, bold symmetrical
silhouette, martial-arts honor, high detail, glowing accents, trophy medallion design
--ar 1:1 --style raw --v 6
```

### 4 — Gold Medallion (Legendary · flagship NMAO dragon)

```
A majestic dragon coiled into a radiant medallion, scales shimmering in ruby, amethyst
and sapphire spectrum over a solid gold field, the perfect-season trophy, centered
circular emblem, painterly collectible card-game key art (Hearthstone, Genshin Impact
style), dramatic cinematic rim lighting, rich enamel and metal, platinum and black-nickel
frame with a single inset gemstone, radiant divine aura, ornate detailing, numbered
limited-edition feel, dark dojo-luxe background with subtle bokeh, bold symmetrical
silhouette, martial-arts honor, high detail, glowing accents, trophy medallion design
--ar 1:1 --style raw --v 6
```

### 5 — Traditionalist (Rare · seated meditator)

```
A serene martial artist seated in lotus meditation posture inside a glowing enso ring,
timeless discipline and calm, centered circular emblem, painterly collectible card-game
key art (Hearthstone, Genshin Impact style), dramatic cinematic rim lighting, rich
enamel and metal, polished gold medallion frame, warm radiant glow, glossy enamel, dark
dojo-luxe background with subtle bokeh, bold symmetrical silhouette, martial-arts honor,
high detail, glowing accents, trophy medallion design --ar 1:1 --style raw --v 6
```

**Negative prompt (add where supported):**

```
--no text, letters, watermark, signature, flat vector, cartoon, 3d plastic render,
photorealistic photo, cluttered background, gore, blood, realistic firearms, menacing
faces, extra frames, busy edges, low contrast, washed-out colors
```

---

## Pick the winner (scoring rubric)

Lay the 5 outputs side by side. Score each 1–5, and favor the **set** that feels most
consistent, not one lucky hero. Look for:

- **Emotion / awe** — does it make you want it? (the whole point)
- **Readability** — clear centered silhouette that would survive a 1" pin.
- **On-palette** — dojo-luxe dark background, gold-forward, jewel accents.
- **Frame quality** — the medallion bezel reads as real metal, rarity is legible.
- **Youth-safe & noble** — fierce, never scary or grim.
- **Consistency** — do all 5 look like the *same collection*?

Aim for one look that scores well on **all five subjects**. That's your style.

---

## Lock the reference (so all 90 match)

- **Midjourney:** take your favorite winning image and use it as a **style reference**
  on every future prompt: add `--sref <image-url>` (upload the winner, copy its URL).
  Optionally combine 2 winners: `--sref url1 url2`. Keep `--style raw --v 6` constant.
  You can also add `--sw 100` to control how strongly the style is applied.
- **Adobe Firefly:** save the winning image and set it as the **Style reference** (with
  "Match" strength ~medium-high) for every subsequent badge. Keep Content type = Art,
  1:1.
- **Freeze these constants for the entire run:** the style-reference image(s), model/
  version, aspect ratio, lighting direction (upper-left), and the frame/rarity language
  from §4 of the art-direction doc.

Once locked, generating any other badge is just: **master template + that badge's
subject line from the prompt pack + the frozen style reference.**

---

## Then what

1. Send me the 5 winners (drop them in one of your folders).
2. I composite them into the shared medallion frame so the whole set is pixel-consistent,
   and confirm the rarity finishes read correctly.
3. We greenlight the full run in batches of ~10.
4. I vectorize the finals to enamel-pin manufacturing spec + export locked/hidden states.
