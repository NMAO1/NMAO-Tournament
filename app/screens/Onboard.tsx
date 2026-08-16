import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues, spectrumStops, status as statusColors } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { listSeasons, listSchools, onboardCompetitor, type Season, type School } from "../lib/onboard";

const RANKS = ["beginner", "intermediate", "advanced"];
const CONSENTS = [
  { key: "media_release", label: "I consent to my competitor's forms being recorded and shown for judging and community voting." },
  { key: "rules", label: "I have read and agree to the competition rules and code of conduct." },
  { key: "terms", label: "I agree to the Terms of Service and Privacy Policy." },
];
const pad = (s: string) => (s.length === 1 ? "0" + s : s);

// First-run onboarding — a guardian registers their competitor: details, school,
// season (mandatory), and consent. Payment for entries happens later, per event.
export default function Onboard({ onDone }: { onDone: () => void }) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [gFirst, setGFirst] = useState(""); const [gLast, setGLast] = useState(""); const [gPhone, setGPhone] = useState("");
  const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [mm, setMm] = useState(""); const [dd, setDd] = useState(""); const [yy, setYy] = useState("");
  const [rank, setRank] = useState<string | null>(null);
  const [style, setStyle] = useState("");
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");

  useEffect(() => {
    listSeasons().then((s) => { setSeasons(s); const active = s.find((x) => x.status === "active"); if (active) setSeasonId(active.id); });
    listSchools().then(setSchools);
  }, []);

  const dob = useMemo(() => (mm && dd && yy.length === 4 ? `${yy}-${pad(mm)}-${pad(dd)}` : ""), [mm, dd, yy]);
  const allConsented = CONSENTS.every((c) => checked[c.key]);
  const ready = first.trim() && last.trim() && dob && rank && seasonId && gFirst.trim() && gLast.trim() && allConsented;

  async function submit() {
    if (!ready) { setMsg("Please complete every field and all consents."); return; }
    setBusy(true); setMsg("");
    const r = await onboardCompetitor({
      guardian: { first_name: gFirst.trim(), last_name: gLast.trim(), phone: gPhone.trim() || undefined },
      competitor: { first_name: first.trim(), last_name: last.trim(), dob, school_id: schoolId, declared_rank: rank!, declared_style: style.trim() },
      season_id: seasonId!,
      consent_types: CONSENTS.filter((c) => checked[c.key]).map((c) => c.key),
    });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Something went wrong."); return; }
    onDone();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Text style={{ color: neutrals.text, fontSize: 24, fontWeight: "800" }}>Register your competitor</Text>
          <TouchableOpacity onPress={() => supabase.auth.signOut()}><Text style={{ color: neutrals.muted2, fontSize: 13 }}>Sign out</Text></TouchableOpacity>
        </View>
        <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 }}>
          Every competitor joins a season — the year-long journey of nine tournaments. You can add more competitors later.
        </Text>

        <Section title="The competitor" />
        <Row><Field label="First name" value={first} onChange={setFirst} flex /><View style={{ width: 10 }} /><Field label="Last name" value={last} onChange={setLast} flex /></Row>
        <Text style={label}>Date of birth</Text>
        <Row>
          <Field label="MM" value={mm} onChange={setMm} keyboard="number-pad" flex /><View style={{ width: 8 }} />
          <Field label="DD" value={dd} onChange={setDd} keyboard="number-pad" flex /><View style={{ width: 8 }} />
          <Field label="YYYY" value={yy} onChange={setYy} keyboard="number-pad" flex />
        </Row>
        <Text style={[label, { marginTop: 14 }]}>Rank</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {RANKS.map((r) => <Chip key={r} label={r[0].toUpperCase() + r.slice(1)} on={rank === r} onPress={() => setRank(r)} />)}
        </View>
        <View style={{ marginTop: 6 }}><Field label="Style (e.g. Karate, Taekwondo)" value={style} onChange={setStyle} /></View>

        {schools.length > 0 ? (
          <>
            <Section title="School (optional)" />
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {schools.map((s) => <Chip key={s.id} label={s.name} on={schoolId === s.id} onPress={() => setSchoolId(schoolId === s.id ? null : s.id)} />)}
            </View>
          </>
        ) : null}

        <Section title="Season" />
        {seasons.length === 0 ? <ActivityIndicator color={neutrals.muted} /> : (
          <View>
            {seasons.map((s) => {
              const on = seasonId === s.id;
              const when = s.status === "scheduled" && s.starts_at ? `Starts ${new Date(s.starts_at).toLocaleDateString()}` : s.status === "active" ? "Open now" : s.status;
              return (
                <TouchableOpacity key={s.id} onPress={() => setSeasonId(s.id)} activeOpacity={0.85}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 13, borderRadius: 14, marginBottom: 8, backgroundColor: on ? "rgba(163,43,247,0.12)" : neutrals.surface, borderWidth: 1, borderColor: on ? hues.amethyst.base : neutrals.border }}>
                  <View><Text style={{ color: neutrals.text, fontWeight: "700" }}>{s.name}</Text><Text style={{ color: neutrals.muted2, fontSize: 11, marginTop: 2 }}>{when}</Text></View>
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? hues.amethyst.hi : neutrals.border, backgroundColor: on ? hues.amethyst.base : "transparent" }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Section title="Guardian" />
        <Row><Field label="Your first name" value={gFirst} onChange={setGFirst} flex /><View style={{ width: 10 }} /><Field label="Your last name" value={gLast} onChange={setGLast} flex /></Row>
        <View style={{ marginTop: 6 }}><Field label="Phone (optional)" value={gPhone} onChange={setGPhone} keyboard="phone-pad" /></View>

        <Section title="Consent" />
        {CONSENTS.map((c) => (
          <TouchableOpacity key={c.key} onPress={() => setChecked((p) => ({ ...p, [c.key]: !p[c.key] }))} activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: checked[c.key] ? hues.gold.base : neutrals.border, backgroundColor: checked[c.key] ? hues.gold.base : "transparent", alignItems: "center", justifyContent: "center", marginRight: 10, marginTop: 1 }}>
              {checked[c.key] ? <Text style={{ color: "#141210", fontWeight: "900", fontSize: 13 }}>✓</Text> : null}
            </View>
            <Text style={{ color: neutrals.muted, fontSize: 12.5, lineHeight: 18, flex: 1 }}>{c.label}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity onPress={submit} disabled={busy || !ready} activeOpacity={0.85} style={{ marginTop: 22, borderRadius: 12, overflow: "hidden", opacity: ready ? 1 : 0.5 }}>
          <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 15, alignItems: "center" }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Register & enter the arena</Text>}
          </LinearGradient>
        </TouchableOpacity>
        {msg ? <Text style={{ color: statusColors.danger, textAlign: "center", marginTop: 14 }}>{msg}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title }: { title: string }) {
  return <Text style={{ color: hues.gold.hi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "800", marginTop: 22, marginBottom: 10 }}>{title}</Text>;
}
function Row({ children }: { children: React.ReactNode }) { return <View style={{ flexDirection: "row" }}>{children}</View>; }
function Field({ label: l, value, onChange, keyboard, flex }: { label: string; value: string; onChange: (s: string) => void; keyboard?: "number-pad" | "phone-pad"; flex?: boolean }) {
  return (
    <View style={flex ? { flex: 1 } : undefined}>
      <TextInput value={value} onChangeText={onChange} placeholder={l} placeholderTextColor={neutrals.muted2} keyboardType={keyboard} autoCapitalize={keyboard ? "none" : "words"}
        style={{ backgroundColor: "#0e0e11", borderColor: neutrals.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, color: neutrals.text, fontSize: 15, marginBottom: 8 }} />
    </View>
  );
}
function Chip({ label: l, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: on ? hues.gold.base : neutrals.border, backgroundColor: on ? "rgba(230,185,63,0.14)" : "transparent" }}>
      <Text style={{ color: on ? hues.gold.hi : neutrals.muted, fontSize: 13, fontWeight: on ? "800" : "500" }}>{l}</Text>
    </TouchableOpacity>
  );
}
const label = { color: neutrals.muted, fontSize: 12, marginBottom: 6, marginTop: 6 } as const;
