import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues } from "@nmao/design-tokens";
import { BadgeFrame, type FrameRarity, type Motif, type GemKey } from "../components/BadgeFrame";

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
  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingTop: 54, paddingBottom: 44 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}><Text style={{ color: neutrals.muted, fontSize: 22 }}>‹</Text></TouchableOpacity>
        <Text style={{ color: neutrals.text, fontSize: 16, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>Frame Lab</Text>
      </View>
      <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 }}>
        The rarity ladder — each tier adds one legible layer. Parametric V1; per-badge specs and signature motifs layer on top.
      </Text>

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
