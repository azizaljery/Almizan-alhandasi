// النافذة لا تعبر ملتقى جدار داخلي بجدارها: كانت تنزلق إلى الغرفة المجاورة فتمر خلف القاطع، وتغطي باب المجلس في الواجهة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, fixWindowJunctions } from '../dist/villa-layout.mjs';
import { createDoc, applyCommand } from '../dist/draw/doc.mjs';

const crossings = doc => doc.openings.filter(o => /window/.test(o.kind)).filter(o => {
  const w = doc.walls.find(x => x.id === o.wall), len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len;
  return doc.walls.some(v => v !== w && v.level === w.level && v.kind !== 'fence' && [v.a, v.b].some(p => {
    const dx = p.x - w.a.x, dy = p.y - w.a.y, t = dx * ux + dy * uy, n = Math.abs(-dx * uy + dy * ux);
    return n < (w.t || .2) && t > o.at - o.w / 2 + .02 && t < o.at + o.w / 2 - .02;
  }));
}).map(o => o.id);

test('المولّد: لا نافذة تعبر ملتقى قاطع، في الدور الواحد والفناء والدورين', () => {
  const C = b => ({ bedrooms: b, majlis: 1, baths: b + 1, kitchens: 1, halls: 1, dining: 1 }), L = (w, l, f = 1) => ({ width: w, length: l, floors: f, streets: ['s'], entries: ['s'] });
  const docs = [
    ...generateVillaDesigns({ land: L(15, 25), counts: C(3), keep: 4 }).designs,
    ...generateVillaDesigns({ land: L(20, 30), counts: C(4), requirements: { prefs: { courtyard: true } }, keep: 4 }).designs,
    ...generateVillaTwoFloors({ land: L(20, 30, 2), counts: C(5), keep: 2 }).designs,
  ].map(d => d.doc);
  assert.ok(docs.length >= 6);
  for (const d of docs) assert.deepEqual(crossings(d), [], d.title);
});

test('الحارس الأخير: نافذة عابرة تُزاح داخل مقطعها، أو تُصغَّر، ولا تمس فتحة أخرى', () => {
  let doc = createDoc({ title: 't' }); const run = c => { const r = applyCommand(doc, c); doc = r.doc; return r.ids; };
  const [front] = run({ type: 'add-wall', level: 'L1', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, t: .25 });
  run({ type: 'add-wall', level: 'L1', a: { x: 4, y: 0 }, b: { x: 4, y: 5 }, t: .12 });
  const [o] = run({ type: 'add-opening', wall: front, kind: 'window2', at: 4.2, w: 2.2 }); // يعبر القاطع عند x = 4
  const fixed = fixWindowJunctions(doc), win = fixed.openings.find(x => x.id === o);
  assert.deepEqual(crossings(fixed), []);
  assert.ok(win && win.at - win.w / 2 >= 4 + .1 && win.w <= 2.2, JSON.stringify(win));
});
