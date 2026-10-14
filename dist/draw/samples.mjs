// Ready-made drawings: used by the "start from an example" button, by tests and by the 3D / assistant work.
import { createDoc, applyCommand } from './doc.mjs';

const run = (doc, command) => applyCommand(doc, command);

/** A compact two-storey-ready villa ground floor (about 12 x 14 m), drawn with the same commands a user would use. */
export function sampleVilla() {
  let d = createDoc({ title: 'فيلا نموذجية' });
  d = run(d, { type: 'set-plot', polygon: [{ x: -2, y: -3 }, { x: 14, y: -3 }, { x: 14, y: 17 }, { x: -2, y: 17 }], north: 0, entry: 's' }).doc;
  // outer shell 12 x 14
  d = run(d, { type: 'add-walls', level: 'L1', points: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 14 }, { x: 0, y: 14 }], closed: true, t: .25 }).doc;
  // partitions
  const P = (ax, ay, bx, by) => { d = run(d, { type: 'add-wall', level: 'L1', a: { x: ax, y: ay }, b: { x: bx, y: by }, t: .12 }).doc; };
  P(0, 5, 12, 5);       // front zone / back zone
  P(6, 0, 6, 5);        // majlis | entrance + stairs
  P(7.5, 5, 7.5, 14);   // sleeping wing | living
  P(0, 9.5, 7.5, 9.5);  // bedroom row split
  P(3.8, 9.5, 3.8, 14); // bedroom 2 | bedroom 3
  P(7.5, 8, 12, 8);     // living | kitchen
  P(9.8, 8, 9.8, 14);   // kitchen | bath/laundry strip
  P(9.8, 11, 12, 11);   // bath | laundry
  const label = (x, y, name, roomType) => { d = run(d, { type: 'add-label', level: 'L1', name, roomType, seed: { x, y } }).doc; };
  label(3, 2.5, 'مجلس الرجال', 'majlis');
  label(9, 2.5, 'المدخل', 'entrance');
  label(3.7, 7.2, 'ممر', 'corridor');
  label(9.7, 6.5, 'صالة المعيشة', 'living');
  label(8.6, 11, 'المطبخ', 'kitchen');
  label(11, 9.5, 'دورة مياه', 'bath');
  label(11, 12.5, 'غسيل', 'laundry');
  label(3.7, 11.7, 'غرفة نوم رئيسية', 'master');
  label(5.8, 11.7, 'غرفة نوم 2', 'bedroom');
  // openings are placed by a point on the wall, so the drawing does not depend on how each wall was oriented
  const wallAt = (x, y) => d.walls.find(w => w.level === 'L1' && Math.abs((w.b.x - w.a.x) * (y - w.a.y) - (w.b.y - w.a.y) * (x - w.a.x)) < 1e-6 && Math.min(w.a.x, w.b.x) - 1e-6 <= x && x <= Math.max(w.a.x, w.b.x) + 1e-6 && Math.min(w.a.y, w.b.y) - 1e-6 <= y && y <= Math.max(w.a.y, w.b.y) + 1e-6);
  const W = (x, y, kind, extra = {}) => { const w = wallAt(x, y); d = run(d, { type: 'add-opening', wall: w.id, kind, at: Math.hypot(x - w.a.x, y - w.a.y), ...extra }).doc; };
  W(9, 0, 'door2', { entry: true });    // main entrance (south) into the entrance hall
  W(3, 0, 'window2');                    // majlis window
  W(6, 2.5, 'arch');                     // majlis <-> entrance
  W(5.6, 5, 'door');                     // majlis side <-> corridor
  W(9, 5, 'door');                       // entrance -> living
  W(7.5, 7.5, 'door');                   // living <-> west wing corridor
  W(12, 3, 'window'); W(12, 6.5, 'window2'); W(12, 9.5, 'window'); W(12, 12.5, 'window');
  W(0, 11.5, 'window'); W(0, 7, 'window');
  W(2, 14, 'window2'); W(5.5, 14, 'window'); W(8.7, 14, 'window'); W(11, 14, 'window');
  W(3.7, 9.5, 'door'); W(5.6, 9.5, 'door');   // corridor -> bedrooms
  W(11, 8, 'door');                            // living -> bath corridor... (kitchen strip)
  W(9.8, 9.5, 'door');                         // kitchen -> bath
  d = run(d, { type: 'add-stair', level: 'L1', x: 8.2, y: 1.2, rot: 0, kind: 'straight', w: 1.1, run: 3.2 }).doc;
  const F = (kind, x, y, rot = 0) => { d = run(d, { type: 'add-fixture', level: 'L1', kind, x, y, rot }).doc; };
  F('majlis-sofa', 3, .9); F('majlis-sofa', .8, 2.5, Math.PI / 2); F('majlis-sofa', 5.2, 2.5, -Math.PI / 2); F('coffee-table', 3, 2.5);
  F('sofa-3', 10, 6.1); F('tv-unit', 9.7, 7.6, Math.PI); F('rug', 9.7, 6.8);
  F('kitchen-run', 8.9, 8.4); F('fridge', 9.2, 13.4); F('dining-table', 8.6, 11.2);
  F('wc', 10.4, 9.0); F('basin', 11.3, 9.4); F('shower', 11.4, 10.4);
  F('washing-machine', 10.4, 13.3);
  F('bed-double', 2.0, 12.5, 0); F('wardrobe', 1.2, 10.1); F('nightstand', .7, 12.8);
  F('bed-single', 5.6, 12.6); F('wardrobe', 5, 10.1);
  return d;
}

export const SAMPLES = Object.freeze({ villa: { ar: 'فيلا من دور واحد (مثال)', build: sampleVilla } });
export default { sampleVilla, SAMPLES };
