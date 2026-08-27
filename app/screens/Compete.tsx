import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { neutrals, hues, metalStops, spectrumStops, status } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { uploadEntryVideo, PickedVideo } from "../lib/upload";
import { myCompetitors } from "../lib/competitors";
import { getActiveCompetitorId, setActiveCompetitorId } from "../lib/activeCompetitor";
import { creditSummary } from "../lib/pricing";
import { competeDashboard, formatCountdown, CompeteDashboard, CompeteEvent, CompeteRound, CompeteRating } from "../lib/compete";
import { HeaderBell } from "../components/HeaderBell";
import { latestUnseenMonthly, markMonthlySeen, MonthlyReveal as MonthlyRevealData } from "../lib/notifications";
import MonthlyReveal from "./MonthlyReveal";
import BuyEntry from "./BuyEntry";
import * as WebBrowser from "expo-web-browser";

// Export competition videos at 1080p H.264 (flip to H264_1280x720 for smaller
// files). MAX_MB guards the plan's Storage cap so an oversize clip gives a clear
// message instead of a server error — raise it when the project moves to Pro.
const EXPORT_PRESET = ImagePicker.VideoExportPreset.H264_1920x1080;
const MAX_MB = 500; // matches the entry-videos bucket ceiling (Pro plan)

type Competitor = { id: string; first_name: string; last_name: string; declared_rank: string | null; dob: string };
const EVENTS = [
  { code: "trad_forms", name: "Traditional Forms" },
  { code: "trad_weapons", name: "Traditional Weapons" },
  { code: "open_forms", name: "Open Forms" },
  { code: "open_weapons", name: "Open Weapons" },
];
const prettyBracket = (b: string) => b.replace("_plus", "+").replace("_", "–");
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

export default function Compete({ unread = 0, onBell }: { unread?: number; onBell?: () => void }) {
  const [comps, setComps] = useState<Competitor[]>([]);
  const [competitorId, setCompetitorId] = useState<string | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const [vid1, setVid1] = useState<PickedVideo | null>(null);
  const [vid2, setVid2] = useState<PickedVideo | null>(null);
  const [phase, setPhase] = useState<"idle" | "working">("idle");
  const [step, setStep] = useState("");
  const [done, setDone] = useState<{ event: string; age_bracket: string } | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [paid, setPaid] = useState(false);
  const [credits, setCredits] = useState<number | null>(null); // spendable entry credits for the active competitor
  const [showBuy, setShowBuy] = useState(false);
  const [dash, setDash] = useState<CompeteDashboard | null>(null); // round + per-event status + ratings
  const [unseenReveal, setUnseenReveal] = useState<MonthlyRevealData | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now()); // ticks the deadline countdown

  async function refreshCredits(cid: string | null) {
    if (!cid) { setCredits(null); return; }
    const s = await creditSummary(cid);
    setCredits(s.credits_remaining);
  }
  async function refreshDash(cid: string | null) {
    if (!cid) { setDash(null); return; }
    setDash(await competeDashboard(cid));
  }
  useEffect(() => { refreshCredits(competitorId); refreshDash(competitorId); }, [competitorId]);

  // Unseen monthly reveal → the "Results Reveal" button (the only launch point).
  useEffect(() => { latestUnseenMonthly().then(setUnseenReveal); }, []);

  // Tick the countdown once a second, but only while a live deadline is shown.
  const deadlineOpen = !!(dash?.round?.submissionsOpen && dash?.round?.closesAt);
  useEffect(() => {
    if (!deadlineOpen) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadlineOpen]);

  useEffect(() => {
    (async () => {
      const rows = await myCompetitors();
      setComps(rows);
      if (rows.length === 1) setCompetitorId(rows[0].id);
      else if (getActiveCompetitorId()) setCompetitorId(getActiveCompetitorId()); // pre-select the child you're viewing
    })();
  }, []);

  async function pick(slot: 1 | 2) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow video access to attach your entry."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      videoExportPreset: EXPORT_PRESET, // transcode to 1080p H.264 on export
      videoMaxDuration: 150,
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const info = await FileSystem.getInfoAsync(a.uri);
    const sizeMb = info.exists && info.size ? info.size / (1024 * 1024) : 0;
    if (sizeMb > MAX_MB) {
      Alert.alert("Video too large", `This clip is ${Math.round(sizeMb)} MB — over the ${MAX_MB} MB limit. Trim it to a shorter form.`);
      return;
    }
    (slot === 1 ? setVid1 : setVid2)({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName });
  }

  const ready = !!competitorId && !!event && !!vid1 && phase === "idle";

  // Poll the entry until the Stripe webhook flips it to 'paid' (source of truth).
  async function waitForPaid(entryId: string): Promise<boolean> {
    for (let i = 0; i < 8; i++) {
      const { data } = await supabase.from("entries").select("payment_status").eq("id", entryId).maybeSingle();
      if ((data as any)?.payment_status === "paid") return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  // Register + pay in one motion (payment activates the entry). Payment happens
  // in the device BROWSER (Stripe Checkout) — deliberately OFF Apple's in-app
  // purchase rails (no 30% cut). Gated to the competitor/guardian by
  // create-entry-checkout — schools can't pay here.
  async function payAndRegister(compId?: string, ev?: string) {
    const cid = compId ?? competitorId; const evt = ev ?? event;
    if (!cid || !evt) return;
    setPhase("working"); setStep("Registering…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-entry-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ competitor_id: cid, event: evt }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Could not start payment.");
      // Season-pass claim: entered for free by spending a credit — no browser checkout.
      if (j.claimed) {
        setCompetitorId(cid); setEvent(evt); setPaid(true); setPhase("idle"); setStep("");
        refreshDash(cid);
        if (typeof j.credits_remaining === "number") setCredits(j.credits_remaining);
        const left = typeof j.credits_remaining === "number" ? `  ${j.credits_remaining} credit${j.credits_remaining === 1 ? "" : "s"} left.` : "";
        Alert.alert("You're in!", `Entered with your season pass.${left}`);
        return;
      }
      setStep("Opening secure checkout…");
      await WebBrowser.openBrowserAsync(j.url); // resolves when the user closes the browser
      setStep("Confirming payment…");
      const ok = await waitForPaid(j.entry_id);
      if (!ok) {
        Alert.alert("Payment pending", "We couldn't confirm your payment yet. If you completed it, your entry will unlock in a moment — pull to refresh.");
        setPhase("idle"); setStep(""); return;
      }
      setCompetitorId(cid); setEvent(evt); setPaid(true); setPhase("idle"); setStep("");
      refreshDash(cid);
    } catch (e: any) {
      Alert.alert("Registration", e?.message ?? "Please try again."); setPhase("idle"); setStep("");
    }
  }

  async function submit() {
    if (!competitorId || !event || !vid1) return;
    setPhase("working"); setStep("Uploading Angle 1…");
    try {
      const path1 = await uploadEntryVideo(competitorId, event, 1, vid1);
      let path2: string | null = null;
      if (vid2) { setStep("Uploading Angle 2…"); path2 = await uploadEntryVideo(competitorId, event, 2, vid2); }

      setStep("Registering your entry…");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/submit-entry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ competitor_id: competitorId, event, video_path: path1, video_path_2: path2 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { throw new Error(j.error || "Could not submit your entry."); }
      setDone({ event: j.event, age_bracket: j.age_bracket });
      refreshDash(competitorId);
    } catch (e: any) {
      Alert.alert("Entry not submitted", e?.message ?? "Please try again.");
    } finally {
      setPhase("idle"); setStep("");
    }
  }

  // Register tap: with credits, claim one; with an empty bucket, prompt to buy
  // more (or pay for this single entry). Credits unknown/loading → just proceed.
  function onRegisterTap(cid?: string, ev?: string) {
    if (credits === 0) {
      Alert.alert(
        "Out of entry credits",
        "You've used all your credits. Buy more at the season rate, or pay for just this entry.",
        [
          { text: "Buy credits", onPress: () => setShowBuy(true) },
          { text: "Pay for this entry", onPress: () => payAndRegister(cid, ev) },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }
    payAndRegister(cid, ev);
  }

  function reset() { setDone(null); setEvent(null); setVid1(null); setVid2(null); setPaid(false); }

  if (showBuy && competitorId) {
    return <BuyEntry competitorId={competitorId} onClose={() => { setShowBuy(false); refreshCredits(competitorId); }} onPaid={() => { setShowBuy(false); refreshCredits(competitorId); }} />;
  }

  // The Results Reveal ceremony — launched deliberately from the button below
  // (this is the only entry point; the app no longer auto-plays it on open).
  if (showReveal && unseenReveal) {
    return (
      <MonthlyReveal
        period={unseenReveal.period}
        payload={unseenReveal.payload}
        onClose={() => { markMonthlySeen(unseenReveal.period); setUnseenReveal(null); setShowReveal(false); }}
      />
    );
  }

  if (done) {
    const ev = EVENTS.find((e) => e.code === done.event)?.name ?? done.event;
    return (
      <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 26 }}>
        <View style={{ width: 92, height: 92, borderRadius: 99, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: hues.gold.base }}>
          <Text style={{ color: hues.gold.hi, fontSize: 46, marginTop: -4 }}>✓</Text>
        </View>
        <Text style={{ color: neutrals.text, fontSize: 24, fontWeight: "700", marginTop: 22 }}>Entry submitted</Text>
        <Text style={{ color: neutrals.muted, fontSize: 15, marginTop: 6, textAlign: "center" }}>
          {ev} · {prettyBracket(done.age_bracket)}
        </Text>
        <Text style={{ color: neutrals.muted2, fontSize: 13, marginTop: 10, textAlign: "center" }}>
          Your video is in the queue. Judges will score it once the round closes.
        </Text>
        <TouchableOpacity onPress={reset} activeOpacity={0.85} style={{ marginTop: 26 }}>
          <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={{ borderRadius: 12, paddingVertical: 14, paddingHorizontal: 30 }}>
            <Text style={{ color: "#141210", fontWeight: "800", fontSize: 15 }}>Enter another event</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: neutrals.text, fontSize: 26, fontWeight: "700" }}>Compete</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <HeaderBell unread={unread} onPress={onBell} />
          <TouchableOpacity onPress={() => supabase.auth.signOut()}>
            <Text style={{ color: neutrals.muted, fontSize: 13 }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
      {dash?.round ? (
        <RoundBanner round={dash.round} nowTs={nowTs} />
      ) : (
        <Text style={{ color: neutrals.muted, fontSize: 14, marginBottom: 16 }}>Submit your entry for the open round.</Text>
      )}

      {unseenReveal && competitorId ? <RevealButton onPress={() => setShowReveal(true)} /> : null}

      {dash && competitorId ? (
        <IdentityStrip
          name={(() => { const c = comps.find((x) => x.id === competitorId); return c ? `${c.first_name} ${c.last_name}` : ""; })()}
          rating={dash.rating}
        />
      ) : null}

      {competitorId && credits !== null && (
        <TouchableOpacity onPress={() => setShowBuy(true)} activeOpacity={0.85}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20,
            borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1,
            borderColor: credits > 0 ? hues.gold.shadow : neutrals.border, backgroundColor: credits > 0 ? "rgba(230,185,63,0.07)" : neutrals.surface }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: credits > 0 ? hues.gold.hi : neutrals.text, fontWeight: "800", fontSize: 14 }}>
              {credits} entry credit{credits === 1 ? "" : "s"}
            </Text>
            <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2 }}>
              {credits > 0 ? "Each event you enter uses 1 credit." : "Buy a season pass or credits to enter."}
            </Text>
          </View>
          <Text style={{ color: hues.sapphire.hi, fontWeight: "700", fontSize: 13 }}>Buy credits ›</Text>
        </TouchableOpacity>
      )}

      {loadErr ? <Text style={{ color: status.danger, marginBottom: 16 }}>{loadErr}</Text> : null}
      {comps.length === 0 && !loadErr ? (
        <Text style={{ color: neutrals.muted2, fontSize: 14 }}>No competitor profile is linked to this account yet.</Text>
      ) : null}

      {comps.length > 1 && (
        <Section label="Competitor">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {comps.map((c) => (
              <Chip key={c.id} active={competitorId === c.id} onPress={() => { setCompetitorId(c.id); setActiveCompetitorId(c.id); }} label={`${c.first_name} ${c.last_name}`} />
            ))}
          </View>
        </Section>
      )}

      {competitorId && (
        <>
          <Section label="This round">
            {(dash?.events && dash.events.length
              ? dash.events
              : EVENTS.map((e) => ({ event: e.code, name: e.name, status: "not_entered" as const, entryId: null, medal: null, place: null }))
            ).map((ev) => (
              <EventStatusRow
                key={ev.event}
                ev={ev}
                selected={event === ev.event}
                canEnter={dash?.round ? dash.round.submissionsOpen : true}
                hasCredits={!!credits && credits > 0}
                onAction={() => {
                  if (ev.status === "awaiting_payment") onRegisterTap(competitorId, ev.event);
                  else if (ev.status === "awaiting_video") { setEvent(ev.event); setPaid(true); }
                  else { setEvent(ev.event); setPaid(false); }
                }}
              />
            ))}
          </Section>

          {event && !paid && (
            <>
              <TouchableOpacity onPress={() => onRegisterTap()} disabled={phase === "working"} activeOpacity={0.85} style={{ marginTop: 8 }}>
                <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={{ borderRadius: 13, paddingVertical: 16, alignItems: "center", opacity: phase === "working" ? 0.7 : 1 }}>
                  {phase === "working"
                    ? <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><ActivityIndicator color="#141210" /><Text style={{ color: "#141210", fontWeight: "800" }}>{step || "Opening payment…"}</Text></View>
                    : <Text style={{ color: "#141210", fontWeight: "800", fontSize: 16 }}>{credits && credits > 0 ? "Register · uses 1 credit" : "Register"}</Text>}
                </LinearGradient>
              </TouchableOpacity>
              <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 10, textAlign: "center" }}>
                {credits && credits > 0 ? `Uses 1 of your ${credits} credits — you'll upload your video next.` : "You'll pay the entry fee, then upload your video."}
              </Text>
            </>
          )}

          {paid && (
            <>
              <View style={{ backgroundColor: "rgba(90,154,106,0.12)", borderWidth: 1, borderColor: "#3f7a52", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <Text style={{ color: "#7ED0A0", fontWeight: "700", fontSize: 13 }}>✓ Entry fee paid — you're registered. Upload your video to compete.</Text>
              </View>
              <Section label="Videos">
                <Text style={{ color: neutrals.muted2, fontSize: 12, marginBottom: 10 }}>
                  Add up to two angles (front + side). Angle 1 is required. Exported at 1080p for crisp judging detail.
                </Text>
                <VideoSlot n={1} picked={vid1} onPick={() => pick(1)} onClear={() => setVid1(null)} required />
                <View style={{ height: 10 }} />
                <VideoSlot n={2} picked={vid2} onPick={() => pick(2)} onClear={() => setVid2(null)} />
              </Section>

              <TouchableOpacity onPress={submit} disabled={!ready} activeOpacity={0.85} style={{ marginTop: 8 }}>
                <LinearGradient colors={ready ? spectrumStops : [neutrals.surface2, neutrals.surface2, neutrals.surface2]}
                  start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                  style={{ borderRadius: 13, paddingVertical: 16, alignItems: "center" }}>
                  {phase === "working"
                    ? <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><ActivityIndicator color="#fff" /><Text style={{ color: "#fff", fontWeight: "800" }}>{step}</Text></View>
                    : <Text style={{ color: ready ? "#fff" : neutrals.muted2, fontWeight: "800", fontSize: 16 }}>Submit Entry</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={{ color: neutrals.muted2, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 10 }}>{label}</Text>
      {children}
    </View>
  );
}
function Chip({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, borderWidth: 1,
        borderColor: active ? hues.gold.base : neutrals.border, backgroundColor: active ? "rgba(230,185,63,0.12)" : neutrals.surface }}>
      <Text style={{ color: active ? hues.gold.hi : neutrals.text, fontWeight: active ? "700" : "500", fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}
// Round banner — season · round + a state-aware line (live deadline countdown
// when submissions are open, otherwise the round's phase).
function RoundBanner({ round, nowTs }: { round: CompeteRound; nowTs: number }) {
  let main: string, sub: string, open = false;
  if (round.submissionsOpen && round.closesAt) {
    open = true;
    main = `Closes in ${formatCountdown(round.closesAt, nowTs)}`;
    sub = "Submit your entry before the deadline.";
  } else if (round.state === "finalized" || round.state === "distributed") {
    main = "Results are in"; sub = "See your reveal above, or start the next round soon.";
  } else if (["closed", "podded", "judging", "resolving"].includes(round.state)) {
    main = "In judging"; sub = "Scores are being tallied — results reveal soon.";
  } else {
    main = "Next round opening soon"; sub = "Get ready — a new round is on the way.";
  }
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: neutrals.border, backgroundColor: neutrals.surface, overflow: "hidden", marginBottom: 16 }}>
      <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 4 }} />
      <View style={{ padding: 16 }}>
        <Text style={{ color: neutrals.muted2, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: "700" }}>
          {round.seasonName ?? "Season"} · Round {round.seq}
        </Text>
        <Text style={{ color: open ? hues.gold.hi : neutrals.text, fontSize: 21, fontWeight: "800", marginTop: 6 }}>
          {open ? "⏳ " : ""}{main}
        </Text>
        <Text style={{ color: neutrals.muted, fontSize: 13, marginTop: 4 }}>{sub}</Text>
      </View>
    </View>
  );
}

// The "worthy" launch button for the monthly reveal (only when one is unseen).
function RevealButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={{ marginBottom: 18 }}>
      <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ borderRadius: 15, padding: 2 }}>
        <View style={{ backgroundColor: "#0b0b0d", borderRadius: 13, paddingVertical: 15, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            <Text style={{ fontSize: 24 }}>🎬</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: hues.gold.hi, fontWeight: "800", fontSize: 15 }}>Your Results Reveal is ready</Text>
              <Text style={{ color: neutrals.muted, fontSize: 12, marginTop: 2 }}>Tap to begin the ceremony</Text>
            </View>
          </View>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 20 }}>▶</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Identity strip — name · rank + Tournament and Duel ratings.
function IdentityStrip({ name, rating }: { name: string; rating: CompeteRating }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: neutrals.text, fontSize: 17, fontWeight: "800" }} numberOfLines={1}>{name}</Text>
        {rating.rank ? <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>{rating.rank}</Text> : null}
      </View>
      <RatingPill label="Tournament" value={rating.skill != null ? String(rating.skill) : "—"}
        note={rating.skill == null ? "unrated" : rating.skillProvisional ? "provisional" : "of 100"} hi={hues.gold.hi} />
      <RatingPill label="Duel" value={rating.duel != null ? String(rating.duel) : "—"}
        note={`${rating.duelWins}W–${rating.duelLosses}L${rating.duelStreak > 1 ? ` · 🔥${rating.duelStreak}` : ""}`} hi={hues.sapphire.hi} />
    </View>
  );
}
function RatingPill({ label, value, note, hi }: { label: string; value: string; note: string; hi: string }) {
  return (
    <View style={{ backgroundColor: neutrals.surface, borderWidth: 1, borderColor: neutrals.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center", minWidth: 84 }}>
      <Text style={{ color: neutrals.muted2, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "700" }}>{label}</Text>
      <Text style={{ color: hi, fontSize: 22, fontWeight: "900", marginTop: 1 }}>{value}</Text>
      <Text style={{ color: neutrals.muted2, fontSize: 9, marginTop: 1 }}>{note}</Text>
    </View>
  );
}

// One event row in the status board — status label + the right action.
function statusMeta(ev: CompeteEvent, canEnter: boolean, hasCredits: boolean):
  { label: string; color: string; action?: string; spectrum?: boolean; badge?: string } {
  switch (ev.status) {
    case "awaiting_payment": return { label: "Awaiting payment", color: hues.gold.hi, action: hasCredits ? "Use 1 credit" : "Complete", spectrum: true };
    case "awaiting_video":   return { label: "Paid — upload your video", color: hues.sapphire.hi, action: "Upload", spectrum: true };
    case "in_judging":       return { label: "In judging", color: status.success, badge: "⏳" };
    case "scored": {
      const emoji = ev.medal === "gold" ? "🥇" : ev.medal === "silver" ? "🥈" : ev.medal === "bronze" ? "🥉" : "✓";
      const place = ev.place ? ` · ${ordinal(ev.place)}` : "";
      return { label: ev.medal ? `${ev.medal}${place}` : "Results in", color: hues.gold.hi, badge: emoji };
    }
    default: // not_entered
      return canEnter
        ? { label: "Not entered", color: neutrals.muted2, action: "Enter" }
        : { label: "Not entered", color: neutrals.muted2 };
  }
}
function EventStatusRow({ ev, selected, canEnter, hasCredits, onAction }:
  { ev: CompeteEvent; selected: boolean; canEnter: boolean; hasCredits: boolean; onAction: () => void }) {
  const meta = statusMeta(ev, canEnter, hasCredits);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
      backgroundColor: selected ? "rgba(230,185,63,0.10)" : neutrals.surface,
      borderWidth: 1, borderColor: selected ? hues.gold.base : neutrals.border,
      borderRadius: 12, padding: 14, marginBottom: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: neutrals.text, fontWeight: "700", fontSize: 15 }}>{ev.name}</Text>
        <Text style={{ color: meta.color, fontSize: 12.5, marginTop: 3, fontWeight: "600" }}>{meta.label}</Text>
      </View>
      {meta.action ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.85}>
          <LinearGradient
            colors={meta.spectrum ? spectrumStops : metalStops("gold")}
            start={{ x: 0, y: meta.spectrum ? 0.5 : 0 }} end={{ x: 1, y: meta.spectrum ? 0.5 : 1 }}
            style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9 }}>
            <Text style={{ color: meta.spectrum ? "#fff" : "#141210", fontWeight: "800", fontSize: 13 }}>{meta.action}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : meta.badge ? (
        <Text style={{ fontSize: 22 }}>{meta.badge}</Text>
      ) : null}
    </View>
  );
}

function VideoSlot({ n, picked, onPick, onClear, required }: { n: number; picked: PickedVideo | null; onPick: () => void; onClear: () => void; required?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: neutrals.surface, borderWidth: 1, borderColor: picked ? hues.gold.shadow : neutrals.border, borderRadius: 12, padding: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: neutrals.text, fontWeight: "600" }}>Angle {n}{required ? "" : "  (optional)"}</Text>
        <Text numberOfLines={1} style={{ color: picked ? hues.gold.hi : neutrals.muted2, fontSize: 12, marginTop: 3 }}>
          {picked ? (picked.fileName ?? "Video selected") : "No video chosen"}
        </Text>
      </View>
      {picked ? (
        <TouchableOpacity onPress={onClear}><Text style={{ color: neutrals.muted, fontSize: 13 }}>Remove</Text></TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onPick} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: neutrals.border }}>
          <Text style={{ color: neutrals.text, fontWeight: "600", fontSize: 13 }}>Choose</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
