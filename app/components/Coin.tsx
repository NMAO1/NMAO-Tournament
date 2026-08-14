import { View, Image, ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// The shiny gold NMAO coin (monthly-reveal opener). ASSET-SWAPPABLE: pass
// `source` with the real high-res NMAO logo (transparent PNG/SVG-exported) and
// it renders in place of the metallic placeholder. The regal title
// (National Martial Arts Organization · Tournament of Champions · Season/Round)
// is rendered ABOVE the coin by the reveal, not on it.

export function Coin({ size = 104, source }: { size?: number; source?: ImageSourcePropType }) {
  if (source) {
    return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
  }
  return (
    <View
      style={{
        shadowColor: "#E6B93F",
        shadowOpacity: 0.6,
        shadowRadius: size * 0.45,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <LinearGradient
        colors={["#FFF7D6", "#E4AE3C", "#7A5A18"]}
        start={{ x: 0.35, y: 0 }}
        end={{ x: 0.65, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}
      >
        {/* dark inset face */}
        <View
          style={{
            width: size * 0.74,
            height: size * 0.74,
            borderRadius: size * 0.37,
            backgroundColor: "#0b0906",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: "rgba(230,185,63,0.5)",
          }}
        >
          {/* placeholder crest — a gold ring, awaiting the real logo art */}
          <View
            style={{
              width: size * 0.34,
              height: size * 0.34,
              borderRadius: size * 0.17,
              borderWidth: 3,
              borderColor: "#EFC24E",
            }}
          />
        </View>
      </LinearGradient>
    </View>
  );
}

export default Coin;
