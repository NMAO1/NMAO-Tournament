import { useMemo } from "react";
import { Canvas, Group, Path, Circle, RadialGradient, Skia, vec } from "@shopify/react-native-skia";

// Digital twin of the physical Season Medallion: 8 wave pieces (rounds R1–R8) ringing a
// fixed keystone center (R9), each rendering its slice of the ONE printed yin-yang in that
// piece's earned metal (or white+season for participation). Unearned rounds render as ghosts.
const C = 170, R = 138, RIN = 52, RC = 48, NW = 8, STEP = (2 * Math.PI) / NW, h = R / 2;
const EYR = R * 0.14;
const P = (r: number, a: number): [number, number] => [C + r * Math.cos(a), C + r * Math.sin(a)];

function waveStr(k: number): string {
  const aL = -Math.PI / 2 + k * STEP, aR = aL + STEP, s = 8, pts: string[] = [];
  const add = (p: [number, number]) => pts.push(p[0].toFixed(1) + " " + p[1].toFixed(1));
  for (let t = 0; t <= s; t++) add(P(RIN + ((R - RIN) * t) / s, aL));
  for (let t = 1; t <= s; t++) add(P(R, aL + (STEP * t) / s));
  for (let t = s - 1; t >= 0; t--) add(P(RIN + ((R - RIN) * t) / s, aR));
  for (let t = 1; t <= s; t++) add(P(RIN, aR - (STEP * t) / s));
  return "M" + pts.join("L") + "Z";
}
const TAIJITU_STR = `M${C} ${C - R} A${R} ${R} 0 0 1 ${C} ${C + R} A${h} ${h} 0 0 1 ${C} ${C} A${h} ${h} 0 0 0 ${C} ${C - R} Z`;
const CENTER_STR = `M${C - RC} ${C} A${RC} ${RC} 0 1 0 ${C + RC} ${C} A${RC} ${RC} 0 1 0 ${C - RC} ${C} Z`;

export type Tier = "gold" | "silver" | "bronze" | "part";
const METAL: Record<Tier, { light: string[]; dark: string[] }> = {
  gold: { light: ["#FFF0BE", "#E6B93F", "#B0851F"], dark: ["#8A6B1E", "#5A3F0E", "#33240A"] },
  silver: { light: ["#F6F8FA", "#C6CDD4", "#949CA4"], dark: ["#7A828A", "#4C535A", "#2E3338"] },
  bronze: { light: ["#F3C79A", "#C57F35", "#8A5620"], dark: ["#6E4A20", "#452C12", "#28180A"] },
  part: { light: ["#FFFFFF", "#ECECE8", "#D2D2CC"], dark: [] }, // dark filled from season
};

export function Medallion({ tiers, season, size = 300 }: {
  tiers: (Tier | null)[];
  season: { hi: string; b: string; sh: string };
  size?: number;
}) {
  const paths = useMemo(() => ({
    waves: Array.from({ length: 8 }, (_, k) => Skia.Path.MakeFromSVGString(waveStr(k))!),
    taijitu: Skia.Path.MakeFromSVGString(TAIJITU_STR)!,
    center: Skia.Path.MakeFromSVGString(CENTER_STR)!,
  }), []);
  const partDark = [season.hi, season.b, season.sh];
  const dark = (t: Tier) => (t === "part" ? partDark : METAL[t].dark);
  const light = (t: Tier) => METAL[t].light;
  const scale = size / 340;
  const hi = vec(C - 34, C - 46);

  const Piece = ({ clip, tier }: { clip: ReturnType<typeof Skia.Path.MakeFromSVGString>; tier: Tier | null }) => {
    if (!tier) return <Path path={clip!} color="#17181d" />;
    const lt = light(tier), dk = dark(tier);
    return (
      <Group clip={clip!}>
        <Circle cx={C} cy={C} r={R}><RadialGradient c={hi} r={R} colors={lt} /></Circle>
        <Group transform={[{ translateX: 2 * C }, { scaleX: -1 }]}>
          <Path path={paths.taijitu}><RadialGradient c={hi} r={R} colors={dk} /></Path>
        </Group>
        <Circle cx={C} cy={C - h} r={EYR} color={dk[1]} />
        <Circle cx={C} cy={C + h} r={EYR} color={lt[1]} />
      </Group>
    );
  };

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale }]}>
        <Circle cx={C} cy={C} r={R + 8} style="stroke" strokeWidth={9} color="#3a3320" />
        <Circle cx={C} cy={C} r={R + 8} style="stroke" strokeWidth={2} color="#5a4c2a" />
        {paths.waves.map((p, k) => <Piece key={k} clip={p} tier={tiers[k] ?? null} />)}
        <Piece clip={paths.center} tier="gold" />
      </Group>
    </Canvas>
  );
}
