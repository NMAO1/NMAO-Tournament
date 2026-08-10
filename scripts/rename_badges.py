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
