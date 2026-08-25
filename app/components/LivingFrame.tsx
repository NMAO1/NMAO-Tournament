import { useEffect, useRef, type ReactNode } from "react";
import { View, Text, Image, Animated, Easing } from "react-native";
import { BadgeFrame, type FrameRarity } from "./BadgeFrame";
import {
  FRAME_SPECS, elementsForTier, ELEMENT_GLYPH, frameElementUrl,
  type FrameElement, type FramePos, type ElementAnim,
} from "../lib/badgeFrames";

// LivingFrame — a base rarity BadgeFrame with per-badge motif elements composited
// on top, gated to the competitor's badge tier, each with optional subtle motion.
export function LivingFrame({ badgeCode, rarity, tier, w, h, radius = 18, children }:
  { badgeCode?: string; rarity: FrameRarity; tier: number; w: number; h: number; radius?: number; children?: ReactNode }) {
  const spec = badgeCode ? FRAME_SPECS[badgeCode] : undefined;
  const baseRarity = spec?.base ?? rarity;
  return (
    <View style={{ width: w, height: h }}>
      <BadgeFrame rarity={baseRarity} w={w} h={h} radius={radius}>{children}</BadgeFrame>
      <FrameElements badgeCode={badgeCode} tier={tier} w={w} h={h} />
    </View>
  );
}

// Just the composited element layer — absolutely positioned within a w×h box.
// Reused by LivingFrame (over the whole card) and by the Arena Side (over the
// thick bottom BAND). `baseSize` overrides the auto element size for the band.
export function FrameElements({ badgeCode, tier, w, h, baseSize }:
  { badgeCode?: string; tier: number; w: number; h: number; baseSize?: number }) {
  const spec = badgeCode ? FRAME_SPECS[badgeCode] : undefined;
  if (!spec) return null;
  const els = elementsForTier(spec, tier);
  const bs = baseSize ?? Math.min(w, h) * 0.26;
  return <>{els.map((el, i) => <ElementView key={`${el.img}-${el.tier}-${i}`} el={el} w={w} h={h} baseSize={bs} />)}</>;
}

function posStyle(pos: FramePos, w: number, h: number, size: number, pad: number) {
  switch (pos) {
    case "bottom-left":   return { left: pad, bottom: pad };
    case "bottom-right":  return { right: pad, bottom: pad };
    case "bottom-center": return { left: w / 2 - size / 2, bottom: pad };
    case "top-left":      return { left: pad, top: pad };
    case "top-right":     return { right: pad, top: pad };
    case "top-center":    return { left: w / 2 - size / 2, top: pad };
    default:              return { left: w / 2 - size / 2, top: h / 2 - size / 2 };
  }
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

  const opacity = kind === "flicker" ? v.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) : 1;
  const transform =
    kind === "flicker" ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }]
    : kind === "float" ? [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }]
    : kind === "write" ? [
        { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-2, 3] }) },
        { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["-5deg", "3deg"] }) },
      ]
    : [];
  return { opacity, transform, ink };
}

function ElementView({ el, w, h, baseSize }: { el: FrameElement; w: number; h: number; baseSize: number }) {
  const size = (el.scale ?? 1) * baseSize;
  const pad = size * 0.2;
  const pos = posStyle(el.pos, w, h, size, pad);
  const url = frameElementUrl(el.img);
  const glyph = ELEMENT_GLYPH[el.img] ?? "◆";
  const a = useElementAnim(el.anim);
  return (
    <Animated.View pointerEvents="none"
      style={{ position: "absolute", width: size, height: size, alignItems: "center", justifyContent: "center", opacity: a.opacity, transform: a.transform, ...pos }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="contain" />
        : <Text style={{ fontSize: size * 0.82 }}>{glyph}</Text>}
      {el.anim === "write"
        ? <Animated.View style={{ position: "absolute", bottom: size * 0.06, width: size * 0.5, height: 2, borderRadius: 2, backgroundColor: "#e8d9b0", opacity: a.ink }} />
        : null}
    </Animated.View>
  );
}
