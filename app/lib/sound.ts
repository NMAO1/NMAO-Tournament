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

// Toggle whether sounds play through the phone's silent switch. The monthly
// ceremony wants true (a showpiece); the duel reveal sets false on entry and
// restores true on exit, so it respects silent mode without changing the default.
export async function setPlaysInSilentMode(v: boolean): Promise<void> {
  if (!ExpoAudio) return;
  try { await ExpoAudio.setAudioModeAsync({ playsInSilentMode: v }); } catch { /* silent */ }
}

export async function play(key: Key): Promise<void> {
  if (!ExpoAudio) return;
  try {
    const p = players[key];
    if (p) { await p.seekTo(0); p.play(); }
  } catch { /* silent */ }
}

// Streamed soundtrack (monthly reveal) — a remote MP3 from the reveal-music
// bucket, looped low under the ceremony. Best-effort: no network / no module =
// the ceremony just runs silent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let musicPlayer: any = null;
let musicGen = 0; // guards the async start: a stop or newer start supersedes an in-flight one
function stopMusicSync(): void {
  try { if (musicPlayer) { musicPlayer.remove(); musicPlayer = null; } } catch { /* silent */ }
}
export async function startMusic(url: string | null, volume = 0.7): Promise<void> {
  if (!ExpoAudio || !url) return;
  const gen = ++musicGen;
  try {
    await ExpoAudio.setAudioModeAsync({ playsInSilentMode: true });
    if (gen !== musicGen) return;             // stopped/superseded while awaiting the audio mode
    stopMusicSync();
    const p = ExpoAudio.createAudioPlayer({ uri: url });
    p.loop = true;
    p.volume = volume;
    musicPlayer = p;
    if (gen !== musicGen) { stopMusicSync(); return; } // stopped after the player was created
    p.play();
  } catch { /* silent */ }
}
export async function stopMusic(): Promise<void> { musicGen++; stopMusicSync(); }

// Gentle fade to silence, then release — the ceremony's score resolves with the
// finale instead of hard-cutting or looping on. Aborts if a stop / new start
// supersedes it mid-fade (so it can never resurrect a stopped track).
export function fadeOutMusic(ms = 900): void {
  if (!ExpoAudio || !musicPlayer) return;
  const p = musicPlayer;
  const gen = musicGen;
  const startVol = typeof p.volume === "number" ? p.volume : 0.7;
  const steps = 16;
  let i = 0;
  const iv = setInterval(() => {
    i++;
    if (musicPlayer !== p || gen !== musicGen) { clearInterval(iv); return; } // superseded/stopped elsewhere
    try { p.volume = Math.max(0, startVol * (1 - i / steps)); } catch { /* silent */ }
    if (i >= steps) {
      clearInterval(iv);
      try { p.remove(); } catch { /* silent */ }
      if (musicPlayer === p) musicPlayer = null;
    }
  }, Math.max(24, Math.floor(ms / steps)));
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
