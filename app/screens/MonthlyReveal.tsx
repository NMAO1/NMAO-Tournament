import { useEffect, useState, useRef, useMemo, forwardRef, useImperativeHandle, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, AppState, Animated, Easing, Image, Dimensions, Linking, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Canvas, Circle } from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { neutrals, hues, rarityBase, type Rarity, type MedalType } from "@nmao/design-tokens";

// rarity ranking — the rarest earned badge crowns the invocation title
const RRANK: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
import { Medal } from "../components/Medal";
import { Medallion, type Tier } from "../components/Medallion";
import { Frame } from "../components/Frame";
import { markMonthlySeen } from "../lib/notifications";
import { useSeasonLabel } from "../lib/season";
import { startMusic, stopMusic, fadeOutMusic, initSounds, play } from "../lib/sound";
import { revealTrackUrl } from "../lib/revealMusic";
import { emblemUrl } from "../lib/vault";
import { revealSponsor, type RevealSponsor } from "../lib/revealSponsor";
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
// The Tournament League emblem — the spectrum dragon coin (replaces the old gold crest).
const EMBLEM = require("../assets/tournament-emblem.png");
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function earnText(b: any): string {
  const ea = b.earned_action;
  if (ea && typeof ea === "object" && typeof ea.note === "string") return ea.note;
  if (typeof ea === "string") return ea;
  return typeof b.description === "string" ? b.description : "";
}

// A tap-into detail (clickable badges + stat tiles open one of these).
type DetailRow = { ic: string; color: string; mn: string; ms?: string; rr?: string };
export type Detail = {
  emblem?: string | null; emblemFallback?: string;
  title: string; titleColor?: string;
  bigValue?: string;
  tag?: string; tagColor?: string;
  sub?: string;
  rows: DetailRow[];
};

export default function MonthlyReveal({ period, payload, onClose, viewerId }: { period: string; payload: Payload; onClose: () => void; viewerId?: string }) {
  const [step, setStep] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null); // tap-into overlay (badges / stats)
  // Bookend sponsor — resolved at view time (segment-targeted). `undefined` while
  // it loads: the ceremony holds until it settles so the step list can't shift
  // out from under an in-flight step. `null` = no sponsor → both bookends skip.
  const [sponsor, setSponsor] = useState<RevealSponsor | null | undefined>(undefined);
  const ready = sponsor !== undefined;
  useEffect(() => { let a = true; revealSponsor(viewerId).then((s) => { if (a) setSponsor(s); }).catch(() => { if (a) setSponsor(null); }); return () => { a = false; }; }, [viewerId]);
  // The competitor's own name for the Invocation name-card (their own reveal, so
  // the full name is fine here — the masked display_name is for peers).
  const [heroName, setHeroName] = useState<string | null>(null);
  useEffect(() => {
    let a = true;
    (async () => {
      if (!viewerId) return;
      try {
        const { data } = await supabase.from("competitors").select("first_name,last_name").eq("id", viewerId).maybeSingle();
        if (a && data) setHeroName([data.first_name, data.last_name].filter(Boolean).join(" ") || null);
      } catch { /* name is optional */ }
    })();
    return () => { a = false; };
  }, [viewerId]);
  useEffect(() => { if (ready) { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* optional */ } } }, [step, ready]);
  // Score: stream this round's soundtrack under the ceremony; stop on exit.
  // initSounds loads the one-shot SFX (riser/tick/win) layered over the music.
  useEffect(() => { if (!ready) return; initSounds(); startMusic(revealTrackUrl(period), 0.7); return () => { stopMusic(); }; }, [period, ready]);
  // Never let the score outlive the moment: cut it if the app backgrounds.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s !== "active") stopMusic(); });
    return () => sub.remove();
  }, []);

  const medals = arr(payload, "medals");
  const badges = arr(payload, "badges");
  const hasSponsor = !!sponsor;
  // The competitor moves through the ceremony at their own pace — each act holds
  // until they press Continue (no auto-advance). Sponsor bookends wrap it.
  const steps: string[] = [
    ...(hasSponsor ? ["presenter"] : []),
    "title",   // ACT 1 — the org name lands + Tournament League
    "name",    // ACT 2 — the dragon crest, their name, their honors
    ...(medals.length ? ["medals"] : []),
    ...(badges.length ? ["badges"] : []),
    "summary",
    "close",
    ...(hasSponsor ? ["sponsor_end"] : []),
  ];
  const kind = steps[step];
  const last = steps.length - 1;

  // Finale: once the ceremony reaches its last card (the Charge, or the sponsor
  // end-card when there is one), let the score fade out rather than loop on.
  useEffect(() => { if (ready && step === last) fadeOutMusic(1400); }, [ready, step, last]);

  function done() { stopMusic(); markMonthlySeen(period); onClose(); }
  function next() { setStep((s) => Math.min(s + 1, last)); }
  // The Charge's Onward advances to the sponsor end-card when there is one, else closes.
  function advanceOrDone() { if (step < last) next(); else done(); }

  // Hold on black while the sponsor resolves (a beat, under the modal's own fade).
  if (!ready) return <View style={{ flex: 1, backgroundColor: "#070605" }} />;

  return (
    <View style={{ flex: 1, backgroundColor: "#050308" }}>
      <LinearGradient colors={["#180b2c", "#0a0512", "#1d0a16"]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <Starfield />
      {kind === "close" ? <RisingEmbers /> : null}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 50 }}>
        {steps.map((_, i) => <View key={i} style={{ flex: 1, height: 3, borderRadius: 3, marginHorizontal: 2, backgroundColor: i <= step ? hues.gold.base : "rgba(255,255,255,0.15)" }} />)}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 22, paddingVertical: 20 }}>
        {kind === "presenter" ? <Presenter sponsor={sponsor!} /> : null}
        {kind === "title" ? <Title /> : null}
        {kind === "name" ? <NameCard message={str(payload, "message")} badges={badges} name={heroName} /> : null}
        {kind === "medals" ? <Medals medals={medals} /> : null}
        {kind === "badges" ? <Badges badges={badges} onDetail={setDetail} /> : null}
        {kind === "summary" ? <Summary payload={payload} viewerId={viewerId} onDetail={setDetail} /> : null}
        {kind === "close" ? <Close onDone={advanceOrDone} signal={str(payload, "signal")} /> : null}
        {kind === "sponsor_end" ? <SponsorEnd sponsor={sponsor!} onDone={done} /> : null}
      </ScrollView>
      <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingBottom: 34 }}>
        {kind !== "close" && kind !== "sponsor_end" ? <Gold label="Continue →" onPress={next} /> : null}
      </View>
      {detail ? <DetailSheet detail={detail} onClose={() => setDetail(null)} /> : null}
    </View>
  );
}

// The tap-into detail overlay — a bottom sheet over the whole ceremony. Opened by
// tapping a badge (how you earned it) or a stat tile / rating (its breakdown).
function DetailSheet({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <LinearGradient colors={["#1b1526", "#0a090e"]} style={StyleSheet.absoluteFill} />
      <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ position: "absolute", top: 52, left: 16, zIndex: 3, padding: 6 }}>
        <Text style={{ color: hues.gold.base, fontSize: 15, fontWeight: "700" }}>‹ Back</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={{ paddingTop: 92, paddingHorizontal: 24, paddingBottom: 40 }}>
        {detail.emblem !== undefined ? (
          <View style={{ alignItems: "center", marginBottom: 10 }}>
            {detail.emblem ? <Image source={{ uri: detail.emblem }} style={{ width: 112, height: 112, borderRadius: 56 }} resizeMode="cover" /> : <Text style={{ fontSize: 52 }}>{detail.emblemFallback ?? "◆"}</Text>}
          </View>
        ) : null}
        <Text style={{ color: detail.titleColor ?? "#F7F3E9", fontFamily: "Georgia", fontWeight: "900", fontSize: 27, textAlign: "center" }}>{detail.title}</Text>
        {detail.bigValue ? <Text style={{ color: detail.titleColor ?? hues.gold.hi, fontFamily: "Georgia", fontWeight: "900", fontSize: 52, textAlign: "center", marginTop: 2 }}>{detail.bigValue}</Text> : null}
        {detail.tag ? <Text style={{ color: detail.tagColor ?? hues.gold.base, fontSize: 11, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginTop: 6 }}>{detail.tag}</Text> : null}
        {detail.sub ? <Text style={{ color: neutrals.muted, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 19, alignSelf: "center", maxWidth: 300 }}>{detail.sub}</Text> : null}
        <View style={{ marginTop: 18 }}>
          {detail.rows.map((r, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.09)" }}>
              <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: r.color + "2e", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                <Text style={{ color: r.color, fontWeight: "900", fontSize: 13 }}>{r.ic}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#F7F3E9", fontWeight: "700", fontSize: 14 }}>{r.mn}</Text>
                {r.ms ? <Text style={{ color: neutrals.muted2, fontSize: 11.5, marginTop: 2, lineHeight: 16 }}>{r.ms}</Text> : null}
              </View>
              {r.rr ? <Text style={{ color: r.color, fontWeight: "800", fontSize: 13, marginLeft: 8 }}>{r.rr}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// A drifting starfield + faint twinkle behind the whole ceremony (Skia, RAF).
// Cheap: ~64 dots, re-rendered each frame only while the reveal is mounted.
function Starfield() {
  const { width, height } = Dimensions.get("window");
  const stars = useMemo(() => Array.from({ length: 64 }, () => ({
    x: Math.random() * width, y: Math.random() * height,
    r: Math.random() * 1.5 + 0.4, tw: Math.random() * Math.PI * 2,
    sp: Math.random() * 0.7 + 0.25, drift: Math.random() * 7 + 2,
    gold: Math.random() < 0.16,
  })), [width, height]);
  const start = useRef(Date.now());
  const [, setNow] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const loop = () => { setNow(Date.now()); raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  const t = (Date.now() - start.current) / 1000;
  return (
    <Canvas style={{ position: "absolute", width, height }} pointerEvents="none">
      {stars.map((s, i) => {
        let y = (s.y - t * s.drift) % height; if (y < 0) y += height;
        const op = 0.28 + 0.5 * (0.5 + 0.5 * Math.sin(t * s.sp * 3 + s.tw));
        return <Circle key={i} cx={s.x} cy={y} r={s.r} color={s.gold ? "#FFE488" : "#FFFFFF"} opacity={op} />;
      })}
    </Canvas>
  );
}

// The Tournament League emblem crest — the spectrum dragon coin in a gilded ring,
// with a soft season-blue glow. Replaces the old gold Coin as the ceremony's crest.
function Crest({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center",
      shadowColor: SEASON.hi, shadowOpacity: 0.7, shadowRadius: size * 0.3, shadowOffset: { width: 0, height: 0 } }}>
      <Image source={EMBLEM} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: "rgba(230,185,63,0.55)" }} resizeMode="cover" />
    </View>
  );
}

// ACT 1 · Title — the org name slides in larger + cinematic and HOLDS, the
// "TOURNAMENT LEAGUE" title lands beneath it. One driver `t` gates the beats.
function Title() {
  const season = useSeasonLabel();
  const t = useRef(new Animated.Value(0)).current;
  const [typed, setTyped] = useState(0);
  const ORG = "NATIONAL MARTIAL ARTS ORGANIZATION";
  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 3800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    let i = 0; const iv = setInterval(() => { i += 1; setTyped(i); if (i >= ORG.length) clearInterval(iv); }, 34);
    const h1 = setTimeout(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid); } catch { /* opt */ } }, 1500);
    const h2 = setTimeout(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch { /* opt */ } }, 2200);
    return () => { clearInterval(iv); clearTimeout(h1); clearTimeout(h2); };
  }, [t]);
  const seg = (pts: number[], out: number[]) => t.interpolate({ inputRange: pts, outputRange: out, extrapolate: "clamp" });
  const orgOp = seg([0, 0.14], [0, 1]);
  const orgRise = seg([0, 0.22], [16, 0]);
  const titleOp = seg([0.42, 0.56], [0, 1]);
  const titleScale = seg([0.42, 0.6, 0.74], [1.5, 0.96, 1]);
  const subOp = seg([0.72, 0.9], [0, 1]);
  return (
    <View style={{ width: "100%", maxWidth: 420, alignItems: "center", justifyContent: "center" }}>
      <Animated.Text style={{ opacity: orgOp, transform: [{ translateY: orgRise }], color: hues.gold.base, fontSize: 16, fontWeight: "800", letterSpacing: 3, textAlign: "center", textTransform: "uppercase", lineHeight: 24, marginBottom: 22 }}>{ORG.slice(0, typed)}</Animated.Text>
      <Animated.Text style={{ opacity: titleOp, transform: [{ scale: titleScale }], color: hues.gold.hi, fontSize: 44, fontWeight: "900", letterSpacing: 1, lineHeight: 46, textAlign: "center", textShadowColor: "rgba(230,185,63,0.6)", textShadowRadius: 26 }}>TOURNAMENT{"\n"}LEAGUE</Animated.Text>
      <Animated.Text style={{ opacity: subOp, color: hues.gold.base, fontSize: 12, fontWeight: "800", letterSpacing: 4, marginTop: 16, textTransform: "uppercase" }}>{season ?? "Season 1 · Sapphire"}</Animated.Text>
    </View>
  );
}

// ACT 2 · Name card — the dragon crest ignites, then the competitor's name +
// their rarest badge as an honorific + a closing line. HOLDS for Continue.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NameCard({ message, badges, name }: { message: string | null; badges: any[]; name: string | null }) {
  const season = useSeasonLabel();
  const t = useRef(new Animated.Value(0)).current;
  const rarest = useMemo(() => badges.slice().sort((a, b) => (RRANK[String(b?.rarity)] || 0) - (RRANK[String(a?.rarity)] || 0))[0], [badges]);
  const honor = rarest ? String(rarest.name || "") : null;
  const rCol = rarest ? rarityBase(asRarity(rarest.rarity)) : hues.gold.base;
  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 2800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const h = setTimeout(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch { /* opt */ } }, 320);
    return () => clearTimeout(h);
  }, [t]);
  const seg = (pts: number[], out: number[]) => t.interpolate({ inputRange: pts, outputRange: out, extrapolate: "clamp" });
  const crestOp = seg([0, 0.24], [0, 1]);
  const crestScale = seg([0, 0.3], [0.5, 1]);
  const seasonOp = seg([0.3, 0.45], [0, 1]);
  const nameOp = seg([0.4, 0.56], [0, 1]);
  const nameRise = seg([0.4, 0.58], [18, 0]);
  const honorOp = seg([0.6, 0.76], [0, 1]);
  const msgOp = seg([0.8, 0.96], [0, 1]);
  return (
    <View style={{ alignItems: "center", width: "100%", maxWidth: 420 }}>
      <Animated.View style={{ opacity: crestOp, transform: [{ scale: crestScale }] }}><Crest size={134} /></Animated.View>
      <Animated.Text style={{ opacity: seasonOp, color: SEASON.hi, fontSize: 13, fontStyle: "italic", marginTop: 18 }}>{season ?? "Season 1 · Sapphire"}</Animated.Text>
      {name ? <Animated.Text style={{ opacity: nameOp, transform: [{ translateY: nameRise }], color: hues.gold.hi, fontFamily: "Georgia", fontSize: 38, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", textAlign: "center", marginTop: 6, textShadowColor: "rgba(230,185,63,0.5)", textShadowRadius: 16 }}>{name}</Animated.Text> : null}
      {honor ? (
        <>
          <Animated.Text style={{ opacity: honorOp, color: hues.gold.hi, fontFamily: "Georgia", fontSize: 18, fontStyle: "italic", marginTop: 10, textAlign: "center" }}>&ldquo;{honor}&rdquo;</Animated.Text>
          <Animated.Text style={{ opacity: honorOp, color: rCol, fontSize: 10.5, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase", marginTop: 5 }}>{String(rarest.rarity)} badge · earned</Animated.Text>
        </>
      ) : (
        <Animated.Text style={{ opacity: honorOp, color: hues.gold.hi, fontFamily: "Georgia", fontSize: 20, fontStyle: "italic", marginTop: 10 }}>A month worth framing</Animated.Text>
      )}
      <Animated.Text style={{ opacity: msgOp, color: neutrals.text, fontSize: 13, fontStyle: "italic", textAlign: "center", marginTop: 16, maxWidth: 300, lineHeight: 19 }}>&ldquo;{message ?? "The season is yours to shape. Onward."}&rdquo;</Animated.Text>
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
function Badges({ badges, onDetail }: { badges: any[]; onDetail: (d: Detail) => void }) {
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
    // slowed population — each badge lands with room to breathe before the next
    const timers = badges.map((_, i) => setTimeout(() => {
      Animated.timing(flips[i], { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      try { play("badge"); } catch { /* optional */ }
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ }
    }, 300 + i * 900));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badges.length]);
  const openBadge = (b: any, url: string | null) => onDetail({
    emblem: url || null, emblemFallback: "◆",
    title: String(b.name ?? ""), titleColor: "#F7F3E9",
    tag: `${String(b.rarity ?? "")} badge`, tagColor: rarityBase(asRarity(b.rarity)),
    rows: [{ ic: "✦", color: rarityBase(asRarity(b.rarity)), mn: "How you earned it", ms: earnText(b) || String(b.description ?? "") }],
  });
  return (
    <View style={{ alignItems: "center", width: "100%" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 18 }}>✦ {badges.length} new badge{badges.length === 1 ? "" : "s"} ✦</Text>
      {badges.map((b, i) => {
        const url = emblemUrl(emblems[String(b?.code)] ?? null);
        const f = flips[i] ?? new Animated.Value(1);
        return (
          <Animated.View key={i} style={{ width: "100%", maxWidth: 320,
            opacity: f.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
            transform: [{ perspective: 800 }, { rotateY: f.interpolate({ inputRange: [0, 1], outputRange: ["100deg", "0deg"] }) }, { scale: f.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => openBadge(b, url)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <Frame rarity={asRarity(b.rarity)} size="mini" radius={26}>
                <View style={{ width: 46, height: 46, backgroundColor: "#100d07", alignItems: "center", justifyContent: "center" }}>
                  {url ? <Image source={{ uri: url }} style={{ width: 44, height: 44 }} resizeMode="contain" /> : <Text style={{ color: "#EFC24E", fontSize: 18 }}>◆</Text>}
                </View>
              </Frame>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 13 }}>{String(b.name ?? "")}</Text>
                <Text style={{ color: rarityBase(asRarity(b.rarity)), fontSize: 8, letterSpacing: 1, textTransform: "uppercase" }}>{String(b.rarity ?? "")}</Text>
                <Text style={{ color: neutrals.muted, fontSize: 11, marginTop: 3, lineHeight: 15 }} numberOfLines={2}>{earnText(b)}</Text>
              </View>
              <Text style={{ color: neutrals.muted2, fontSize: 16, marginLeft: 6 }}>›</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
      <Text style={{ color: neutrals.muted2, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>tap a badge to see how you earned it</Text>
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

// One stat tile — rises + fades in on its stagger, counts up in its accent, and
// taps into its detail.
function StatTile({ value, label, accent, delay, onPress }: { value: number; label: string; accent: string; delay: number; onPress: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => Animated.timing(a, { toValue: 1, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(), delay);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }], margin: 6 }}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ width: 150, alignItems: "center", borderWidth: 1, borderColor: accent + "55", borderRadius: 14, backgroundColor: accent + "12", paddingVertical: 16, paddingHorizontal: 12 }}>
        <Count to={value} delay={delay} style={{ color: accent, fontSize: 30, fontWeight: "900" }} />
        <Text style={{ color: neutrals.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 6, textAlign: "center" }}>{label}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 8, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>tap ›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const STAT_INFO: Record<string, string> = {
  "Duels won": "Head-to-head duels you won this period.",
  "Best streak": "Your longest run of consecutive duel wins.",
  "Medals": "Judged-event medals earned this period.",
  "Badges": "New honors unlocked this period — open the badges act to read each story.",
  "Backed you": "People who voted for you in the arena.",
  "Schools faced": "Distinct dojos your opponents came from.",
  "Landslides": "Wins by 80%+ of the community vote.",
  "Helped decide": "Duels where your vote matched the crowd.",
};

function Summary({ payload, viewerId, onDetail }: { payload: Payload; viewerId?: string; onDetail: (d: Detail) => void }) {
  const rating = num(payload, "rating");
  const gain = num(payload, "rating_gain");
  // National tournament (skill) rating isn't in the reveal payload — pull it live so
  // it can sit beside the duel rating. Falls back to the single duel hero if absent.
  const [skillRow, setSkillRow] = useState<{ rating: number; provisional: boolean } | null>(null);
  useEffect(() => {
    let a = true;
    (async () => {
      if (!viewerId) return;
      try {
        const { data } = await supabase.from("skill_ratings").select("rating, events_count").eq("competitor_id", viewerId).maybeSingle();
        if (a && data && typeof data.rating === "number") setSkillRow({ rating: Math.round(data.rating), provisional: (typeof data.events_count === "number" ? data.events_count : 0) < 3 });
      } catch { /* tournament rating is optional here */ }
    })();
    return () => { a = false; };
  }, [viewerId]);
  const skill = skillRow ? skillRow.rating : null;
  const provisional = skillRow ? skillRow.provisional : false;
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
  const GOLD = hues.gold.hi, SAP = hues.sapphire.hi, EMER = hues.emerald?.hi ?? "#3FB37F";
  const openStat = (label: string, value: number, accent: string) => onDetail({ title: label, titleColor: accent, bigValue: String(value), sub: STAT_INFO[label], rows: [] });
  const openDuel = () => onDetail({ title: "Duel Rating", titleColor: SAP, bigValue: String(rating ?? 0), tag: gain && gain > 0 ? `▲ +${gain}` : undefined, tagColor: EMER, sub: "Your head-to-head Elo across all duels this season.", rows: [] });
  const openTour = () => onDetail({ title: "Tournament Rating", titleColor: GOLD, bigValue: String(skill ?? 0), tag: provisional ? "Provisional" : undefined, tagColor: GOLD, sub: provisional ? "Your national judged-skill rating — provisional until you log more judged entries." : "Your national judged-skill rating.", rows: [] });
  const bothRatings = skill != null && rating != null;
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 16 }}>Your season, so far</Text>

      {bothRatings ? (
        <View style={{ flexDirection: "row", marginBottom: 18, width: "100%", maxWidth: 336, justifyContent: "center" }}>
          <TouchableOpacity activeOpacity={0.85} onPress={openTour} style={{ flex: 1, marginRight: 6, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 16, paddingVertical: 14, backgroundColor: "rgba(255,255,255,0.02)" }}>
            <Text style={{ color: neutrals.muted2, fontSize: 9.5, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>Tournament</Text>
            <Count to={skill as number} dur={1200} delay={300} style={{ color: GOLD, fontFamily: "Georgia", fontSize: 40, fontWeight: "900", lineHeight: 44 }} />
            {provisional ? <Text style={{ color: GOLD, fontSize: 9, fontWeight: "800", letterSpacing: 0.5, marginTop: 2 }}>PROVISIONAL</Text> : null}
            <Text style={{ color: neutrals.muted2, fontSize: 8, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>tap ›</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={openDuel} style={{ flex: 1, marginLeft: 6, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 16, paddingVertical: 14, backgroundColor: "rgba(255,255,255,0.02)" }}>
            <Text style={{ color: neutrals.muted2, fontSize: 9.5, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>Duel</Text>
            <Count to={rating as number} dur={1200} delay={300} style={{ color: SAP, fontFamily: "Georgia", fontSize: 40, fontWeight: "900", lineHeight: 44 }} />
            {gain && gain > 0 ? <Text style={{ color: EMER, fontSize: 10, fontWeight: "800", marginTop: 2 }}>▲ +{gain}</Text> : null}
            <Text style={{ color: neutrals.muted2, fontSize: 8, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>tap ›</Text>
          </TouchableOpacity>
        </View>
      ) : rating != null ? (
        <TouchableOpacity activeOpacity={0.85} onPress={openDuel} style={{ alignItems: "center", marginBottom: 18 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <Count to={rating} dur={1200} delay={300} style={{ color: hues.gold.hi, fontFamily: "Georgia", fontSize: 58, fontWeight: "900", lineHeight: 60, textShadowColor: "rgba(230,185,63,0.4)", textShadowRadius: 18 }} />
            {gain && gain > 0 ? <GainChip gain={gain} /> : null}
          </View>
          <Text style={{ color: neutrals.muted2, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>Duel Rating · tap ›</Text>
        </TouchableOpacity>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", maxWidth: 336 }}>
        {tiles.map((t, i) => { const accent = accents[i % accents.length]; return <StatTile key={t.label} value={t.value as number} label={t.label} accent={accent} delay={700 + i * 190} onPress={() => openStat(t.label, t.value as number, accent)} />; })}
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

// A sponsor's logo, or its name as a wordmark when no logo art is set.
function SponsorMark({ sponsor, big }: { sponsor: RevealSponsor; big?: boolean }) {
  if (sponsor.logoUrl) {
    return <Image source={{ uri: sponsor.logoUrl }} style={{ width: big ? 224 : 168, height: big ? 84 : 60 }} resizeMode="contain" />;
  }
  return <Text style={{ color: "#EDEFF2", fontSize: big ? 36 : 26, fontWeight: "900", letterSpacing: 2, textAlign: "center", textShadowColor: "rgba(255,255,255,0.18)", textShadowRadius: 12 }}>{sponsor.name}</Text>;
}

// Sponsor pre-roll — "This round … is presented by [logo]", the sponsor's tagline,
// and a brand-color underline, revealed in a staggered gilded sequence. (Bookends
// the end-card; both appear only when a sponsor is targeted to the viewer.)
function Presenter({ sponsor }: { sponsor: RevealSponsor }) {
  const season = useSeasonLabel();
  const intro = useRef(new Animated.Value(0)).current;
  useEffect(() => { intro.setValue(0); Animated.timing(intro, { toValue: 1, duration: 2200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [intro]);
  const fade = (a: number, b: number) => intro.interpolate({ inputRange: [a, b], outputRange: [0, 1], extrapolate: "clamp" });
  const grow = (a: number, b: number, from: number) => intro.interpolate({ inputRange: [a, b], outputRange: [from, 1], extrapolate: "clamp" });
  return (
    <View style={{ alignItems: "center" }}>
      <Animated.Text style={{ opacity: fade(0, 0.2), color: neutrals.muted, fontSize: 13, lineHeight: 22, textAlign: "center", letterSpacing: 0.3 }}>
        This round of the{"\n"}
        <Text style={{ color: hues.gold.base, fontWeight: "800", letterSpacing: 0.6 }}>{season ? `${season} · Tournament of Champions` : "Tournament of Champions"}</Text>{"\n"}
        is presented by
      </Animated.Text>
      <Animated.View style={{ opacity: fade(0.22, 0.55), transform: [{ scale: grow(0.22, 0.55, 0.82) }], marginTop: 26, marginBottom: 4, alignItems: "center" }}>
        <SponsorMark sponsor={sponsor} big />
      </Animated.View>
      {sponsor.tagline ? <Animated.Text style={{ opacity: fade(0.5, 0.75), color: "#c9b8a0", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 16, letterSpacing: 0.3, maxWidth: 300 }}>{sponsor.tagline}</Animated.Text> : null}
      <Animated.View style={{ opacity: fade(0.62, 0.9), width: 74, height: 3, borderRadius: 3, marginTop: 18, backgroundColor: sponsor.color }} />
    </View>
  );
}

// Sponsor end-card — "Brought to you by [logo]", a motivational message, an
// optional offer, and a "Shop the … store" link (opens the sponsor's URL). The
// true finale card; its Onward closes the ceremony.
function SponsorEnd({ sponsor, onDone }: { sponsor: RevealSponsor; onDone: () => void }) {
  const intro = useRef(new Animated.Value(0)).current;
  useEffect(() => { intro.setValue(0); Animated.timing(intro, { toValue: 1, duration: 2400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [intro]);
  const fade = (a: number, b: number) => intro.interpolate({ inputRange: [a, b], outputRange: [0, 1], extrapolate: "clamp" });
  const rise = (a: number, b: number, d: number) => intro.interpolate({ inputRange: [a, b], outputRange: [d, 0], extrapolate: "clamp" });
  const openStore = () => { if (sponsor.storeUrl) Linking.openURL(sponsor.storeUrl).catch(() => {}); };
  return (
    <View style={{ alignItems: "center", alignSelf: "stretch" }}>
      <Animated.Text style={{ opacity: fade(0, 0.16), color: neutrals.muted, fontSize: 12, fontWeight: "700", letterSpacing: 2.4, textTransform: "uppercase" }}>Brought to you by</Animated.Text>
      <Animated.View style={{ opacity: fade(0.14, 0.42), marginTop: 16, marginBottom: 2, alignItems: "center" }}>
        <SponsorMark sponsor={sponsor} />
      </Animated.View>
      {sponsor.message ? <Animated.Text style={{ opacity: fade(0.38, 0.62), color: "#efe6d2", fontSize: 16, fontStyle: "italic", textAlign: "center", marginTop: 14, maxWidth: 300, lineHeight: 22 }}>{sponsor.message}</Animated.Text> : null}
      {sponsor.offer ? (
        <Animated.View style={{ opacity: fade(0.54, 0.76), transform: [{ translateY: rise(0.54, 0.76, 10) }], marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: sponsor.color + "66", backgroundColor: sponsor.color + "14", paddingVertical: 9, paddingHorizontal: 16, maxWidth: 300 }}>
          <Text style={{ color: "#f0d9b0", fontSize: 13, textAlign: "center" }}>🎁  {sponsor.offer}</Text>
        </Animated.View>
      ) : null}
      {sponsor.storeUrl ? (
        <Animated.View style={{ opacity: fade(0.68, 0.9), transform: [{ translateY: rise(0.68, 0.9, 10) }], marginTop: 20 }}>
          <TouchableOpacity onPress={openStore} activeOpacity={0.85}>
            <View style={{ borderRadius: 99, paddingVertical: 13, paddingHorizontal: 26, backgroundColor: sponsor.color }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 }}>Shop the {sponsor.name} store →</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      <Animated.View style={{ opacity: fade(0.82, 1), marginTop: 26 }}>
        <TouchableOpacity onPress={onDone} activeOpacity={0.8}>
          <Text style={{ color: neutrals.muted, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", padding: 8 }}>Onward →</Text>
        </TouchableOpacity>
      </Animated.View>
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
        <Crest size={96} />
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
