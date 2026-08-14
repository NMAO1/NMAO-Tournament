import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";
import { myCompetitors } from "../lib/competitors";
import { standings, voterBoard, type Scope, type Division, type LbRow, type VoterRow } from "../lib/leaderboard";

const DIVS: { key: Division; label: string; hue: string }[] = [
  { key: "all", label: "All", hue: hues.gold.base },
  { key: "beginner", label: "Beginner", hue: hues.sapphire.base },
  { key: "intermediate", label: "Intermediate", hue: hues.amethyst.base },
  { key: "advanced", label: "Advanced", hue: hues.ruby.base },
];
const SCOPES: { key: Scope; label: string }[] = [
  { key: "bracket", label: "My Bracket" },
  { key: "school", label: "My School" },
  { key: "global", label: "Global" },
];
const beltHue = (belt: string | null) =>
  belt === "advanced" || belt === "black_belt" ? hues.ruby.base : belt === "intermediate" ? hues.amethyst.base : hues.sapphire.base;

type SortKey = "rating" | "wins" | "medals" | "duels" | "winPct" | "bestStreak";
const SORTS: { key: SortKey; label: string; unit: string; get: (r: LbRow) => number; sub: (r: LbRow) => string }[] = [
  { key: "rating", label: "Rating", unit: "RTG", get: (r) => r.rating, sub: (r) => `${r.wins}W · ${r.bestStreak}🔥` },
  { key: "wins", label: "Wins", unit: "W", get: (r) => r.wins, sub: (r) => `${r.rating} · ${r.winPct}%` },
  { key: "medals", label: "Medals", unit: "🏅", get: (r) => r.medals, sub: (r) => `${r.wins}W · ${r.losses}L` },
  { key: "duels", label: "Duels", unit: "", get: (r) => r.duels, sub: (r) => `${r.wins}W · ${r.losses}L` },
  { key: "winPct", label: "Win %", unit: "%", get: (r) => r.winPct, sub: (r) => `${r.wins}W · ${r.losses}L` },
  { key: "bestStreak", label: "Streak", unit: "🔥", get: (r) => r.bestStreak, sub: (r) => `${r.rating} RTG` },
];

export default function Leaderboard() {
  const [me, setMe] = useState<string | null>(null);
  const [voters, setVoters] = useState(false);
  const [scope, setScope] = useState<Scope>("global");
  const [division, setDivision] = useState<Division>("all");
  const [sort, setSort] = useState<SortKey>("rating");
  const [duel, setDuel] = useState<LbRow[] | null>(null);
  const [vote, setVote] = useState<VoterRow[] | null>(null);
  const [sel, setSel] = useState<LbRow | null>(null);

  useEffect(() => { myCompetitors().then((c) => setMe(c[0]?.id ?? null)); }, []);
  useEffect(() => { if (me && !voters) { setDuel(null); standings(me, scope, division).then(setDuel); } }, [me, scope, division, voters]);
  useEffect(() => { if (me && voters) { setVote(null); voterBoard(me).then(setVote); } }, [me, voters]);

  const sortDef = SORTS.find((s) => s.key === sort)!;
  const rows = duel ? [...duel].sort((a, b) => sortDef.get(b) - sortDef.get(a)) : null;

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", backgroundColor: neutrals.surface, borderRadius: 10, padding: 3, marginBottom: 12 }}>
          <Seg label="Duelists" active={!voters} onPress={() => setVoters(false)} />
          <Seg label="Voters" active={voters} onPress={() => setVoters(true)} />
        </View>

        {!voters ? (
          <>
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              {SCOPES.map((s) => <Chip key={s.key} label={s.label} active={scope === s.key} color={hues.gold.hi} onPress={() => setScope(s.key)} />)}
            </View>
            <Row2Label t="Division" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {DIVS.map((d) => <Chip key={d.key} label={d.label} active={division === d.key} color={d.hue} filled onPress={() => setDivision(d.key)} />)}
            </ScrollView>
            <Row2Label t="Sort" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {SORTS.map((s) => <Chip key={s.key} label={s.label} active={sort === s.key} color={hues.gold.base} filled onPress={() => setSort(s.key)} />)}
            </ScrollView>

            {rows == null ? <ActivityIndicator color={neutrals.muted} style={{ marginTop: 24 }} />
              : rows.length === 0 ? <Empty />
              : rows.map((r, i) => {
                const raw = sortDef.get(r);
                const val = raw >= 1000 ? raw.toLocaleString() : String(raw);
                return <LbRowView key={r.competitorId} rank={i + 1} row={r} value={val} unit={sortDef.unit} sub={sortDef.sub(r)} onPress={() => setSel(r)} />;
              })}
          </>
        ) : (
          vote == null ? <ActivityIndicator color={neutrals.muted} style={{ marginTop: 24 }} />
            : vote.length === 0 ? <Empty />
            : vote.map((r) => <VoterRowView key={r.rank} r={r} />)
        )}
      </ScrollView>

      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setSel(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-end" }}>
          {sel ? <PlayerCard row={sel} onClose={() => setSel(null)} /> : null}
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: active ? hues.gold.base : "transparent" }}>
      <Text style={{ color: active ? "#141210" : neutrals.muted2, fontWeight: "800", fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}
function Chip({ label, active, color, filled, onPress }: { label: string; active: boolean; color: string; filled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, marginRight: 8, borderWidth: 1, borderColor: active ? color : neutrals.border, backgroundColor: active && filled ? color : active ? "rgba(230,185,63,0.1)" : "transparent" }}>
      <Text style={{ color: active && filled ? "#0b0a08" : active ? color : neutrals.muted2, fontSize: 11, fontWeight: "800" }}>{label}</Text>
    </TouchableOpacity>
  );
}
function Row2Label({ t }: { t: string }) {
  return <Text style={{ color: neutrals.muted2, fontSize: 9, letterSpacing: 1.3, fontWeight: "800", textTransform: "uppercase", marginBottom: 7 }}>{t}</Text>;
}
function Avatar({ name, belt, size = 40, glow }: { name: string; belt: string | null; size?: number; glow?: boolean }) {
  const hue = glow ? hues.gold.base : beltHue(belt);
  const initials = name.replace("You — ", "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: hue, alignItems: "center", justifyContent: "center", backgroundColor: "#15130f" }}>
      <Text style={{ color: hue, fontWeight: "800", fontSize: size * 0.32 }}>{initials}</Text>
    </View>
  );
}
function LbRowView({ rank, row, value, unit, sub, onPress }: { rank: number; row: LbRow; value: string; unit: string; sub: string; onPress: () => void }) {
  const top = rank <= 3;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 13, marginBottom: 9, borderRadius: 16, backgroundColor: row.you ? "rgba(230,185,63,0.09)" : neutrals.surface, borderWidth: 1, borderColor: row.you ? hues.gold.shadow : neutrals.border }}>
      <Text style={{ color: top ? hues.gold.hi : neutrals.muted2, fontWeight: "800", width: 26, textAlign: "center", fontVariant: ["tabular-nums"], fontSize: 15 }}>{rank}</Text>
      <View style={{ marginHorizontal: 10 }}><Avatar name={row.name} belt={row.belt} glow={top} /></View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: neutrals.text, fontWeight: row.you ? "800" : "600", fontSize: 14 }}>{row.name}{rank === 1 ? "  👑" : ""}{row.you ? "  · YOU" : ""}</Text>
        <Text numberOfLines={1} style={{ color: neutrals.muted2, fontSize: 11, marginTop: 1, textTransform: "capitalize" }}>{[row.belt?.replace("_", " "), row.school].filter(Boolean).join(" · ")}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] }}>{value}{unit ? <Text style={{ color: neutrals.muted2, fontSize: 9, fontWeight: "700" }}> {unit}</Text> : null}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 10, marginTop: 1 }}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}
function VoterRowView({ r }: { r: VoterRow }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 14, backgroundColor: r.you ? "rgba(230,185,63,0.08)" : neutrals.surface, borderWidth: 1, borderColor: r.you ? hues.gold.shadow : neutrals.border }}>
      <Text style={{ color: r.you ? hues.gold.hi : neutrals.muted2, fontWeight: "800", width: 28, fontVariant: ["tabular-nums"] }}>{r.rank}</Text>
      <Text style={{ flex: 1, color: neutrals.text, fontWeight: r.you ? "800" : "600", fontSize: 14 }} numberOfLines={1}>{r.name}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{r.votesCast}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 10 }}>{r.accuracy != null ? `${Math.round(r.accuracy)}% acc` : "votes"}</Text>
      </View>
    </View>
  );
}
function PlayerCard({ row, onClose }: { row: LbRow; onClose: () => void }) {
  const hue = beltHue(row.belt);
  const bento = [
    { k: "Duels", v: row.duels, acc: hues.sapphire.base },
    { k: "Medals", v: row.medals, acc: hues.gold.base },
    { k: "Best Streak", v: row.bestStreak, acc: hues.amethyst.base },
  ];
  const game = [
    { tag: "ALL TIME", name: "Winning percentage", v: `${row.winPct}%` },
    { tag: "ALL TIME", name: "Record (W–L–D)", v: `${row.wins}–${row.losses}–${row.draws}` },
    { tag: "ALL TIME", name: "Best streak", v: `${row.bestStreak} 🔥` },
    { tag: "NOW", name: "Current streak", v: `${row.streak}` },
    { tag: "NOW", name: "Rank", v: `#${row.rank}` },
  ];
  return (
    <TouchableOpacity activeOpacity={1} style={{ backgroundColor: "#161618", borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: "#2a2a2e", paddingBottom: 30 }}>
      <View style={{ width: 40, height: 4, borderRadius: 3, backgroundColor: "#3a3a3e", alignSelf: "center", marginTop: 10, marginBottom: 6 }} />
      <View style={{ alignItems: "center", paddingHorizontal: 20, paddingTop: 8 }}>
        <Avatar name={row.name} belt={row.belt} size={78} />
        <Text style={{ color: neutrals.text, fontSize: 20, fontWeight: "800", marginTop: 10 }}>{row.name.replace("You — ", "")}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>Rank #{row.rank} · {[row.belt?.replace("_", " "), row.school].filter(Boolean).join(" · ")}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 9.5, letterSpacing: 2, fontWeight: "800", marginTop: 16 }}>DUEL RATING</Text>
        <Text style={{ color: hues.gold.hi, fontSize: 26, fontWeight: "800", marginTop: 3, fontVariant: ["tabular-nums"] }}>{row.rating.toLocaleString()} <Text style={{ color: neutrals.muted, fontSize: 12 }}>RTG</Text></Text>
      </View>
      <View style={{ flexDirection: "row", gap: 9, paddingHorizontal: 20, marginTop: 16 }}>
        {bento.map((b) => (
          <View key={b.k} style={{ flex: 1, backgroundColor: "#141416", borderWidth: 1, borderColor: neutrals.border, borderRadius: 14, paddingVertical: 12, alignItems: "center", overflow: "hidden" }}>
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: b.acc }} />
            <Text style={{ color: neutrals.muted2, fontSize: 9, letterSpacing: 1, fontWeight: "700", textTransform: "uppercase" }}>{b.k}</Text>
            <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "800", marginTop: 5, fontVariant: ["tabular-nums"] }}>{b.v}</Text>
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <Text style={{ color: neutrals.muted, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginBottom: 10 }}>GAME STATS</Text>
        {game.map((g, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#141416", borderWidth: 1, borderColor: neutrals.border, borderRadius: 13, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 8, overflow: "hidden" }}>
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: [hues.ruby.base, hues.amethyst.base, hues.sapphire.base][i % 3] }} />
            <View>
              <Text style={{ color: neutrals.muted2, fontSize: 8.5, letterSpacing: 1.2, fontWeight: "700" }}>{g.tag}</Text>
              <Text style={{ color: neutrals.text, fontSize: 13, fontWeight: "700", marginTop: 2 }}>{g.name}</Text>
            </View>
            <Text style={{ color: neutrals.text, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{g.v}</Text>
          </View>
        ))}
        <TouchableOpacity onPress={onClose} style={{ alignItems: "center", marginTop: 10 }}><Text style={{ color: neutrals.muted, fontSize: 13 }}>Close</Text></TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}
function Empty() {
  return <Text style={{ color: neutrals.muted2, textAlign: "center", marginTop: 28 }}>No standings here yet — get in the arena.</Text>;
}
