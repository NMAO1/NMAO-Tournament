import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Animated, ActivityIndicator, Image, Dimensions, StyleSheet, Linking, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { neutrals, hues, rarityStops, rarityBase, spectrumStops } from "@nmao/design-tokens";
import { emblemUrl } from "../lib/badges";
import { FrameElements } from "../components/LivingFrame";
import { FRAME_SPECS, frameElementUrl } from "../lib/badgeFrames";
import { faceOff, castVote, playbackUrls, duelSponsor, sponsorImpression, reportDuel, blockCompetitor, type FaceOff, type Choice, type Card, type Sponsor, type FrameAnim } from "../lib/duel";
import { useSeasonLabel } from "../lib/season";
import { sponsorClick, sponsorAdWatch } from "../lib/store";
import { useTitleSponsor } from "../lib/title";

// A worn frame/crest (equipped badge) — what the crest popover reveals.
type Crest = NonNullable<Card["frame"]>;
// The tapped crest + which lower corner it sits in, so the popup anchors beside it.
type CrestAnchor = { frame: Crest; corner: "left" | "right" };
const RARITY_LABEL: Record<string, string> = { legendary: "Legendary", epic: "Epic", rare: "Rare", common: "Common" };

// The Arena "ring" — the crown-jewel voting screen. Landscape (via guarded
// expo-screen-orientation; falls back to portrait if not installed). Two forms
// side by side in their collectible frames; watch to unlock the vote; the tally
// stays hidden. Real playback via expo-video (signed URLs from get-playback-url).
// BOTH forms play SIMULTANEOUSLY for a true side-by-side comparison (mirrors the
// judges' 2-angle scoring carousel); they start muted to avoid clashing audio,
// and tapping a side brings its audio forward while muting the other. The
// watch-to-vote gate fills while the forms roll (poster fallback if no URL yet).

const WATCH_GOAL = 15;
type Urls = { challenger: string | null; opponent: string | null };
// event code (open_forms) → display label (Open Forms)
const evName = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function Arena({ duelId, voterId, onClose }: { duelId: string; voterId: string; onClose: (voted?: boolean) => void }) {
  const [face, setFace] = useState<FaceOff | null>(null);
  // tale → (sponsor, if one is available) → ring
  const [phase, setPhase] = useState<"tale" | "sponsor" | "ring">("tale");
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [count, setCount] = useState(10);
  const [urls, setUrls] = useState<Urls>({ challenger: null, opponent: null });
  const [urlsLoaded, setUrlsLoaded] = useState(false);
  const [watched, setWatched] = useState(0);
  const [active, setActive] = useState<Choice | null>(null);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState<Choice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [crest, setCrest] = useState<CrestAnchor | null>(null);
  const flash = useRef(new Animated.Value(0)).current;

  // one player per side; both roll SIMULTANEOUSLY so the two forms can be
  // compared side by side (mirrors the judges' 2-angle scoring carousel). Muted
  // by default to avoid two clashing audio tracks — tapping a side brings its
  // audio forward (`active` = the side currently unmuted; null = both muted).
  const chPlayer = useVideoPlayer(null, (p) => { p.loop = true; p.muted = true; });
  const opPlayer = useVideoPlayer(null, (p) => { p.loop = true; p.muted = true; });
  useEffect(() => { if (urls.challenger) chPlayer.replace(urls.challenger); }, [urls.challenger, chPlayer]);
  useEffect(() => { if (urls.opponent) opPlayer.replace(urls.opponent); }, [urls.opponent, opPlayer]);
  useEffect(() => { playbackUrls(duelId).then((u) => { setUrls(u); setUrlsLoaded(true); }); }, [duelId]);

  // once we're in the ring, autoplay BOTH forms together the moment each signed
  // URL is present — no tap needed; they play in parallel for the comparison.
  useEffect(() => {
    if (phase !== "ring") return;
    if (urls.challenger) chPlayer.play();
    if (urls.opponent) opPlayer.play();
  }, [phase, urls, chPlayer, opPlayer]);

  // landscape while the ring is mounted (guarded — no crash if lib absent)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let SO: any = null;
    try { SO = require("expo-screen-orientation"); } catch { SO = null; }
    SO?.lockAsync?.(SO?.OrientationLock?.LANDSCAPE);
    return () => { SO?.lockAsync?.(SO?.OrientationLock?.PORTRAIT_UP); };
  }, []);

  useEffect(() => { faceOff(duelId).then(setFace); }, [duelId]);
  // prefetch a sponsor for the interstitial — targeted to the viewer's segment
  // (age/region) + the duel's event once the face-off (event) has loaded.
  useEffect(() => { duelSponsor(voterId, face?.type).then(setSponsor); }, [duelId, voterId, face?.type]);

  // leaving the tale → show the sponsor break if one is loaded, else the ring
  const afterTale = () => setPhase(sponsor ? "sponsor" : "ring");

  // "Tale of the Path" opening — a ~10s fight-card face-off before the ring.
  useEffect(() => {
    if (!face || phase !== "tale") return;
    if (count <= 0) { afterTale(); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [face, phase, count, sponsor]);

  // accumulate watch time only while a REAL video is actually rolling — never
  // blind-accrue when both sides are missing a signed URL, or a voter could
  // unlock the vote on a duel they can't see. If neither side has video, the
  // gate never fills and voting stays locked (see the "unavailable" notice).
  useEffect(() => {
    if (phase !== "ring") return;
    const t = setInterval(() => {
      if (chPlayer.playing || opPlayer.playing) setWatched((w) => Math.min(WATCH_GOAL, w + 0.1));
    }, 100);
    return () => clearInterval(t);
  }, [phase, chPlayer, opPlayer]);

  // both signed URLs failed to load → nothing to watch; voting must stay disabled.
  const noVideos = urlsLoaded && !urls.challenger && !urls.opponent;

  // both forms are already rolling; tapping a side brings its AUDIO forward and
  // mutes the other (tap the focused side again → both mute). Playback never stops.
  function focusAudio(side: Choice) {
    const isCh = side === "challenger";
    if (active === side) {
      chPlayer.muted = true; opPlayer.muted = true;
      setActive(null);
    } else {
      chPlayer.muted = !isCh; opPlayer.muted = isCh;
      setActive(side);
    }
  }

  const unlocked = watched >= WATCH_GOAL && !noVideos;

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

  // ---- UGC safety (App Store 1.2): report a video / block a competitor ----
  function openSafety(side: Choice) {
    const card = side === "challenger" ? face?.challenger : face?.opponent;
    if (!card) return;
    Alert.alert(card.name, "Keep the community safe.", [
      { text: "Report this video", onPress: () => promptReport(side) },
      { text: "Block this competitor", style: "destructive", onPress: () => confirmBlock(card.competitorId, card.name) },
      { text: "Cancel", style: "cancel" },
    ]);
  }
  function promptReport(side: Choice) {
    const reasons: { label: string; code: string }[] = [
      { label: "Inappropriate or unsafe", code: "inappropriate" },
      { label: "Not a martial arts entry", code: "not_martial_arts" },
      { label: "Bullying or harassment", code: "harassment" },
    ];
    Alert.alert("Why are you reporting?", undefined, [
      ...reasons.map((r) => ({
        text: r.label,
        onPress: async () => {
          await reportDuel(duelId, voterId, side, r.code);
          Alert.alert("Reported", "Thanks — our team will review this, and it's now hidden from voting.", [{ text: "OK", onPress: () => onClose(false) }]);
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }
  function confirmBlock(competitorId: string, name: string) {
    Alert.alert("Block this competitor?", `You won't be matched with ${name}, and their duels won't appear for you.`, [
      { text: "Block", style: "destructive", onPress: async () => {
        await blockCompetitor(voterId, competitorId);
        Alert.alert("Blocked", `${name} is blocked. You can unblock from Profile → Blocked accounts.`, [{ text: "OK", onPress: () => onClose(false) }]);
      } },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  if (!face) {
    return (
      <View style={{ flex: 1, backgroundColor: "#060504", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={neutrals.muted} />
      </View>
    );
  }

  if (phase === "tale") {
    return <TaleOfThePath face={face} count={count} voterId={voterId} onEnter={afterTale} onExit={() => onClose(false)} />;
  }

  // sponsor interstitial — a short sponsor clip between the tale and the vote
  if (phase === "sponsor" && sponsor) {
    return <SponsorBreak sponsor={sponsor} onDone={() => setPhase("ring")} onExit={() => onClose(false)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#060504" }}>
      {/* the ring — the two badge frames FILL the whole screen, full-bleed to
          every edge (max band real estate for customization + sponsorship). All
          HUD/meter/tally/vote controls float on top. */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        <Side
          card={face.challenger} choice="challenger" rarity={face.challenger.frame?.rarity ?? "legendary"}
          active={active === "challenger"} unlocked={unlocked} voted={voted}
          player={chPlayer} hasVideo={!!urls.challenger}
          onAudio={() => focusAudio("challenger")} onVote={() => vote("challenger")}
          onCrest={() => face.challenger.frame && setCrest({ frame: face.challenger.frame, corner: "left" })}
          onSafety={() => openSafety("challenger")}
          demoFrame="gem-series" demoValue={6}
        />
        <Side
          card={face.opponent} choice="opponent" rarity={face.opponent.frame?.rarity ?? "epic"}
          active={active === "opponent"} unlocked={unlocked} voted={voted}
          player={opPlayer} hasVideo={!!urls.opponent}
          onAudio={() => focusAudio("opponent")} onVote={() => vote("opponent")}
          onCrest={() => face.opponent.frame && setCrest({ frame: face.opponent.frame, corner: "right" })}
          onSafety={() => openSafety("opponent")}
          demoFrame="gem-series" demoValue={10}
        />
      </View>

      {/* VS clash over the centre seam */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <VsBadge />
      </View>

      {/* top HUD overlay — just the exit affordance; the round/event context
          lives in the vote queue, not here (it overlapped the frame borders). */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingTop: 38, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={() => onClose(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: neutrals.text, fontSize: 12, letterSpacing: 1, textShadowColor: "#000", textShadowRadius: 6 }}>‹  EXIT RING</Text>
        </TouchableOpacity>
      </View>

      {/* watch-to-vote meter overlay */}
      <View pointerEvents="none" style={{ position: "absolute", top: 66, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 }}>
        <Text style={{ color: neutrals.text, fontSize: 11, fontWeight: "700", textShadowColor: "#000", textShadowRadius: 5 }}>Watch to vote</Text>
        <View style={{ flex: 1, height: 5, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.5)", overflow: "hidden" }}>
          <LinearGradient colors={rarityStops("legendary")} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: "100%", width: `${(watched / WATCH_GOAL) * 100}%`, borderRadius: 5 }} />
        </View>
        <Text style={{ color: neutrals.muted, fontSize: 10, textShadowColor: "#000", textShadowRadius: 5 }}>{Math.floor(watched)}s / {WATCH_GOAL}s</Text>
      </View>

      {/* both-play hint — or, if playback failed for both sides, an unavailable notice */}
      <View pointerEvents="none" style={{ position: "absolute", top: 84, left: 0, right: 0, alignItems: "center" }}>
        {noVideos
          ? <Text style={{ color: hues.ruby.hi, fontSize: 11, fontWeight: "700", textShadowColor: "#000", textShadowRadius: 6 }}>Videos unavailable — voting is disabled for this duel</Text>
          : <Text style={{ color: neutrals.muted, fontSize: 10, textShadowColor: "#000", textShadowRadius: 5 }}>Both forms play together · tap one to hear its audio</Text>}
      </View>

      {/* hidden-tally note overlay (bottom centre, between the two vote CTAs) */}
      <View pointerEvents="none" style={{ position: "absolute", bottom: 8, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ color: neutrals.muted, fontSize: 10, textShadowColor: "#000", textShadowRadius: 5 }}>
          {voted ? "Vote counted — tally reveals when the duel closes" : `👁 Tally hidden · closes ${closesIn(face)}`}
        </Text>
        {err ? <Text style={{ color: hues.ruby.hi, fontSize: 11, marginTop: 4 }}>{err}</Text> : null}
      </View>

      {/* cinematic vote flash */}
      <Animated.View
        pointerEvents="none"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "#FFF3C0", opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }}
      />

      {/* tap a competitor's worn crest → what the badge is + how it's earned */}
      <CrestPopup crest={crest} onClose={() => setCrest(null)} />
    </View>
  );
}

// A short sponsor clip shown between the Tale of the Path and the vote ring.
// Plays once; Skip unlocks after `minSeconds`, and it auto-advances to the ring
// when the clip ends. Counts one impression on show. Optional tap-through link.
function SponsorBreak({ sponsor, onDone, onExit }: { sponsor: Sponsor; onDone: () => void; onExit: () => void }) {
  const [remaining, setRemaining] = useState(Math.max(0, sponsor.minSeconds));
  const player = useVideoPlayer(sponsor.videoUrl, (p) => { p.loop = false; p.muted = false; p.play(); });

  useEffect(() => { sponsorImpression(sponsor.id); }, [sponsor.id]);   // count the view
  useEffect(() => {                                                    // Skip unlocks after minSeconds
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {                                                    // watched to the end → count a completion + advance
    const sub = player.addListener("playToEnd", () => { sponsorAdWatch(sponsor.id, "ad_complete", player.currentTime); onDone(); });
    return () => sub.remove();
  }, [player, onDone, sponsor.id]);

  const canSkip = remaining <= 0;
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />

      {/* SPONSORED tag + exit */}
      <View pointerEvents="none" style={{ position: "absolute", top: 40, left: 16, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
        <Text style={{ color: neutrals.muted, fontSize: 10, fontWeight: "800", letterSpacing: 2 }}>SPONSORED</Text>
      </View>
      <TouchableOpacity onPress={onExit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ position: "absolute", top: 40, right: 16 }}>
        <Text style={{ color: neutrals.text, fontSize: 12, letterSpacing: 1, textShadowColor: "#000", textShadowRadius: 6 }}>EXIT  ›</Text>
      </TouchableOpacity>

      {/* sponsor name + tagline + optional tap-through (bottom-left) */}
      <View style={{ position: "absolute", left: 18, bottom: 20, maxWidth: "62%" }}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", textShadowColor: "#000", textShadowRadius: 6 }} numberOfLines={1}>{sponsor.name}</Text>
        {sponsor.tagline ? <Text style={{ color: neutrals.muted, fontSize: 13, marginTop: 2, textShadowColor: "#000", textShadowRadius: 6 }} numberOfLines={2}>{sponsor.tagline}</Text> : null}
        {sponsor.clickUrl ? (
          <TouchableOpacity onPress={() => { sponsorClick("ad_click", { adId: sponsor.id }); const u = sponsor.clickUrl; if (u) Linking.openURL(u).catch(() => {}); }}
            style={{ marginTop: 10, alignSelf: "flex-start", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Learn more  ↗</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Skip (bottom-right) — locked until minSeconds elapse */}
      <TouchableOpacity disabled={!canSkip} onPress={() => { sponsorAdWatch(sponsor.id, "ad_skip", player.currentTime); onDone(); }}
        style={{ position: "absolute", right: 18, bottom: 22, backgroundColor: canSkip ? "rgba(233,193,90,0.95)" : "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: canSkip ? "#141210" : "#fff", fontWeight: "800", fontSize: 13 }}>
          {canSkip ? "Skip ad  ›" : `Skip in ${remaining}s`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// An animated border for a sponsor frame: a breathing glow ("pulse") or a
// diagonal gloss that sweeps across the band ("shimmer"/"sheen").
function AnimatedBorder({ animation, color, radius = 26 }: { animation: FrameAnim; color: string; radius?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (animation === "none") return;
    const dur = animation === "pulse" ? 1100 : 1900;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: dur, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: animation === "pulse" ? dur : 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [animation, v]);
  if (animation === "none") return null;
  if (animation === "pulse") {
    return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 3, borderColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.95] }) }]} />;
  }
  const tx = v.interpolate({ inputRange: [0, 1], outputRange: [-300, 300] });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
      <Animated.View style={{ position: "absolute", top: -60, bottom: -60, width: 70, transform: [{ translateX: tx }, { rotate: "18deg" }] }}>
        <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

function Side({
  card, choice, rarity, active, unlocked, voted, player, hasVideo, onAudio, onVote, onCrest, onSafety,
  demoFrame, demoValue,
}: {
  card: Card; choice: Choice; rarity: "common" | "rare" | "epic" | "legendary";
  active: boolean; unlocked: boolean; voted: Choice | null;
  player: VideoPlayer; hasVideo: boolean; onAudio: () => void; onVote: () => void; onCrest: () => void; onSafety: () => void;
  demoFrame?: string; demoValue?: number;
}) {
  const dim = voted && voted !== choice;
  const sf = card.sponsorFrame;             // a branded sponsor frame overrides the rarity band
  const first = card.firstName;
  const BAND = 64;                          // thick bottom band = the badge / vote area
  const SHELF = 176;                        // element shelf: the band + spill up into the video
  const [bandW, setBandW] = useState(320);
  // The equipped badge's "living frame" elements ride the thick bottom band.
  // TEMP demo: fall back to the journaling pilot so it shows on any test fighter.
  const frameCode = demoFrame && FRAME_SPECS[demoFrame] ? demoFrame
    : (card.frame?.code && FRAME_SPECS[card.frame.code] ? card.frame.code : "journal_keeper");
  const frameSpec = FRAME_SPECS[frameCode];
  const frameValue = demoValue ?? 140;       // DEMO progress value for the living frame
  // Base border material comes from the badge spec (e.g. old wood) when defined.
  const glow = sf ? sf.accentColor : (frameSpec?.border?.glow ?? rarityBase(rarity));
  const borderTexture = !sf && frameSpec?.border?.texture ? frameElementUrl(frameSpec.border.texture) : null;
  return (
    <View style={{ flex: 1, opacity: dim ? 0.32 : 1 }}>
      {/* custom frame: thin top + sides, a THICK bottom band (BAND) that the side
          borders squeeze into — the big customizable badge/sponsor area. */}
      <View style={{ flex: 1, shadowColor: glow, shadowOpacity: 0.6, shadowRadius: 26, shadowOffset: { width: 0, height: 0 } }}>
        <LinearGradient
          colors={(borderTexture ? ["rgba(0,0,0,0)", "rgba(0,0,0,0)"] : sf ? [sf.accentColor, sf.accentColor] : (frameSpec?.border?.colors ?? rarityStops(rarity))) as ReturnType<typeof rarityStops>} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: 26, overflow: "hidden", paddingTop: 14, paddingLeft: 14, paddingRight: 14, paddingBottom: BAND }}
        >
          {borderTexture ? <Image source={{ uri: borderTexture }} resizeMode="repeat" style={StyleSheet.absoluteFill} /> : null}
          {sf ? <AnimatedBorder animation={sf.animation} color={sf.accentColor} /> : null}
          <TouchableOpacity activeOpacity={0.95} onPress={onAudio} style={{ flex: 1 }}>
            <View style={{ flex: 1, borderRadius: 12, overflow: "hidden", backgroundColor: "#0d0a06", alignItems: "center", justifyContent: "center" }}>
              {hasVideo ? (
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
              ) : null}
              {/* nameplate at the top */}
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "rgba(8,6,4,0.72)", paddingVertical: 6, alignItems: "center" }}>
                <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 14 }} numberOfLines={1}>{card.name}</Text>
                {card.school ? <Text style={{ color: neutrals.muted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>{card.school}</Text> : null}
              </View>
              {/* UGC safety: report the video / block this competitor */}
              <TouchableOpacity onPress={onSafety} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ position: "absolute", top: 7, left: 7, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(6,5,4,0.5)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", zIndex: 6 }}>
                <Text style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>⚑</Text>
              </TouchableOpacity>
              {/* both forms roll at once; this chip shows/toggles which side's audio
                  is live (tap to hear this side; the other side mutes). */}
              {hasVideo ? (
                <View style={{ position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: active ? "rgba(233,193,90,0.94)" : "rgba(0,0,0,0.5)" }}>
                  <Text style={{ fontSize: 13 }}>{active ? "🔊" : "🔇"}</Text>
                  <Text style={{ color: active ? "#141210" : "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 }}>{active ? "AUDIO" : "TAP TO HEAR"}</Text>
                </View>
              ) : null}
              {/* sponsor frame branding: featured product image (top-right) + a
                  "presented by" ribbon (bottom-left, opposite the audio chip). */}
              {sf?.imageUrl ? (
                <Image source={{ uri: sf.imageUrl }} style={{ position: "absolute", top: 36, right: 8, width: 46, height: 46, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" }} resizeMode="cover" />
              ) : null}
              {sf ? (
                <View style={{ position: "absolute", left: 8, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(6,5,4,0.62)", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 99, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", maxWidth: "78%" }}>
                  {sf.logoUrl ? <Image source={{ uri: sf.logoUrl }} style={{ width: 16, height: 16, borderRadius: 8 }} /> : <Text style={{ fontSize: 10 }}>◆</Text>}
                  <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 }} numberOfLines={1}>PRESENTED BY {sf.label.toUpperCase()}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </LinearGradient>
      </View>
      {/* per-badge "living frame" elements ride the thick bottom band (behind the
          vote CTA). Skipped when a sponsor frame owns the band. */}
      {!sf ? (
        <View onLayout={(e) => { const wd = e.nativeEvent.layout.width; if (wd > 0) setBandW(wd); }} pointerEvents="none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SHELF, zIndex: 20 }}>
          {/* elements sit on the band and spill up into the video (fighter is center-frame) */}
          <FrameElements badgeCode={frameCode} value={frameValue} w={bandW} h={SHELF} />
        </View>
      ) : null}

      {/* clear vote pill — floats in the lower-right of the VIDEO, ABOVE the band,
          so the bottom border stays clear for the crest imagery + animations */}
      <VotePill
        label={voted === choice ? "✓ Voted" : "Vote"}
        onPress={onVote} disabled={!unlocked || !!voted} dimmed={!unlocked && !voted}
        choice={choice} bandH={BAND}
      />

      {/* worn crest — a single inset "dragonball" imprint, mirrored to the outer
          lower corner (challenger → left, opponent → right) for a balanced look;
          tap it to reveal the badge name + how it's earned. Rendered last so it
          sits above the vote CTA and catches the corner tap. */}
      {card.frame ? (
        <CrestInset frame={card.frame} corner={choice === "challenger" ? "left" : "right"} onPress={onCrest} />
      ) : null}
    </View>
  );
}

// A single circular crest gem, inset into a lower corner of the frame band.
function CrestInset({ frame, corner, onPress }: { frame: Crest; corner: "left" | "right"; onPress: () => void }) {
  const ring = rarityBase(frame.rarity);
  const url = emblemUrl(frame.code);
  const D = 46;
  return (
    <TouchableOpacity
      onPress={onPress} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ position: "absolute", bottom: (64 - D) / 2, ...(corner === "left" ? { left: 12 } : { right: 12 }), width: D, height: D, borderRadius: D / 2, shadowColor: ring, shadowOpacity: 0.85, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } }}
    >
      {/* the inset well: dark rim + rarity ring around the emblem sphere */}
      <View style={{ width: D, height: D, borderRadius: D / 2, borderWidth: 2, borderColor: ring, backgroundColor: "#0b0805", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
        {url ? (
          <Image source={{ uri: url }} style={{ width: D, height: D }} resizeMode="cover" />
        ) : (
          <Text style={{ color: ring, fontSize: 18 }}>◆</Text>
        )}
      </View>
      {/* glossy top highlight → reads as a set "dragonball" sphere */}
      <View pointerEvents="none" style={{ position: "absolute", top: 5, left: D * 0.26, width: D * 0.48, height: D * 0.3, borderRadius: D / 2, backgroundColor: "rgba(255,255,255,0.20)" }} />
    </TouchableOpacity>
  );
}

// A clear gold vote pill, floated into the lower-OUTER corner of the video (above
// the band): bottom-left for the left fighter, bottom-right for the right — keeping
// the bottom border free for the crest imagery + animations.
function VotePill({ label, onPress, disabled, dimmed, choice, bandH }:
  { label: string; onPress: () => void; disabled: boolean; dimmed: boolean; choice: Choice; bandH: number }) {
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled} activeOpacity={0.85}
      style={{ position: "absolute", ...(choice === "challenger" ? { left: 12 } : { right: 12 }), bottom: bandH, zIndex: 30, opacity: dimmed ? 0.55 : 1 }}
    >
      <LinearGradient
        colors={[hues.gold.hi, "#c69329"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: "rgba(255,244,214,0.75)", shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 7, shadowOffset: { width: 0, height: 2 } }}
      >
        <Text style={{ color: "#1a1206", fontWeight: "900", fontSize: 14.5, letterSpacing: 1, textTransform: "uppercase" }}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
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
function TaleOfThePath({ face, count, voterId, onEnter, onExit }: { face: FaceOff; count: number; voterId: string; onEnter: () => void; onExit: () => void }) {
  const season = useSeasonLabel();
  const title = useTitleSponsor(voterId, face.type);
  const w = Dimensions.get("window").width;
  const [crest, setCrest] = useState<CrestAnchor | null>(null);
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
          <Text style={{ color: neutrals.muted2, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>{season ? `${evName(face.type)} · ${season}` : evName(face.type)}</Text>
          {title ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, backgroundColor: "rgba(233,193,90,0.12)", borderWidth: 1, borderColor: "rgba(233,193,90,0.4)", paddingVertical: 3, paddingHorizontal: 10, borderRadius: 99 }}>
              {title.logoUrl ? <Image source={{ uri: title.logoUrl }} style={{ width: 15, height: 15, borderRadius: 8 }} /> : null}
              <Text style={{ color: hues.gold.hi, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 }}>PRESENTED BY {title.name.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity onPress={onEnter}><Text style={{ color: neutrals.muted2, fontSize: 11, letterSpacing: 1 }}>Skip ›</Text></TouchableOpacity>
      </View>

      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Animated.View style={{ flex: 1, alignItems: "center", transform: [{ translateX: slideL }] }}>
          <Fighter card={face.challenger} align="right" onCrest={() => face.challenger.frame && setCrest({ frame: face.challenger.frame, corner: "left" })} />
        </Animated.View>
        <Animated.View style={{ width: 88, alignItems: "center", transform: [{ scale: vs }] }}>
          <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff", shadowColor: hues.sapphire.hi, shadowOpacity: 0.9, shadowRadius: 24 }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 26, fontStyle: "italic" }}>VS</Text>
          </LinearGradient>
        </Animated.View>
        <Animated.View style={{ flex: 1, alignItems: "center", transform: [{ translateX: slideR }] }}>
          <Fighter card={face.opponent} align="left" onCrest={() => face.opponent.frame && setCrest({ frame: face.opponent.frame, corner: "right" })} />
        </Animated.View>
      </View>

      <View style={{ alignItems: "center", paddingBottom: 12 }}>
        <TouchableOpacity onPress={onEnter} activeOpacity={0.85} style={{ borderRadius: 10, overflow: "hidden", minWidth: 184 }}>
          <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 9, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 0.5 }}>ENTER THE ARENA  →</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={{ color: neutrals.muted2, fontSize: 9, marginTop: 6, letterSpacing: 1 }}>Auto-enters in {count}s</Text>
      </View>

      <CrestPopup crest={crest} onClose={() => setCrest(null)} />
    </View>
  );
}

// ── Crest popover — tap a fighter's worn crest to see the badge name + how it's
// earned. A tiny in-view card (not a Modal, so it never covers the videos or
// conflicts with the landscape lock) anchored right beside the tapped corner
// gem; tap anywhere to dismiss. ──
function CrestPopup({ crest, onClose }: { crest: CrestAnchor | null; onClose: () => void }) {
  if (!crest) return null;
  const { frame, corner } = crest;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* transparent catcher — tap anywhere off the card to dismiss; no dimming
          so the videos stay fully visible behind it */}
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFill} />
      {/* the little card, sitting just above the corner gem it belongs to */}
      <View
        style={{
          position: "absolute", bottom: 62, maxWidth: 188,
          ...(corner === "left" ? { left: 12 } : { right: 12 }),
          backgroundColor: "rgba(16,14,16,0.97)", borderRadius: 12, borderWidth: 1,
          borderColor: rarityBase(frame.rarity) + "AA", paddingVertical: 9, paddingHorizontal: 12,
          shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text style={{ color: neutrals.text, fontSize: 13, fontWeight: "800" }}>{frame.name}</Text>
        <Text style={{ color: rarityBase(frame.rarity), fontSize: 8, letterSpacing: 1.2, fontWeight: "800", textTransform: "uppercase", marginTop: 1 }}>
          {RARITY_LABEL[frame.rarity] ?? frame.rarity}
        </Text>
        {frame.description ? (
          <Text style={{ color: neutrals.muted, fontSize: 11, lineHeight: 15, marginTop: 5 }}>{frame.description}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Fighter({ card, align, onCrest }: { card: Card; align: "left" | "right"; onCrest: () => void }) {
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
    <View style={{ flex: 1, alignItems: "center", maxWidth: 344 }}>
      {/* spotlight photo / silhouette on the badge-color glow */}
      <View style={{ width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: glow + "26", borderWidth: 2, borderColor: glow, shadowColor: glow, shadowOpacity: 0.8, shadowRadius: 12, overflow: "hidden" }}>
        {card.photo ? (
          <Image source={{ uri: card.photo }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : (
          <Text style={{ color: glow, fontSize: 22, fontWeight: "900" }}>{initials}</Text>
        )}
      </View>
      <Text numberOfLines={1} style={{ color: neutrals.text, fontSize: 15, fontWeight: "900", marginTop: 7, textAlign: "center" }}>{card.name}</Text>
      {card.frame ? (
        <TouchableOpacity onPress={onCrest} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
          {emblemUrl(card.frame.code) ? <Image source={{ uri: emblemUrl(card.frame.code)! }} style={{ width: 14, height: 14 }} resizeMode="contain" /> : null}
          <Text style={{ color: glow, fontSize: 8.5, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "800" }}>{card.frame.name}</Text>
          <Text style={{ color: neutrals.muted2, fontSize: 8.5 }}>ⓘ</Text>
        </TouchableOpacity>
      ) : null}
      <View style={{ marginTop: 8, width: 224, maxWidth: "100%", paddingHorizontal: 4 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3.5, borderBottomWidth: 1, borderColor: "#1c1712" }}>
            <Text style={{ color: neutrals.muted2, fontSize: 12 }}>{k}</Text>
            <Text numberOfLines={1} style={{ color: neutrals.text, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"], textTransform: "capitalize", flex: 1, textAlign: "right", marginLeft: 10 }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
