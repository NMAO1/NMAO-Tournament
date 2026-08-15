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
export type GemKey = "sapphire" | "amethyst" | "ruby" | "emerald" | "coral" | "onyx" | "rose" | "turquoise" | "peridot" | "platinum";

const SPECTRUM = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#007aff", "#5856d6", "#af52de", "#ff2d55", "#ff3b30"];
const GOLD = ["#f6d878", "#c8962c", "#f6d878", "#8a6a1e", "#f6d878"];
const BRONZE = ["#8a6a3a", "#d9b072", "#7a5122", "#c99a58"];
const SILVER = ["#8f97a3", "#e9eef5", "#7d8590", "#d3dae3"];

const GEMS: Record<GemKey, { ring: string[]; light: string; base: string; dark: string; spark: string }> = {
  sapphire: { ring: ["#cfe4ff", "#2f7bff", "#0b3fd6", "#2f7bff", "#cfe4ff"], light: "#e6f0ff", base: "#2f7bff", dark: "#0b3fd6", spark: "#bcdcff" },
  amethyst: { ring: ["#e9d3ff", "#9a52de", "#5e2a9e", "#9a52de", "#e9d3ff"], light: "#f2e2ff", base: "#9a52de", dark: "#5e2a9e", spark: "#dcbcff" },
  ruby: { ring: ["#ffd0d6", "#e0264a", "#9e0f2c", "#e0264a", "#ffd0d6"], light: "#ffe1e6", base: "#e0264a", dark: "#9e0f2c", spark: "#ffc0cb" },
  emerald: { ring: ["#c8ffe0", "#12b76a", "#0a7a47", "#12b76a", "#c8ffe0"], light: "#e0fff0", base: "#12b76a", dark: "#0a7a47", spark: "#bcffd8" },
  coral: { ring: ["#ffd9cf", "#ff7a5c", "#d84f36", "#ff7a5c", "#ffd9cf"], light: "#ffe6de", base: "#ff7a5c", dark: "#d84f36", spark: "#ffc8ba" },
  onyx: { ring: ["#c9ced8", "#3a3e47", "#111319", "#3a3e47", "#c9ced8"], light: "#c9ced8", base: "#3a3e47", dark: "#111319", spark: "#dfe4ee" },
  rose: { ring: ["#ffe0ee", "#ff5c9e", "#d81f6a", "#ff5c9e", "#ffe0ee"], light: "#ffe9f3", base: "#ff5c9e", dark: "#d81f6a", spark: "#ffc0da" },
  turquoise: { ring: ["#c8fff5", "#1fc8c0", "#0a8a86", "#1fc8c0", "#c8fff5"], light: "#e0fffb", base: "#1fc8c0", dark: "#0a8a86", spark: "#bcfff5" },
  peridot: { ring: ["#eaffc8", "#a8d820", "#6e9410", "#a8d820", "#eaffc8"], light: "#f2ffda", base: "#a8d820", dark: "#6e9410", spark: "#dcff9a" },
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
        {/* signature motif — a coiling dragon (gold on Gold Medallion, the season
            gem's color on each Season Champion); the crowned gem sits on top */}
        {motif === "dragon-coil" || motif === "crowned-gem" ? (
          <DragonSerpent clock={clock} cx={cx} cy={cy} w={w} h={h} band={band}
            color={motif === "crowned-gem" ? GEMS[gem].base : "#ffd76a"}
            headColor={motif === "crowned-gem" ? GEMS[gem].light : "#ffe08a"} />
        ) : null}
        {motif === "crowned-gem" ? <CrownedGem clock={clock} cx={cx} band={band} gem={gem} /> : null}
        {/* one-time entrance bloom */}
        <Circle cx={cx} cy={cy} r={flareR} opacity={flareO}>
          <RadialGradient c={vec(cx, cy)} r={flareR} colors={["rgba(255,247,208,0.95)", "rgba(255,214,120,0)"]} />
        </Circle>
      </Canvas>
    </View>
  );
}

// DRAGON — an Eastern dragon (snout, horns, eye, spiked tapering body) drawn as
// real Skia paths along an oval that hugs the border, rotated as one rigid coil
// so it circles the frame edges and never crosses the centered video.
// A drawn, fierce Eastern-dragon head in profile: snarling open maw with fangs,
// brow ridge, twin swept horns, a spiked mane, and whiskers. Nose points +x,
// neck at the origin so it attaches to the body. Composed from several paths.
const DRAGON_HEAD_SVG = "M0 -4 L4 -9 Q10 -12 15 -9 L17 -6 L23 -8 L27 -3 L25 -1 L27 0 L19 0 L13 -2 L5 -3 Z";
const DRAGON_JAW_SVG = "M5 -1 L13 2 L22 3 L27 3 L24 6 L15 6 L8 4 L4 2 Z";
const DRAGON_TEETH_SVG = "M22 0 L23 4 L24 0 Z M18 0 L19 2 L20 0 Z M20 3 L21 -1 L22 3 Z M15 4 L16 2 L17 4 Z";
const DRAGON_HORNS_SVG = "M4 -8 Q-3 -13 -9 -24 Q-2 -15 7 -9 Z M9 -10 Q5 -15 1 -23 Q7 -15 13 -10 Z";
const DRAGON_FRILL_SVG = "M0 -4 L-6 -7 L-1 -2 L-7 -1 L-2 2 L-6 5 L0 3 Z";
const DRAGON_BROW_SVG = "M9 -7 L16 -8 L14 -5 Z";
const DRAGON_WHISK_SVG = "M26 -2 Q16 -9 4 -13 M26 1 Q18 7 6 11";
const DRAGON_EARFIN_SVG = "M7 -7 L2 -12 L9 -8 L4 -14 L11 -8 Z";
const DRAGON_TONGUE_SVG = "M24 3 L31 4 L28 3 L32 2 L27 2 Z";
// Undulation params (shared by the body worklet and the head anchor).
const D_SEGS = 40, D_SPAN = 4.5, D_WSPEED = 780, D_WAVES = 2.3, D_SPIN = 3600, D_AMPF = 0.42;
function DragonSerpent({ clock, cx, cy, w, h, band, color, headColor }: { clock: ReturnType<typeof useClock>; cx: number; cy: number; w: number; h: number; band: number; color: string; headColor: string }) {
  const a = w / 2 - band * 0.5;
  const b = h / 2 - band * 0.5;
  const amp = band * D_AMPF, HW = band * 0.5;
  // Animated body — a snaking ribbon + dorsal spikes rebuilt each frame with a
  // traveling wave down the spine, so the dragon slithers as it coils.
  const bodyPath = useDerivedValue(() => {
    const t = clock.value;
    const p = Skia.Path.Make();
    const xs: number[] = [], ys: number[] = [], nxs: number[] = [], nys: number[] = [], hws: number[] = [];
    for (let k = 0; k <= D_SEGS; k++) {
      const s = k / D_SEGS;
      const ang = -s * D_SPAN;
      const bx = cx + a * Math.cos(ang), by = cy + b * Math.sin(ang);
      const tx = -a * Math.sin(ang), ty = b * Math.cos(ang);
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const off = amp * Math.sin(s * D_WAVES * 6.28318 - t / D_WSPEED) * (1 - s * 0.25);
      xs.push(bx + nx * off); ys.push(by + ny * off); nxs.push(nx); nys.push(ny);
      hws.push(Math.max(0.35, HW * (1 - s * 0.9)));
    }
    p.moveTo(xs[0] + nxs[0] * hws[0], ys[0] + nys[0] * hws[0]);
    for (let k = 1; k <= D_SEGS; k++) p.lineTo(xs[k] + nxs[k] * hws[k], ys[k] + nys[k] * hws[k]);
    for (let k = D_SEGS; k >= 0; k--) p.lineTo(xs[k] - nxs[k] * hws[k], ys[k] - nys[k] * hws[k]);
    p.close();
    for (let k = 3; k < D_SEGS - 1; k += 3) {
      const tall = 1 - k / D_SEGS;
      const bdx = xs[k] - xs[k + 1], bdy = ys[k] - ys[k + 1];
      p.moveTo(xs[k] + nxs[k] * hws[k], ys[k] + nys[k] * hws[k]);
      p.lineTo(xs[k] + nxs[k] * (hws[k] + band * (0.4 + tall * 0.85)) + bdx * 1.4, ys[k] + nys[k] * (hws[k] + band * (0.4 + tall * 0.85)) + bdy * 1.4);
      p.lineTo(xs[k + 1] + nxs[k + 1] * hws[k + 1], ys[k + 1] + nys[k + 1] * hws[k + 1]);
      p.close();
    }
    return p;
  });
  // Head follows the leading end of the wave (ang 0), tangent points +y there.
  const headTransform = useDerivedValue(() => {
    const off = amp * Math.sin(-clock.value / D_WSPEED);
    return [{ translateX: cx + a - off }, { translateY: cy }, { rotate: Math.PI / 2 }, { scale: band * 0.18 }];
  });
  const headP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_HEAD_SVG)!, []);
  const jawP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_JAW_SVG)!, []);
  const teethP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_TEETH_SVG)!, []);
  const hornsP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_HORNS_SVG)!, []);
  const frillP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_FRILL_SVG)!, []);
  const browP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_BROW_SVG)!, []);
  const whiskP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_WHISK_SVG)!, []);
  const earP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_EARFIN_SVG)!, []);
  const tongueP = useMemo(() => Skia.Path.MakeFromSVGString(DRAGON_TONGUE_SVG)!, []);
  // a flicking tongue + a subtle head bob
  const tongueTf = useDerivedValue(() => [{ scaleX: 0.7 + 0.4 * Math.abs(Math.sin(clock.value / 260)) }]);
  const spin = useDerivedValue(() => [{ rotate: (clock.value / D_SPIN) % (Math.PI * 2) }]);
  return (
    <Group origin={vec(cx, cy)} transform={spin}>
      {/* body (soft glow) */}
      <Group layer={<Paint><Blur blur={1.0} /></Paint>}>
        <Path path={bodyPath}>
          <SkLinearGradient start={vec(cx, cy - b)} end={vec(cx, cy + b)} colors={[headColor, color]} />
        </Path>
      </Group>
      {/* drawn head (crisper, so the detail reads) */}
      <Group transform={headTransform}>
        <Group layer={<Paint><Blur blur={0.4} /></Paint>}>
          <Path path={whiskP} style="stroke" strokeWidth={0.9} color={headColor} opacity={0.75} />
          <Path path={earP} color={color} />
          <Path path={hornsP} color={color} />
          <Path path={frillP} color={color} />
          <Group origin={vec(25, 3)} transform={tongueTf}><Path path={tongueP} color="#ff3b30" /></Group>
          <Path path={headP}>
            <SkLinearGradient start={vec(6, -10)} end={vec(6, 4)} colors={[headColor, color]} />
          </Path>
          <Path path={jawP} color={color} />
          <Path path={teethP} color="#fff7e0" />
          <Path path={browP} color="#1a0500" opacity={0.65} />
          {/* nostril */}
          <Circle cx={23} cy={-2} r={0.7} color="#1a0500" opacity={0.7} />
          {/* menacing glowing eye */}
          <Circle cx={12} cy={-5} r={2.8} color="#ff2d00" opacity={0.5} />
          <Circle cx={12} cy={-5} r={1.6} color="#ffd23b" />
          <Circle cx={12} cy={-5} r={0.7} color="#1a0500" />
        </Group>
      </Group>
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
