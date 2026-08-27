import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Image, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { duelReveal, type Reveal, type Card, type DuelType } from "../lib/duel";
import { useSeasonLabel } from "../lib/season";
import { initSounds, play, setPlaysInSilentMode } from "../lib/sound";

type Outcome = "win" | "deadlock" | "loss" | "spectator";

// The per-duel reveal — the tally unveiling after a duel closes. Stepped
// (face-off → result → tally → onward), outcome-aware (win / deadlock / loss /
// spectator), always invites re-entry. Rewards are held to the monthly reveal.
export default function DuelReveal({ duelId, myId, onClose }: { duelId: string; myId: string | null; onClose: () => void }) {
  const [rev, setRev] = useState<Reveal | null>(null);
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => { duelReveal(duelId).then((r) => (r ? setRev(r) : setFailed(true))); }, [duelId]);
  // Sound: init + respect the silent switch for duels (unlike the always-plays
  // monthly ceremony); restore the default on exit so the ceremony is unaffected.
  useEffect(() => {
    initSounds().then(() => setPlaysInSilentMode(false));
    return () => { setPlaysInSilentMode(true); };
  }, []);
  // light tick on step change — the Result step (1) fires its own outcome-aware haptic
  useEffect(() => { if (step === 1) return; try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ } }, [step]);

  if (failed) return <Center><Text style={{ color: neutrals.muted, textAlign: "center" }}>This duel isn’t ready to reveal yet.</Text><Ghost label="Close" onPress={onClose} /></Center>;
  if (!rev) return <Center><ActivityIndicator color={neutrals.muted} /></Center>;

  const iAmChallenger = myId === rev.challenger.competitorId;
  const participant = iAmChallenger || myId === rev.opponent.competitorId;
  const won = !!rev.winnerId && rev.winnerId === myId;
  const draw = rev.result === "draw" || rev.result === "no_contest";
  const outcome: Outcome = won ? "win" : draw ? "deadlock" : participant ? "loss" : "spectator";

  const me = participant && !iAmChallenger ? rev.opponent : rev.challenger;
  const them = participant && !iAmChallenger ? rev.challenger : rev.opponent;
  const myVotes = participant && !iAmChallenger ? rev.opponentVotes : rev.challengerVotes;
  const theirVotes = participant && !iAmChallenger ? rev.challengerVotes : rev.opponentVotes;
  const myBackers = participant && !iAmChallenger ? rev.opponentBackers : rev.challengerBackers;
  // the viewer's own rating movement (participants only; null for old/draw duels)
  const myRatingBefore = participant ? (iAmChallenger ? rev.challengerRatingBefore : rev.opponentRatingBefore) : null;
  const myRatingAfter = participant ? (iAmChallenger ? rev.challengerRatingAfter : rev.opponentRatingAfter) : null;
  const winnerName = rev.winnerId === rev.challenger.competitorId ? rev.challenger.firstName
    : rev.winnerId === rev.opponent.competitorId ? rev.opponent.firstName : null;

  const steps = [
    <FaceOff key="f" a={rev.challenger} b={rev.opponent} type={rev.type} />,
    <Result key="r" outcome={outcome} me={me} them={them} winnerName={winnerName} ratingBefore={myRatingBefore} ratingAfter={myRatingAfter} />,
    <Tally key="t" mine={myVotes} theirs={theirVotes} backers={myBackers} meName={me.firstName} themName={them.firstName} spectator={outcome === "spectator"} />,
    <Onward key="o" outcome={outcome} onDone={onClose} />,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#080611" }}>
      {/* spectrum progress rail (regal blue→purple→red) */}
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 50 }}>
        {steps.map((_, i) => (
          i <= step
            ? <LinearGradient key={i} colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, height: 3, borderRadius: 3, marginHorizontal: 2 }} />
            : <View key={i} style={{ flex: 1, height: 3, borderRadius: 3, marginHorizontal: 2, backgroundColor: "rgba(255,255,255,0.15)" }} />
        ))}
      </View>
      {/* bento card — a spectrum hairline border around a regal dark panel */}
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 18 }}>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: 1.5 }}>
          <View style={{ borderRadius: 25, backgroundColor: "#0c0a16", paddingVertical: 30, paddingHorizontal: 16 }}>{steps[step]}</View>
        </LinearGradient>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", paddingBottom: 34 }}>
        {step > 0 ? <Ghost label="‹ Back" onPress={() => setStep((s) => s - 1)} /> : <View style={{ width: 104 }} />}
        <View style={{ width: 12 }} />
        {step < steps.length - 1 ? <Spectrum label="Next ›" onPress={() => setStep((s) => s + 1)} /> : <Spectrum label="Done" onPress={onClose} />}
      </View>
    </View>
  );
}

function VideoThumb({ card }: { card: Card }) {
  const rarity = card.frame?.rarity ?? "legendary";
  return (
    <View style={{ alignItems: "center", width: 128 }}>
      <Frame rarity={rarity} size="mini">
        <View style={{ width: 120, height: 68, backgroundColor: "#0d0a06", alignItems: "center", justifyContent: "center" }}>
          {card.photo ? <Image source={{ uri: card.photo }} style={{ width: 120, height: 68 }} resizeMode="cover" /> : <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 22 }}>👤</Text>}
        </View>
      </Frame>
      <Text style={{ color: neutrals.muted2, fontSize: 8, letterSpacing: 1, textTransform: "uppercase", marginTop: 6 }}>{card.firstName}</Text>
      <Text style={{ color: neutrals.text, fontSize: 13, fontWeight: "900", textTransform: "uppercase" }}>{card.lastName}</Text>
      {card.sponsorFrame ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, backgroundColor: "rgba(6,5,4,0.6)", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 99, borderWidth: 1, borderColor: card.sponsorFrame.accentColor }}>
          {card.sponsorFrame.logoUrl ? <Image source={{ uri: card.sponsorFrame.logoUrl }} style={{ width: 12, height: 12, borderRadius: 6 }} /> : <Text style={{ fontSize: 8 }}>◆</Text>}
          <Text style={{ color: "#fff", fontSize: 7, fontWeight: "800", letterSpacing: 0.3 }} numberOfLines={1}>PRESENTED BY {card.sponsorFrame.label.toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FaceOff({ a, b, type }: { a: Card; b: Card; type: DuelType }) {
  const season = useSeasonLabel();
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>{season ? `${season} · ${type}` : type}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <VideoThumb card={a} />
        <Text style={{ color: hues.gold.hi, fontWeight: "900", fontStyle: "italic", fontSize: 34, marginTop: 22, marginHorizontal: 4 }}>VS</Text>
        <VideoThumb card={b} />
      </View>
      <Text style={{ color: hues.gold.hi, fontSize: 9, letterSpacing: 2, textTransform: "uppercase", marginTop: 18, marginBottom: 6 }}>Tale of the Path</Text>
      <Row l={a.school ?? "—"} label="Team" r={b.school ?? "—"} />
      <Row l={type} label="Style" r={type} />
      <Row l={a.rank ?? "—"} label="Rank" r={b.rank ?? "—"} />
      <Row l={String(a.duelWins)} label="Duel Wins" r={String(b.duelWins)} />
      <Row l={String(a.winStreak)} label="Win Streak" r={String(b.winStreak)} />
      <Row l={String(a.rating)} label="Rating" r={String(b.rating)} />
    </View>
  );
}

function Row({ l, label, r }: { l: string; label: string; r: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", width: 264, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 5, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 3 }}>
      <Text style={{ flex: 1, textAlign: "right", color: neutrals.text, fontSize: 11 }}>{l}</Text>
      <Text style={{ color: hues.gold.hi, fontSize: 8, letterSpacing: 0.5, textTransform: "uppercase", marginHorizontal: 10 }}>{label}</Text>
      <Text style={{ flex: 1, textAlign: "left", color: neutrals.text, fontSize: 11 }}>{r}</Text>
    </View>
  );
}

// A JS-driven integer count-up (non-native driver so we can read the value).
function CountUp({ from, to, duration = 1100, style }: { from: number; to: number; duration?: number; style?: object }) {
  const [val, setVal] = useState(from);
  useEffect(() => {
    const av = new Animated.Value(0);
    const id = av.addListener(({ value }) => setVal(Math.round(from + (to - from) * value)));
    Animated.timing(av, { toValue: 1, duration, useNativeDriver: false }).start();
    return () => av.removeListener(id);
  }, [from, to, duration]);
  return <Text style={style}>{val}</Text>;
}

function Result({ outcome, me, them, winnerName, ratingBefore, ratingAfter }:
  { outcome: Outcome; me: Card; them: Card; winnerName: string | null; ratingBefore: number | null; ratingAfter: number | null }) {
  const map = {
    win: { emblem: "👑", head: "Congratulations", sub: "The people have spoken and named you victorious." },
    deadlock: { emblem: "⚔️", head: "Deadlock", sub: "Too close to call — a rivalry worth settling." },
    loss: { emblem: "↑", head: "Well fought.", sub: `${them.firstName} took this round — but every duel sharpens your edge.` },
    spectator: { emblem: "🏆", head: winnerName ? `${winnerName} wins` : "The winner", sub: "The community has decided." },
  }[outcome];
  // Suspense: hold a beat ("the crowd has decided…") before the payoff lands.
  const [revealed, setRevealed] = useState(false);
  const s = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    play("riser"); // tension builds through the suspense beat…
    const t = setTimeout(() => {
      setRevealed(true);
      try {
        const kind = outcome === "loss" || outcome === "deadlock"
          ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success;
        Haptics.notificationAsync(kind);
      } catch { /* optional */ }
      // …then the outcome sting lands with the emblem: win = triumphant, loss/
      // deadlock = a gentle "soft" (never a defeat buzzer), spectator = neutral.
      play(outcome === "win" ? "win" : outcome === "spectator" ? "reveal" : "soft");
      Animated.spring(s, { toValue: 1, friction: 5, tension: 130, useNativeDriver: true }).start();
      if (outcome === "win") Animated.spring(glow, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
    }, 750);
    return () => clearTimeout(t);
  }, [s, glow, outcome]);
  const scale = s.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.8] });
  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

  if (!revealed) {
    return <View style={{ alignItems: "center" }}><Text style={{ color: neutrals.muted, fontSize: 13, letterSpacing: 2, textTransform: "uppercase" }}>The crowd has decided…</Text></View>;
  }
  const delta = ratingBefore != null && ratingAfter != null ? ratingAfter - ratingBefore : null;
  const up = (delta ?? 0) >= 0;
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        {outcome === "win" ? (
          <Animated.View pointerEvents="none" style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: hues.gold.base, opacity: glowOp, transform: [{ scale: glowScale }] }} />
        ) : null}
        <Animated.Text style={{ fontSize: 40, opacity: s, transform: [{ scale }] }}>{map.emblem}</Animated.Text>
      </View>
      <Animated.View style={{ alignItems: "center", opacity: s }}>
        <Text style={{ color: neutrals.text, fontSize: 24, fontWeight: "800" }}>{map.head}</Text>
        <Text style={{ color: hues.gold.hi, fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 10, maxWidth: 280, lineHeight: 20 }}>{map.sub}</Text>
        {delta != null && ratingBefore != null && ratingAfter != null ? (
          <View style={{ alignItems: "center", marginTop: 20 }}>
            <Text style={{ color: neutrals.muted2, fontSize: 9, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Your dueling rating</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ color: neutrals.muted, fontSize: 16, fontWeight: "700" }}>{ratingBefore}</Text>
              <Text style={{ color: neutrals.muted2, fontSize: 14 }}>→</Text>
              <CountUp from={ratingBefore} to={ratingAfter} style={{ color: neutrals.text, fontSize: 26, fontWeight: "900" }} />
              <View style={{ backgroundColor: (up ? hues.emerald.base : hues.ruby.base) + "22", borderColor: up ? hues.emerald.base : hues.ruby.base, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: up ? hues.emerald.hi : hues.ruby.hi, fontSize: 13, fontWeight: "800" }}>{up ? "▲ +" : "▼ "}{delta}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function Tally({ mine, theirs, backers, meName, themName, spectator }: { mine: number; theirs: number; backers: number; meName: string; themName: string; spectator: boolean }) {
  const total = Math.max(1, mine + theirs);
  const pct = Math.round((mine / total) * 100);
  // sweep-fill the bar as the numbers count up — the tally was hidden all through
  // voting, so the unveil earns a little motion.
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(fill, { toValue: 1, duration: 950, useNativeDriver: false }).start(); }, [fill]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${pct}%`] });
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>The tally, revealed</Text>
      <View style={{ width: 260, height: 26, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden", flexDirection: "row", borderWidth: 1, borderColor: neutrals.border }}>
        <Animated.View style={{ width, backgroundColor: hues.gold.base }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", width: 260, marginTop: 8 }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800" }}>{spectator ? meName : "You"} · <CountUp from={0} to={mine} duration={950} style={{ color: hues.gold.hi, fontWeight: "800" }} /></Text>
        <Text style={{ color: neutrals.muted2 }}>{theirs} · {themName}</Text>
      </View>
      <Text style={{ color: neutrals.text, fontSize: 14, marginTop: 20 }}>
        <CountUp from={0} to={backers} duration={950} style={{ color: hues.gold.hi, fontWeight: "800", fontSize: 20 }} /> competitors backed {spectator ? meName : "you"}
      </Text>
    </View>
  );
}

function Onward({ outcome, onDone }: { outcome: Outcome; onDone: () => void }) {
  const cta = { win: "Enter again — keep your streak alive 🔥", deadlock: "Run it back", loss: "Improve your submission & compete again!", spectator: "Back to the arena" }[outcome];
  const line = { win: "Momentum. The arena felt that one.", deadlock: "That one’s unfinished.", loss: "With every effort, we learn and grow.", spectator: "Well judged." }[outcome];
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Onward</Text>
      <Text style={{ color: hues.gold.hi, fontSize: 15, fontStyle: "italic", textAlign: "center", maxWidth: 280 }}>&ldquo;{line}&rdquo;</Text>
      <Text style={{ color: hues.amethyst.hi, fontSize: 12, textAlign: "center", marginTop: 14, maxWidth: 280 }}>✦ Your badges &amp; medals await the monthly reveal.</Text>
      <View style={{ marginTop: 22, alignSelf: "stretch" }}>
        <Spectrum label={cta} full onPress={onDone} />
      </View>
    </View>
  );
}

function Spectrum({ label, onPress, full }: { label: string; onPress: () => void; full?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ minWidth: full ? undefined : 104 }}>
      <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ borderRadius: 11, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{label}</Text>
      </LinearGradient>
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
function Center({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: "#060504", alignItems: "center", justifyContent: "center", padding: 26 }}>{children}</View>;
}
