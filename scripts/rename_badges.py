#!/usr/bin/env python3
"""
Auto-rename Firefly badge downloads to their badge name.

Firefly saves files named after the prompt (e.g. "Firefly_..._A fierce but noble
golden dragon face...png"). This maps each to <NN>-<slug>.png by matching a unique
phrase from the prompt. Drop downloads in a folder and run:

    python3 scripts/rename_badges.py <downloads_dir> [out_dir=docs/badge-art/reference]

Copies (doesn't move) matched files; prints anything unmatched so you can add it.
Extend REGISTRY as new batches are added (phrase -> output stem).
"""
import sys, os, shutil

REGISTRY = {
  # heroes
  "golden dragon face": "37-undefeated-dragon",
  "tiger's eye with living fire": "25-spirit-fire-tiger-eye",
  "lotus flower opening in full bloom": "29-open-mind-lotus",
  "coiled into a radiant medallion, scales shimmering in ruby": "72-gold-medallion-nmao-dragon",
  # validation
  "seated in lotus meditation posture inside a glowing enso": "30-traditionalist",
  "archery target with a single arrow struck dead center": "21-precision",
  "fist wreathed in crackling golden lightning": "22-kime",
  "noble tiger's eye, amber and gold iris": "33-fearless",
  "shooting star arcing upward with a luminous trail": "14-rising-star",
  # batch 02
  "single bare foot stepping onto a glowing dojo mat": "01-first-step",
  "young martial artist bowing respectfully in silhouette": "02-first-bow",
  "yin-yang symbol splitting open with radiant light": "03-first-reveal",
  "ink brush resting on an open journal page": "04-first-reflection",
  "two crossed practice swords catching the first light": "59-first-duel",
  "glowing ballot dropping into a ballot box": "73-first-vote",
  "two friendly martial artists training side by side": "82-teammate",
  "ribboned medal catching its very first light": "05-first-medal",
  "single glowing footprint turning back toward the dojo mat": "09-back-on-the-mat",
  "elegant crane taking flight against a golden sunrise": "10-early-bird",
  "mountain peak with a planted flag catching alpine sunrise": "15-new-heights",
  "phoenix rising from glowing embers": "17-comeback",
  "three-step victory podium bathed in a warm spotlight": "34-podium",
  "ornate compass with a subtle martial motif": "32-style-explorer",
  "tree's roots gripping a mountain base": "23-rooted",
  "curling tsunami wave": "24-flow",
  "glowing anvil struck with an explosive burst of sparks": "12-iron-will",
  "radiant calendar disc with every day lit up": "13-perfect-attendance",
  "ascending stone steps rising into light": "16-steady-climb",
  "tournament bracket with a single glowing star node": "38-semifinalist",
  # season champions (match by scale color)
  "deep sapphire-blue glowing scales": "season-champion-s1",
  "rich amethyst-purple scales": "season-champion-s2",
  "vivid ruby-red scales": "season-champion-s3",
  "luminous emerald-green scales": "season-champion-s4",
  "warm coral pink-orange scales": "season-champion-s5",
  "iridescent black onyx": "season-champion-s6",
  "soft rose-pink scales": "season-champion-s7",
  "bright turquoise-teal scales": "season-champion-s8",
  "golden peridot yellow-green scales": "season-champion-s9",
  "radiant platinum silver-white scales": "season-champion-s10",
  # batch 03
  "radiant gold star-medal at the moment of first triumph": "06-first-gold",
  "nine glowing points of light forming a perfect circle": "08-nine-bows",
  "wooden board shattering with an explosive burst": "18-breakthrough",
  "crossed bo staff and sai gleaming": "31-weapon-master",
  "fully assembled glowing yin-yang medallion": "43-imprint-complete",
  "assembled multi-segment medallion catching the light": "44-season-keepsake",
  "warrior seated in calm meditation with a sword laid to rest": "57-reflective-warrior",
  "rising blade wreathed in momentum lines": "62-warpath",
  "raised triumphant hands lifted by a warm glow": "63-peoples-champion",
  "glowing map dotted with location pins": "64-road-warrior",
  "keen open eye with a luminous iris": "76-sharp-eye",
  "crown passing between two hands on a beam of light": "77-kingmaker",
  "glowing tide line lifting on calm water": "19-rising-floor",
  "martial fist and a weapon crossed in balance": "28-both-hands",
  "arrow buried in a bullseye's gold center": "58-goal-keeper",
  "decisive flash of light across crossed blades": "61-first-blood",
  "two interlocked glowing rings": "65-rivalry",
  "calendar with a steady glowing flame": "75-daily-voter",
  "perfectly balanced glowing scales": "78-fair-witness",
  "proud school crest banner catching the light": "81-dojo-pride",
  # batch 04 — final 41 (standard frames)
  "worn dojo training mat marked with glowing tally": "07-on-the-mat",
  "lotus formed of light and sparks blooming": "26-innovator",
  "stack of gleaming gold bars radiating light": "35-gold-rush",
  "hourglass fused with a dueling blade": "67-iron-duelist",
  "senior martial artist guiding a young student": "87-mentor",
  "six-sided mastery star with every point lit evenly": "89-well-rounded",
  "glowing globe crossed by martial travel paths": "90-globetrotter",
  "faint luminous martial silhouette dissolving into mist": "86-ghost",
  "hourglass with glowing sand racing down": "11-deadline-warrior",
  "open journal book with a glowing quill": "56-consistent-journaler",
  "two mirrored warrior silhouettes facing off": "60-duelist",
  "radiant megaphone emitting glowing sound-waves": "74-voice-of-the-people",
  "open hand cupping a glowing heart": "83-encourager",
  "commemorative ribboned emblem with a single candle flame": "88-anniversary",
  # batch 04 — epic (bespoke spectrum frame)
  "hexagonal radar mastery diagram fully filled": "20-full-circle",
  "luminous crescent arc sweeping across multiple gold medals": "36-sweep",
  "laurel wreath woven from medals encircling a radiant center": "71-podium-season",
  "two bracket paths converging on a glowing crown": "39-finalist",
  "small determined martial artist silhouetted against a towering opponent": "42-giant-slayer",
  "unbroken radiant dueling blade with a spectrum aura": "66-undefeated-duelist",
  "two dueling blades locked edge-to-edge": "80-deadlock",
  "ornate wax seal glowing with authority": "79-trusted-voter",
  "single serene enso brushstroke circle with a soft inner glow": "85-zen",
  # batch 04 — legendary (bespoke platinum+gem frame)
  "golden crown resting over a radiant yin-yang": "27-grandmaster",
  "laurel crown above a radiant yin-yang": "40-grand-champion",
  "starred championship ribbon with regal detailing": "41-sponsors-champion",
  "platinum yin-yang ringed by ten glowing stars": "55-decade-of-dedication",
  "crowned dueling blade radiating divine light": "68-duel-legend",
  "radiant enso circle framing a perfect glowing burst": "84-perfect-score",
  "ornate founder's wax seal with an inset gem": "69-charter-member",
  "blazing torch held high against the dark": "70-trailblazer",
  # batch 04 — gem series
  "carved from a single sapphire jewel": "45-gem-s1-sapphire",
  "carved from a single amethyst jewel": "46-gem-s2-amethyst",
  "carved from a single ruby jewel": "47-gem-s3-ruby",
  "carved from a single emerald jewel": "48-gem-s4-emerald",
  "carved from a single coral jewel": "49-gem-s5-coral",
  "carved from a single black onyx jewel": "50-gem-s6-onyx",
  "carved from a single rose-pink jewel": "51-gem-s7-rose",
  "carved from a single turquoise jewel": "52-gem-s8-turquoise",
  "carved from a single peridot jewel": "53-gem-s9-peridot",
  "carved from a single platinum-white diamond jewel": "54-gem-s10-platinum",
  # tolerant aliases (short/mis-spelled gem prompts + reworded subjects)
  "commemorative ribboned emblem": "88-anniversary",
  "single sapphire jew": "45-gem-s1-sapphire",
  "single amethyst jew": "46-gem-s2-amethyst",
  "single ruby jew": "47-gem-s3-ruby",
  "single emerald jew": "48-gem-s4-emerald",
  "single coral jew": "49-gem-s5-coral",
  "single onyx jew": "50-gem-s6-onyx",
  "single rose jew": "51-gem-s7-rose",
  "single turquoise jew": "52-gem-s8-turquoise",
  "single peridot jew": "53-gem-s9-peridot",
  "single periodot": "53-gem-s9-peridot",
  "single platinum jew": "54-gem-s10-platinum",
}

def main():
    src=sys.argv[1]; out=sys.argv[2] if len(sys.argv)>2 else "docs/badge-art/reference"
    os.makedirs(out,exist_ok=True)
    matched=0; unmatched=[]
    for f in sorted(os.listdir(src)):
        if not f.lower().endswith((".png",".jpg",".jpeg",".webp")): continue
        low=f.lower(); hit=None
        for phrase,stem in REGISTRY.items():
            if phrase.lower() in low: hit=stem; break
        if hit:
            shutil.copy2(os.path.join(src,f), os.path.join(out,hit+".png")); matched+=1
            print(f"  {hit}.png  <-  {f[:50]}...")
        else:
            unmatched.append(f)
    print(f"\nmatched {matched}, unmatched {len(unmatched)}")
    for u in unmatched: print("  UNMATCHED:", u)

if __name__=="__main__": main()
