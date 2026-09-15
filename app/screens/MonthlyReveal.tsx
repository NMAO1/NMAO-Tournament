import { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, AppState, Animated, Easing } from "react-native";
import { Canvas, Circle } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { neutrals, hues, type Rarity, type MedalType } from "@nmao/design-tokens";
import { Coin } from "../components/Coin";
import { Medal } from "../components/Medal";
import { Medallion, type Tier } from "../components/Medallion";
import { Frame } from "../components/Frame";
import { markMonthlySeen } from "../lib/notifications";
import { useSeasonLabel } from "../lib/season";
import { startMusic, stopMusic, fadeOutMusic, initSounds, play } from "../lib/sound";
import { revealTrackUrl } from "../lib/revealMusic";

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
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 50 }}>
        {steps.map((_, i) => <View key={i} style={{ flex: 1, height: 3, borderRadius: 3, marginHorizontal: 2, backgroundColor: i <= step ? hues.gold.base : "rgba(255,255,255,0.15)" }} />)}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 22, paddingVertical: 20 }}>
        {kind === "open" ? <Open message={str(payload, "message")} /> : null}
        {kind === "medals" ? <Medals medals={medals} /> : null}
        {kind === "badges" ? <Badges badges={badges} /> : null}
        {kind === "summary" ? <Summary backers={num(payload, "backers")} rating={num(payload, "rating")} gain={num(payload, "rating_gain")} schools={num(payload, "schools_faced")} /> : null}
        {kind === "close" ? <Close onDone={done} /> : null}
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

function Open({ message }: { message: string | null }) {
  const season = useSeasonLabel();
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 22, fontWeight: "700", textAlign: "center", lineHeight: 27 }}>National Martial Arts Organization</Text>
      <Text style={{ color: hues.gold.base, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 }}>Tournament of Champions</Text>
      {season ? <Text style={{ color: hues.gold.hi, fontSize: 17, fontStyle: "italic", marginTop: 8, marginBottom: 20 }}>{season}</Text> : <View style={{ height: 20 }} />}
      <Coin size={104} />
      <Text style={{ color: hues.gold.hi, fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 22, maxWidth: 280, lineHeight: 20 }}>&ldquo;{message ?? "A month worth framing. Here’s what you earned."}&rdquo;</Text>
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
    try { play("riser"); } catch { /* optional */ } // tension build as the assembly begins
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
      try { play("soft"); } catch { /* optional */ } // a soft tick on each seat, on the beat
      if (i >= filled || i >= 8) {
        clearInterval(id);
        setTimeout(() => {
          setDone(true);
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* optional */ }
          try { play("win"); } catch { /* optional */ } // triumphant hit as the medallion completes
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Badges({ badges }: { badges: any[] }) {
  return (
    <View style={{ alignItems: "center", width: "100%" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>✦ {badges.length} new badge{badges.length === 1 ? "" : "s"} ✦</Text>
      {badges.map((b, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 14, width: "100%", maxWidth: 320 }}>
          <Frame rarity={asRarity(b.rarity)} size="mini" radius={26}>
            <View style={{ width: 46, height: 46, backgroundColor: "#100d07", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#EFC24E", fontSize: 18 }}>◆</Text>
            </View>
          </Frame>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 13 }}>{String(b.name ?? "")}</Text>
            <Text style={{ color: neutrals.muted2, fontSize: 8, letterSpacing: 1, textTransform: "uppercase" }}>{String(b.rarity ?? "")}</Text>
            <Text style={{ color: neutrals.muted, fontSize: 11, marginTop: 3, lineHeight: 15 }}>{earnText(b)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Summary({ backers, rating, gain, schools }: { backers: number | null; rating: number | null; gain: number | null; schools: number | null }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>Your season, so far</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
        {backers != null ? <Stat v={String(backers)} l="Backed you" /> : null}
        {rating != null ? <Stat v={`${rating}${gain ? " ▲" : ""}`} l="Rating" /> : null}
        {schools != null ? <Stat v={String(schools)} l="Schools faced" /> : null}
      </View>
    </View>
  );
}
function Stat({ v, l }: { v: string; l: string }) {
  return (
    <View style={{ borderWidth: 1, borderColor: neutrals.border, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", paddingVertical: 12, paddingHorizontal: 16, margin: 6, minWidth: 84, alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 20, fontWeight: "800" }}>{v}</Text>
      <Text style={{ color: neutrals.muted2, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 4 }}>{l}</Text>
    </View>
  );
}

function Close({ onDone }: { onDone: () => void }) {
  return (
    <View style={{ alignItems: "center", alignSelf: "stretch" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Carry it forward</Text>
      <Text style={{ color: hues.gold.hi, fontSize: 16, fontStyle: "italic", textAlign: "center", maxWidth: 280, lineHeight: 22 }}>&ldquo;Sharper than last month. Bring it to the tournament.&rdquo;</Text>
      <View style={{ marginTop: 24, alignSelf: "stretch", paddingHorizontal: 12 }}>
        <Gold full label="Onward →" onPress={onDone} />
      </View>
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
