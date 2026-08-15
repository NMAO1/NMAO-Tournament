import { View, StyleSheet } from "react-native";
import { Canvas, Image as SkImage, useImage, ColorMatrix, Group, Circle, Blur, Paint, vec, useClock } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

// The MJ silver dragon (a luminance master) tinted to any season color and set
// into the frame's bottom band with subtle life — a slow breath, an aura glow,
// and a flickering eye. One image → every season.
export type DragonTint = "silver" | "gold" | "sapphire" | "amethyst" | "ruby" | "emerald" | "coral" | "onyx" | "rose" | "turquoise" | "peridot" | "platinum";
const TINT: Record<DragonTint, [number, number, number]> = {
  silver: [1, 1, 1], gold: [1.18, 0.86, 0.34],
  sapphire: [0.28, 0.55, 1.18], amethyst: [0.8, 0.42, 1.18], ruby: [1.18, 0.28, 0.42],
  emerald: [0.25, 1.08, 0.6], coral: [1.2, 0.6, 0.45], onyx: [0.72, 0.74, 0.84],
  rose: [1.2, 0.5, 0.84], turquoise: [0.25, 1.02, 0.96], peridot: [0.8, 1.1, 0.32], platinum: [0.96, 0.99, 1.08],
};
const mat = ([r, g, b]: [number, number, number]) => [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];

export function DragonBand({ w = 360, h = 210, tint = "silver", border = "#c7cdd6" }: { w?: number; h?: number; tint?: DragonTint; border?: string }) {
  const img = useImage(require("../assets/dragon-silver.png"));
  const clock = useClock();
  const aspect = 821 / 900;
  const dw = w * 1.02;
  const dh = dw * aspect;
  const dx = (w - dw) / 2;
  const dy = h - dh * 0.66;            // dragon sits low, head rises into the frame
  const cxg = w / 2, cyg = dy + dh / 2;
  const eyeX = dx + dw * 0.83, eyeY = dy + dh * 0.22;
  const m = mat(TINT[tint]);
  const breathe = useDerivedValue(() => [{ scale: 1 + 0.016 * Math.sin(clock.value / 1500) }]);
  const auraOp = useDerivedValue(() => 0.3 + 0.2 * Math.sin(clock.value / 1000));
  const eyeOp = useDerivedValue(() => 0.45 + 0.55 * Math.abs(Math.sin(clock.value / 700)));
  return (
    <View style={{ width: w, height: h, borderRadius: 16, overflow: "hidden", backgroundColor: "#0c0a08", borderWidth: 2, borderColor: border }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group origin={vec(cxg, cyg)} transform={breathe}>
          {/* soft aura behind */}
          <Group layer={<Paint opacity={auraOp}><Blur blur={13} /></Paint>}>
            <SkImage image={img} x={dx} y={dy} width={dw} height={dh} fit="contain"><ColorMatrix matrix={m} /></SkImage>
          </Group>
          {/* crisp dragon */}
          <SkImage image={img} x={dx} y={dy} width={dw} height={dh} fit="contain"><ColorMatrix matrix={m} /></SkImage>
          {/* fiery eye glint */}
          <Circle cx={eyeX} cy={eyeY} r={5} color="#ff8a1e" opacity={eyeOp} />
          <Circle cx={eyeX} cy={eyeY} r={2.4} color="#fff2b0" opacity={eyeOp} />
        </Group>
      </Canvas>
    </View>
  );
}
