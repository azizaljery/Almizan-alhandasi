// Architectural identity, independent of names, IDs, furniture, position, scale,
// reflection and quarter-turns. These are product matching rules, not a legal test.
import { analyzeDoc } from './draw/digest.mjs';

export const SIGNATURE_POLICY = 'mizan-delivery/1';
export const COPY_LIMIT = .90;
const round = n => Math.round(n * 10000) / 10000;
const turn = (x, y, k) => { if (k >= 4) x = -x; for (let j = 0; j < k % 4; j++) [x, y] = [-y, x]; return [x, y]; };

export function designSignature(doc) {
  const model = analyzeDoc(doc);
  const levels = model.levels.filter(l => l.rooms.length).sort((a, b) => a.level.elevation - b.level.elevation);
  if (!levels.length || levels.length > 3 || levels.some(l => l.rooms.length > 100)) throw Error('لا يمكن توثيق بصمة هذا المخطط؛ راجع الفراغات وحدودها.');
  const variants = [];
  for (let k = 0; k < 8; k++) {
    const floor = levels.map(l => {
      const rooms = l.rooms.filter(r => r.type !== 'outdoor').map(r => ({ type: r.type, area: r.area, poly: r.net.map(p => turn(p.x, p.y, k)) }));
      const pts = rooms.flatMap(r => r.poly);
      if (!pts.length) throw Error('المخطط لا يحتوي على فراغات داخلية مغلقة.');
      const x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1]));
      const scale = Math.max(Math.max(...pts.map(p => p[0])) - x0, Math.max(...pts.map(p => p[1])) - y0);
      if (!(scale > .1)) throw Error('أبعاد المخطط غير صالحة.');
      return rooms.map(r => {
        const poly = r.poly.map(([x, y]) => [round((x - x0) / scale), round((y - y0) / scale)]);
        const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
        const loX = Math.min(...xs), hiX = Math.max(...xs), loY = Math.min(...ys), hiY = Math.max(...ys);
        return { type: r.type, x: round((loX + hiX) / 2), y: round((loY + hiY) / 2), w: round(hiX - loX), h: round(hiY - loY), area: round(r.area / (scale * scale)), poly: poly.sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
      }).sort((a, b) => a.x - b.x || a.y - b.y || a.w - b.w || a.h - b.h);
    });
    variants.push(floor);
  }
  // Room types are deliberately absent from the exact key: relabelling a room
  // cannot release an already delivered geometry.
  const geometry = v => JSON.stringify(v.map(l => l.map(r => r.poly).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))));
  const key = variants.map(geometry).sort()[0];
  return { policy: SIGNATURE_POLICY, variants, key };
}

function floorSimilarity(a, b) {
  if (!a?.length || !b?.length) return 0;
  const pairs = [];
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const A = a[i], B = b[j];
    const position = Math.max(0, 1 - Math.hypot(A.x - B.x, A.y - B.y) / .25);
    const size = Math.min(A.w, B.w) / Math.max(A.w, B.w, .0001) * Math.min(A.h, B.h) / Math.max(A.h, B.h, .0001);
    // Geometry dominates: changing a room's function cannot disguise a copy.
    const area = Math.min(A.area, B.area) / Math.max(A.area, B.area, .0001);
    pairs.push({ i, j, score: .6 * position + .25 * size + .13 * area + .02 * Number(A.type === B.type) });
  }
  pairs.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
  const usedA = new Set(), usedB = new Set(); let total = 0;
  for (const p of pairs) if (!usedA.has(p.i) && !usedB.has(p.j)) { usedA.add(p.i); usedB.add(p.j); total += p.score; }
  return total / Math.max(a.length, b.length);
}

export function signatureSimilarity(a, b) {
  if (a.policy !== SIGNATURE_POLICY || b.policy !== SIGNATURE_POLICY) throw Error('إصدار بصمة غير مدعوم.');
  let whole = 0, ground = 0;
  const ref = b.variants[0];
  for (const v of a.variants) {
    const scores = v.map((l, i) => floorSimilarity(l, ref[i]));
    whole = Math.max(whole, scores.reduce((s, n) => s + n, 0) / Math.max(v.length, ref.length));
    ground = Math.max(ground, scores[0] || 0);
  }
  return { whole, ground, copy: a.key === b.key || whole >= COPY_LIMIT || (Math.min(a.variants[0][0].length, ref[0].length) >= 6 && ground >= .96) };
}
