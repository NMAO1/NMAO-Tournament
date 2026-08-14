import { View, Text, ScrollView } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";

// Dueling standings — foundation placeholder. Next: scoped standings
// (My School · My Rank+Age · Global) + the voter leaderboard, from duel_ratings.
const ROWS = [
  { rank: 1, name: "Maya Rivera", school: "Rolling River", rating: 1216, you: false },
  { rank: 2, name: "Kenji Tanaka", school: "Iron Path", rating: 1188, you: false },
  { rank: 3, name: "You", school: "Rolling River", rating: 1174, you: true },
  { rank: 4, name: "Aria Chen", school: "Zephyr Ridge", rating: 1150, you: false },
];

export default function Leaderboard() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: neutrals.bg }}
      contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
    >
      <Text style={{ color: neutrals.muted, marginBottom: 16, lineHeight: 20 }}>
        Dueling standings — your rank & age bracket. Voter leaderboard coming too.
      </Text>
      {ROWS.map((r) => (
        <View
          key={r.rank}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            paddingHorizontal: 14,
            marginBottom: 8,
            borderRadius: 12,
            backgroundColor: r.you ? "rgba(230,185,63,0.08)" : neutrals.surface,
            borderWidth: 1,
            borderColor: r.you ? hues.gold.shadow : neutrals.border,
          }}
        >
          <Text style={{ color: r.you ? hues.gold.hi : neutrals.muted2, fontWeight: "800", width: 26, fontVariant: ["tabular-nums"] }}>
            {r.rank}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: neutrals.text, fontWeight: r.you ? "800" : "600", fontSize: 14 }}>{r.name}</Text>
            <Text style={{ color: neutrals.muted2, fontSize: 11 }}>{r.school}</Text>
          </View>
          <Text style={{ color: hues.gold.hi, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{r.rating}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
