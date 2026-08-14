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
  style?: ViewStyle;
  children?: ReactNode;
}) {
  const stops = hue ? metalStops(hue) : rarityStops(rarity ?? "legendary");
  const glowColor = hue ? hues[hue].base : rarityBase(rarity ?? "legendary");
  const pad = size === "ring" ? 16 : 4;
  const r = radius ?? (size === "ring" ? 16 : 11);

  return (
    <View
      style={[
        glow && {
          shadowColor: glowColor,
          shadowOpacity: 0.55,
          shadowRadius: size === "ring" ? 22 : 12,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      <LinearGradient
        colors={stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: pad, borderRadius: r }}
      >
        <View style={{ borderRadius: Math.max(2, r - pad + 1), overflow: "hidden", aspectRatio }}>
          {children}
        </View>
      </LinearGradient>
    </View>
  );
}

export default Frame;
