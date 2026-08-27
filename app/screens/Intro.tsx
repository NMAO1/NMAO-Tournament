import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";

// First-run "how it works" — a 4-card swipeable intro shown once after onboarding
// (gated by a SecureStore flag in App.tsx). Skippable. Explains the core loop so a
// new competitor isn't dropped into the app cold.

const CARDS = [
  { icon: "⚔️", accent: hues.ruby.hi, title: "Welcome to the Arena", body: "Challenge a rival and submit your form — then the community decides the winner. Four duels a week, opponents matched to your rank and age. Your opponent stays a mystery until the reveal." },
  { icon: "👁", accent: hues.sapphire.hi, title: "Watch, then vote", body: "Every duel is judged by competitors like you. Watch both forms for 15 seconds to unlock your vote — and the tally stays hidden until the duel closes, so no one sways the crowd." },
  { icon: "📈", accent: hues.amethyst.hi, title: "Two ratings, one journey", body: "Your Dueling rating starts at 1200 and moves with every duel. Your Tournament skill rating starts at 50 and tracks your judged rounds. They never mix — two paths, both yours." },
  { icon: "🎖️", accent: hues.gold.hi, title: "The Monthly Reveal", body: "Badges and medals aren't handed out quietly — they're unveiled in a monthly ceremony. Compete all month, then watch your honors revealed. Win or learn, then compete again." },
];

export default function Intro({ onDone }: { onDone: () => void }) {
  const { width } = Dimensions.get("window");
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === CARDS.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };
  const next = () => {
    if (last) return onDone();
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingTop: 56, paddingHorizontal: 20 }}>
        <TouchableOpacity onPress={onDone} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: neutrals.muted2, fontSize: 14, fontWeight: "600" }}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {CARDS.map((c, i) => (
          <View key={i} style={{ width, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 }}>
            <View style={{ width: 128, height: 128, borderRadius: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.accent + "55", backgroundColor: c.accent + "12", marginBottom: 30, shadowColor: c.accent, shadowOpacity: 0.5, shadowRadius: 26, shadowOffset: { width: 0, height: 0 } }}>
              <Text style={{ fontSize: 60 }}>{c.icon}</Text>
            </View>
            <Text style={{ color: neutrals.text, fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 16 }}>{c.title}</Text>
            <Text style={{ color: neutrals.muted, fontSize: 15, lineHeight: 23, textAlign: "center", maxWidth: 340 }}>{c.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* dots */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 22 }}>
        {CARDS.map((_, i) => (
          <View key={i} style={{ width: i === page ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i === page ? hues.gold.base : neutrals.border }} />
        ))}
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <TouchableOpacity onPress={next} activeOpacity={0.85}>
          <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ borderRadius: 14, paddingVertical: 16, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: 0.3 }}>{last ? "Enter the Arena  ⚔" : "Next  ›"}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
