// تحسين محدود للمرشحين الجدد فقط: باب تقديم في جدار مشترك فعلي.
// لا نقل جدران/غرف ولا تعديل تصميم مقفل، وكل اقتراح يُفحص مجددًا من هندسته الناتجة.
import { analyzeDoc } from '../draw/digest.mjs';
import { applyCommand } from '../draw/doc.mjs';
import { reviewDoc } from '../draw/review.mjs';
import { closestOnSegment, dist } from '../draw/geom.mjs';
import { evaluateSaudiQuality } from './saudi-quality.mjs';

export function improveServingDoors(doc, contract, { locks = [] } = {}) {
  if (locks.length || contract.diningService === false) return { doc, changes: [] };
  let current = doc; const changes = [];
  const forbidden = new Set(['SWING_BLOCKED', 'FIXTURE_OVERLAP', 'FIXTURE_OUTSIDE', 'OPENING_OVERLAP', 'OPENING_NEAR_END', 'OPENING_AT_JUNCTION']);
  const faults = d => reviewDoc(d).filter(i => i.severity === 'error' || forbidden.has(i.code));
  for (const type of ['kitchen', 'majlis']) {
    const model = analyzeDoc(current), lv = model.levels[0]; if (!lv) break;
    const before = evaluateSaudiQuality(current, contract), code = type === 'kitchen' ? 'kitchen-dining' : 'men-dining';
    if (!before.failed.includes(code)) continue;
    const dining = lv.rooms.filter(r => r.type === 'dining'), seeds = lv.rooms.filter(r => r.type === type && (type !== 'majlis' || /رجال/.test(r.name)));
    const banned = r => ['bedroom','master','bath','wc','service','storage','laundry','living','court','terrace'].includes(r.type) || (r.type==='majlis'&&!seeds.some(s=>s.id===r.id)) || (r.type==='kitchen'&&type!=='kitchen');
    // A guest foyer/service passage can be the missing link even when majlis and dining do not touch.
    const reached=new Set(seeds.map(r=>r.id)),queue=[...reached];
    while(queue.length){const id=queue.shift();for(const edge of lv.graph.get(id)||[]){const room=lv.roomsById.get(edge.to);if(room&&!banned(room)&&!reached.has(room.id)){reached.add(room.id);queue.push(room.id);}}}
    const from=lv.rooms.filter(r=>reached.has(r.id)&&r.type!=='dining');
    let accepted = false;
    for (const a of from) for (const b of dining) {
      if (accepted || lv.openings.some(o => o.door && o.sides.some(s => s.room.id === a.id) && o.sides.some(s => s.room.id === b.id))) continue;
      for (const edge of a.edges.filter(e => e.space === b.spaceId && e.length >= 1.5)) {
        if (accepted) break;
        for (const wall of lv.walls) {
          if (closestOnSegment(edge.a, wall.a, wall.b).dist > .01 || closestOnSegment(edge.b, wall.a, wall.b).dist > .01) continue;
          const width = .9, length = dist(edge.a, edge.b);
          for (const f of [.5, .3, .7]) {
            const p = { x: edge.a.x + f * (edge.b.x - edge.a.x), y: edge.a.y + f * (edge.b.y - edge.a.y) };
            if (Math.min(f, 1 - f) * length < width / 2 + .2) continue;
            try {
              const at = closestOnSegment(p, wall.a, wall.b).t * dist(wall.a, wall.b);
              const candidate = applyCommand(current, { type: 'add-opening', wall: wall.id, kind: 'door', at, w: width, h: 2.1 }).doc;
              const op = candidate.openings.at(-1);
              if (Math.abs(op.at - at) > .01) continue; // fitOpening must not silently move the intended service door.
              const resolved = analyzeDoc(candidate).levels[0].openings.find(o => o.id === op.id);
              if (!resolved?.sides.some(s => s.room.id === a.id) || !resolved.sides.some(s => s.room.id === b.id)) continue;
              const key = i => `${i.code}:${[...(i.targetIds || [])].sort().join(',')}`;
              const existingFaults = new Set(faults(current).map(key));
              if (faults(candidate).some(i => !existingFaults.has(key(i)))) continue;
              const after = evaluateSaudiQuality(candidate, contract);
              if (after.failed.includes(code) || after.failed.some(id => !before.failed.includes(id))) continue;
              changes.push({ openingId: op.id, wallId: wall.id, rooms: [a.id, b.id], reason: code, before: before.checks.find(c => c.id === code), after: after.checks.find(c => c.id === code) });
              current = candidate; accepted = true; break;
            } catch { /* no valid opening at this point; retain original */ }
          }
          if (accepted) break;
        }
      }
    }
  }
  return { doc: current, changes };
}
