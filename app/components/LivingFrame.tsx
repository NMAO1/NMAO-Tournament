import { useEffect, useRef, type ReactNode } from "react";
import { View, Text, Image, Animated, Easing } from "react-native";
import { BadgeFrame, type FrameRarity } from "./BadgeFrame";
import {
  FRAME_SPECS, elementsForTier, ELEMENT_GLYPH, frameElementUrl,
  type FrameElement, type ElementAnim,
} from "../lib/badgeFrames";

// LivingFrame — a base rarity BadgeFrame with the badge's motif elements
// composited on a bottom "shelf", gated to tier, each with optional motion.
export function LivingFrame({ badgeCode, rarity, tier, w, h, radius = 18, children }:
  { badgeCode?: string; rarity: FrameRarity; tier: number; w: number; h: number; radius?: number; children?: ReactNode }) {
  const spec = badgeCode ? FRAME_SPECS[badgeCode] : undefined;
  const baseRarity = spec?.base ?? rarity;
  const shelfH = h * 0.5; // bottom half = the shelf; elements may spill above it
  return (
    <View style={{ width: w, height: h }}>
      <BadgeFrame rarity={baseRarity} w={w} h={h} radius={radius}>{children}</BadgeFrame>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: shelfH }}>
        <FrameElements badgeCode={badgeCode} tier={tier} w={w} h={shelfH} />
      </View>
    </View>
  );
}

// Just the composited element layer — placed within a w×h shelf box. Reused by
// LivingFrame (over a card) and by the Arena Side (over the thick bottom band).
export function FrameElements({ badgeCode, tier, w, h, baseSize }:
  { badgeCode?: string; tier: number; w: number; h: number; baseSize?: number }) {
  const spec = badgeCode ? FRAME_SPECS[badgeCode] : undefined;
  if (!spec) return null;
  const els = elementsForTier(spec, tier);
  const bs = baseSize ?? Math.min(w, h) * 0.46;
  return <>{els.map((el, i) => <ElementView key={`${el.img}-${el.tier}-${i}`} el={el} w={w} h={h} baseSize={bs} />)}</>;
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

function ElementView({ el, w, h, baseSize }: { el: FrameElement; w: number; h: number; baseSize: number }) {
  const size = el.scale * baseSize;
  const cx = el.x * w, cy = el.y * h;
  const url = frameElementUrl(el.img);
  const glyph = ELEMENT_GLYPH[el.img] ?? "◆";
  const a = useElementAnim(el.anim);
  const base = el.rotate ? [{ rotate: `${el.rotate}deg` }] : [];
  return (
    <Animated.View pointerEvents="none"
      style={{
        position: "absolute", width: size, height: size, left: cx - size / 2, top: cy - size / 2,
        alignItems: "center", justifyContent: "center", opacity: a.opacity,
        transformOrigin: el.anim === "flicker" ? "50% 92%" : undefined,
        transform: [...base, ...a.anim] as never,
      }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="contain" />
        : <Text style={{ fontSize: size * 0.82 }}>{glyph}</Text>}
      {el.anim === "write"
        ? <Animated.View style={{ position: "absolute", bottom: size * 0.12, left: size * 0.2, width: size * 0.34, height: 2, borderRadius: 2, backgroundColor: "#e8d9b0", opacity: a.ink }} />
        : null}
    </Animated.View>
  );
}
