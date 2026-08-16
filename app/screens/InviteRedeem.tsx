import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues, spectrumStops, status as statusColors } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { listSeasons, getInvite, onboardCompetitor, type Season, type InvitePrefill } from "../lib/onboard";

const CONSENTS = [
  { key: "media_release", label: "I consent to my competitor's forms being recorded and shown for judging and community voting." },
  { key: "rules", label: "I have read and agree to the competition rules and code of conduct." },
  { key: "terms", label: "I agree to the Terms of Service and Privacy Policy." },
];
const RANK_LABEL: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", black_belt: "Black Belt" };
const pad = (s: string) => (s.length === 1 ? "0" + s : s);
// Timezone-safe DOB display — build from Y/M/D parts so a UTC "2014-07-07"
// doesn't render as the prior day in a behind-UTC locale.
function fmtDOB(iso: string): string {
  const [Y, M, D] = iso.split("-").map(Number);
  return new Date(Y, M - 1, D).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Membership-bridge redeem — a guardian opens an invite deep-link and completes
// the gated part: confirm the (school-provided) competitor, add themselves, pick
// the season, and consent. School + rank come from the invite (school owns rank);
// payment lands later with the Stripe tiers. On submit the pending athlete
// becomes a live competitor linked back to the Membership student.
export default function InviteRedeem({ token, onDone, onCancel }: { token: string; onDone: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitePrefill | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [gFirst, setGFirst] = useState(""); const [gLast, setGLast] = useState(""); const [gPhone, setGPhone] = useState("");
  const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [mm, setMm] = useState(""); const [dd, setDd] = useState(""); const [yy, setYy] = useState("");
  const [dobLocked, setDobLocked] = useState(false);
  const [style, setStyle] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const r = await getInvite(token);
      if (!r.ok || !r.invite) { setLoadErr(r.error || "This invite is no longer valid."); setLoading(false); return; }
      const inv = r.invite; setInvite(inv);
      setFirst(inv.competitor.first_name || ""); setLast(inv.competitor.last_name || "");
      if (inv.competitor.dob) { const [Y, M, D] = inv.competitor.dob.split("-"); setYy(Y); setMm(M); setDd(D); setDobLocked(true); }
      setLoading(false);
    })();
    listSeasons().then((s) => { setSeasons(s); const a = s.find((x) => x.status === "active"); if (a) setSeasonId(a.id); });
  }, [token]);

  const dob = useMemo(() => (mm && dd && yy.length === 4 ? `${yy}-${pad(mm)}-${pad(dd)}` : ""), [mm, dd, yy]);
  const allConsented = CONSENTS.every((c) => checked[c.key]);
  const ready = first.trim() && last.trim() && dob && seasonId && gFirst.trim() && gLast.trim() && allConsented;

  async function submit() {
    if (!ready) { setMsg("Please complete every field and all consents."); return; }
    setBusy(true); setMsg("");
    // school_id + rank are taken from the invite server-side (school owns rank).
    const r = await onboardCompetitor({
      guardian: { first_name: gFirst.trim(), last_name: gLast.trim(), phone: gPhone.trim() || undefined },
      competitor: { first_name: first.trim(), last_name: last.trim(), dob, declared_style: style.trim() },
      season_id: seasonId!,
      consent_types: CONSENTS.filter((c) => checked[c.key]).map((c) => c.key),
      invite_token: token,
    });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Something went wrong."); return; }
    onDone();
  }

  if (loading) return <Center><ActivityIndicator color={neutrals.muted} /></Center>;
  if (loadErr || !invite) return (
    <Center>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>⏳</Text>
      <Text style={{ color: neutrals.text, fontSize: 18, fontWeight: "800", textAlign: "center" }}>This invite can't be opened</Text>
      <Text style={{ color: neutrals.muted, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 19 }}>{loadErr || "It may have expired or already been used. Ask your school for a fresh link."}</Text>
      <TouchableOpacity onPress={onCancel} style={{ marginTop: 22 }}><Text style={{ color: neutrals.muted2, fontSize: 13 }}>Go back</Text></TouchableOpacity>
    </Center>
  );

  const rankLabel = invite.competitor.rank ? (RANK_LABEL[invite.competitor.rank] ?? invite.competitor.rank) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "800", flex: 1, paddingRight: 10 }}>Complete {first || "your competitor"}'s registration</Text>
          <TouchableOpacity onPress={() => supabase.auth.signOut()}><Text style={{ color: neutrals.muted2, fontSize: 13 }}>Sign out</Text></TouchableOpacity>
        </View>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 3, borderRadius: 99, marginBottom: 14, width: 120 }} />
        <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 4 }}>
          <Text style={{ color: hues.gold.hi, fontWeight: "800" }}>{invite.school.name || "Your school"}</Text> invited this competitor. Confirm the details, add yourself as guardian, and consent to finish. Your rank is set by your school.
        </Text>

        <Section title="The competitor" />
        <Row><Field label="First name" value={first} onChange={setFirst} flex /><View style={{ width: 10 }} /><Field label="Last name" value={last} onChange={setLast} flex /></Row>

        <Text style={label}>Date of birth</Text>
        {dobLocked ? (
          <LockedField value={new Date(invite.competitor.dob!).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} />
        ) : (
          <Row>
            <Field label="MM" value={mm} onChange={setMm} keyboard="number-pad" flex /><View style={{ width: 8 }} />
            <Field label="DD" value={dd} onChange={setDd} keyboard="number-pad" flex /><View style={{ width: 8 }} />
            <Field label="YYYY" value={yy} onChange={setYy} keyboard="number-pad" flex />
          </Row>
        )}

        <Text style={[label, { marginTop: 14 }]}>Rank</Text>
        <LockedField value={rankLabel || "Your school will assign your rank"} muted={!rankLabel}
          note={invite.competitor.belt_name ? `Your school's record: ${invite.competitor.belt_name}` : "Set by your school"} />

        <View style={{ marginTop: 6 }}><Field label="Style (e.g. Karate, Taekwondo)" value={style} onChange={setStyle} /></View>

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
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Complete registration</Text>}
          </LinearGradient>
        </TouchableOpacity>
        <Text style={{ color: neutrals.muted2, fontSize: 11, textAlign: "center", marginTop: 10 }}>Season entry payment is handled with your school's plan.</Text>
        {msg ? <Text style={{ color: statusColors.danger, textAlign: "center", marginTop: 12 }}>{msg}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 34 }}>{children}</View>;
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
// Read-only display for school-owned fields (rank) and known DOB.
function LockedField({ value, note, muted }: { value: string; note?: string; muted?: boolean }) {
  return (
    <View style={{ backgroundColor: "#0e0e11", borderColor: neutrals.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ color: muted ? neutrals.muted2 : neutrals.text, fontSize: 15, fontStyle: muted ? "italic" : "normal", flex: 1 }}>{value}</Text>
      {note ? <Text style={{ color: neutrals.muted2, fontSize: 10, marginLeft: 8, textAlign: "right", maxWidth: 150 }}>🔒 {note}</Text> : <Text style={{ color: neutrals.muted2, fontSize: 12, marginLeft: 8 }}>🔒</Text>}
    </View>
  );
}
const label = { color: neutrals.muted, fontSize: 12, marginBottom: 6, marginTop: 6 } as const;
