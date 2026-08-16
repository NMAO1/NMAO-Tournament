import { Text, type TextStyle, type StyleProp } from "react-native";
import { spectrumStops } from "@nmao/design-tokens";

// Cascading-spectrum text — each character is colored along the app's spectrum
// (red → magenta → purple → blue), so a word reads as a gradient without a
// native gradient/mask. The outer style carries font/size/weight/spacing.
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function colorAt(t: number): string {
  const s = spectrumStops as readonly string[];
  const seg = Math.max(0, Math.min(1, t)) * (s.length - 1);
  const i = Math.min(s.length - 2, Math.floor(seg));
  const f = seg - i;
  const [r1, g1, b1] = rgb(s[i]); const [r2, g2, b2] = rgb(s[i + 1]);
  const l = (a: number, b: number) => Math.round(a + (b - a) * f);
  return `rgb(${l(r1, r2)},${l(g1, g2)},${l(b1, b2)})`;
}
export function SpectrumText({ children, style, numberOfLines }: { children: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const chars = [...children];
  const n = chars.length;
  // spread the cascade across the visible (non-space) run so spaces don't waste hue
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {chars.map((c, i) => (
        <Text key={i} style={{ color: colorAt(n <= 1 ? 0.5 : i / (n - 1)) }}>{c}</Text>
      ))}
    </Text>
  );
}
