import { useEffect, useState, type ReactNode } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import * as Haptics from "expo-haptics";
import { neutrals, hues } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { duelReveal, type Reveal, type Card, type DuelType } from "../lib/duel";
import { useSeasonLabel } from "../lib/season";

type Outcome = "win" | "deadlock" | "loss" | "spectator";

// The per-duel reveal — the tally unveiling after a duel closes. Stepped
// (face-off → result → tally → onward), outcome-aware (win / deadlock / loss /
// spectator), always invites re-entry. Rewards are held to the monthly reveal.
export default function DuelReveal({ duelId, myId, onClose }: { duelId: string; myId: string | null; onClose: () => void }) {
  const [rev, setRev] = useState<Reveal | null>(null);
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => { duelReveal(duelId).then((r) => (r ? setRev(r) : setFailed(true))); }, [duelId]);
  useEffect(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ } }, [step]);

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

  const steps = [
    <FaceOff key="f" a={rev.challenger} b={rev.opponent} type={rev.type} />,
    <Result key="r" outcome={outcome} me={me} them={them} />,
    <Tally key="t" mine={myVotes} theirs={theirVotes} backers={myBackers} meName={me.firstName} themName={them.firstName} spectator={outcome === "spectator"} />,
    <Onward key="o" outcome={outcome} onDone={onClose} />,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#060504" }}>
      <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingTop: 50 }}>
        {steps.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: 3, marginHorizontal: 2, backgroundColor: i <= step ? hues.gold.base : "rgba(255,255,255,0.15)" }} />
        ))}
      </View>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }}>{steps[step]}</View>
      <View style={{ flexDirection: "row", justifyContent: "center", paddingBottom: 34 }}>
        {step > 0 ? <Ghost label="‹ Back" onPress={() => setStep((s) => s - 1)} /> : <View style={{ width: 104 }} />}
        <View style={{ width: 12 }} />
        {step < steps.length - 1 ? <Gold label="Next ›" onPress={() => setStep((s) => s + 1)} /> : <Gold label="Done" onPress={onClose} />}
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

function Result({ outcome, me, them }: { outcome: Outcome; me: Card; them: Card }) {
  const map = {
    win: { emblem: "👑", head: "Congratulations", sub: "The people have spoken and named you victorious." },
    deadlock: { emblem: "⚔️", head: "Deadlock", sub: "Too close to call — a rivalry worth settling." },
    loss: { emblem: "↑", head: "Well fought.", sub: `${them.firstName} took this round — but every duel sharpens your edge.` },
    spectator: { emblem: "🏆", head: `${them.firstName === me.firstName ? "" : ""}The winner`, sub: "The community has decided." },
  }[outcome];
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 40, marginBottom: 10 }}>{map.emblem}</Text>
      <Text style={{ color: neutrals.text, fontSize: 24, fontWeight: "800" }}>{map.head}</Text>
      <Text style={{ color: hues.gold.hi, fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 10, maxWidth: 280, lineHeight: 20 }}>{map.sub}</Text>
    </View>
  );
}

function Tally({ mine, theirs, backers, meName, themName, spectator }: { mine: number; theirs: number; backers: number; meName: string; themName: string; spectator: boolean }) {
  const total = Math.max(1, mine + theirs);
  const pct = Math.round((mine / total) * 100);
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>The tally, revealed</Text>
      <View style={{ width: 260, height: 26, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden", flexDirection: "row", borderWidth: 1, borderColor: neutrals.border }}>
        <View style={{ width: `${pct}%`, backgroundColor: hues.gold.base }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", width: 260, marginTop: 8 }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800" }}>{spectator ? meName : "You"} · {mine}</Text>
        <Text style={{ color: neutrals.muted2 }}>{theirs} · {themName}</Text>
      </View>
      <Text style={{ color: neutrals.text, fontSize: 14, marginTop: 20 }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800", fontSize: 20 }}>{backers}</Text> competitors backed {spectator ? meName : "you"}
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
        <Gold label={cta} full onPress={onDone} />
      </View>
    </View>
  );
}

function Gold({ label, onPress, full }: { label: string; onPress: () => void; full?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ minWidth: full ? undefined : 104 }}>
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
function Center({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: "#060504", alignItems: "center", justifyContent: "center", padding: 26 }}>{children}</View>;
}
