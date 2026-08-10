import { useEffect, useRef } from "react";
import { View, Text, Image, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals } from "@nmao/design-tokens";
import { BadgeAward, emblemUrl } from "../lib/badges";

const RARITY: Record<string, { label: string; colors: [string, string, string] }> = {
  common: { label: "Common", colors: ["#C7CCD1", "#9AA0A6", "#6E747A"] },
  uncommon: { label: "Uncommon", colors: ["#8FE3A3", "#4FB06A", "#2E7A45"] },
  rare: { label: "Rare", colors: ["#66A9FF", "#1F7BFF", "#0B3FD6"] },
  epic: { label: "Epic", colors: ["#C982FF", "#A32BF7", "#6712C4"] },
  legendary: { label: "Legendary", colors: ["#FFE488", "#E6B93F", "#9C7A22"] },
};

// One badge revealing: emblem art (or a rarity-gradient fallback) that pops in
// with a spring and a pulsing rarity glow. Emblem art comes from the
// badge-emblems bucket once uploaded; until then the fallback disc renders.
export default function BadgeUnlock({ award, delay = 0 }: { award: BadgeAward; delay?: number }) {
  const pop = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();
    });
  }, [pop, glow, delay]);

  const r = RARITY[award.rarity ?? "common"] ?? RARITY.common;
  const url = emblemUrl(award.emblem_key);
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.6] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.13] });

  return (
    <Animated.View style={{ alignItems: "center", marginVertical: 14, transform: [{ scale: pop }] }}>
      <View style={{ width: 132, height: 132, alignItems: "center", justifyContent: "center" }}>
        <Animated.View pointerEvents="none" style={{ position: "absolute", width: 156, height: 156, borderRadius: 999, opacity: glowOpacity, transform: [{ scale: glowScale }] }}>
          <LinearGradient colors={[r.colors[0], "transparent"]} start={{ x: 0.5, y: 0.5 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 999 }} />
        </Animated.View>
        {url ? (
          <Image source={{ uri: url }} style={{ width: 122, height: 122, borderRadius: 999 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 122, height: 122, borderRadius: 999, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: r.colors[2] }}>
            <LinearGradient colors={r.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            <Text style={{ color: "#141210", fontWeight: "800", fontSize: 12, textAlign: "center", paddingHorizontal: 10 }}>{award.name}</Text>
          </View>
        )}
      </View>
      <Text style={{ color: neutrals.text, fontSize: 17, fontWeight: "700", marginTop: 10 }}>{award.name}</Text>
      <Text style={{ color: r.colors[0], fontSize: 11, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 3 }}>
        {r.label}{award.tier ? ` · ${award.tier}` : ""}
      </Text>
      {award.description ? (
        <Text style={{ color: neutrals.muted2, fontSize: 12, textAlign: "center", marginTop: 6, maxWidth: 280, lineHeight: 18 }}>{award.description}</Text>
      ) : null}
    </Animated.View>
  );
}
