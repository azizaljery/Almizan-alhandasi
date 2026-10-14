// AUDIT probe: in REAL multi-engine runs, how often does AZIZ reject candidates as "Duplicate design",
// and do the dropped ones differ from the kept one in openings only?
import { defaultRooms, normalizeRooms, validatePlot } from '../../dist/planner.mjs';
import { runMultiEngineDesign } from '../../dist/multi-engine.mjs';
const plot = validatePlot({ width: 35, length: 45, entry: 's', streets: { s: true }, floors: 1, coverage: .75, streetSetback: 3, neighborSetback: 1.5 });
const rows = [];
for (const shape of ['rect', 'l', 'u']) for (const idea of ['', 'avoid long corridors']) for (const seed of [1, 2, 3]) {
  try {
    const out = await runMultiEngineDesign({ plot, rooms: normalizeRooms(defaultRooms()), selectedShape: shape, idea, seed });
    const az = out.aziz ?? out.decisionAziz ?? null;
    const rej = (az?.candidatesRejected ?? []);
    const dup = rej.filter((r) => /Duplicate design/.test(r.description));
    const byId = new Map(out.models.map((m) => [m.integration?.candidateId, m]));
    let openingsOnly = 0;
    for (const d of dup) {
      const keptId = /candidate (cand:[0-9a-f]+)/.exec(d.description)?.[1];
      const a = byId.get(d.candidateId), b = byId.get(keptId);
      if (a && b && JSON.stringify(a.rooms) === JSON.stringify(b.rooms) && JSON.stringify(a.openings) !== JSON.stringify(b.openings)) openingsOnly++;
    }
    rows.push({ shape, idea: idea || '-', seed, models: out.models.length, azizPresent: !!az, duplicateDesignRejections: dup.length, ofWhichOpeningsOnlyDifferent: openingsOnly });
  } catch (e) { rows.push({ shape, idea: idea || '-', seed, error: String(e.message).slice(0, 80) }); }
}
console.table(rows);
