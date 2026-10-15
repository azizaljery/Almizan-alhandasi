// تصدير DXF للمرسم: نُقل حرفيًا من studio.mjs إلى وحدة مشتركة بلا أي تغيير في السلوك (نقي: بلا DOM).
// الوحدة بالمليمتر، وطبقة لكل دور: <الدور>_WALLS / _FURNITURE / _WINDOWS / _DOORS.
import { wallRect, fixtureRect } from './review.mjs';

export function toDxf(doc) {
  const out = ['0', 'SECTION', '2', 'ENTITIES'], mm = v => (v * 1000).toFixed(1);
  const line = (layer, a, b) => out.push('0', 'LINE', '8', layer, '10', mm(a.x), '20', mm(a.y), '30', '0', '11', mm(b.x), '21', mm(b.y), '31', '0');
  const poly = (layer, p) => p.forEach((q, i) => line(layer, q, p[(i + 1) % p.length]));
  for (const lv of doc.levels) {
    const pre = lv.id + '_';
    for (const w of doc.walls) if (w.level === lv.id) poly(pre + 'WALLS', wallRect(w));
    for (const f of doc.fixtures) if (f.level === lv.id) poly(pre + 'FURNITURE', fixtureRect(f));
    for (const o of doc.openings) if (o.level === lv.id) { const w = doc.walls.find(x => x.id === o.wall); if (!w) continue; const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }; line(pre + (o.kind.startsWith('window') ? 'WINDOWS' : 'DOORS'), { x: w.a.x + u.x * (o.at - o.w / 2), y: w.a.y + u.y * (o.at - o.w / 2) }, { x: w.a.x + u.x * (o.at + o.w / 2), y: w.a.y + u.y * (o.at + o.w / 2) }); }
  }
  out.push('0', 'ENDSEC', '0', 'EOF'); return out.join('\n');
}
export default { toDxf };
