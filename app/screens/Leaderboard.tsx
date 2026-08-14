import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";
import { myCompetitors } from "../lib/competitors";
import { standings, voterBoard, tournamentBoard, type Scope, type Division, type LbRow, type VoterRow, type TourRow } from "../lib/leaderboard";

type Board = "duelists" | "tournament" | "voters";
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

type TSortKey = "points" | "gold" | "medals" | "events";
const TSORTS: { key: TSortKey; label: string; unit: string; get: (r: TourRow) => number; sub: (r: TourRow) => string }[] = [
  { key: "points", label: "Points", unit: "pts", get: (r) => r.points, sub: (r) => `${r.gold}🥇 ${r.silver}🥈 ${r.bronze}🥉` },
  { key: "gold", label: "Gold", unit: "🥇", get: (r) => r.gold, sub: (r) => `${r.medals} medals · ${r.events} events` },
  { key: "medals", label: "Medals", unit: "🏅", get: (r) => r.medals, sub: (r) => `${r.gold}🥇 ${r.silver}🥈 ${r.bronze}🥉` },
  { key: "events", label: "Events", unit: "", get: (r) => r.events, sub: (r) => `${r.medals} medals` },
];

export default function Leaderboard() {
  const [me, setMe] = useState<string | null>(null);
  const [board, setBoard] = useState<Board>("duelists");
  const [scope, setScope] = useState<Scope>("global");
  const [division, setDivision] = useState<Division>("all");
  const [sort, setSort] = useState<SortKey>("rating");
  const [tsort, setTsort] = useState<TSortKey>("points");
  const [duel, setDuel] = useState<LbRow[] | null>(null);
  const [tour, setTour] = useState<TourRow[] | null>(null);
  const [vote, setVote] = useState<VoterRow[] | null>(null);
  const [selD, setSelD] = useState<LbRow | null>(null);
  const [selT, setSelT] = useState<TourRow | null>(null);

  useEffect(() => { myCompetitors().then((c) => setMe(c[0]?.id ?? null)); }, []);
  useEffect(() => { if (me && board === "duelists") { setDuel(null); standings(me, scope, division).then(setDuel); } }, [me, scope, division, board]);
  useEffect(() => { if (me && board === "tournament") { setTour(null); tournamentBoard(me, division).then(setTour); } }, [me, division, board]);
  useEffect(() => { if (me && board === "voters") { setVote(null); voterBoard(me).then(setVote); } }, [me, board]);

  const sortDef = SORTS.find((s) => s.key === sort)!;
  const rows = duel ? [...duel].sort((a, b) => sortDef.get(b) - sortDef.get(a)) : null;
  const tsortDef = TSORTS.find((s) => s.key === tsort)!;
  const trows = tour ? [...tour].sort((a, b) => tsortDef.get(b) - tsortDef.get(a)) : null;

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", backgroundColor: neutrals.surface, borderRadius: 10, padding: 3, marginBottom: 12 }}>
          <Seg label="Duelists" active={board === "duelists"} onPress={() => setBoard("duelists")} />
          <Seg label="Tournament" active={board === "tournament"} onPress={() => setBoard("tournament")} />
          <Seg label="Voters" active={board === "voters"} onPress={() => setBoard("voters")} />
        </View>

        {board === "duelists" ? (
          <>
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              {SCOPES.map((s) => <Chip key={s.key} label={s.label} active={scope === s.key} color={hues.gold.hi} spectrum onPress={() => setScope(s.key)} />)}
            </View>
            <DivisionRow division={division} setDivision={setDivision} />
            <Row2Label t="Sort" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {SORTS.map((s) => <Chip key={s.key} label={s.label} active={sort === s.key} color={hues.gold.base} filled spectrum onPress={() => setSort(s.key)} />)}
            </ScrollView>
            {rows == null ? <Loading /> : rows.length === 0 ? <Empty /> : rows.map((r, i) => {
              const raw = sortDef.get(r); const val = raw >= 1000 ? raw.toLocaleString() : String(raw);
              return <LbRowView key={r.competitorId} rank={i + 1} row={r} value={val} unit={sortDef.unit} sub={sortDef.sub(r)} onPress={() => setSelD(r)} />;
            })}
          </>
        ) : board === "tournament" ? (
          <>
            <DivisionRow division={division} setDivision={setDivision} />
            <Row2Label t="Sort" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {TSORTS.map((s) => <Chip key={s.key} label={s.label} active={tsort === s.key} color={hues.gold.base} filled spectrum onPress={() => setTsort(s.key)} />)}
            </ScrollView>
            {trows == null ? <Loading /> : trows.length === 0 ? <Empty note="No tournament medals yet — compete in the next round." /> : trows.map((r, i) => {
              const raw = tsortDef.get(r); const val = raw >= 1000 ? raw.toLocaleString() : String(raw);
              return <TourRowView key={r.competitorId} rank={i + 1} row={r} value={val} unit={tsortDef.unit} sub={tsortDef.sub(r)} onPress={() => setSelT(r)} />;
            })}
          </>
        ) : (
          vote == null ? <Loading /> : vote.length === 0 ? <Empty /> : vote.map((r) => <VoterRowView key={r.rank} r={r} />)
        )}
      </ScrollView>

      <Modal visible={!!selD} transparent animationType="slide" onRequestClose={() => setSelD(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setSelD(null)} style={sheetScrim}>{selD ? <PlayerCard row={selD} onClose={() => setSelD(null)} /> : null}</TouchableOpacity>
      </Modal>
      <Modal visible={!!selT} transparent animationType="slide" onRequestClose={() => setSelT(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setSelT(null)} style={sheetScrim}>{selT ? <TourCard row={selT} onClose={() => setSelT(null)} /> : null}</TouchableOpacity>
      </Modal>
    </>
  );
}

const sheetScrim = { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-end" as const };

function DivisionRow({ division, setDivision }: { division: Division; setDivision: (d: Division) => void }) {
  return (
    <>
      <Row2Label t="Division" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {DIVS.map((d) => <Chip key={d.key} label={d.label} active={division === d.key} color={d.hue} filled spectrum onPress={() => setDivision(d.key)} />)}
      </ScrollView>
    </>
  );
}
function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const inner = <Text style={{ color: active ? "#fff" : neutrals.muted2, fontWeight: "800", fontSize: 12 }}>{label}</Text>;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1, borderRadius: 8, overflow: "hidden" }}>
      {active
        ? <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 8, alignItems: "center" }}>{inner}</LinearGradient>
        : <View style={{ paddingVertical: 8, alignItems: "center" }}>{inner}</View>}
    </TouchableOpacity>
  );
}
function Chip({ label, active, color, filled, spectrum, onPress }: { label: string; active: boolean; color: string; filled?: boolean; spectrum?: boolean; onPress: () => void }) {
  if (spectrum && active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ marginRight: 8, borderRadius: 999, overflow: "hidden" }}>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingHorizontal: 14, paddingVertical: 7 }}>
          <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
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
function RowShell({ rank, name, belt, school, value, unit, sub, you, onPress }: { rank: number; name: string; belt: string | null; school: string | null; value: string; unit: string; sub: string; you: boolean; onPress: () => void }) {
  const top = rank <= 3;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 13, marginBottom: 9, borderRadius: 16, backgroundColor: you ? "rgba(230,185,63,0.09)" : neutrals.surface, borderWidth: 1, borderColor: you ? hues.gold.shadow : neutrals.border }}>
      <Text style={{ color: top ? hues.gold.hi : neutrals.muted2, fontWeight: "800", width: 26, textAlign: "center", fontVariant: ["tabular-nums"], fontSize: 15 }}>{rank}</Text>
      <View style={{ marginHorizontal: 10 }}><Avatar name={name} belt={belt} glow={top} /></View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: neutrals.text, fontWeight: you ? "800" : "600", fontSize: 14 }}>{name}{rank === 1 ? "  👑" : ""}{you ? "  · YOU" : ""}</Text>
        <Text numberOfLines={1} style={{ color: neutrals.muted2, fontSize: 11, marginTop: 1, textTransform: "capitalize" }}>{[belt?.replace("_", " "), school].filter(Boolean).join(" · ")}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] }}>{value}{unit ? <Text style={{ color: neutrals.muted2, fontSize: 9, fontWeight: "700" }}> {unit}</Text> : null}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 10, marginTop: 1 }}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}
function LbRowView({ rank, row, value, unit, sub, onPress }: { rank: number; row: LbRow; value: string; unit: string; sub: string; onPress: () => void }) {
  return <RowShell rank={rank} name={row.name} belt={row.belt} school={row.school} value={value} unit={unit} sub={sub} you={row.you} onPress={onPress} />;
}
function TourRowView({ rank, row, value, unit, sub, onPress }: { rank: number; row: TourRow; value: string; unit: string; sub: string; onPress: () => void }) {
  return <RowShell rank={rank} name={row.name} belt={row.belt} school={row.school} value={value} unit={unit} sub={sub} you={row.you} onPress={onPress} />;
}
function VoterRowView({ r }: { r: VoterRow }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 14, backgroundColor: r.you ? "rgba(230,185,63,0.08)" : neutrals.surface, borderWidth: 1, borderColor: r.you ? hues.gold.shadow : neutrals.border }}>
      <Text style={{ color: r.you ? hues.gold.hi : neutrals.muted2, fontWeight: "800", width: 28, fontVariant: ["tabular-nums"] }}>{r.rank}</Text>
      <Text style={{ flex: 1, color: neutrals.text, fontWeight: r.you ? "800" : "600", fontSize: 14 }} numberOfLines={1}>{r.name}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{r.votesCast}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 10 }}>{r.accuracy != null ? `${Math.round(r.accuracy * 100)}% acc` : "votes"}</Text>
      </View>
    </View>
  );
}
function CardShell({ name, belt, school, rank, headLabel, headValue, headUnit, bento, game, onClose }: {
  name: string; belt: string | null; school: string | null; rank: number; headLabel: string; headValue: string; headUnit: string;
  bento: { k: string; v: number | string; acc: string }[]; game: { tag: string; name: string; v: string }[]; onClose: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={1} style={{ backgroundColor: "#161618", borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: "#2a2a2e", paddingBottom: 30 }}>
      <View style={{ width: 40, height: 4, borderRadius: 3, backgroundColor: "#3a3a3e", alignSelf: "center", marginTop: 10, marginBottom: 6 }} />
      <View style={{ alignItems: "center", paddingHorizontal: 20, paddingTop: 8 }}>
        <Avatar name={name} belt={belt} size={78} />
        <Text style={{ color: neutrals.text, fontSize: 20, fontWeight: "800", marginTop: 10 }}>{name.replace("You — ", "")}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2, textTransform: "capitalize" }}>Rank #{rank} · {[belt?.replace("_", " "), school].filter(Boolean).join(" · ")}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 9.5, letterSpacing: 2, fontWeight: "800", marginTop: 16 }}>{headLabel}</Text>
        <Text style={{ color: hues.gold.hi, fontSize: 26, fontWeight: "800", marginTop: 3, fontVariant: ["tabular-nums"] }}>{headValue} <Text style={{ color: neutrals.muted, fontSize: 12 }}>{headUnit}</Text></Text>
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
function PlayerCard({ row, onClose }: { row: LbRow; onClose: () => void }) {
  return <CardShell name={row.name} belt={row.belt} school={row.school} rank={row.rank} headLabel="DUEL RATING" headValue={row.rating.toLocaleString()} headUnit="RTG"
    bento={[{ k: "Duels", v: row.duels, acc: hues.sapphire.base }, { k: "Medals", v: row.medals, acc: hues.gold.base }, { k: "Best Streak", v: row.bestStreak, acc: hues.amethyst.base }]}
    game={[
      { tag: "ALL TIME", name: "Winning percentage", v: `${row.winPct}%` },
      { tag: "ALL TIME", name: "Record (W–L–D)", v: `${row.wins}–${row.losses}–${row.draws}` },
      { tag: "ALL TIME", name: "Best streak", v: `${row.bestStreak} 🔥` },
      { tag: "NOW", name: "Current streak", v: `${row.streak}` },
      { tag: "NOW", name: "Rank", v: `#${row.rank}` },
    ]} onClose={onClose} />;
}
function TourCard({ row, onClose }: { row: TourRow; onClose: () => void }) {
  return <CardShell name={row.name} belt={row.belt} school={row.school} rank={row.rank} headLabel="TOURNAMENT POINTS" headValue={String(row.points)} headUnit="pts"
    bento={[{ k: "🥇 Gold", v: row.gold, acc: hues.gold.base }, { k: "🥈 Silver", v: row.silver, acc: "#C6CDD4" }, { k: "🥉 Bronze", v: row.bronze, acc: "#C57F35" }]}
    game={[
      { tag: "SEASON", name: "Total medals", v: `${row.medals}` },
      { tag: "SEASON", name: "Events entered", v: `${row.events}` },
      { tag: "SEASON", name: "Participation", v: `${row.participation}` },
      { tag: "NOW", name: "Rank", v: `#${row.rank}` },
    ]} onClose={onClose} />;
}
function Loading() { return <ActivityIndicator color={neutrals.muted} style={{ marginTop: 24 }} />; }
function Empty({ note }: { note?: string }) {
  return <Text style={{ color: neutrals.muted2, textAlign: "center", marginTop: 28 }}>{note ?? "No standings here yet — get in the arena."}</Text>;
}
