import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Animated, ActivityIndicator, Image, Dimensions, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { neutrals, hues, rarityStops, rarityBase } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { faceOff, castVote, playbackUrls, type FaceOff, type Choice, type Card } from "../lib/duel";

// The Arena "ring" — the crown-jewel voting screen. Landscape (via guarded
// expo-screen-orientation; falls back to portrait if not installed). Two forms
// side by side in their collectible frames; watch to unlock the vote; the tally
// stays hidden. Real playback via expo-video (signed URLs from get-playback-url);
// the watch-to-vote gate accrues only while a real video is actually playing.
// If a side has no signed URL yet, it falls back to a tap-to-accrue poster.

const WATCH_GOAL = 15;
type Urls = { challenger: string | null; opponent: string | null };
// event code (open_forms) → display label (Open Forms)
const evName = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function Arena({ duelId, voterId, onClose }: { duelId: string; voterId: string; onClose: (voted?: boolean) => void }) {
  const [face, setFace] = useState<FaceOff | null>(null);
  const [phase, setPhase] = useState<"tale" | "ring">("tale");
  const [count, setCount] = useState(10);
  const [urls, setUrls] = useState<Urls>({ challenger: null, opponent: null });
  const [watched, setWatched] = useState(0);
  const [active, setActive] = useState<Choice | null>(null);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState<Choice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const flash = useRef(new Animated.Value(0)).current;

  // one player per side; source is swapped in once the signed URLs arrive
  const chPlayer = useVideoPlayer(null, (p) => { p.loop = false; p.muted = false; });
  const opPlayer = useVideoPlayer(null, (p) => { p.loop = false; p.muted = false; });
  useEffect(() => { if (urls.challenger) chPlayer.replace(urls.challenger); }, [urls.challenger, chPlayer]);
  useEffect(() => { if (urls.opponent) opPlayer.replace(urls.opponent); }, [urls.opponent, opPlayer]);
  useEffect(() => { playbackUrls(duelId).then(setUrls); }, [duelId]);

  // landscape while the ring is mounted (guarded — no crash if lib absent)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let SO: any = null;
    try { SO = require("expo-screen-orientation"); } catch { SO = null; }
    SO?.lockAsync?.(SO?.OrientationLock?.LANDSCAPE);
    return () => { SO?.lockAsync?.(SO?.OrientationLock?.PORTRAIT_UP); };
  }, []);

  useEffect(() => { faceOff(duelId).then(setFace); }, [duelId]);

  // "Tale of the Path" opening — a ~10s fight-card face-off before the ring.
  useEffect(() => {
    if (!face || phase !== "tale") return;
    if (count <= 0) { setPhase("ring"); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [face, phase, count]);

  // accumulate watch time — only while a real video is actually playing (a
  // poster side, with no signed URL, accrues on tap so it stays votable).
  useEffect(() => {
    if (!active) return;
    const player = active === "challenger" ? chPlayer : opPlayer;
    const hasVideo = active === "challenger" ? !!urls.challenger : !!urls.opponent;
    const t = setInterval(() => {
      if (!hasVideo || player.playing) setWatched((w) => Math.min(WATCH_GOAL, w + 0.1));
    }, 100);
    return () => clearInterval(t);
  }, [active, urls, chPlayer, opPlayer]);

  // tap a side to play it (and pause the other); tap again to pause
  function togglePlay(side: Choice) {
    const player = side === "challenger" ? chPlayer : opPlayer;
    const other = side === "challenger" ? opPlayer : chPlayer;
    const hasVideo = side === "challenger" ? !!urls.challenger : !!urls.opponent;
    if (active === side) {
      if (hasVideo) player.pause();
      setActive(null);
    } else {
      if (hasVideo) { other.pause(); player.play(); }
      setActive(side);
    }
  }

  const unlocked = watched >= WATCH_GOAL;

  async function vote(choice: Choice) {
    if (!unlocked || voting || voted) return;
    setVoting(true);
    setErr(null);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* haptics optional */ }
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 170, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 540, useNativeDriver: true }),
    ]).start();
    const r = await castVote(duelId, voterId, choice, watched);
    setVoting(false);
    if (!r.ok) { setErr(r.error ?? "Could not record your vote."); return; }
    setVoted(choice);
    setTimeout(() => onClose(true), 950);
  }

  if (!face) {
    return (
      <View style={{ flex: 1, backgroundColor: "#060504", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={neutrals.muted} />
      </View>
    );
  }

  if (phase === "tale") {
    return <TaleOfThePath face={face} count={count} onEnter={() => setPhase("ring")} onExit={() => onClose(false)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#060504" }}>
      {/* top HUD */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 40, paddingHorizontal: 16, paddingBottom: 6 }}>
        <TouchableOpacity onPress={() => onClose(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: neutrals.muted, fontSize: 12, letterSpacing: 1 }}>‹  EXIT RING</Text>
        </TouchableOpacity>
        <Text style={{ color: neutrals.muted2, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>
          S1 · Round VIII · {evName(face.type)}
        </Text>
        <View style={{ width: 64 }} />
      </View>

      {/* watch-to-vote meter */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 6 }}>
        <Text style={{ color: neutrals.text, fontSize: 11, fontWeight: "700" }}>Watch to vote</Text>
        <View style={{ flex: 1, height: 5, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <LinearGradient
            colors={rarityStops("legendary")}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ height: "100%", width: `${(watched / WATCH_GOAL) * 100}%`, borderRadius: 5 }}
          />
        </View>
        <Text style={{ color: neutrals.muted2, fontSize: 10 }}>{Math.floor(watched)}s / {WATCH_GOAL}s</Text>
      </View>

      {/* the ring — each badge frame FILLS its whole side, full-bleed to the
          screen edges (room for customization + sponsorship on the band). The
          VS clash sits over the centre seam. */}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "stretch", gap: 2 }}>
        <Side
          card={face.challenger} choice="challenger" rarity={face.challenger.frame?.rarity ?? "legendary"}
          active={active === "challenger"} unlocked={unlocked} voted={voted}
          player={chPlayer} hasVideo={!!urls.challenger}
          onPlay={() => togglePlay("challenger")} onVote={() => vote("challenger")}
        />
        <Side
          card={face.opponent} choice="opponent" rarity={face.opponent.frame?.rarity ?? "epic"}
          active={active === "opponent"} unlocked={unlocked} voted={voted}
          player={opPlayer} hasVideo={!!urls.opponent}
          onPlay={() => togglePlay("opponent")} onVote={() => vote("opponent")}
        />
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <VsBadge />
        </View>
      </View>

      {/* hidden tally */}
      <View style={{ alignItems: "center", paddingBottom: 12 }}>
        <Text style={{ color: neutrals.muted2, fontSize: 10 }}>
          {voted ? "Vote counted — the tally reveals when the duel closes" : `👁 Tally hidden · closes ${closesIn(face)}`}
        </Text>
        {err ? <Text style={{ color: hues.ruby.hi, fontSize: 11, marginTop: 4 }}>{err}</Text> : null}
      </View>

      {/* cinematic vote flash */}
      <Animated.View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#FFF3C0", opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }}
      />
    </View>
  );
}

// A colour that CONTRASTS the frame band so the vote CTA pops.
function contrastOf(rarity: "common" | "rare" | "epic" | "legendary") {
  return rarity === "legendary" ? hues.amethyst : rarity === "epic" ? hues.gold : hues.gold;
}

function Side({
  card, choice, rarity, active, unlocked, voted, player, hasVideo, onPlay, onVote,
}: {
  card: Card; choice: Choice; rarity: "common" | "rare" | "epic" | "legendary";
  active: boolean; unlocked: boolean; voted: Choice | null;
  player: VideoPlayer; hasVideo: boolean; onPlay: () => void; onVote: () => void;
}) {
  const dim = voted && voted !== choice;
  const cta = contrastOf(rarity);          // contrasting vote-button colour
  const filled = unlocked || voted === choice;
  const first = card.firstName;
  return (
    <View style={{ flex: 1, opacity: dim ? 0.32 : 1 }}>
      {/* the frame fills the whole side */}
      <Frame rarity={rarity} size="ring" fill style={{ flex: 1 }}>
        <TouchableOpacity activeOpacity={0.95} onPress={onPlay} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "#0d0a06", alignItems: "center", justifyContent: "center" }}>
            {hasVideo ? (
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
            ) : null}
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(0,0,0,0.42)", alignItems: "center", justifyContent: "center", opacity: hasVideo && active ? 0.18 : 1 }}>
              <Text style={{ color: "#fff", fontSize: 20 }}>{active ? "❚❚" : "▶"}</Text>
            </View>
            {/* quiet nameplate overlaid at the bottom of the video */}
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(8,6,4,0.8)", paddingVertical: 5, alignItems: "center" }}>
              <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>{card.name}</Text>
              {card.school ? <Text style={{ color: neutrals.muted2, fontSize: 9 }} numberOfLines={1}>{card.school}</Text> : null}
            </View>
          </View>
        </TouchableOpacity>
      </Frame>
      {/* contrasting vote bar */}
      <TouchableOpacity activeOpacity={0.85} onPress={onVote} disabled={!unlocked || !!voted} style={{ marginTop: 6 }}>
        <View
          style={{
            borderRadius: 11, paddingVertical: 13, alignItems: "center",
            borderWidth: 2, borderColor: cta.base,
            backgroundColor: filled ? cta.base : "rgba(12,10,6,0.9)",
            opacity: unlocked ? 1 : 0.5,
            shadowColor: cta.hi, shadowOpacity: filled ? 0.8 : 0, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
          }}
        >
          <Text style={{ color: filled ? "#0c0a06" : cta.hi, fontWeight: "900", fontSize: 15, letterSpacing: 1, textTransform: "uppercase" }}>
            {voted === choice ? "✓ Voted" : `Vote ${first}`}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ── Edgy, video-game "VS" clash badge — a slanted metallic slab with a
// ruby↔sapphire clash gradient and a heavy italic glowing VS. ──
function VsBadge() {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] }}>
      {/* outer glow slab */}
      <View style={{ shadowColor: hues.ruby.hi, shadowOpacity: 0.95, shadowRadius: 26, shadowOffset: { width: 0, height: 0 } }}>
        <LinearGradient
          colors={[hues.ruby.base, "#120b06", hues.sapphire.base]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 5, borderWidth: 2.5, borderColor: hues.gold.hi, transform: [{ skewX: "-12deg" }] }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontStyle: "italic", fontSize: 44, letterSpacing: 2, transform: [{ skewX: "12deg" }], textShadowColor: hues.ruby.hi, textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } }}>
            VS
          </Text>
        </LinearGradient>
      </View>
    </View>
  );
}

function closesIn(face: FaceOff): string {
  return face.status === "voting" ? "soon" : "—";
}

// ── "Tale of the Path" — the fight-card face-off before the ring (spec §2a) ──
// Landscape cinematic: the two panels slide in from opposite edges while a large
// VS pops (spring overshoot) in the centre.
function TaleOfThePath({ face, count, onEnter, onExit }: { face: FaceOff; count: number; onEnter: () => void; onExit: () => void }) {
  const w = Dimensions.get("window").width;
  const slideL = useRef(new Animated.Value(-w)).current;
  const slideR = useRef(new Animated.Value(w)).current;
  const vs = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideL, { toValue: 0, useNativeDriver: true, friction: 9, tension: 55 }),
      Animated.spring(slideR, { toValue: 0, useNativeDriver: true, friction: 9, tension: 55 }),
      Animated.sequence([
        Animated.delay(240),
        Animated.spring(vs, { toValue: 1, useNativeDriver: true, friction: 3.5, tension: 140 }),
      ]),
    ]).start();
  }, [slideL, slideR, vs]);

  return (
    <View style={{ flex: 1, backgroundColor: "#060504", paddingTop: 34 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 }}>
        <TouchableOpacity onPress={onExit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: neutrals.muted, fontSize: 12, letterSpacing: 1 }}>‹  EXIT</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: hues.gold.hi, fontSize: 13, letterSpacing: 4, fontWeight: "800" }}>⚔  TALE OF THE PATH</Text>
          <Text style={{ color: neutrals.muted2, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>{evName(face.type)} · S1 · Round VIII</Text>
        </View>
        <TouchableOpacity onPress={onEnter}><Text style={{ color: neutrals.muted2, fontSize: 11, letterSpacing: 1 }}>Skip ›</Text></TouchableOpacity>
      </View>

      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Animated.View style={{ flex: 1, alignItems: "center", transform: [{ translateX: slideL }] }}>
          <Fighter card={face.challenger} align="right" />
        </Animated.View>
        <Animated.View style={{ width: 88, alignItems: "center", transform: [{ scale: vs }] }}>
          <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: hues.gold.base, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: hues.gold.hi, shadowColor: hues.gold.hi, shadowOpacity: 0.9, shadowRadius: 24 }}>
            <Text style={{ color: "#1a1305", fontWeight: "900", fontSize: 26, fontStyle: "italic" }}>VS</Text>
          </View>
        </Animated.View>
        <Animated.View style={{ flex: 1, alignItems: "center", transform: [{ translateX: slideR }] }}>
          <Fighter card={face.opponent} align="left" />
        </Animated.View>
      </View>

      <View style={{ alignItems: "center", paddingBottom: 20 }}>
        <TouchableOpacity onPress={onEnter} activeOpacity={0.85} style={{ borderRadius: 12, overflow: "hidden", minWidth: 240 }}>
          <LinearGradient colors={rarityStops("legendary")} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: "#1a1305", fontWeight: "900", fontSize: 13, letterSpacing: 0.5 }}>ENTER THE ARENA  →</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={{ color: neutrals.muted2, fontSize: 10, marginTop: 8, letterSpacing: 1 }}>Auto-enters in {count}s</Text>
      </View>
    </View>
  );
}

function Fighter({ card, align }: { card: Card; align: "left" | "right" }) {
  const rarity = card.frame?.rarity ?? "epic";
  const glow = rarityBase(rarity);
  const initials = card.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const rows: [string, string | number][] = [
    ["Team", card.school ?? "—"],
    ["Rank", (card.rank ?? "—").replace("_", " ")],
    ["Duel Wins", card.duelWins],
    ["Win Streak", `${card.winStreak}🔥`],
    ["Rating", card.rating.toLocaleString()],
  ];
  return (
    <View style={{ flex: 1, alignItems: "center", maxWidth: 260 }}>
      {/* spotlight photo / silhouette on the badge-color glow */}
      <View style={{ width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", backgroundColor: glow + "26", borderWidth: 2, borderColor: glow, shadowColor: glow, shadowOpacity: 0.8, shadowRadius: 18, overflow: "hidden" }}>
        {card.photo ? (
          <Image source={{ uri: card.photo }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Text style={{ color: glow, fontSize: 30, fontWeight: "900" }}>{initials}</Text>
        )}
      </View>
      <Text numberOfLines={1} style={{ color: neutrals.text, fontSize: 18, fontWeight: "900", marginTop: 10, textAlign: "center" }}>{card.name}</Text>
      {card.frame ? <Text style={{ color: glow, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "800", marginTop: 2 }}>{card.frame.name}</Text> : null}
      <View style={{ marginTop: 10, alignSelf: "stretch", paddingHorizontal: align === "right" ? 12 : 12 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 1, borderColor: "#1c1712" }}>
            <Text style={{ color: neutrals.muted2, fontSize: 11 }}>{k}</Text>
            <Text numberOfLines={1} style={{ color: neutrals.text, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"], textTransform: "capitalize", flex: 1, textAlign: "right", marginLeft: 10 }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
