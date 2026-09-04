import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues } from "@nmao/design-tokens";
import { BadgeFrame, type FrameRarity, type Motif, type GemKey } from "../components/BadgeFrame";
import { LivingFrame } from "../components/LivingFrame";
import { RingFrame } from "../components/RingFrame";
import { DragonBand, type DragonTint } from "../components/DragonBand";
import { FRAME_SPECS } from "../lib/badgeFrames";

// Every badge that has an evolving living frame (skips the flat common borders).
const LIVING_CODES = Object.keys(FRAME_SPECS).filter((c) => FRAME_SPECS[c].elements.length > 0);

// Frame Lab — a live on-device preview of the rarity → effect ladder plus the
// legendary signature motifs, so we can see and tune each before mapping all
// 100 badges. Each tile wraps a sample "video" so it reads like the Arena.
const TIERS: { rarity: FrameRarity; motif?: Motif; gem?: GemKey; label: string; desc: string }[] = [
  { rarity: "common", label: "Common", desc: "Flat bronze · no motion" },
  { rarity: "uncommon", label: "Uncommon", desc: "Brushed silver · soft glow" },
  { rarity: "rare", label: "Rare", desc: "Gold · shimmer sweep + glow pulse" },
  { rarity: "epic", label: "Epic", desc: "Spectrum · rotating shine + sparkles" },
  { rarity: "legendary", label: "Legendary", desc: "Radiant aura · rotating gold + embers" },
  { rarity: "legendary", motif: "dragon-coil", label: "Gold Medallion", desc: "Legendary motif · dragon-coil + entrance" },
  { rarity: "legendary", motif: "crowned-gem", gem: "sapphire", label: "Season Champion", desc: "Legendary motif · crowned gem + entrance" },
];

export default function FrameLab({ onBack }: { onBack: () => void }) {
  const W = 150, H = 200;
  const [value, setValue] = useState(140);
  const STEPS = [40, 80, 120, 160, 200];
  // picture-frame ring (Oracle) — driven by VOTING ACCURACY %. <60 base · 60s · 70s · 80s · 90s+ (shooting star)
  const [ringVal, setRingVal] = useState(50);
  const RING_STEPS = [50, 65, 75, 85, 95];
  const RING_LABELS = ["Base", "60s", "70s", "80s", "90s ✦"];
  // Sovereign's Crown ring (Grand Champion) — driven by CHAMPIONSHIPS won
  const [crownVal, setCrownVal] = useState(0);
  const CROWN_STEPS = [0, 1, 2, 3, 5];
  const CROWN_LABELS = ["Dormant", "1", "2", "3+", "Dynasty"];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingTop: 54, paddingBottom: 44 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}><Text style={{ color: neutrals.muted, fontSize: 22 }}>‹</Text></TouchableOpacity>
        <Text style={{ color: neutrals.text, fontSize: 16, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>Frame Lab</Text>
      </View>
      <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 }}>
        The rarity ladder — each tier adds one legible layer. Parametric V1; per-badge specs and signature motifs layer on top.
      </Text>

      {/* ── PICTURE-FRAME RING (V3 prototype): a Firefly image masked to the border
          ring, cross-fading through tiers as the value climbs, stars accreting around
          the ring, glow ramping. Tint placeholders until Firefly art lands. ── */}
      <View style={{ borderWidth: 1, borderColor: hues.sapphire?.shadow ?? "#22306a", borderRadius: 16, padding: 16, marginBottom: 26, backgroundColor: "rgba(90,120,255,0.06)" }}>
        <Text style={{ color: hues.sapphire?.hi ?? "#7aa0ff", fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "800", marginBottom: 4 }}>Picture-Frame Ring · V3 prototype (Oracle)</Text>
        <Text style={{ color: neutrals.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 16 }}>
          Driven by VOTING ACCURACY: 60s → starfield · 70s → constellation · 80s → aurora · 90%+ → a shooting star. A running ratio, so a slump drops you a tier — tough to earn and keep. Step the accuracy to watch it.
        </Text>
        <View style={{ alignItems: "center" }}>
          <RingFrame badgeCode="oracle" value={ringVal} w={220} h={150} radius={18}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b12" }}>
              <Text style={{ color: neutrals.muted2, fontSize: 11 }}>video</Text>
            </View>
          </RingFrame>
          <Text style={{ color: hues.gold.hi, fontSize: 14, fontWeight: "800", marginTop: 12 }}>{ringVal}% accuracy</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
            {RING_STEPS.map((v, i) => (
              <TouchableOpacity key={v} onPress={() => setRingVal(v)}
                style={{ paddingHorizontal: 10, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1,
                  borderColor: ringVal === v ? (hues.sapphire?.base ?? "#5a78ff") : neutrals.border, backgroundColor: ringVal === v ? "rgba(90,120,255,0.18)" : neutrals.surface }}>
                <Text style={{ color: ringVal === v ? (hues.sapphire?.hi ?? "#7aa0ff") : neutrals.muted, fontWeight: "800", fontSize: 12.5 }}>{RING_LABELS[i]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ── SOVEREIGN'S CROWN ring (Grand Champion) — driven by championships won ── */}
      <View style={{ borderWidth: 1, borderColor: "#4a3a12", borderRadius: 16, padding: 16, marginBottom: 26, backgroundColor: "rgba(232,199,102,0.06)" }}>
        <Text style={{ color: hues.gold.hi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "800", marginBottom: 4 }}>Sovereign's Crown · V3 (Grand Champion)</Text>
        <Text style={{ color: neutrals.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 16 }}>
          An ornate frame that awakens from dormant bronze to radiant gold per CHAMPIONSHIP, a jewel setting around it each title, ending in a dynasty's gold rain at 5+. Step the titles.
        </Text>
        <View style={{ alignItems: "center" }}>
          <RingFrame badgeCode="grand-champion" value={crownVal} w={220} h={150} radius={18}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b12" }}>
              <Text style={{ color: neutrals.muted2, fontSize: 11 }}>video</Text>
            </View>
          </RingFrame>
          <Text style={{ color: hues.gold.hi, fontSize: 14, fontWeight: "800", marginTop: 12 }}>{crownVal} championship{crownVal === 1 ? "" : "s"}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
            {CROWN_STEPS.map((v, i) => (
              <TouchableOpacity key={v} onPress={() => setCrownVal(v)}
                style={{ paddingHorizontal: 10, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1,
                  borderColor: crownVal === v ? hues.gold.base : neutrals.border, backgroundColor: crownVal === v ? "rgba(232,199,102,0.18)" : neutrals.surface }}>
                <Text style={{ color: crownVal === v ? hues.gold.hi : neutrals.muted, fontWeight: "800", fontSize: 12.5 }}>{CROWN_LABELS[i]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ── Living frames (V2): per-badge, evolving with tier. Placeholder glyphs
          until the Firefly element art lands in the badge-frames bucket. ── */}
      <View style={{ borderWidth: 1, borderColor: hues.amethyst.shadow, borderRadius: 16, padding: 16, marginBottom: 26, backgroundColor: "rgba(163,43,247,0.06)" }}>
        <Text style={{ color: hues.amethyst.hi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "800", marginBottom: 4 }}>Living Frames · V2 (per-badge, evolving)</Text>
        <Text style={{ color: neutrals.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 16 }}>
          The journaling badge grows with entries — a lit candle every 20, the journal at 50, the writing quill at 75. Step the count to watch it evolve.
        </Text>
        <View style={{ alignItems: "center" }}>
          <LivingFrame badgeCode="journal_keeper" rarity="rare" value={value} w={172} h={230} radius={18}>
            <Sample label="Journal Keeper" />
          </LivingFrame>
          <Text style={{ color: hues.gold.hi, fontSize: 14, fontWeight: "800", marginTop: 12 }}>
            {value} journal entries
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {STEPS.map((v) => (
              <TouchableOpacity key={v} onPress={() => setValue(v)}
                style={{ width: 46, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1,
                  borderColor: value === v ? hues.amethyst.base : neutrals.border, backgroundColor: value === v ? "rgba(163,43,247,0.18)" : neutrals.surface }}>
                <Text style={{ color: value === v ? hues.amethyst.hi : neutrals.muted, fontWeight: "800", fontSize: 14 }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ── the full living-frame gallery — every evolving badge frame at the current
          value, so the whole batch is previewable on-device (emoji placeholders until
          the Firefly art lands). ── */}
      <Text style={{ color: hues.amethyst.hi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "800", marginBottom: 4 }}>All Living Frames · {LIVING_CODES.length}</Text>
      <Text style={{ color: neutrals.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 14 }}>
        Every badge frame at value {value}. Step the count above to watch each one grow.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 26 }}>
        {LIVING_CODES.map((code) => (
          <View key={code} style={{ width: "48%", alignItems: "center", marginBottom: 20 }}>
            <LivingFrame badgeCode={code} rarity={FRAME_SPECS[code].base} value={value} w={150} h={200} radius={16}>
              <Sample label={FRAME_SPECS[code].label ?? code} />
            </LivingFrame>
            <Text style={{ color: hues.gold.hi, fontSize: 12, fontWeight: "800", marginTop: 10, textAlign: "center" }}>{FRAME_SPECS[code].label ?? code}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {TIERS.map((t) => (
          <View key={t.label} style={{ width: "48%", alignItems: "center", marginBottom: 24 }}>
            <BadgeFrame rarity={t.rarity} motif={t.motif} gem={t.gem} w={W} h={H} radius={18}>
              <Sample label={t.label} />
            </BadgeFrame>
            <Text style={{ color: hues.gold.hi, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, marginTop: 12 }}>{t.label}</Text>
            <Text style={{ color: neutrals.muted2, fontSize: 10.5, textAlign: "center", marginTop: 3, lineHeight: 14 }}>{t.desc}</Text>
          </View>
        ))}
      </View>

      <Text style={{ color: hues.gold.hi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "800", marginTop: 10, marginBottom: 4 }}>Dragon (MJ art) · bottom band</Text>
      <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
        High-quality dragon art, silver master tinted to any season, with subtle life (breath · aura · eye glint).
      </Text>
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        {DRAGONS.map((d) => (
          <View key={d.tint} style={{ marginBottom: 16, alignItems: "center" }}>
            <DragonBand tint={d.tint} border={d.border} w={360} h={210} />
            <Text style={{ color: hues.gold.hi, fontSize: 13, fontWeight: "800", marginTop: 8 }}>{d.label}</Text>
          </View>
        ))}
      </View>

      <Text style={{ color: hues.gold.hi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "800", marginTop: 10, marginBottom: 4 }}>Season Champions</Text>
      <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 }}>
        The crowned gem, one color per season won — the rarest set, chased across the decade.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {SEASONS.map((s) => (
          <View key={s.gem} style={{ width: "48%", alignItems: "center", marginBottom: 24 }}>
            <BadgeFrame rarity="legendary" motif="crowned-gem" gem={s.gem} w={W} h={H} radius={18}>
              <Sample label={s.name} />
            </BadgeFrame>
            <Text style={{ color: hues.gold.hi, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, marginTop: 12 }}>{s.s} · {s.name}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const DRAGONS: { tint: DragonTint; border: string; label: string }[] = [
  { tint: "silver", border: "#c7cdd6", label: "Silver (master)" },
  { tint: "gold", border: "#f6d878", label: "Gold Medallion" },
  { tint: "sapphire", border: "#2f7bff", label: "S1 · Sapphire" },
  { tint: "ruby", border: "#e0264a", label: "S3 · Ruby" },
];

const SEASONS: { s: string; name: string; gem: GemKey }[] = [
  { s: "S1", name: "Sapphire", gem: "sapphire" },
  { s: "S2", name: "Amethyst", gem: "amethyst" },
  { s: "S3", name: "Ruby", gem: "ruby" },
  { s: "S4", name: "Emerald", gem: "emerald" },
  { s: "S5", name: "Coral", gem: "coral" },
  { s: "S6", name: "Onyx", gem: "onyx" },
  { s: "S7", name: "Rose", gem: "rose" },
  { s: "S8", name: "Turquoise", gem: "turquoise" },
  { s: "S9", name: "Peridot", gem: "peridot" },
  { s: "S10", name: "Platinum", gem: "platinum" },
];

// A stand-in for the competitor video behind the frame.
function Sample({ label }: { label: string }) {
  return (
    <LinearGradient colors={["#14100a", "#241a10", "#0c0a06"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "rgba(255,255,255,0.16)", fontSize: 30, fontWeight: "900" }}>▶</Text>
    </LinearGradient>
  );
}
