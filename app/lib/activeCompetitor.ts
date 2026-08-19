import { useEffect, useState } from "react";
import { myCompetitors, type MyCompetitor } from "./competitors";

// Shared "active competitor" so a guardian with more than one ward sees the SAME
// child across every tab (Duel, Honors, Profile, Compete). Previously each screen
// used myCompetitors()[0], so a parent's second child was unreachable.
let _activeId: string | null = null;
const _subs = new Set<() => void>();

export function setActiveCompetitorId(id: string | null) { _activeId = id; _subs.forEach((f) => f()); }
export function getActiveCompetitorId() { return _activeId; }

export function useActiveCompetitor(): { comps: MyCompetitor[]; activeId: string | null; setActive: (id: string) => void } {
  const [comps, setComps] = useState<MyCompetitor[]>([]);
  const [active, setActive] = useState<string | null>(_activeId);
  useEffect(() => {
    let alive = true;
    const sync = () => setActive(_activeId);
    _subs.add(sync);
    myCompetitors().then((rows) => {
      if (!alive) return;
      setComps(rows);
      if (!_activeId && rows[0]) setActiveCompetitorId(rows[0].id); // seed to first ward
      else sync();
    });
    return () => { alive = false; _subs.delete(sync); };
  }, []);
  return { comps, activeId: active, setActive: setActiveCompetitorId };
}
