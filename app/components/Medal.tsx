import { View, Text, Image, ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { medalMetal, type MedalType } from "@nmao/design-tokens";

// A tournament medal. ASSET-SWAPPABLE: pass `source` (a require()'d PNG or a
// {uri} — the real CGI render / turntable frame) and it replaces the metallic
// placeholder with zero change to the surrounding lock-in effects.
//
//   <Medal type="gold" size={64} place={1} />
//   <Medal type="gold" source={require("../assets/medals/gold.png")} />

export function Medal({
  type,
  size = 60,
  place,
  ribbon = true,
  source,
}: {
  type: MedalType;
  size?: number;
  /** placement number engraved on the placeholder (1/2/3…); omit for participation */
  place?: number | null;
  ribbon?: boolean;
  source?: ImageSourcePropType;
}) {
  if (source) {
    return <Image source={source} style={{ width: size, height: size * 1.25 }} resizeMode="contain" />;
  }

  const stops = medalMetal[type];
  const glyph = place != null ? String(place) : type === "participation" ? "❋" : "★";

  return (
    <View style={{ alignItems: "center" }}>
      {ribbon ? (
        <View style={{ flexDirection: "row", height: size * 0.3, marginBottom: -size * 0.18, zIndex: 0 }}>
          <View style={{ width: size * 0.22, backgroundColor: "#B23433", transform: [{ skewX: "11deg" }], borderRadius: 2 }} />
          <View style={{ width: size * 0.22, backgroundColor: "#2F6FB6", transform: [{ skewX: "-11deg" }], borderRadius: 2 }} />
        </View>
      ) : null}

      <View
        style={{
          shadowColor: stops[1],
          shadowOpacity: 0.6,
          shadowRadius: size * 0.34,
          shadowOffset: { width: 0, height: 0 },
          zIndex: 1,
        }}
      >
        <LinearGradient
          colors={stops}
          start={{ x: 0.34, y: 0 }}
          end={{ x: 0.66, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* engraved rim */}
          <View
            style={{
              position: "absolute",
              width: size * 0.82,
              height: size * 0.82,
              borderRadius: size * 0.41,
              borderWidth: 1.5,
              borderColor: "rgba(0,0,0,0.22)",
            }}
          />
          <Text style={{ fontSize: size * 0.4, color: "rgba(0,0,0,0.5)", fontWeight: "900" }}>{glyph}</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

export default Medal;
