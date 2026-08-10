// Sound is best-effort. We load expo-audio dynamically so a missing native
// module (e.g. running in plain Expo Go) can never crash the app — the ceremony
// always runs; sound is a bonus when the module exists (the dev build).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ExpoAudio: any = null;
try { ExpoAudio = require("expo-audio"); } catch { ExpoAudio = null; }

const FILES = {
  riser: require("../assets/sounds/riser.wav"),
  reveal: require("../assets/sounds/reveal.wav"),
  win: require("../assets/sounds/win.wav"),
  soft: require("../assets/sounds/soft.wav"),
};
type Key = keyof typeof FILES;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const players: Partial<Record<Key, any>> = {};
let ready = false;

export async function initSounds(): Promise<void> {
  if (ready || !ExpoAudio) return;
  try {
    await ExpoAudio.setAudioModeAsync({ playsInSilentMode: true });
    for (const k of Object.keys(FILES) as Key[]) {
      const p = ExpoAudio.createAudioPlayer(FILES[k]);
      p.volume = 0.9;
      players[k] = p;
    }
    ready = true;
  } catch { /* silent */ }
}

export async function play(key: Key): Promise<void> {
  if (!ExpoAudio) return;
  try {
    const p = players[key];
    if (p) { await p.seekTo(0); p.play(); }
  } catch { /* silent */ }
}

export async function unloadSounds(): Promise<void> {
  if (!ExpoAudio) return;
  try {
    for (const k of Object.keys(players) as Key[]) { players[k]?.remove(); delete players[k]; }
    ready = false;
  } catch { /* silent */ }
}

// True when real audio is available (the dev build) — lets the UI lean on sound.
export const soundAvailable = !!ExpoAudio;
