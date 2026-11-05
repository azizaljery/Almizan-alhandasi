// تصاميم عملاء مختلفة (مولَّدة بأوامر المرسم نفسها) لاختبار تنوّع الواجهات.
import { createDoc, applyCommand } from '../../dist/draw/doc.mjs';
import { readFileSync } from 'node:fs';
import { sampleVilla } from '../../dist/draw/samples.mjs';
const run = (d, c) => applyCommand(d, c).doc;
function villa({ title, w, l, plot, entryX, wins = [], extra = [], levels = 1, back = [] }) {
  let d = createDoc({ title });
  d = run(d, { type: 'set-plot', polygon: plot, north: 0, entry: 's' });
  d = run(d, { type: 'add-walls', level: 'L1', points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }], closed: true, t: .25 });
  d = run(d, { type: 'add-wall', level: 'L1', a: { x: 0, y: l * .4 }, b: { x: w, y: l * .4 }, t: .12 });
  const at = (x, y) => d.walls.find(wl => Math.abs((wl.b.x - wl.a.x) * (y - wl.a.y) - (wl.b.y - wl.a.y) * (x - wl.a.x)) < 1e-6 && Math.min(wl.a.x, wl.b.x) - 1e-6 <= x && x <= Math.max(wl.a.x, wl.b.x) + 1e-6 && Math.min(wl.a.y, wl.b.y) - 1e-6 <= y && y <= Math.max(wl.a.y, wl.b.y) + 1e-6);
  const O = (x, y, kind, ex = {}) => { const wl = at(x, y); d = run(d, { type: 'add-opening', wall: wl.id, kind, at: Math.hypot(x - wl.a.x, y - wl.a.y), ...ex }); };
  O(entryX, 0, 'door2', { entry: true });
  for (const [x, k] of wins) O(x, 0, k);
  for (const [x, y, k] of extra) O(x, y, k);
  for (const [x, k] of back) O(x, l, k);
  for (let i = 1; i < levels; i++) d = run(d, { type: 'add-level', name: 'الدور ' + (i + 1) });
  return d;
}
export const DESIGNS = {
  c1: () => JSON.parse(readFileSync(new URL('../../dist/facade-j/facade-realism/C1.json', import.meta.url), 'utf8')),
  sample: () => sampleVilla(),
  narrowLeft: () => villa({ title: 'ضيّقة', w: 8, l: 16, plot: [{ x: -2, y: -3 }, { x: 10, y: -3 }, { x: 10, y: 19 }, { x: -2, y: 19 }], entryX: 1.6, wins: [[5.5, 'window']], back: [[2, 'window'], [6, 'window']] }),
  wideRight: () => villa({ title: 'عريضة', w: 18, l: 10, plot: [{ x: -3, y: -4 }, { x: 21, y: -4 }, { x: 21, y: 13 }, { x: -3, y: 13 }], entryX: 15, levels: 2, wins: [[2.5, 'window2'], [6.5, 'window2'], [10.5, 'window2'], [13, 'window']], back: [[3, 'window'], [9, 'window'], [14, 'window']] }),
  garageMid: () => villa({ title: 'مرآب', w: 11, l: 12, plot: [{ x: -2, y: -3 }, { x: 13, y: -3 }, { x: 13, y: 15 }, { x: -2, y: 15 }], entryX: 7, wins: [[2.7, 'garage'], [9.8, 'window']], back: [[3, 'window'], [8, 'window']] }),
  symmetric: () => villa({ title: 'متماثلة', w: 15, l: 13, plot: [{ x: -3, y: -3 }, { x: 18, y: -3 }, { x: 18, y: 16 }, { x: -3, y: 16 }], entryX: 7.5, levels: 2, wins: [[2.5, 'window2'], [5, 'window'], [10, 'window'], [12.5, 'window2']], back: [[3, 'window'], [7.5, 'window'], [12, 'window']] }),
};
export const designList = () => Object.entries(DESIGNS).map(([id, f]) => [id, f()]);
