import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Canvas, RoundedRect, SweepGradient, RadialGradient, LinearGradient as SkLinearGradient,
  Group, Circle, Path, Blur, Paint, Skia, vec, useClock,
} from "@shopify/react-native-skia";
import { useSharedValue, withTiming, useDerivedValue } from "react-native-reanimated";

// ── BadgeFrame — the "collect the look" runtime. A frame that wraps a
// competitor's video with a rarity-escalating effect. Legendary badges also get
// a hand-authored SIGNATURE MOTIF layered on the frame plus a one-time ENTRANCE
// flourish when they appear. Cheap tiers use expo-linear-gradient + Animated;
// spectrum/aura/motif tiers use Skia (GPU).

export type FrameRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Motif = "dragon-coil" | "crowned-gem";
export type GemKey = "sapphire" | "amethyst" | "ruby" | "emerald" | "platinum";

const SPECTRUM = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#007aff", "#5856d6", "#af52de", "#ff2d55", "#ff3b30"];
const GOLD = ["#f6d878", "#c8962c", "#f6d878", "#8a6a1e", "#f6d878"];
const BRONZE = ["#8a6a3a", "#d9b072", "#7a5122", "#c99a58"];
const SILVER = ["#8f97a3", "#e9eef5", "#7d8590", "#d3dae3"];

const GEMS: Record<GemKey, { ring: string[]; light: string; base: string; dark: string; spark: string }> = {
  sapphire: { ring: ["#cfe4ff", "#2f7bff", "#0b3fd6", "#2f7bff", "#cfe4ff"], light: "#e6f0ff", base: "#2f7bff", dark: "#0b3fd6", spark: "#bcdcff" },
  amethyst: { ring: ["#e9d3ff", "#9a52de", "#5e2a9e", "#9a52de", "#e9d3ff"], light: "#f2e2ff", base: "#9a52de", dark: "#5e2a9e", spark: "#dcbcff" },
  ruby: { ring: ["#ffd0d6", "#e0264a", "#9e0f2c", "#e0264a", "#ffd0d6"], light: "#ffe1e6", base: "#e0264a", dark: "#9e0f2c", spark: "#ffc0cb" },
  emerald: { ring: ["#c8ffe0", "#12b76a", "#0a7a47", "#12b76a", "#c8ffe0"], light: "#e0fff0", base: "#12b76a", dark: "#0a7a47", spark: "#bcffd8" },
  platinum: { ring: ["#f4f6fa", "#c7cdd6", "#9aa2ad", "#c7cdd6", "#f4f6fa"], light: "#ffffff", base: "#c7cdd6", dark: "#8a929d", spark: "#ffffff" },
};

export function BadgeFrame({ rarity, motif, gem = "sapphire", w, h, radius = 20, children }: { rarity: FrameRarity; motif?: Motif; gem?: GemKey; w: number; h: number; radius?: number; children?: ReactNode }) {
  if (rarity === "common") return <CommonFrame w={w} h={h} r={radius}>{children}</CommonFrame>;
  if (rarity === "uncommon") return <UncommonFrame w={w} h={h} r={radius}>{children}</UncommonFrame>;
  if (rarity === "rare") return <RareFrame w={w} h={h} r={radius}>{children}</RareFrame>;
  if (rarity === "epic") return <EpicFrame w={w} h={h} r={radius}>{children}</EpicFrame>;
  return <LegendaryFrame w={w} h={h} r={radius} motif={motif} gem={gem}>{children}</LegendaryFrame>;
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

function CommonFrame({ w, h, r, children }: { w: number; h: number; r: number; children?: ReactNode }) {
  return <GradientBorder w={w} h={h} r={r} band={6} colors={BRONZE}>{children}</GradientBorder>;
}
function UncommonFrame({ w, h, r, children }: { w: number; h: number; r: number; children?: ReactNode }) {
  return <GradientBorder w={w} h={h} r={r} band={7} colors={SILVER} glow={{ color: "#cfd8e3", radius: 9, opacity: 0.5 }}>{children}</GradientBorder>;
}

// RARE — gold border + shimmer sweep + gentle glow pulse (Animated).
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
        <Animated.View pointerEvents="none" style={{ position: "absolute", left: -w, right: -w, height: h * 0.5, transform: [{ translateY: tx }, { rotate: "18deg" }] }}>
          <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }} />
        </Animated.View>
        <View style={{ flex: 1, borderRadius: Math.max(2, r - 8), overflow: "hidden", backgroundColor: "#0d0a06" }}>{children}</View>
      </LinearGradient>
    </Animated.View>
  );
}

// EPIC — spectrum border, rotating conic shine + twinkling sparkles.
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

function useEntrance(duration = 900) {
  const e = useSharedValue(0);
  useEffect(() => { e.value = withTiming(1, { duration }); }, [e, duration]);
  return e;
}

// LEGENDARY — radiant aura + rotating ring + rising embers, plus an optional
// signature motif and a one-time entrance flare. Border color follows the gem
// for crowned-gem, else gold.
function LegendaryFrame({ w, h, r, motif, gem, children }: { w: number; h: number; r: number; motif?: Motif; gem: GemKey; children?: ReactNode }) {
  const band = 12;
  const cx = w / 2, cy = h / 2;
  const clock = useClock();
  const entrance = useEntrance();
  const ring = motif === "crowned-gem" ? GEMS[gem].ring : GOLD;
  const spin = useDerivedValue(() => [{ rotate: (clock.value / 5200) % (Math.PI * 2) }]);
  const spinBack = useDerivedValue(() => [{ rotate: -(clock.value / 4200) % (Math.PI * 2) }]);
  const auraOpacity = useDerivedValue(() => (0.5 + 0.35 * Math.sin(clock.value / 800)) * Math.min(1, entrance.value * 1.3));
  const flareO = useDerivedValue(() => Math.sin(Math.min(entrance.value, 1) * Math.PI) * 0.85);
  const flareR = Math.max(w, h) * 0.62;
  const parts = 12;
  return (
    <View style={{ width: w, height: h }}>
      <View style={{ position: "absolute", top: band, left: band, right: band, bottom: band, borderRadius: Math.max(2, r - band), overflow: "hidden", backgroundColor: "#0d0a06" }}>{children}</View>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* radiant aura */}
        <Group layer={<Paint opacity={auraOpacity}><Blur blur={18} /></Paint>}>
          <RoundedRect x={band / 2} y={band / 2} width={w - band} height={h - band} r={r} style="stroke" strokeWidth={band * 1.6}>
            <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={spin} colors={ring} />
          </RoundedRect>
        </Group>
        {/* crisp ring */}
        <RoundedRect x={band / 2} y={band / 2} width={w - band} height={h - band} r={r} style="stroke" strokeWidth={band * 0.7}>
          <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={spin} colors={ring} />
        </RoundedRect>
        {/* counter-rotating inner ring */}
        <RoundedRect x={band * 1.1} y={band * 1.1} width={w - band * 2.2} height={h - band * 2.2} r={Math.max(2, r - band)} style="stroke" strokeWidth={1.4} opacity={0.55}>
          <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={spinBack} colors={["#fff3c0", ring[1] ?? "#f6d878", "#fff3c0"]} />
        </RoundedRect>
        {Array.from({ length: parts }).map((_, i) => (
          <Ember key={i} clock={clock} i={i} n={parts} w={w} h={h} band={band} color={motif === "crowned-gem" ? GEMS[gem].spark : "#ffcf6b"} />
        ))}
        {/* signature motif */}
        {motif === "dragon-coil" ? <DragonCoil clock={clock} cx={cx} cy={cy} w={w} h={h} r={r} band={band} /> : null}
        {motif === "crowned-gem" ? <CrownedGem clock={clock} cx={cx} band={band} gem={gem} /> : null}
        {/* one-time entrance bloom */}
        <Circle cx={cx} cy={cy} r={flareR} opacity={flareO}>
          <RadialGradient c={vec(cx, cy)} r={flareR} colors={["rgba(255,247,208,0.95)", "rgba(255,214,120,0)"]} />
        </Circle>
      </Canvas>
    </View>
  );
}

// DRAGON-COIL (parametric V1) — a bright golden comet coiling the border fast,
// blurred to read as living energy. Real dragon art swaps in here later.
function DragonCoil({ clock, cx, cy, w, h, band }: { clock: ReturnType<typeof useClock>; cx: number; cy: number; w: number; h: number; r: number; band: number }) {
  const coil = useDerivedValue(() => [{ rotate: (clock.value / 1500) % (Math.PI * 2) }]);
  const coil2 = useDerivedValue(() => [{ rotate: ((clock.value / 1500) + Math.PI) % (Math.PI * 2) }]);
  const HEAD = ["rgba(255,215,110,0)", "rgba(255,215,110,0)", "rgba(255,215,110,0)", "#fff6c8", "#ffcf5a", "rgba(255,190,60,0)", "rgba(255,215,110,0)", "rgba(255,215,110,0)"];
  const TAIL = ["rgba(255,215,110,0)", "rgba(255,215,110,0)", "rgba(255,215,110,0)", "rgba(255,215,110,0)", "#ffd97a", "rgba(255,215,110,0)", "rgba(255,215,110,0)", "rgba(255,215,110,0)"];
  return (
    <Group layer={<Paint><Blur blur={4} /></Paint>}>
      <RoundedRect x={band / 2} y={band / 2} width={w - band} height={h - band} r={18} style="stroke" strokeWidth={band * 0.95}>
        <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={coil} colors={HEAD} />
      </RoundedRect>
      <RoundedRect x={band / 2} y={band / 2} width={w - band} height={h - band} r={18} style="stroke" strokeWidth={band * 0.7}>
        <SweepGradient c={vec(cx, cy)} origin={vec(cx, cy)} transform={coil2} colors={TAIL} />
      </RoundedRect>
    </Group>
  );
}

// CROWNED-GEM (Season Champion) — a faceted, season-colored gem under a small
// gold crown at top-center, with a shine glint sweeping the facets.
function CrownedGem({ clock, cx, band, gem }: { clock: ReturnType<typeof useClock>; cx: number; band: number; gem: GemKey }) {
  const g = GEMS[gem];
  const topY = band - 2;
  const gemPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(cx - 9, topY + 6); // table left
    p.lineTo(cx + 9, topY + 6); // table right
    p.lineTo(cx + 12, topY + 12); // girdle right
    p.lineTo(cx, topY + 26); // culet (bottom point)
    p.lineTo(cx - 12, topY + 12); // girdle left
    p.close();
    return p;
  }, [cx, topY]);
  const facet = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(cx - 9, topY + 6); p.lineTo(cx, topY + 26);
    p.moveTo(cx + 9, topY + 6); p.lineTo(cx, topY + 26);
    p.moveTo(cx - 12, topY + 12); p.lineTo(cx + 12, topY + 12);
    return p;
  }, [cx, topY]);
  const crown = useMemo(() => {
    const p = Skia.Path.Make();
    const y = topY - 1;
    p.moveTo(cx - 9, y); p.lineTo(cx - 9, y - 6); p.lineTo(cx - 4.5, y - 2); p.lineTo(cx, y - 8);
    p.lineTo(cx + 4.5, y - 2); p.lineTo(cx + 9, y - 6); p.lineTo(cx + 9, y); p.close();
    return p;
  }, [cx, topY]);
  const glintX = useDerivedValue(() => cx - 8 + (((clock.value / 1100) % 1)) * 16);
  return (
    <Group>
      {/* gem body */}
      <Path path={gemPath}>
        <SkLinearGradient start={vec(cx, topY + 4)} end={vec(cx, topY + 26)} colors={[g.light, g.base, g.dark]} />
      </Path>
      {/* facet lines */}
      <Path path={facet} style="stroke" strokeWidth={0.8} color="rgba(255,255,255,0.5)" />
      {/* table highlight */}
      <Path path={gemPath} style="stroke" strokeWidth={1} color={g.light} opacity={0.8} />
      {/* moving glint */}
      <Circle cx={glintX} cy={topY + 11} r={1.6} color="#ffffff" opacity={0.85} />
      {/* crown */}
      <Path path={crown} color="#f6d878" />
      <Path path={crown} style="stroke" strokeWidth={0.8} color="#fff3c0" />
    </Group>
  );
}

function Sparkle({ clock, i, n, w, h, band, color }: { clock: ReturnType<typeof useClock>; i: number; n: number; w: number; h: number; band: number; color: string }) {
  const a = (i / n) * Math.PI * 2;
  const px = w / 2 + Math.cos(a) * (w / 2 - band / 2);
  const py = h / 2 + Math.sin(a) * (h / 2 - band / 2);
  const op = useDerivedValue(() => 0.2 + 0.8 * Math.abs(Math.sin(clock.value / 480 + i * 1.3)));
  const rad = useDerivedValue(() => 1.6 + 1.2 * Math.abs(Math.sin(clock.value / 480 + i * 1.3)));
  return <Circle cx={px} cy={py} r={rad} color={color} opacity={op} />;
}

function Ember({ clock, i, n, w, h, band, color }: { clock: ReturnType<typeof useClock>; i: number; n: number; w: number; h: number; band: number; color: string }) {
  const side = i % 2 === 0 ? band * 0.6 : w - band * 0.6;
  const phase = i / n;
  const cy = useDerivedValue(() => {
    const t = ((clock.value / 2600) + phase) % 1;
    return h - t * (h - band);
  });
  const op = useDerivedValue(() => {
    const t = ((clock.value / 2600) + phase) % 1;
    return Math.sin(t * Math.PI) * 0.85;
  });
  const cx = useDerivedValue(() => side + Math.sin((clock.value / 500) + i) * 3);
  return <Circle cx={cx} cy={cy} r={1.8} color={color} opacity={op} />;
}
