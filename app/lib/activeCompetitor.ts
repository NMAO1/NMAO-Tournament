import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { myCompetitors, type MyCompetitor } from "./competitors";

// Shared "active competitor" so a guardian with more than one child sees the SAME
// competitor across every tab (Duel, Honors, Profile, Compete, Leaderboard).
// State lives at module scope so every screen reads one source of truth; the
// chosen child is persisted (SecureStore) so it survives an app restart, and the
// roster can be reloaded in place (e.g. after a parent adds another child).
const KEY = "nmao_active_competitor_v1";

let _activeId: string | null = null;
let _comps: MyCompetitor[] = [];
let _ready = false;
let _loading: Promise<void> | null = null;
const _subs = new Set<() => void>();
const notify = () => _subs.forEach((f) => f());

export function getActiveCompetitorId() { return _activeId; }

export function setActiveCompetitorId(id: string | null) {
  _activeId = id;
  notify();
  SecureStore.setItemAsync(KEY, id ?? "").catch(() => { /* non-fatal */ });
}

async function load(force = false): Promise<void> {
  if (_loading && !force) return _loading;
  _loading = (async () => {
    const rows = await myCompetitors().catch(() => [] as MyCompetitor[]);
    _comps = rows;
    // Restore the persisted child if it's still one of ours; otherwise keep a
    // valid current selection, else fall back to the first child.
    if (!_activeId) {
      let saved: string | null = null;
      try { saved = (await SecureStore.getItemAsync(KEY)) || null; } catch { /* ignore */ }
      if (saved && rows.some((r) => r.id === saved)) _activeId = saved;
    }
    if (_activeId && !rows.some((r) => r.id === _activeId)) _activeId = null; // stale (e.g. removed)
    if (!_activeId && rows[0]) setActiveCompetitorId(rows[0].id);
    _ready = true;
    notify();
  })();
  return _loading;
}

// Re-fetch the roster in place and notify every consumer — call after a parent
// adds (or removes) a child so the switcher + all tabs pick it up without a restart.
export async function reloadCompetitors(): Promise<MyCompetitor[]> {
  _loading = null;
  await load(true);
  return _comps;
}

export function useActiveCompetitor(): {
  comps: MyCompetitor[]; activeId: string | null; ready: boolean;
  setActive: (id: string) => void; reload: () => Promise<MyCompetitor[]>;
} {
  const [, setTick] = useState(0);
  useEffect(() => {
    const sync = () => setTick((t) => t + 1);
    _subs.add(sync);
    if (!_ready) load();
    return () => { _subs.delete(sync); };
  }, []);
  return { comps: _comps, activeId: _activeId, ready: _ready, setActive: setActiveCompetitorId, reload: reloadCompetitors };
}
