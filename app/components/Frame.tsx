import { ReactNode } from "react";
import { View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { metalStops, hues, rarityStops, rarityBase, type Hue, type Rarity } from "@nmao/design-tokens";

// The collectible badge FRAME — a metallic rarity-colored border that rings a
// video / profile photo / avatar. The single primitive used across the Arena
// (ring), the vote queue (mini thumbs), the reveal face-off, and avatars.
//
//   <Frame rarity="legendary" size="ring" aspectRatio={16/9}><Video/></Frame>
//   <Frame hue="amethyst" size="mini"><Image/></Frame>
//
// size: "mini" = thin border (thumbs/avatars) · "ring" = thick sponsor-ready band.

type Size = "mini" | "ring";

export function Frame({
  rarity,
  hue,
  size = "mini",
  aspectRatio,
  radius,
  glow = true,
  fill = false,
  band,
  style,
  children,
}: {
  /** rarity → frame color (legendary gold · epic amethyst · rare sapphire · common steel) */
  rarity?: Rarity;
  /** explicit hue overrides rarity */
  hue?: Hue;
  size?: Size;
  aspectRatio?: number;
  radius?: number;
  glow?: boolean;
  /** stretch the frame to fill its parent (ignores aspectRatio) */
  fill?: boolean;
  /** override the border-band thickness (px) — wider = more room for sponsorship */
  band?: number;
  style?: ViewStyle;
  children?: ReactNode;
}) {
  const stops = hue ? metalStops(hue) : rarityStops(rarity ?? "legendary");
  const glowColor = hue ? hues[hue].base : rarityBase(rarity ?? "legendary");
  const pad = band ?? (size === "ring" ? 16 : 4);
  const r = radius ?? (size === "ring" ? 16 : 11);

  return (
    <View
      style={[
        glow && {
          shadowColor: glowColor,
          shadowOpacity: 0.6,
          shadowRadius: size === "ring" ? 26 : 12,
          shadowOffset: { width: 0, height: 0 },
        },
        fill && { flex: 1 },
        style,
      ]}
    >
      <LinearGradient
        colors={stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: pad, borderRadius: r, ...(fill && { flex: 1 }) }}
      >
        <View style={{ borderRadius: Math.max(2, r - pad + 1), overflow: "hidden", ...(fill ? { flex: 1 } : { aspectRatio }) }}>
          {children}
        </View>
      </LinearGradient>
    </View>
  );
}

export default Frame;
