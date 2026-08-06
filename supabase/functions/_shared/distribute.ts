// =====================================================================
// NMAO Tournament Engine — distribute core (pipeline step 6.8)
// Pure, DB-free, deterministic.
//
// Builds the medal ship list: one grouped shipment per school. Every
// competitor who competed gets the collectible interlocking segment
// ('participation'); pod placements 1/2/3 additionally get gold/silver/
// bronze. Schools are shipped one box for the instructor to hand out.
// =====================================================================

export type ResultRow = {
  entryId: string;
  competitorId: string;
  competitorName: string;
  schoolId: string;
  event: string;
  placement: number; // within-pod placement from resolvePod
};

export type MedalType = 'gold' | 'silver' | 'bronze' | 'participation';

export type ShipItem = {
  competitorId: string;
  competitorName: string;
  event: string;
  placement: number;
  medals: MedalType[]; // always includes 'participation'; plus a placement medal for top 3
};

export type SchoolShipment = {
  schoolId: string;
  schoolName: string;
  address: unknown;
  itemCount: number;
  items: ShipItem[];
};

export type ShipList = {
  shipments: SchoolShipment[];
  totalMedals: number;
};

const PLACEMENT_MEDAL: Record<number, MedalType> = { 1: 'gold', 2: 'silver', 3: 'bronze' };

export function buildShipList(
  results: ResultRow[],
  schools: Record<string, { name: string; address?: unknown }>,
): ShipList {
  const bySchool = new Map<string, ShipItem[]>();

  for (const r of results) {
    const medals: MedalType[] = ['participation'];
    const placementMedal = PLACEMENT_MEDAL[r.placement];
    if (placementMedal) medals.push(placementMedal);

    const item: ShipItem = {
      competitorId: r.competitorId,
      competitorName: r.competitorName,
      event: r.event,
      placement: r.placement,
      medals,
    };
    if (!bySchool.has(r.schoolId)) bySchool.set(r.schoolId, []);
    bySchool.get(r.schoolId)!.push(item);
  }

  const shipments: SchoolShipment[] = [...bySchool.keys()]
    .sort()
    .map((schoolId) => {
      const items = bySchool
        .get(schoolId)!
        .sort(
          (a, b) =>
            a.competitorName.localeCompare(b.competitorName) ||
            a.event.localeCompare(b.event),
        );
      const meta = schools[schoolId] ?? { name: schoolId, address: null };
      const itemCount = items.reduce((s, it) => s + it.medals.length, 0);
      return {
        schoolId,
        schoolName: meta.name,
        address: meta.address ?? null,
        itemCount,
        items,
      };
    });

  const totalMedals = shipments.reduce((s, sh) => s + sh.itemCount, 0);
  return { shipments, totalMedals };
}
