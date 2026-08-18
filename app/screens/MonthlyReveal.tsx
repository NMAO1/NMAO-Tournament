import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { neutrals, hues, type Rarity, type MedalType } from "@nmao/design-tokens";
import { Coin } from "../components/Coin";
import { Medal } from "../components/Medal";
import { Medallion, type Tier } from "../components/Medallion";
import { Frame } from "../components/Frame";
import { markMonthlySeen } from "../lib/notifications";
import { useSeasonLabel } from "../lib/season";

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
  useEffect(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* optional */ } }, [step]);

  const medals = arr(payload, "medals");
  const badges = arr(payload, "badges");
  const steps: string[] = ["open", ...(medals.length ? ["medals"] : []), ...(badges.length ? ["badges"] : []), "summary", "close"];
  const kind = steps[step];

  function done() { markMonthlySeen(period); onClose(); }

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
      <View style={{ flexDirection: "row", justifyContent: "center", paddingBottom: 34 }}>
        {step > 0 ? <Ghost label="‹ Back" onPress={() => setStep((s) => s - 1)} /> : <View style={{ width: 104 }} />}
        <View style={{ width: 12 }} />
        {step < steps.length - 1 ? <Gold label="Next ›" onPress={() => setStep((s) => s + 1)} /> : <Gold label="Done" onPress={done} />}
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Medals({ medals }: { medals: any[] }) {
  // The month's medals take their place on the Season Medallion, one by one.
  const target: (Tier | null)[] = Array.from({ length: 8 }, (_, i) => (medals[i] ? asTier(medals[i].tier) : null));
  const [shown, setShown] = useState<(Tier | null)[]>(Array(8).fill(null));
  useEffect(() => {
    setShown(Array(8).fill(null));
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(target.map((t, idx) => (idx < i ? t : null)));
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ }
      if (i >= target.filter(Boolean).length || i >= 8) clearInterval(id);
    }, 220);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medals]);
  return (
    <View style={{ alignItems: "center", width: "100%" }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>◈ Your Season Medallion ◈</Text>
      <Medallion tiers={shown} season={SEASON} size={236} />
      <Text style={{ color: neutrals.muted2, fontSize: 11, marginTop: 8, marginBottom: 4 }}>Each medal takes its place</Text>
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
