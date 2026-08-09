import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, metalStops } from "@nmao/design-tokens";

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#FF2E3B", "#A32BF7", "#1F7BFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.spectrum}
      />
      <Text style={styles.title}>NMAO</Text>
      <Text style={styles.sub}>Competitor App · Phase 0</Text>
      <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.badge}>
        <Text style={styles.badgeText}>foundation online</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  spectrum: { height: 4, width: 200, borderRadius: 99, marginBottom: 22 },
  title: { color: neutrals.text, fontSize: 44, fontWeight: "600" },
  sub: { color: neutrals.muted, marginTop: 6 },
  badge: { marginTop: 24, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  badgeText: { color: "#141210", fontWeight: "700" },
});
