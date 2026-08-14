import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";
import { myCompetitors } from "../lib/competitors";
import { standings, voterBoard, type Scope, type LbRow, type VoterRow } from "../lib/leaderboard";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "bracket", label: "My Bracket" },
  { key: "school", label: "My School" },
  { key: "global", label: "Global" },
];

// Dueling standings (rank+age bracket / school / global) + the voter board.
export default function Leaderboard() {
  const [me, setMe] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("bracket");
  const [voters, setVoters] = useState(false);
  const [duel, setDuel] = useState<LbRow[] | null>(null);
  const [vote, setVote] = useState<VoterRow[] | null>(null);

  useEffect(() => { myCompetitors().then((c) => setMe(c[0]?.id ?? null)); }, []);
  useEffect(() => { if (me && !voters) { setDuel(null); standings(me, scope).then(setDuel); } }, [me, scope, voters]);
  useEffect(() => { if (me && voters) { setVote(null); voterBoard(me).then(setVote); } }, [me, voters]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 34 }}>
      <View style={{ flexDirection: "row", backgroundColor: neutrals.surface, borderRadius: 10, padding: 3, marginBottom: 12 }}>
        <Seg label="Duelists" active={!voters} onPress={() => setVoters(false)} />
        <Seg label="Voters" active={voters} onPress={() => setVoters(true)} />
      </View>

      {!voters ? (
        <>
          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            {SCOPES.map((s) => <Chip key={s.key} label={s.label} active={scope === s.key} onPress={() => setScope(s.key)} />)}
          </View>
          {duel == null ? <ActivityIndicator color={neutrals.muted} style={{ marginTop: 24 }} /> : duel.length === 0 ? <Empty /> : duel.map((r) => (
            <Row key={r.rank} rank={r.rank} you={r.you} name={r.name} sub={r.school ?? ""} right={String(r.rating)} rightSub={`${r.wins}W · ${r.streak}🔥`} />
          ))}
        </>
      ) : (
        vote == null ? <ActivityIndicator color={neutrals.muted} style={{ marginTop: 24 }} /> : vote.length === 0 ? <Empty /> : vote.map((r) => (
          <Row key={r.rank} rank={r.rank} you={r.you} name={r.name} sub="the arena’s eye" right={String(r.votesCast)} rightSub="votes" />
        ))
      )}
    </ScrollView>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: active ? hues.gold.base : "transparent" }}>
      <Text style={{ color: active ? "#141210" : neutrals.muted2, fontWeight: "800", fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, marginRight: 8, borderWidth: 1, borderColor: active ? hues.gold.shadow : neutrals.border, backgroundColor: active ? "rgba(230,185,63,0.1)" : "transparent" }}>
      <Text style={{ color: active ? hues.gold.hi : neutrals.muted2, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}
function Row({ rank, you, name, sub, right, rightSub }: { rank: number; you: boolean; name: string; sub: string; right: string; rightSub: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: you ? "rgba(230,185,63,0.08)" : neutrals.surface, borderWidth: 1, borderColor: you ? hues.gold.shadow : neutrals.border }}>
      <Text style={{ color: you ? hues.gold.hi : neutrals.muted2, fontWeight: "800", width: 28, fontVariant: ["tabular-nums"] }}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: neutrals.text, fontWeight: you ? "800" : "600", fontSize: 14 }} numberOfLines={1}>{name}</Text>
        {sub ? <Text style={{ color: neutrals.muted2, fontSize: 11 }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{right}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 10 }}>{rightSub}</Text>
      </View>
    </View>
  );
}
function Empty() {
  return <Text style={{ color: neutrals.muted2, textAlign: "center", marginTop: 24 }}>No standings here yet — get in the arena.</Text>;
}
