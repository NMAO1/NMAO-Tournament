import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Image, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BadgeFrame, type FrameRarity } from "./BadgeFrame";
import {
  FRAME_SPECS, resolveElements, ELEMENT_GLYPH, frameElementUrl,
  type PlacedElement, type ElementAnim,
} from "../lib/badgeFrames";

// LivingFrame — a base rarity BadgeFrame with the badge's motif elements
// composited on a bottom "shelf", grown by the progress `value`, each with motion.
export function LivingFrame({ badgeCode, rarity, value, w, h, radius = 18, children }:
  { badgeCode?: string; rarity: FrameRarity; value: number; w: number; h: number; radius?: number; children?: ReactNode }) {
  const spec = badgeCode ? FRAME_SPECS[badgeCode] : undefined;
  const baseRarity = spec?.base ?? rarity;
  const shelfH = h * 0.5; // bottom half = the shelf; elements may spill above it
  return (
    <View style={{ width: w, height: h }}>
      <BadgeFrame rarity={baseRarity} w={w} h={h} radius={radius}>{children}</BadgeFrame>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: shelfH }}>
        <FrameElements badgeCode={badgeCode} value={value} w={w} h={shelfH} />
      </View>
    </View>
  );
}

// Just the composited element layer — placed within a w×h shelf box. Reused by
// LivingFrame (over a card) and by the Arena Side (over the thick bottom band).
export function FrameElements({ badgeCode, value, w, h, baseSize }:
  { badgeCode?: string; value: number; w: number; h: number; baseSize?: number }) {
  const spec = badgeCode ? FRAME_SPECS[badgeCode] : undefined;
  if (!spec) return null;
  const els = resolveElements(spec, value);
  if (!els.length) return null;
  const bs = baseSize ?? Math.min(w, h) * 0.46;
  const glow = spec.border?.glow ?? "#e8c766";
  // bounding box of the placed elements (px) so the FX hug only the coins/crest
  let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
  for (const el of els) {
    const s = el.scale * bs, ex = el.x * w, ey = el.y * h;
    L = Math.min(L, ex - s / 2); R = Math.max(R, ex + s / 2);
    T = Math.min(T, ey - s / 2); B = Math.max(B, ey + s / 2);
  }
  const box = { x: Math.max(0, L), y: Math.max(0, T), w: Math.min(w, R) - Math.max(0, L), h: Math.min(h, B) - Math.max(0, T) };
  return (
    <>
      <GlowLayer color={glow} box={box} />
      {els.map((el, i) => <ElementView key={`${el.img}-${i}`} el={el} w={w} h={h} baseSize={bs} index={i} />)}
      <GlintSweep box={box} />
      <Sparkles box={box} />
    </>
  );
}

// ── Frame FX — a reusable shine + depth layer, confined to the element box ──
type FxBox = { x: number; y: number; w: number; h: number };

// Warm ambient bloom behind the elements, tinted by the frame's glow color.
function GlowLayer({ color, box }: { color: string; box: FxBox }) {
  return (
    <View pointerEvents="none" style={{
      position: "absolute", left: box.x + box.w * 0.05, width: box.w * 0.9, top: box.y + box.h * 0.32, height: box.h * 0.7,
      borderRadius: box.h * 0.35, backgroundColor: color, opacity: 0.12,
      shadowColor: color, shadowOpacity: 0.9, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    }} />
  );
}

// A slow specular glint that sweeps across the coins/crest every few seconds.
function GlintSweep({ box }: { box: FxBox }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.loop(Animated.sequence([
      Animated.timing(x, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(3600),
      Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(400),
    ]));
    run.start();
    return () => run.stop();
  }, [x]);
  const tx = x.interpolate({ inputRange: [0, 1], outputRange: [-box.w * 0.5, box.w * 1.2] });
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, overflow: "hidden" }}>
      <Animated.View style={{ position: "absolute", top: -box.h * 0.3, height: box.h * 1.6, width: Math.max(24, box.w * 0.32), transform: [{ translateX: tx }, { skewX: "-18deg" }] }}>
        <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.24)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

// A few twinkles that pop and fade over the top of the hoard.
function Sparkles({ box }: { box: FxBox }) {
  const pts = [{ x: 0.28, y: 0.12, d: 0 }, { x: 0.66, y: 0.04, d: 950 }, { x: 0.48, y: 0.24, d: 1900 }];
  const sz = Math.max(13, Math.min(box.w, box.h) * 0.16);
  return <>{pts.map((p, i) => <Sparkle key={i} x={box.x + p.x * box.w} y={box.y + p.y * box.h} delay={p.d} size={sz} />)}</>;
}
function Sparkle({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 640, useNativeDriver: true }),
      Animated.delay(2400),
    ]));
    run.start();
    return () => run.stop();
  }, [v, delay]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, alignItems: "center", justifyContent: "center", opacity: v, transform: [{ scale }] }}>
      <Text style={{ fontSize: size, color: "#fff", textShadowColor: "#fff", textShadowRadius: 6 }}>✦</Text>
    </Animated.View>
  );
}

function useElementAnim(kind?: ElementAnim) {
  const v = useRef(new Animated.Value(0)).current;   // motion driver
  const ink = useRef(new Animated.Value(0)).current; // "write" ink stroke
  useEffect(() => {
    if (!kind) return;
    const loop = (dur: number, easing = Easing.inOut(Easing.quad)) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: dur, easing, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: dur, easing, useNativeDriver: true }),
      ]));
    if (kind === "flicker") loop(240, Easing.linear).start();
    else if (kind === "float") loop(1400).start();
    else if (kind === "write") {
      loop(850, Easing.inOut(Easing.sin)).start();
      Animated.loop(Animated.sequence([
        Animated.timing(ink, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(ink, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.delay(500),
      ])).start();
    }
  }, [kind, v, ink]);

  const opacity = kind === "flicker" ? v.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) : 1;
  const anim =
    kind === "flicker" ? [
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
        { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-1, 1.5] }) },
      ]
    : kind === "float" ? [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }]
    : kind === "write" ? [
        { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-2, 2] }) },
        { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "2deg"] }) },
      ]
    : [];
  return { opacity, anim, ink };
}

function ElementView({ el, w, h, baseSize, index }: { el: PlacedElement; w: number; h: number; baseSize: number; index: number }) {
  const size = el.scale * baseSize;
  const cx = el.x * w, cy = el.y * h;
  const url = frameElementUrl(el.img);
  const glyph = ELEMENT_GLYPH[el.img] ?? "◆";
  const [imgFailed, setImgFailed] = useState(false);   // missing art → fall back to the glyph
  const a = useElementAnim(el.anim);
  // stack-in: each element drops + settles on mount, staggered by index (coins pile up)
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, delay: Math.min(index * 22, 480), friction: 6, tension: 130, useNativeDriver: true }).start();
  }, [enter, index]);
  const enterTY = enter.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] });
  const enterScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });
  const opacity = Animated.multiply(a.opacity, enter);
  const base = el.rotate ? [{ rotate: `${el.rotate}deg` }] : [];
  return (
    <Animated.View pointerEvents="none"
      style={{
        position: "absolute", width: size, height: size, left: cx - size / 2, top: cy - size / 2,
        alignItems: "center", justifyContent: "center", opacity,
        transformOrigin: el.anim === "flicker" ? "50% 92%" : undefined,
        shadowColor: "#000", shadowOpacity: 0.38, shadowRadius: 5, shadowOffset: { width: 0, height: 3 },
        transform: [...base, { translateY: enterTY }, { scale: enterScale }, ...a.anim] as never,
      }}>
      {url && !imgFailed
        ? <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="contain" onError={() => setImgFailed(true)} />
        : <Text style={{ fontSize: size * 0.82 }}>{glyph}</Text>}
      {el.anim === "write"
        ? <Animated.View style={{ position: "absolute", bottom: size * 0.12, left: size * 0.2, width: size * 0.34, height: 2, borderRadius: 2, backgroundColor: "#e8d9b0", opacity: a.ink }} />
        : null}
    </Animated.View>
  );
}
