import { useEffect, useState, useRef, useMemo, forwardRef, useImperativeHandle, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, AppState, Animated, Easing, Image, Dimensions } from "react-native";
import { Canvas, Circle } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { neutrals, hues, rarityBase, type Rarity, type MedalType } from "@nmao/design-tokens";

// rarity ranking — the rarest earned badge crowns the invocation title
const RRANK: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
import { Coin } from "../components/Coin";
import { Medal } from "../components/Medal";
import { Medallion, type Tier } from "../components/Medallion";
import { Frame } from "../components/Frame";
import { markMonthlySeen } from "../lib/notifications";
import { useSeasonLabel } from "../lib/season";
import { startMusic, stopMusic, fadeOutMusic, initSounds, play } from "../lib/sound";
import { revealTrackUrl } from "../lib/revealMusic";
import { emblemUrl } from "../lib/vault";
import { supabase } from "../lib/supabase";

// The monthly badge + tournament-medal reveal — the collectibles ceremony.
// Stepped: NMAO coin + regal title → medals → badges → season summary → journal.
type Payload = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arr = (p: Payload, k: string): any[] => (Array.isArray(p[k]) ? (p[k] as any[]) : []);
const num = (p: Payload, k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);
const str = (p: Payload, k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
const asRarity = (r: unknown): Rarity => (r === "legendary" || r === "epic" || r === "rare" || r === "common" ? r : "common");
const asMedal = (t: unknown): MedalType => (t === "gold" || t === "silver" || t === "bronze" || t === "participation" ? t : "participation");
const asTier = (t: unknown): Tier => (t === "gold" || t === "silver" || t === "bronze" ? (t as Tier) : "part");
const SEASON = { hi: "#66A9FF", b: "#1F7BFF", sh: "#0B3FD6" }; // S1 Sapphire
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function earnText(b: any): string {
  const ea = b.earned_action;
  if (ea && typeof ea === "object" && typeof ea.note === "string") return ea.note;
  if (typeof ea === "string") return ea;
  return typeof b.description === "string" ? b.description : "";
}

export default function MonthlyReveal({ period, payload, onClose }: { period: string; payload: Payload; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true); // phase C: the ceremony plays itself
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* optional */ } }, [step]);
  // Score: stream this round's soundtrack under the ceremony; stop on exit.
  // initSounds loads the one-shot SFX (riser/tick/win) layered over the music.
  useEffect(() => { initSounds(); startMusic(revealTrackUrl(period), 0.7); return () => { stopMusic(); }; }, [period]);
  // Never let the score outlive the moment: cut it if the app backgrounds.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s !== "active") stopMusic(); });
    return () => sub.remove();
  }, []);

  const medals = arr(payload, "medals");
  const badges = arr(payload, "badges");
  const steps: string[] = ["open", ...(medals.length ? ["medals"] : []), ...(badges.length ? ["badges"] : []), "summary", "close"];
  const kind = steps[step];
  const last = steps.length - 1;

  // How long each act holds before the film advances (phase C: proportional-ish;
  // badges scale with count). The close act is the final CTA — it never auto-advances.
  function durMs(k: string): number {
    if (k === "open") return 5600;
    if (k === "medals") return 9500;
    if (k === "badges") return Math.max(6500, badges.length * 2800);
    if (k === "summary") return 6500;
    return 0;
  }
  // Auto-advance timeline; pausing (setAuto false) or a manual skip re-drives it.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (auto && step < last) timer.current = setTimeout(() => setStep((s) => Math.min(s + 1, last)), durMs(kind));
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, auto, kind, last]);

  // Finale: once the acts finish and the ceremony rests on its closing card, let
  // the score fade out rather than loop on underneath it.
  useEffect(() => { if (kind === "close") fadeOutMusic(1400); }, [kind]);

  function done() { stopMusic(); markMonthlySeen(period); onClose(); }

  return (
    <View style={{ flex: 1, backgroundColor: "#070605" }}>
      {kind === "close" ? <RisingEmbers /> : null}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 50 }}>
        {steps.map((_, i) => <View key={i} style={{ flex: 1, height: 3, borderRadius: 3, marginHorizontal: 2, backgroundColor: i <= step ? hues.gold.base : "rgba(255,255,255,0.15)" }} />)}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 22, paddingVertical: 20 }}>
        {kind === "open" ? <Open message={str(payload, "message")} badges={badges} /> : null}
        {kind === "medals" ? <Medals medals={medals} /> : null}
        {kind === "badges" ? <Badges badges={badges} /> : null}
        {kind === "summary" ? <Summary payload={payload} /> : null}
        {kind === "close" ? <Close onDone={done} signal={str(payload, "signal")} /> : null}
      </ScrollView>
      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingBottom: 34 }}>
        {step < last ? (
          <>
            <Ghost label={auto ? "❚❚ Pause" : "▶ Play"} onPress={() => setAuto((a) => !a)} />
            <View style={{ width: 12 }} />
            <Gold label="Skip ›" onPress={() => { setAuto(false); setStep((s) => Math.min(s + 1, last)); }} />
          </>
        ) : null}
      </View>
    </View>
  );
}

// The Invocation — the ceremonial open: NMAO mark, the competitor's earned
// honorific (from their rarest badge), and a saying, revealed in a staggered
// gilded sequence. (RN Animated; a single `intro` value drives all beats.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Open({ message, badges }: { message: string | null; badges: any[] }) {
  const season = useSeasonLabel();
  const intro = useRef(new Animated.Value(0)).current;
  const rarest = useMemo(() => badges.slice().sort((a, b) => (RRANK[String(b?.rarity)] || 0) - (RRANK[String(a?.rarity)] || 0))[0], [badges]);
  useEffect(() => {
    intro.setValue(0);
    Animated.timing(intro, { toValue: 1, duration: 1900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const h = setTimeout(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* optional */ } }, 950);
    return () => clearTimeout(h);
  }, [intro]);
  const fade = (a: number, b: number) => intro.interpolate({ inputRange: [a, b], outputRange: [0, 1], extrapolate: "clamp" });
  const grow = (a: number, b: number, from: number) => intro.interpolate({ inputRange: [a, b], outputRange: [from, 1], extrapolate: "clamp" });
  const rise = (a: number, b: number, d: number) => intro.interpolate({ inputRange: [a, b], outputRange: [d, 0], extrapolate: "clamp" });
  const honor = rarest ? String(rarest.name || "") : null;
  const rCol = rarest ? rarityBase(asRarity(rarest.rarity)) : hues.gold.base;
  return (
    <View style={{ alignItems: "center" }}>
      <Animated.Text style={{ opacity: fade(0, 0.15), color: hues.gold.base, fontSize: 12, fontWeight: "800", letterSpacing: 3, textTransform: "uppercase", textAlign: "center" }}>National Martial Arts Organization</Animated.Text>
      {season ? <Animated.Text style={{ opacity: fade(0.05, 0.22), color: hues.gold.hi, fontSize: 14, fontStyle: "italic", marginTop: 6 }}>{season} · Tournament of Champions</Animated.Text> : null}
      <Animated.View style={{ opacity: fade(0.12, 0.4), transform: [{ scale: grow(0.12, 0.4, 0.7) }], marginTop: 22, marginBottom: 6 }}>
        <Coin size={116} />
      </Animated.View>
      {honor ? (
        <>
          <Animated.Text style={{ opacity: fade(0.36, 0.7), transform: [{ translateY: rise(0.36, 0.7, 18) }, { scale: grow(0.36, 0.72, 0.86) }], color: hues.gold.hi, fontFamily: "Georgia", fontSize: 30, fontWeight: "700", textAlign: "center", marginTop: 16, textShadowColor: "rgba(230,185,63,0.55)", textShadowRadius: 16, maxWidth: 320, lineHeight: 36 }}>&ldquo;{honor}&rdquo;</Animated.Text>
          <Animated.Text style={{ opacity: fade(0.6, 0.82), color: rCol, fontSize: 12, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase", marginTop: 8 }}>{String(rarest.rarity)} badge earned</Animated.Text>
        </>
      ) : (
        <Animated.Text style={{ opacity: fade(0.36, 0.7), transform: [{ scale: grow(0.36, 0.72, 0.86) }], color: hues.gold.hi, fontFamily: "Georgia", fontSize: 26, fontWeight: "700", textAlign: "center", marginTop: 16 }}>A month worth framing</Animated.Text>
      )}
      <Animated.Text style={{ opacity: fade(0.76, 1), transform: [{ translateY: rise(0.76, 1, 10) }], color: hues.gold.hi, fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 22, maxWidth: 300, lineHeight: 20 }}>&ldquo;{message ?? "The season is yours to shape. Onward."}&rdquo;</Animated.Text>
    </View>
  );
}

type BurstHandle = { fire: (x: number, y: number, o?: { count?: number; spd?: number; r?: number; color?: string; life?: number }) => void };
type Spark = { x: number; y: number; ang: number; spd: number; r: number; color: string; born: number; life: number };
const sparkColor = (t: Tier): string => (t === "gold" ? "#FFE488" : t === "silver" ? "#EAF2FA" : t === "bronze" ? "#F3C79A" : "#FFFFFF");

// Skia particle bursts fired as each medallion segment seats (+ a big one at the
// finale). RAF-driven — no reanimated. Sparks fly out on an ease-out arc and fade;
// the canvas only re-renders while sparks are alive.
const Bursts = forwardRef<BurstHandle, { size: number }>(function Bursts({ size }, ref) {
  const sparks = useRef<Spark[]>([]);
  const raf = useRef<number | null>(null);
  const [, setNow] = useState(0);
  const loop = useCallback(() => {
    const t = Date.now();
    sparks.current = sparks.current.filter((s) => t - s.born < s.life);
    setNow(t);
    raf.current = sparks.current.length ? requestAnimationFrame(loop) : null;
  }, []);
  useImperativeHandle(ref, () => ({
    fire: (x, y, o = {}) => {
      const n = o.count ?? 22, now = Date.now();
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        sparks.current.push({ x, y, ang, spd: (o.spd ?? 80) * (0.55 + Math.random() * 0.9), r: (o.r ?? 3) * (0.6 + Math.random()), color: o.color ?? "#FFE488", born: now, life: o.life ?? 720 });
      }
      if (!raf.current) raf.current = requestAnimationFrame(loop);
    },
  }), [loop]);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  const t = Date.now();
  return (
    <Canvas style={{ position: "absolute", width: size, height: size }} pointerEvents="none">
      {sparks.current.map((s, i) => {
        const a = Math.min(1, (t - s.born) / s.life);
        const ease = 1 - (1 - a) * (1 - a);
        const d = s.spd * ease;
        return <Circle key={i} cx={s.x + Math.cos(s.ang) * d} cy={s.y + Math.sin(s.ang) * d} r={Math.max(0, s.r * (1 - a * 0.6))} color={s.color} opacity={Math.max(0, 1 - a)} />;
      })}
    </Canvas>
  );
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Medals({ medals }: { medals: any[] }) {
  // Phase B — the Season Medallion assembles piece by piece: each earned segment
  // seats with a glow pulse + escalating haptic, then a climactic shockwave +
  // flash when the medallion completes. (RN Animated — no reanimated babel plugin.)
  const MED = 260;
  const BEAT = 520; // ms per segment — a steady, musical cadence for the inserts
  const target: (Tier | null)[] = Array.from({ length: 8 }, (_, i) => (medals[i] ? asTier(medals[i].tier) : null));
  const filled = target.filter(Boolean).length;
  const [shown, setShown] = useState<(Tier | null)[]>(Array(8).fill(null));
  const [done, setDone] = useState(false);
  const flash = useRef(new Animated.Value(0)).current;   // per-seat glow pulse
  const land = useRef(new Animated.Value(0)).current;    // completion shockwave + flash
  const bursts = useRef<BurstHandle>(null);              // Skia particle bursts
  useEffect(() => {
    setShown(Array(8).fill(null)); setDone(false);
    flash.setValue(0); land.setValue(0);
    try { play("mriser"); } catch { /* optional */ } // tension build as the assembly begins
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(target.map((t, idx) => (idx < i ? t : null)));
      flash.setValue(0);
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      // burst of sparks at the seating segment, in its earned metal
      const idx = i - 1;
      if (idx >= 0 && idx < 8 && target[idx]) {
        const ang = -Math.PI / 2 + (idx + 0.5) * (Math.PI / 4);
        const rr = 95 * (MED / 340);
        bursts.current?.fire(MED / 2 + rr * Math.cos(ang), MED / 2 + rr * Math.sin(ang),
          { count: 20, spd: MED * 0.34, r: 3, color: sparkColor(target[idx]!), life: 720 });
      }
      try { Haptics.impactAsync(i >= filled ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ }
      try { play("clink"); } catch { /* optional */ } // a soft tick on each seat, on the beat
      if (i >= filled || i >= 8) {
        clearInterval(id);
        setTimeout(() => {
          setDone(true);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* optional */ }
          try { play("clang"); } catch { /* optional */ } // triumphant hit as the medallion completes
          bursts.current?.fire(MED / 2, MED / 2, { count: 54, spd: MED * 0.62, r: 4, color: "#FFE9B0", life: 1150 });
          Animated.timing(land, { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        }, 300);
      }
    }, BEAT);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medals]);
  return (
    <View style={{ alignItems: "center", width: "100%" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>◈ Your Season Medallion ◈</Text>
      <View style={{ width: MED, height: MED, alignItems: "center", justifyContent: "center" }}>
        {/* completion shockwave ring */}
        <Animated.View pointerEvents="none" style={{ position: "absolute", width: MED * 0.7, height: MED * 0.7, borderRadius: MED * 0.35, borderWidth: 3, borderColor: hues.gold.hi,
          opacity: land.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.9, 0] }),
          transform: [{ scale: land.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.3] }) }] }} />
        {/* per-seat central glow */}
        <Animated.View pointerEvents="none" style={{ position: "absolute", width: MED * 0.55, height: MED * 0.55, borderRadius: MED * 0.275, backgroundColor: hues.gold.hi,
          opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }),
          transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.5] }) }] }} />
        <Medallion tiers={shown} season={SEASON} size={MED} />
        {/* Skia particle bursts (over the medallion) */}
        <Bursts ref={bursts} size={MED} />
        {/* completion white flash */}
        <Animated.View pointerEvents="none" style={{ position: "absolute", width: MED, height: MED, borderRadius: MED / 2, backgroundColor: "#FFFFFF",
          opacity: land.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.8, 0] }) }} />
      </View>
      <Text style={{ color: done ? hues.gold.hi : neutrals.muted2, fontSize: 11, marginTop: 8, marginBottom: 4, fontWeight: done ? "800" : "400", letterSpacing: done ? 1 : 0 }}>{done ? "The season takes shape" : "Each medal takes its place"}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
        {medals.map((m, i) => (
          <View key={i} style={{ alignItems: "center", margin: 8, width: 84 }}>
            <Medal type={asMedal(m.tier)} place={typeof m.place === "number" ? m.place : null} size={44} />
            <Text style={{ color: neutrals.text, fontSize: 10, fontWeight: "700", marginTop: 6, textAlign: "center" }} numberOfLines={1}>{String(m.event ?? "")}</Text>
            <Text style={{ color: neutrals.muted2, fontSize: 9, textTransform: "capitalize" }}>{String(m.tier ?? "")}{typeof m.place === "number" ? ` · ${ordinal(m.place)}` : ""}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Phase B — badges flip in one by one (3D rotateY) with their real emblem art,
// each with a clink + haptic. Emblem keys aren't in the payload, so we look them
// up by code (graceful ◆ fallback if art is missing).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Badges({ badges }: { badges: any[] }) {
  const [emblems, setEmblems] = useState<Record<string, string | null>>({});
  const flips = useMemo(() => badges.map(() => new Animated.Value(0)), [badges.length]);
  useEffect(() => {
    const codes = badges.map((b) => b?.code).filter(Boolean);
    if (codes.length) {
      supabase.from("badges").select("code, emblem_key").in("code", codes).then(({ data }) => {
        const m: Record<string, string | null> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((data as any[] | null) ?? []).forEach((r) => { m[r.code] = r.emblem_key ?? null; });
        setEmblems(m);
      });
    }
    const timers = badges.map((_, i) => setTimeout(() => {
      Animated.timing(flips[i], { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      try { play("badge"); } catch { /* optional */ }
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ }
    }, 260 + i * 430));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badges.length]);
  return (
    <View style={{ alignItems: "center", width: "100%" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>✦ {badges.length} new badge{badges.length === 1 ? "" : "s"} ✦</Text>
      {badges.map((b, i) => {
        const url = emblemUrl(emblems[String(b?.code)] ?? null);
        const f = flips[i] ?? new Animated.Value(1);
        return (
          <Animated.View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 14, width: "100%", maxWidth: 320,
            opacity: f.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
            transform: [{ perspective: 800 }, { rotateY: f.interpolate({ inputRange: [0, 1], outputRange: ["100deg", "0deg"] }) }, { scale: f.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
            <Frame rarity={asRarity(b.rarity)} size="mini" radius={26}>
              <View style={{ width: 46, height: 46, backgroundColor: "#100d07", alignItems: "center", justifyContent: "center" }}>
                {url ? <Image source={{ uri: url }} style={{ width: 44, height: 44 }} resizeMode="contain" /> : <Text style={{ color: "#EFC24E", fontSize: 18 }}>◆</Text>}
              </View>
            </Frame>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 13 }}>{String(b.name ?? "")}</Text>
              <Text style={{ color: rarityBase(asRarity(b.rarity)), fontSize: 8, letterSpacing: 1, textTransform: "uppercase" }}>{String(b.rarity ?? "")}</Text>
              <Text style={{ color: neutrals.muted, fontSize: 11, marginTop: 3, lineHeight: 15 }}>{earnText(b)}</Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

// A number that eases up from 0 to `to`, starting after `delay`. Drives a
// listener (useNativeDriver:false — the value is read on the JS side to render
// text), so the count-up ticks up on screen the way the web scorecard does.
function Count({ to, dur = 900, delay = 0, suffix = "", style }: { to: number; dur?: number; delay?: number; suffix?: string; style?: any }) {
  const v = useRef(new Animated.Value(0)).current;
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = v.addListener(({ value }) => setN(Math.round(value)));
    const t = setTimeout(() => {
      Animated.timing(v, { toValue: to, duration: dur, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, delay);
    return () => { v.removeListener(id); clearTimeout(t); };
  }, [to]);
  return <Text style={style}>{n}{suffix}</Text>;
}

// One stat tile — rises + fades in on its stagger, then counts up in its accent.
function StatTile({ value, label, accent, delay }: { value: number; label: string; accent: string; delay: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => Animated.timing(a, { toValue: 1, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(), delay);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      width: 150, alignItems: "center", borderWidth: 1, borderColor: accent + "55", borderRadius: 14, backgroundColor: accent + "12", paddingVertical: 18, paddingHorizontal: 12, margin: 6 }}>
      <Count to={value} delay={delay} style={{ color: accent, fontSize: 30, fontWeight: "900" }} />
      <Text style={{ color: neutrals.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 6, textAlign: "center" }}>{label}</Text>
    </Animated.View>
  );
}

function Summary({ payload }: { payload: Payload }) {
  const rating = num(payload, "rating");
  const gain = num(payload, "rating_gain");
  // candidate tiles in priority order — show only the ones that carry signal
  const candidates: { value: number | null; label: string }[] = [
    { value: num(payload, "duels_won"), label: "Duels won" },
    { value: num(payload, "best_streak"), label: "Best streak" },
    { value: num(payload, "medals_earned"), label: "Medals" },
    { value: num(payload, "badges_earned"), label: "Badges" },
    { value: num(payload, "backers"), label: "Backed you" },
    { value: num(payload, "schools_faced"), label: "Schools faced" },
    { value: num(payload, "landslide_wins"), label: "Landslides" },
    { value: num(payload, "helped_decide"), label: "Helped decide" },
  ];
  const tiles = candidates.filter((c) => c.value != null && c.value > 0).slice(0, 6);
  const accents = [hues.sapphire.hi, hues.ruby.hi, hues.amethyst.hi, hues.gold.hi, hues.emerald?.hi ?? hues.sapphire.hi, hues.gold.hi];
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 16 }}>Your season, so far</Text>

      {rating != null ? (
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <Count to={rating} dur={1200} delay={300} style={{ color: hues.gold.hi, fontFamily: "Georgia", fontSize: 58, fontWeight: "900", lineHeight: 60, textShadowColor: "rgba(230,185,63,0.4)", textShadowRadius: 18 }} />
            {gain && gain > 0 ? <GainChip gain={gain} /> : null}
          </View>
          <Text style={{ color: neutrals.muted2, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>Duel Rating</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", maxWidth: 336 }}>
        {tiles.map((t, i) => <StatTile key={t.label} value={t.value as number} label={t.label} accent={accents[i % accents.length]} delay={700 + i * 190} />)}
      </View>
    </View>
  );
}

// The ▲ +N chip that rides beside the hero rating — appears after the count-up.
function GainChip({ gain }: { gain: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => Animated.spring(a, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start(), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      marginLeft: 8, marginTop: 6, borderRadius: 99, backgroundColor: (hues.emerald?.hi ?? "#3FB37F") + "22", borderWidth: 1, borderColor: (hues.emerald?.hi ?? "#3FB37F") + "66", paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text style={{ color: hues.emerald?.hi ?? "#3FB37F", fontSize: 12, fontWeight: "800" }}>▲ +{gain}</Text>
    </Animated.View>
  );
}

// The Charge — the send-off. A tone-adapted rallying line keyed to the month's
// signal, the NMAO crest returning to bookend the Invocation, a "next battle"
// tile, and the Onward CTA — revealed in a staggered gilded sequence over
// rising embers. (RN Animated; a single `intro` value drives all beats.)
const CHARGE: Record<string, { head: string; sub: string }> = {
  effort: { head: "Sharper than last month.", sub: "Now bring it to the tournament." },
  dominant: { head: "The throne is yours to defend.", sub: "Round 9 comes for the crown." },
  rising: { head: "You're climbing. Don't stop now.", sub: "The next rung is Round 9." },
  steady: { head: "Keep stacking the work.", sub: "Round 9 is the next brick." },
};

// Embers drifting upward behind the Charge — a quiet "carry it forward" motion.
// Each ember loops on its own timing (native driver); the field is memoized so the
// loops start once. Rendered as a full-screen layer behind the ceremony content.
function RisingEmbers({ count = 14 }: { count?: number }) {
  const H = Dimensions.get("window").height;
  const embers = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: 4 + Math.random() * 92,
    size: 2 + Math.random() * 3.5,
    dur: 3400 + Math.random() * 2800,
    delay: Math.random() * 3000,
    drift: (Math.random() - 0.5) * 40,
    color: [hues.sapphire.hi, hues.amethyst.hi, hues.gold.hi][i % 3],
    v: new Animated.Value(0),
  })), [count]);
  useEffect(() => {
    const anims = embers.map((e) => Animated.loop(Animated.sequence([
      Animated.delay(e.delay),
      Animated.timing(e.v, { toValue: 1, duration: e.dur, easing: Easing.linear, useNativeDriver: true }),
    ])));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [embers]);
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      {embers.map((e, i) => (
        <Animated.View key={i} style={{ position: "absolute", left: `${e.x}%`, bottom: -8, width: e.size, height: e.size, borderRadius: e.size / 2, backgroundColor: e.color,
          opacity: e.v.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 0.7, 0.4, 0] }),
          transform: [
            { translateY: e.v.interpolate({ inputRange: [0, 1], outputRange: [0, -(H * 0.85)] }) },
            { translateX: e.v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, e.drift, 0] }) },
          ] }} />
      ))}
    </View>
  );
}

function Close({ onDone, signal }: { onDone: () => void; signal: string | null }) {
  const season = useSeasonLabel();
  const intro = useRef(new Animated.Value(0)).current;
  const c = (signal && CHARGE[signal]) ? CHARGE[signal] : CHARGE.effort;
  useEffect(() => {
    intro.setValue(0);
    Animated.timing(intro, { toValue: 1, duration: 2600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const h = setTimeout(() => { try { play("win"); } catch { /* optional */ } }, 650);
    return () => clearTimeout(h);
  }, [intro]);
  const fade = (a: number, b: number) => intro.interpolate({ inputRange: [a, b], outputRange: [0, 1], extrapolate: "clamp" });
  const grow = (a: number, b: number, from: number) => intro.interpolate({ inputRange: [a, b], outputRange: [from, 1], extrapolate: "clamp" });
  const rise = (a: number, b: number, d: number) => intro.interpolate({ inputRange: [a, b], outputRange: [d, 0], extrapolate: "clamp" });
  return (
    <View style={{ alignItems: "center", alignSelf: "stretch" }}>
      <Animated.Text style={{ opacity: fade(0, 0.12), color: hues.gold.base, fontSize: 12, fontWeight: "800", letterSpacing: 3, textTransform: "uppercase" }}>Carry It Forward</Animated.Text>
      <Animated.View style={{ opacity: fade(0.08, 0.34), transform: [{ scale: grow(0.08, 0.34, 0.7) }], marginTop: 18, marginBottom: 4,
        shadowColor: hues.amethyst.hi, shadowOpacity: 0.6, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } }}>
        <Coin size={92} />
      </Animated.View>
      <Animated.Text style={{ opacity: fade(0.26, 0.52), transform: [{ translateY: rise(0.26, 0.52, 16) }], color: hues.gold.hi, fontSize: 30, fontWeight: "900", textAlign: "center", marginTop: 18, maxWidth: 320, lineHeight: 35, textShadowColor: "rgba(230,185,63,0.4)", textShadowRadius: 18 }}>{c.head}</Animated.Text>
      <Animated.Text style={{ opacity: fade(0.46, 0.68), color: "#d9cfb6", fontSize: 15, fontStyle: "italic", textAlign: "center", marginTop: 12, maxWidth: 290, lineHeight: 21 }}>{c.sub}</Animated.Text>
      <Animated.View style={{ opacity: fade(0.62, 0.82), transform: [{ translateY: rise(0.62, 0.82, 12) }], marginTop: 20, borderRadius: 14, borderWidth: 1, borderColor: hues.amethyst.hi + "66", backgroundColor: hues.amethyst.hi + "12", paddingVertical: 11, paddingHorizontal: 22, alignItems: "center" }}>
        <Text style={{ color: neutrals.text, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 }}>{season ? `${season} · Next Battle` : "Your Next Battle"}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", marginTop: 3 }}>Awaits you in the Arena</Text>
      </Animated.View>
      <Animated.View style={{ opacity: fade(0.8, 1), transform: [{ translateY: rise(0.8, 1, 14) }], marginTop: 26, alignSelf: "stretch", paddingHorizontal: 12 }}>
        <Gold full label="Onward →" onPress={onDone} />
      </Animated.View>
    </View>
  );
}

function Gold({ label, onPress, full }: { label: string; onPress: () => void; full?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ minWidth: full ? undefined : 104, alignSelf: full ? "stretch" : "auto" }}>
      <View style={{ borderRadius: 11, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center", backgroundColor: hues.gold.base }}>
        <Text style={{ color: "#141210", fontWeight: "800", fontSize: 13 }}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}
function Ghost({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ minWidth: 104 }}>
      <View style={{ borderRadius: 11, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center", borderWidth: 1, borderColor: neutrals.border }}>
        <Text style={{ color: neutrals.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}
