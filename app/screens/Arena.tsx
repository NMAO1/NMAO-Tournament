import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Animated, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { neutrals, hues, rarityStops, rarityBase } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { faceOff, castVote, type FaceOff, type Choice, type Card } from "../lib/duel";

// The Arena "ring" — the crown-jewel voting screen. Landscape (via guarded
// expo-screen-orientation; falls back to portrait if not installed). Two forms
// side by side in their collectible frames; watch to unlock the vote; the tally
// stays hidden. Video playback = a poster placeholder for now (expo-video drops
// into <Poster/> later; the 15s gate already tracks "watch" time on tap-to-play).

const WATCH_GOAL = 15;

export default function Arena({ duelId, voterId, onClose }: { duelId: string; voterId: string; onClose: (voted?: boolean) => void }) {
  const [face, setFace] = useState<FaceOff | null>(null);
  const [watched, setWatched] = useState(0);
  const [active, setActive] = useState<Choice | null>(null);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState<Choice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const flash = useRef(new Animated.Value(0)).current;

  // landscape while the ring is mounted (guarded — no crash if lib absent)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let SO: any = null;
    try { SO = require("expo-screen-orientation"); } catch { SO = null; }
    SO?.lockAsync?.(SO?.OrientationLock?.LANDSCAPE);
    return () => { SO?.lockAsync?.(SO?.OrientationLock?.PORTRAIT_UP); };
  }, []);

  useEffect(() => { faceOff(duelId).then(setFace); }, [duelId]);

  // accumulate watch time while a side is "playing"
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setWatched((w) => Math.min(WATCH_GOAL, w + 0.1)), 100);
    return () => clearInterval(t);
  }, [active]);

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

  return (
    <View style={{ flex: 1, backgroundColor: "#060504" }}>
      {/* top HUD */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 40, paddingHorizontal: 16, paddingBottom: 6 }}>
        <TouchableOpacity onPress={() => onClose(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: neutrals.muted, fontSize: 12, letterSpacing: 1 }}>‹  EXIT RING</Text>
        </TouchableOpacity>
        <Text style={{ color: neutrals.muted2, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>
          S1 · Round VIII · {face.type}
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

      {/* the ring */}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 4 }}>
        <Side
          card={face.challenger} choice="challenger" rarity={face.challenger.frame?.rarity ?? "legendary"}
          active={active === "challenger"} unlocked={unlocked} voted={voted}
          onPlay={() => setActive("challenger")} onVote={() => vote("challenger")}
        />
        <View style={{ width: 40, alignItems: "center" }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: hues.gold.base }}>
            <Text style={{ color: "#1a1305", fontWeight: "900", fontSize: 12 }}>VS</Text>
          </View>
        </View>
        <Side
          card={face.opponent} choice="opponent" rarity={face.opponent.frame?.rarity ?? "epic"}
          active={active === "opponent"} unlocked={unlocked} voted={voted}
          onPlay={() => setActive("opponent")} onVote={() => vote("opponent")}
        />
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

function Side({
  card, choice, rarity, active, unlocked, voted, onPlay, onVote,
}: {
  card: Card; choice: Choice; rarity: "common" | "rare" | "epic" | "legendary";
  active: boolean; unlocked: boolean; voted: Choice | null; onPlay: () => void; onVote: () => void;
}) {
  const dim = voted && voted !== choice;
  const border = rarityBase(rarity);
  const first = card.firstName;
  return (
    <View style={{ flex: 1, opacity: dim ? 0.4 : 1 }}>
      <Frame rarity={rarity} size="ring">
        <TouchableOpacity activeOpacity={0.9} onPress={onPlay}>
          <View style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: "#0d0a06", alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 16 }}>{active ? "❚❚" : "▶"}</Text>
            </View>
          </View>
          {/* nameplate (centered) */}
          <View style={{ backgroundColor: "rgba(8,6,4,0.92)", paddingVertical: 5, alignItems: "center" }}>
            <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 12 }}>{card.name}</Text>
            {card.school ? <Text style={{ color: neutrals.muted2, fontSize: 9 }}>{card.school}</Text> : null}
          </View>
        </TouchableOpacity>
      </Frame>
      <TouchableOpacity activeOpacity={0.85} onPress={onVote} disabled={!unlocked || !!voted} style={{ marginTop: 8 }}>
        <View
          style={{
            borderRadius: 10, paddingVertical: 10, alignItems: "center",
            borderWidth: 1.5, borderColor: border,
            backgroundColor: voted === choice ? border : "rgba(12,10,6,0.92)",
            opacity: unlocked ? 1 : 0.4,
          }}
        >
          <Text style={{ color: voted === choice ? "#0c0a06" : border, fontWeight: "800", fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>
            {voted === choice ? "Voted ✓" : `Vote ${first}`}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function closesIn(face: FaceOff): string {
  return face.status === "voting" ? "soon" : "—";
}
