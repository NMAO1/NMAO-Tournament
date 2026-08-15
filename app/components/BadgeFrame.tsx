import { useEffect, useRef, type ReactNode } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Canvas, RoundedRect, SweepGradient, Group, Circle, Blur, Paint, vec, useClock,
} from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

// ── BadgeFrame — the "collect the look" runtime. A frame that wraps a
// competitor's video (or any child) with a rarity-escalating effect:
//   common → flat metal · uncommon → + soft glow · rare → + one animation ·
//   epic → spectrum rotating + sparkles · legendary → radiant aura + particles.
// Cheap tiers are pure RN + expo-linear-gradient + Animated; the spectrum/aura
// tiers use Skia (GPU). This is the V1 parametric ladder; per-badge specs and
// signature motifs layer on later.

export type FrameRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

const SPECTRUM = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#007aff", "#5856d6", "#af52de", "#ff2d55", "#ff3b30"];
const GOLD = ["#f6d878", "#c8962c", "#f6d878", "#8a6a1e", "#f6d878"];
const BRONZE = ["#8a6a3a", "#d9b072", "#7a5122", "#c99a58"];
const SILVER = ["#8f97a3", "#e9eef5", "#7d8590", "#d3dae3"];

export function BadgeFrame({ rarity, w, h, radius = 20, children }: { rarity: FrameRarity; w: number; h: number; radius?: number; children?: ReactNode }) {
  if (rarity === "common") return <CommonFrame w={w} h={h} r={radius}>{children}</CommonFrame>;
  if (rarity === "uncommon") return <UncommonFrame w={w} h={h} r={radius}>{children}</UncommonFrame>;
  if (rarity === "rare") return <RareFrame w={w} h={h} r={radius}>{children}</RareFrame>;
  if (rarity === "epic") return <EpicFrame w={w} h={h} r={radius}>{children}</EpicFrame>;
  return <LegendaryFrame w={w} h={h} r={radius}>{children}</LegendaryFrame>;
}

// A gradient border band with the content inset inside it.
function GradientBorder({ w, h, r, band, colors, glow, children }: { w: number; h: number; r: number; band: number; colors: string[]; glow?: { color: string; radius: number; opacity: number }; children?: ReactNode }) {
  return (
    <View style={{ width: w, height: h, borderRadius: r, ...(glow ? { shadowColor: glow.color, shadowOpacity: glow.opacity, shadowRadius: glow.radius, shadowOffset: { width: 0, height: 0 } } : null) }}>
      <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: r, padding: band }}>
        <View style={{ flex: 1, borderRadius: Math.max(2, r - band), overflow: "hidden", backgroundColor: "#0d0a06" }}>{children}</View>
      </LinearGradient>
    </View>
  );
}

// COMMON — flat bronze border, no motion.
function CommonFrame({ w, h, r, children }: { w: number; h: number; r: number; children?: ReactNode }) {
  return <GradientBorder w={w} h={h} r={r} band={6} colors={BRONZE}>{children}</GradientBorder>;
}

// UNCOMMON — brushed silver border + soft static glow.
function UncommonFrame({ w, h, r, children }: { w: number; h: number; r: number; children?: ReactNode }) {
  return <GradientBorder w={w} h={h} r={r} band={7} colors={SILVER} glow={{ color: "#cfd8e3", radius: 9, opacity: 0.5 }}>{children}</GradientBorder>;
}

// RARE — gold border + a shimmer sweep + a gentle glow pulse. Pure Animated.
function RareFrame({ w, h, r, children }: { w: number; h: number; r: number; children?: ReactNode }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
  }, [sweep, pulse]);
  const tx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-h, h] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });
  return (
    <Animated.View style={{ width: w, height: h, borderRadius: r, shadowColor: "#f6d878", shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, shadowOpacity: glowOpacity }}>
      <LinearGradient colors={GOLD as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: r, padding: 8, overflow: "hidden" }}>
        {/* shimmer band sweeping down the metal */}
        <Animated.View pointerEvents="none" style={{ position: "absolute", left: -w, right: -w, height: h * 0.5, transform: [{ translateY: tx }, { rotate: "18deg" }] }}>
          <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }} />
        </Animated.View>
        <View style={{ flex: 1, borderRadius: Math.max(2, r - 8), overflow: "hidden", backgroundColor: "#0d0a06" }}>{children}</View>
      </LinearGradient>
    </Animated.View>
  );
}

// EPIC — iridescent spectrum border, rotating conic shine + twinkling sparkles.
function EpicFrame({ w, h, r, children }: { w: number; h: number; r: number; children?: ReactNode }) {
  const band = 10;
  const cx = w / 2, cy = h / 2;
  const clock = useClock();
  const spin = useDerivedValue(() => [{ rotate: (clock.value / 3500) % (Math.PI * 2) }]);
  const glowOpacity = useDerivedValue(() => 0.45 + 0.3 * Math.sin(clock.value / 650));
  const sparks = 7;
  return (
    <View style={{ width: w, height: h }}>
      <View style={{ position: "absolute", top: band, left: band, right: band, bottom: band, borderRadius: Math.max(2, r - band), overflow: "hidden", backgroundColor: "#0d0a06" }}>{children}</View>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Group layer={<Paint opacity={glowOpacity}><Blur blur={9} /></Paint>}>
          <RoundedRect x={band / 2} y={band / 2} width={w - band} height={h - band} r={r} style="stroke" strokeWidth={band}>
            <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={spin} colors={SPECTRUM} />
          </RoundedRect>
        </Group>
        <RoundedRect x={band / 2} y={band / 2} width={w - band} height={h - band} r={r} style="stroke" strokeWidth={band * 0.68}>
          <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={spin} colors={SPECTRUM} />
        </RoundedRect>
        {Array.from({ length: sparks }).map((_, i) => (
          <Sparkle key={i} clock={clock} i={i} n={sparks} w={w} h={h} band={band} color="#ffffff" />
        ))}
      </Canvas>
    </View>
  );
}

// LEGENDARY — radiant pulsing aura + rotating gold sweep + a rising particle
// stream + a counter-rotating inner ring (motif placeholder for the flagship
// hand-authored motifs to come).
function LegendaryFrame({ w, h, r, children }: { w: number; h: number; r: number; children?: ReactNode }) {
  const band = 12;
  const cx = w / 2, cy = h / 2;
  const clock = useClock();
  const spin = useDerivedValue(() => [{ rotate: (clock.value / 5200) % (Math.PI * 2) }]);
  const spinBack = useDerivedValue(() => [{ rotate: -(clock.value / 4200) % (Math.PI * 2) }]);
  const auraOpacity = useDerivedValue(() => 0.5 + 0.35 * Math.sin(clock.value / 800));
  const parts = 12;
  return (
    <View style={{ width: w, height: h }}>
      <View style={{ position: "absolute", top: band, left: band, right: band, bottom: band, borderRadius: Math.max(2, r - band), overflow: "hidden", backgroundColor: "#0d0a06" }}>{children}</View>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* radiant aura */}
        <Group layer={<Paint opacity={auraOpacity}><Blur blur={18} /></Paint>}>
          <RoundedRect x={band / 2} y={band / 2} width={w - band} height={h - band} r={r} style="stroke" strokeWidth={band * 1.6}>
            <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={spin} colors={GOLD} />
          </RoundedRect>
        </Group>
        {/* crisp gold ring */}
        <RoundedRect x={band / 2} y={band / 2} width={w - band} height={h - band} r={r} style="stroke" strokeWidth={band * 0.7}>
          <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={spin} colors={GOLD} />
        </RoundedRect>
        {/* counter-rotating thin inner ring (motif hint) */}
        <RoundedRect x={band * 1.1} y={band * 1.1} width={w - band * 2.2} height={h - band * 2.2} r={Math.max(2, r - band)} style="stroke" strokeWidth={1.4} opacity={0.55}>
          <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={spinBack} colors={["#fff3c0", "#f6d878", "#fff3c0"]} />
        </RoundedRect>
        {Array.from({ length: parts }).map((_, i) => (
          <Ember key={i} clock={clock} i={i} n={parts} w={w} h={h} band={band} />
        ))}
      </Canvas>
    </View>
  );
}

// A twinkling sparkle fixed on the border ring (Epic).
function Sparkle({ clock, i, n, w, h, band, color }: { clock: ReturnType<typeof useClock>; i: number; n: number; w: number; h: number; band: number; color: string }) {
  const a = (i / n) * Math.PI * 2;
  const px = w / 2 + Math.cos(a) * (w / 2 - band / 2);
  const py = h / 2 + Math.sin(a) * (h / 2 - band / 2);
  const op = useDerivedValue(() => 0.2 + 0.8 * Math.abs(Math.sin(clock.value / 480 + i * 1.3)));
  const rad = useDerivedValue(() => 1.6 + 1.2 * Math.abs(Math.sin(clock.value / 480 + i * 1.3)));
  return <Circle cx={px} cy={py} r={rad} color={color} opacity={op} />;
}

// A gold ember rising along the frame edge, looping (Legendary).
function Ember({ clock, i, n, w, h, band }: { clock: ReturnType<typeof useClock>; i: number; n: number; w: number; h: number; band: number }) {
  const side = i % 2 === 0 ? band * 0.6 : w - band * 0.6; // left / right edge
  const phase = i / n;
  const cy = useDerivedValue(() => {
    const t = ((clock.value / 2600) + phase) % 1;
    return h - t * (h - band); // rise from bottom to top
  });
  const op = useDerivedValue(() => {
    const t = ((clock.value / 2600) + phase) % 1;
    return Math.sin(t * Math.PI) * 0.85; // fade in/out
  });
  const cx = useDerivedValue(() => side + Math.sin((clock.value / 500) + i) * 3);
  return <Circle cx={cx} cy={cy} r={1.8} color="#ffcf6b" opacity={op} />;
}
