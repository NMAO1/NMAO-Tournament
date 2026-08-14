import { View, Text, ScrollView } from "react-native";
import { neutrals } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { Medal } from "../components/Medal";
import type { Rarity } from "@nmao/design-tokens";

// Badge vault + medal case — foundation placeholder demonstrating the Frame /
// Medal primitives across every rarity & metal.
const RARITIES: Rarity[] = ["legendary", "epic", "rare", "common"];

export default function Achievements() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: neutrals.bg }}
      contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
    >
      <Text style={{ color: neutrals.muted, marginBottom: 18, lineHeight: 20 }}>
        Your badge vault — earned frames glow by rarity; locked ones await.
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {RARITIES.map((r) => (
          <View key={r} style={{ alignItems: "center", width: "24%", marginBottom: 16 }}>
            <Frame rarity={r} size="mini" radius={30}>
              <View style={{ width: 52, height: 52, backgroundColor: "#100d07", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#EFC24E", fontSize: 20 }}>◆</Text>
              </View>
            </Frame>
            <Text style={{ color: neutrals.muted2, fontSize: 9, marginTop: 8, textTransform: "capitalize" }}>{r}</Text>
          </View>
        ))}
      </View>

      <Text style={{ color: neutrals.muted, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "800", marginTop: 12, marginBottom: 16 }}>
        Medal case
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        <Medal type="gold" place={1} size={54} />
        <Medal type="silver" place={2} size={54} />
        <Medal type="bronze" place={3} size={54} />
        <Medal type="participation" size={54} />
      </View>
    </ScrollView>
  );
}
