import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Animated, Easing, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { neutrals, hues, metalStops } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { initSounds, play, unloadSounds } from "../lib/sound";
import { unseenAwards, markSeen, BadgeAward } from "../lib/badges";
import BadgeUnlock from "./BadgeUnlock";

export type RevealResult = {
  placement: number | null;
  before: number;
  after: number;
  delta: number;
  event: string;
  medalType: string | null; // gold | silver | bronze | participation | null
};

const { width: W } = Dimensions.get("window");
const SPECTRUM = ["#FF2E3B", "#C22DE0", "#A32BF7", "#4B6BFF", "#1F7BFF"] as const;
const EVENT_NAME: Record<string, string> = {
  trad_forms: "Traditional Forms", trad_weapons: "Traditional Weapons",
  open_forms: "Open Forms", open_weapons: "Open Weapons",
};
const MEDAL_STOPS: Record<string, [string, string, string]> = {
  gold: metalStops("gold"), silver: ["#F2F2F2", "#C7CCD1", "#8A8F94"], bronze: ["#E7B080", "#CD8B62", "#8C5A38"],
};
const ordinal = (n: number | null): string => {
  if (n == null) return "—";
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export default function Reveal({ result, onDone, competitorId }: { result: RevealResult; onDone: () => void; competitorId?: string }) {
  const [phase, setPhase] = useState<"arm" | "playing" | "done" | "badges">("arm");
  const [displayRating, setDisplayRating] = useState(Math.round(result.before));
  const [saying, setSaying] = useState<{ text: string; author: string | null } | null>(null);
  const [awards, setAwards] = useState<BadgeAward[]>([]);

  const shimmer = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const armPulse = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const place = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;   // 3D rotateY spin-in
  const swirl = useRef(new Animated.Value(0)).current;  // curved entrance path
  const glow = useRef(new Animated.Value(0)).current;   // settled pulse
  const shine = useRef(new Animated.Value(0)).current;
  const count = useRef(new Animated.Value(0)).current;
  const delta = useRef(new Animated.Value(0)).current;
  const sayFade = useRef(new Animated.Value(0)).current;

  const up = result.delta >= 0;
  const medal = result.medalType && MEDAL_STOPS[result.medalType] ? result.medalType : null;
  const triumphant = !!medal || up;

  // stable particle field
  const particles = useMemo(() => Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 + (i % 2 ? 0.25 : -0.25);
    const dist = 120 + Math.random() * 110;
    return {
      x: Math.cos(a) * dist, y: Math.sin(a) * dist,
      rot: (Math.random() * 2 - 1) * 420, size: 11 + Math.random() * 14,
      char: i % 4 === 0 ? "★" : "✦", color: SPECTRUM[i % SPECTRUM.length],
    };
  }), []);

  useEffect(() => {
    let mounted = true;
    initSounds();
    supabase.from("motivational_sayings").select("text, author").eq("active", true).limit(40)
      .then(({ data }) => {
        if (!mounted || !data || !data.length) return;
        const pick = data[Math.floor(Math.random() * data.length)] as { text: string; author: string | null };
        setSaying(pick);
      });
    if (competitorId) unseenAwards(competitorId).then((a) => { if (mounted) setAwards(a); });
    // background shimmer sweep (loops forever)
    Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })).start();
    return () => { mounted = false; unloadSounds(); };
  }, [shimmer, competitorId]);

  // build-up while armed: ring pulse + button breathing + riser
  useEffect(() => {
    if (phase !== "arm") return;
    play("riser");
    const loops = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(ring, { toValue: 0, duration: 1000, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(armPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(armPulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ]));
    loops.start();
    const tick = setInterval(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 620);
    return () => { loops.stop(); clearInterval(tick); };
  }, [phase, ring, armPulse]);

  useEffect(() => {
    const id = count.addListener(({ value }) =>
      setDisplayRating(Math.round(result.before + (result.after - result.before) * value)));
    return () => count.removeListener(id);
  }, [count, result]);

  async function go() {
    setPhase("playing");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    play("reveal");
    Animated.parallel([
      Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(place, { toValue: 1, friction: 5, tension: 65, useNativeDriver: true }),
      Animated.timing(spin, { toValue: 1, duration: 1250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(swirl, { toValue: 1, duration: 900, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
    ]).start(() => {
      play(triumphant ? "win" : "soft");
      Haptics.notificationAsync(triumphant ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();
      if (medal) Animated.timing(shine, { toValue: 1, duration: 900, delay: 120, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
      Animated.parallel([
        Animated.timing(count, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(delta, { toValue: 1, duration: 600, delay: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        Animated.timing(sayFade, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
        setPhase("done");
      });
    });
  }

  const shimmerRot = shimmer.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.18] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] });
  const armScale = armPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.25, 3] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 0.35, 0] });
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-140, 140] });
  const spinY = spin.interpolate({ inputRange: [0, 1], outputRange: ["900deg", "0deg"] });
  const swirlX = swirl.interpolate({ inputRange: [0, 1], outputRange: [76, 0] });
  const swirlY = swirl.interpolate({ inputRange: [0, 1], outputRange: [-66, 0] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.72] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });

  if (phase === "badges") {
    return (
      <View style={{ flex: 1, backgroundColor: neutrals.bg, paddingTop: 70, paddingBottom: 28 }}>
        <Text style={{ color: neutrals.text, fontSize: 24, fontWeight: "700", textAlign: "center" }}>
          {awards.length > 1 ? `${awards.length} Badges Unlocked` : "Badge Unlocked"}
        </Text>
        <Text style={{ color: neutrals.muted, fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 6 }}>Added to your collection</Text>
        <ScrollView contentContainerStyle={{ alignItems: "center", paddingVertical: 10 }}>
          {awards.map((a, i) => <BadgeUnlock key={a.id} award={a} delay={i * 320} />)}
        </ScrollView>
        <TouchableOpacity onPress={() => { markSeen(awards.map((a) => a.id)); onDone(); }} activeOpacity={0.85} style={{ alignSelf: "center", marginTop: 8 }}>
          <View style={{ paddingVertical: 13, paddingHorizontal: 42, borderRadius: 12, borderWidth: 1, borderColor: neutrals.border }}>
            <Text style={{ color: neutrals.text, fontWeight: "700" }}>Continue</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 26, overflow: "hidden" }}>
      {/* ambient spectrum shimmer */}
      <Animated.View pointerEvents="none" style={{ position: "absolute", width: W * 2.2, height: W * 2.2, opacity: 0.14, transform: [{ rotate: shimmerRot }] }}>
        <LinearGradient colors={[...SPECTRUM, "#FF2E3B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 999 }} />
      </Animated.View>

      {/* energy burst */}
      <Animated.View pointerEvents="none" style={{ position: "absolute", width: 260, height: 260, borderRadius: 999, opacity: burstOpacity, transform: [{ scale: burstScale }] }}>
        <LinearGradient colors={SPECTRUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 999 }} />
      </Animated.View>

      {/* star particles */}
      {phase !== "arm" && particles.map((p, i) => (
        <Animated.Text key={i} pointerEvents="none" style={{
          position: "absolute", fontSize: p.size, color: p.color,
          opacity: burst.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] }),
          transform: [
            { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
            { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.y] }) },
            { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.rot}deg`] }) },
            { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, 1.2, 0.5] }) },
          ],
        }}>{p.char}</Animated.Text>
      ))}

      {phase === "arm" ? (
        <>
          <Animated.View pointerEvents="none" style={{ position: "absolute", width: 250, height: 250, borderRadius: 999, opacity: ringOpacity, transform: [{ scale: ringScale }] }}>
            <LinearGradient colors={SPECTRUM} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 999 }} />
            <View style={{ position: "absolute", top: 7, left: 7, right: 7, bottom: 7, borderRadius: 999, backgroundColor: neutrals.bg }} />
          </Animated.View>
          <Text style={{ color: neutrals.muted, letterSpacing: 3, textTransform: "uppercase", fontSize: 12 }}>Your result is in</Text>
          <Text style={{ color: neutrals.text, fontSize: 26, fontWeight: "700", marginTop: 8, marginBottom: 34 }}>{EVENT_NAME[result.event] ?? result.event}</Text>
          <Animated.View style={{ transform: [{ scale: armScale }] }}>
            <TouchableOpacity onPress={go} activeOpacity={0.85}>
              <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ paddingVertical: 17, paddingHorizontal: 52, borderRadius: 15 }}>
                <Text style={{ color: "#141210", fontWeight: "800", fontSize: 18, letterSpacing: 1 }}>REVEAL</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </>
      ) : (
        <>
          <Animated.View style={{ alignItems: "center", transform: [{ scale: place }] }}>
            {medal ? (
              <Animated.View style={{ marginBottom: 10, alignItems: "center", justifyContent: "center", transform: [{ perspective: 800 }, { translateX: swirlX }, { translateY: swirlY }, { rotateY: spinY }] }}>
                {/* settled glow */}
                <Animated.View pointerEvents="none" style={{ position: "absolute", width: 176, height: 176, borderRadius: 999, opacity: glowOpacity, transform: [{ scale: glowScale }] }}>
                  <LinearGradient colors={[MEDAL_STOPS[medal][0], "transparent"]} start={{ x: 0.5, y: 0.5 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 999 }} />
                </Animated.View>
                {/* medal disc with bevel + sheen + shine sweep */}
                <View style={{ width: 140, height: 140, borderRadius: 999, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 3, borderColor: MEDAL_STOPS[medal][2] }}>
                  <LinearGradient colors={MEDAL_STOPS[medal]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                  <LinearGradient colors={["rgba(255,255,255,0.5)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, height: "55%" }} />
                  <Animated.View pointerEvents="none" style={{ position: "absolute", top: -12, bottom: -12, width: 42, backgroundColor: "rgba(255,255,255,0.6)", transform: [{ translateX: shineX }, { rotate: "20deg" }] }} />
                  <Text style={{ color: "#141210", fontSize: 42, fontWeight: "800" }}>{ordinal(result.placement)}</Text>
                  <Text style={{ color: "rgba(0,0,0,0.6)", fontSize: 11, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>{medal}</Text>
                </View>
              </Animated.View>
            ) : (
              <Text style={{ color: hues.gold.hi, fontSize: 80, fontWeight: "800", textShadowColor: hues.gold.shadow, textShadowRadius: 24 }}>{ordinal(result.placement)}</Text>
            )}
            <Text style={{ color: neutrals.muted, fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase" }}>{EVENT_NAME[result.event] ?? result.event}</Text>
          </Animated.View>

          <View style={{ alignItems: "center", marginTop: 30 }}>
            <Text style={{ color: neutrals.muted2, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Rating</Text>
            <Text style={{ color: neutrals.text, fontSize: 62, fontWeight: "800", marginTop: 2 }}>{displayRating}</Text>
            <Animated.View style={{ opacity: delta, transform: [{ translateX: delta.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }], flexDirection: "row", alignItems: "center", marginTop: 4, paddingHorizontal: 15, paddingVertical: 7, borderRadius: 999, backgroundColor: up ? "rgba(90,154,106,0.16)" : "rgba(224,112,112,0.16)", borderWidth: 1, borderColor: up ? "#3f7a52" : "#a24b4b" }}>
              <Text style={{ color: up ? "#7ED0A0" : "#F0A0A0", fontSize: 16, fontWeight: "800" }}>{up ? "▲ +" : "▼ "}{result.delta.toFixed(1)}</Text>
            </Animated.View>
          </View>

          {saying && (
            <Animated.View style={{ opacity: sayFade, marginTop: 30, maxWidth: 340 }}>
              <Text style={{ color: triumphant ? neutrals.muted : neutrals.text, fontSize: triumphant ? 14 : 17, fontStyle: "italic", textAlign: "center", lineHeight: triumphant ? 20 : 25 }}>
                “{saying.text}”
              </Text>
              {saying.author ? <Text style={{ color: neutrals.muted2, fontSize: 12, textAlign: "center", marginTop: 6 }}>— {saying.author}</Text> : null}
            </Animated.View>
          )}

          {phase === "done" && (
            <TouchableOpacity onPress={() => { if (awards.length) { play("win"); setPhase("badges"); } else onDone(); }} activeOpacity={0.85} style={{ marginTop: 34 }}>
              <View style={{ paddingVertical: 13, paddingHorizontal: 36, borderRadius: 12, borderWidth: 1, borderColor: awards.length ? hues.gold.shadow : neutrals.border }}>
                <Text style={{ color: awards.length ? hues.gold.hi : neutrals.text, fontWeight: "700" }}>{awards.length ? "See what you unlocked →" : "Continue"}</Text>
              </View>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}
