import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Image, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FRAME_SPECS, frameElementUrl, ELEMENT_GLYPH, type RingConfig } from "../lib/badgeFrames";

// RingFrame — a PICTURE-FRAME ring around inset content. A Firefly image (or a tint
// gradient placeholder) fills the border margin; it CROSS-FADES through tiers as the
// value climbs, accretes motifs around the perimeter, and ramps its glow/sparkle with
// progress — so the frame visibly LEVELS UP. Content (the video) sits inset on top,
// so the art shows only in the ring.
export function RingFrame({ badgeCode, ring, value, w, h, radius = 20, children }:
  { badgeCode?: string; ring?: RingConfig; value: number; w: number; h: number; radius?: number; children?: ReactNode }) {
  const cfg = ring ?? (badgeCode ? FRAME_SPECS[badgeCode]?.ring : undefined);
  if (!cfg) return <View style={{ width: w, height: h }}>{children}</View>;

  const t = Math.max(10, (cfg.thickness ?? 0.15) * Math.min(w, h));   // ring thickness (px)
  const glow = cfg.glow ?? "#e8c766";
  const lastStop = cfg.stops.length ? cfg.stops[cfg.stops.length - 1] : 1;
  const p = Math.max(0, Math.min(1, value / (lastStop || 1)));         // 0..1 progress for FX ramp
  // active tier = base(0) + one per passed stop
  const activeTier = cfg.stops.reduce((n, s) => (value >= s ? n + 1 : n), 0);

  return (
    <View style={{ width: w, height: h }}>
      {/* outer glow — intensifies with progress */}
      <View pointerEvents="none" style={{
        position: "absolute", left: -6, top: -6, width: w + 12, height: h + 12, borderRadius: radius + 6,
        shadowColor: glow, shadowOpacity: 0.25 + 0.6 * p, shadowRadius: 10 + 22 * p, shadowOffset: { width: 0, height: 0 },
        backgroundColor: glow, opacity: 0.05 + 0.06 * p,
      }} />

      {/* the ring art — stacked tiers, each fades in as its stop is passed (higher = on top) */}
      <View style={{ position: "absolute", width: w, height: h, borderRadius: radius, overflow: "hidden" }}>
        {cfg.tints.map((tint, i) => (
          <TierLayer key={i} tint={tint} img={cfg.images?.[i]} active={i <= activeTier} w={w} h={h} kenBurns={i === activeTier} />
        ))}
      </View>

      {/* the inset window — content (video) covers the center, leaving only the ring */}
      <View style={{ position: "absolute", left: t, top: t, width: w - 2 * t, height: h - 2 * t, borderRadius: Math.max(4, radius - t * 0.7), overflow: "hidden", backgroundColor: "#060504" }}>
        {children}
      </View>

      {/* perimeter motifs — accrete around the ring as the value grows */}
      {cfg.perimeter ? <Perimeter cfg={cfg.perimeter} value={value} w={w} h={h} inset={t / 2} size={t * 0.7} /> : null}

      {/* sheen sweep + sparkles ride the whole ring; sparkle count ramps with progress */}
      <RingGlint w={w} h={h} radius={radius} />
      <RingSparkles w={w} h={h} inset={t / 2} count={1 + Math.round(p * 4)} glow={glow} />

      {/* elite flourish at the top tier — a shooting star, or a royal gold rain */}
      {cfg.flourishAt != null && value >= cfg.flourishAt
        ? (cfg.flourishKind === "gold-rain" ? <GoldRain w={w} h={h} /> : <ShootingStar w={w} h={h} />)
        : null}
    </View>
  );
}

// A gentle rain of gold sparks drifting down the frame — the Sovereign's dynasty flourish.
function GoldRain({ w, h }: { w: number; h: number }) {
  const xs = [0.14, 0.32, 0.5, 0.66, 0.84, 0.26];
  return <>{xs.map((x, i) => <GoldSpark key={i} x={x * w} h={h} delay={i * 480} />)}</>;
}
function GoldSpark({ x, h, delay }: { x: number; h: number; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 1900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(2400),
    ]));
    run.start(); return () => run.stop();
  }, [v, delay]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [-h * 0.1, h * 1.05] });
  const tx = v.interpolate({ inputRange: [0, 1], outputRange: [0, 7] });
  const opacity = v.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: x, top: 0, opacity, transform: [{ translateX: tx }, { translateY: ty }] }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#ffe9a8", shadowColor: "#f0d878", shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }} />
    </Animated.View>
  );
}

// A shooting star that streaks diagonally across the frame every few seconds — the
// unmistakable 90%+ Oracle flourish. Rare, so it reads as a reward.
function ShootingStar({ w, h }: { w: number; h: number }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.loop(Animated.sequence([
      Animated.delay(1600),
      Animated.timing(p, { toValue: 1, duration: 820, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(p, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(4600),
    ]));
    run.start(); return () => run.stop();
  }, [p]);
  const x0 = -0.14 * w, y0 = 0.05 * h, x1 = 1.14 * w, y1 = 0.44 * h;
  const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  const tx = p.interpolate({ inputRange: [0, 1], outputRange: [x0, x1] });
  const ty = p.interpolate({ inputRange: [0, 1], outputRange: [y0, y1] });
  const opacity = p.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const trailLen = Math.max(70, w * 0.42);
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity, transform: [{ translateX: tx }, { translateY: ty }, { rotate: `${ang}deg` }] }}>
      <LinearGradient colors={["rgba(200,216,255,0)", "rgba(200,216,255,0.9)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", right: 0, top: -1.5, width: trailLen, height: 3, borderRadius: 2 }} />
      <View style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff", shadowColor: "#cfe0ff", shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }} />
    </Animated.View>
  );
}

// One ring tier: a tint gradient (always) with the Firefly art over it (when present),
// cross-fading in when its stop is passed. The active tier slowly ken-burns.
function TierLayer({ tint, img, active, w, h, kenBurns }: { tint: string; img?: string; active: boolean; w: number; h: number; kenBurns: boolean }) {
  const op = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => { Animated.timing(op, { toValue: active ? 1 : 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start(); }, [active, op]);
  const kb = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!kenBurns) return;
    const run = Animated.loop(Animated.sequence([
      Animated.timing(kb, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(kb, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    run.start(); return () => run.stop();
  }, [kenBurns, kb]);
  const scale = kb.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1.13] });
  const tx = kb.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] });
  const url = img ? frameElementUrl(img) : null;
  const [failed, setFailed] = useState(false);
  const darker = shade(tint, -0.4);
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", width: w, height: h, opacity: op }}>
      <LinearGradient colors={[shade(tint, 0.15), tint, darker]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ position: "absolute", width: w, height: h }} />
      {url && !failed ? (
        <Animated.Image source={{ uri: url }} resizeMode="cover" onError={() => setFailed(true)}
          style={{ position: "absolute", width: w, height: h, transform: [{ scale }, { translateX: tx }] }} />
      ) : null}
    </Animated.View>
  );
}

// Accreting motifs spaced evenly around the ring perimeter.
function Perimeter({ cfg, value, w, h, inset, size }: { cfg: NonNullable<RingConfig["perimeter"]>; value: number; w: number; h: number; inset: number; size: number }) {
  const n = Math.min(Math.floor(value / cfg.per), cfg.max ?? 24);
  if (n <= 0) return null;
  const url = frameElementUrl(cfg.img);
  const glyph = ELEMENT_GLYPH[cfg.img] ?? "✦";
  const pts = Array.from({ length: n }, (_, i) => perimeterPoint((i + 0.5) / n, w, h, inset));
  return <>{pts.map((pt, i) => <PerimItem key={i} x={pt.x} y={pt.y} size={size} url={url} glyph={glyph} index={i} />)}</>;
}
function PerimItem({ x, y, size, url, glyph, index }: { x: number; y: number; size: number; url: string | null; glyph: string; index: number }) {
  const enter = useRef(new Animated.Value(0)).current;
  const [failed, setFailed] = useState(false);
  useEffect(() => { Animated.spring(enter, { toValue: 1, delay: Math.min(index * 30, 700), friction: 6, tension: 120, useNativeDriver: true }).start(); }, [enter, index]);
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, alignItems: "center", justifyContent: "center", opacity: enter, transform: [{ scale }] }}>
      {url && !failed ? <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="contain" onError={() => setFailed(true)} />
        : <Text style={{ fontSize: size * 0.8 }}>{glyph}</Text>}
    </Animated.View>
  );
}

// A single specular sweep that rolls diagonally across the whole frame.
function RingGlint({ w, h, radius }: { w: number; h: number; radius: number }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.loop(Animated.sequence([
      Animated.timing(x, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(4200),
      Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }), Animated.delay(400),
    ]));
    run.start(); return () => run.stop();
  }, [x]);
  const tx = x.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.5, w * 1.2] });
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: w, height: h, borderRadius: radius, overflow: "hidden" }}>
      <Animated.View style={{ position: "absolute", top: -h * 0.3, height: h * 1.6, width: Math.max(28, w * 0.28), transform: [{ translateX: tx }, { skewX: "-18deg" }] }}>
        <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}
function RingSparkles({ w, h, inset, count, glow }: { w: number; h: number; inset: number; count: number; glow: string }) {
  const pts = Array.from({ length: count }, (_, i) => ({ ...perimeterPoint((i / count + 0.13) % 1, w, h, inset), d: i * 700 }));
  const sz = Math.max(12, inset * 1.4);
  return <>{pts.map((p, i) => <RingSparkle key={i} x={p.x} y={p.y} delay={p.d} size={sz} color={glow} />)}</>;
}
function RingSparkle({ x, y, delay, size, color }: { x: number; y: number; delay: number; size: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.loop(Animated.sequence([
      Animated.delay(delay), Animated.timing(v, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 640, useNativeDriver: true }), Animated.delay(2200),
    ]));
    run.start(); return () => run.stop();
  }, [v, delay]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, alignItems: "center", justifyContent: "center", opacity: v, transform: [{ scale }] }}>
      <Text style={{ fontSize: size, color: "#fff", textShadowColor: color, textShadowRadius: 8 }}>✦</Text>
    </Animated.View>
  );
}

// A point on the rounded-rect ring centerline (inset from the edge), parametrized by
// frac ∈ [0,1) clockwise from top-left.
function perimeterPoint(frac: number, w: number, h: number, inset: number): { x: number; y: number } {
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const wEdge = x1 - x0, hEdge = y1 - y0;
  const per = 2 * (wEdge + hEdge);
  let d = (frac % 1) * per;
  if (d < wEdge) return { x: x0 + d, y: y0 };                 // top
  d -= wEdge;
  if (d < hEdge) return { x: x1, y: y0 + d };                 // right
  d -= hEdge;
  if (d < wEdge) return { x: x1 - d, y: y1 };                 // bottom
  d -= wEdge;
  return { x: x0, y: y1 - d };                                // left
}

// Lighten (amt>0) or darken (amt<0) a #rrggbb hex.
function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
