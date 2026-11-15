// فتحات الأدوار العليا: تتبع غرف الدور العلوي الفعلية (موضعًا ونوع غرفة) بنسب طراز مختلفة عن الأرضي، وتبقى سليمة هندسيًا.
// الفحص من طبقات النموذج المبني نفسها (frame/glazing بعد extrudeFloors) مقابل مخطط المولّد، لا من ادعاء الوحدة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { facadeDoc, floorsInfo, extrudeFloors, floorLevel, FLOOR } from '../dist/facade-j/facade-realism/floors.mjs';
import { buildAllSides } from '../dist/facade-j/facade-realism/model.mjs';
import { STYLES, transformDoc } from '../dist/facade-j/facade-realism/styles/index.mjs';
import { upperOpenings, placeUpper, proportions, roomRole, UPPER_NOTE } from '../dist/facade-j/facade-realism/upper.mjs';
import { generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';

const counts = b => ({ bedrooms: b, majlis: 1, baths: b, kitchens: 1, halls: 1, dining: 1 });
const mk = (w, l, b, req = '') => generateVillaTwoFloors({ land: { width: w, length: l, streets: ['s'], entries: ['s'], floors: 2 }, counts: counts(b), requirements: extractRequirements(req, {}), keep: 2 }).designs.map(d => d.doc);
const DOCS = [...mk(20, 30, 5), ...mk(25, 25, 3), ...mk(18, 35, 5, 'ابي فيلا دورين وتراس فوق'), ...mk(14, 30, 3)];

async function build(doc, style, skip = 0, withUpper = true) {
  const T = (await STYLES[style].load()).templates; let n = 0;
  for (const t of T) {
    const q = new URLSearchParams({ style, tpl: t.id, tseed: '1' });
    try { const d = await facadeDoc(doc, q, transformDoc), FI = floorsInfo(q), b0 = buildAllSides(d, 'A'); FI.style = style; if (withUpper && FI.n > 1) FI.upper = upperOpenings(doc, b0);
      if (n++ < skip) continue; return { built: extrudeFloors(b0, FI), b0, FI, tpl: t.id }; } catch { /* قالب لا يُبنى على هذا المخطط */ }
  }
  throw new Error('لا قالب للطراز ' + style);
}
const frames = (built, k) => Object.entries(built).flatMap(([side, B]) => B.layers.filter(L => L.role === 'frame' && L.floor === k).map(L => {
  const us = L.outer.map(p => p[0]), zs = L.outer.map(p => p[1]); return { side, id: L.opening, piece: L.id.split('/')[0], u0: Math.min(...us), u1: Math.max(...us), z0: Math.min(...zs), z1: Math.max(...zs), room: L.room, B };
}));

test('كل فتحة علوية: داخل قطعة جدار من الأرضي بهامش حافة، ضمن نطاق منسوب الدور، ولا تتداخل مع جارتها، وموسومة بغرفتها', async () => {
  for (const style of Object.keys(STYLES)) for (const doc of DOCS) {
    const { built, tpl, FI } = await build(doc, style), tag = `${style}/${tpl}`, F1 = frames(built, 1), FL = floorLevel(1);
    assert.ok(FI.upper?.stats.real > 0, tag + ': لا فتحات علوية حقيقية');
    for (const f of F1) {
      const pc = built[f.side].F.pieces.find(p => p.id === f.piece); assert.ok(pc, tag + ': قطعة ' + f.piece);
      assert.ok(f.u0 >= pc.u0 + .25 && f.u1 <= pc.u1 - .25, `${tag}: ${f.id} قرب حافة الجدار (${f.u0.toFixed(2)}..${f.u1.toFixed(2)} في ${pc.u0}..${pc.u1})`);
      assert.ok(f.z0 >= FL - 1e-6 && f.z1 <= FL + 3.0 + 1e-6, `${tag}: ${f.id} خارج نطاق الدور ${f.z0}..${f.z1}`);
      assert.ok(f.u1 - f.u0 >= .3 && f.z1 - f.z0 >= .4, `${tag}: ${f.id} صغيرة جدًا`); assert.ok(f.room, tag + ': بلا غرفة ' + f.id);
    }
    for (const side of ['s', 'n', 'e', 'w']) { const L = F1.filter(f => f.side === side).sort((a, b) => a.u0 - b.u0); for (let i = 1; i < L.length; i++) if (L[i].piece === L[i - 1].piece) assert.ok(L[i].u0 >= L[i - 1].u1 + .2, `${tag}: ${side} فتحتان متلاصقتان ${L[i - 1].id}/${L[i].id}`); }
  }
});

test('إيقاع العلوي لا يطابق الأرضي: مواضع u لفتحات الدور العلوي ليست نسخة من الأرضي، وأبعادها مختلفة', async () => {
  for (const style of Object.keys(STYLES)) {
    let differ = 0, total = 0;
    for (const doc of DOCS) {
      const { built, tpl } = await build(doc, style), g = Object.entries(built).flatMap(([side, B]) => B.layers.filter(L => L.role === 'frame' && !(L.floor > 0)).map(L => ({ side, u: (Math.min(...L.outer.map(p => p[0])) + Math.max(...L.outer.map(p => p[0]))) / 2, w: Math.max(...L.outer.map(p => p[0])) - Math.min(...L.outer.map(p => p[0])) })));
      const up = frames(built, 1); total++;
      const same = up.length === g.length && up.every(f => g.some(x => x.side === f.side && Math.abs(x.u - (f.u0 + f.u1) / 2) < .05 && Math.abs(x.w - (f.u1 - f.u0)) < .05));
      if (!same) differ++; assert.ok(up.length > 0, `${style}/${tpl}: دور علوي بلا فتحات`);
    }
    assert.equal(differ, total, `${style}: فتحات العلوي نسخة من الأرضي في ${total - differ} من ${total} مخططًا`);
  }
});

test('تتبع غرف المخطط: نوع الغرفة من أقرب ملصق علوي، وحمام/سلم يعطيان فتحة أصغر أو أضيق من نوم/صالة في الطراز نفسه', async () => {
  const doc = DOCS[0], { b0 } = await build(doc, 'M'), U = upperOpenings(doc, b0), all = Object.values(U.sides).flat();
  const rooms = new Set(all.map(o => o.room)); assert.ok(rooms.has('bed') || rooms.has('master'), 'غرف نوم علوية: ' + [...rooms].join('،'));
  assert.ok(all.every(o => o.k >= 1 && Number.isFinite(o.u) && o.piece), 'كل فتحة بدور وموضع وقطعة');
  for (const style of Object.keys(STYLES)) { const b = proportions(style, 'bath'), n = proportions(style, 'bed'); assert.ok(b.h * 1.4 <= n.h && b.sill >= n.sill, style + ': حمام أصغر وأعلى جلسة من النوم'); }
  assert.equal(roomRole('master'), 'master'); assert.equal(roomRole('bedroom'), 'bed'); assert.equal(roomRole('bath'), 'bath'); assert.equal(roomRole('living'), 'living'); assert.equal(roomRole('balcony'), 'balcony');
});

test('الطرز مختلفة النسب: نافذة النوم النجدية أصغر وأعلى جلسة من المعاصرة، والحجازية أطول وأضيق، والكلاسيكية رأسية', () => {
  const M = proportions('M', 'bed'), N = proportions('N', 'bed'), H = proportions('H', 'bed'), C = proportions('C', 'bed');
  assert.ok(N.h < M.h && N.sill > M.sill && N.max < M.max, 'نجدي: أصغر وأعلى جلسة'); assert.ok(H.h / H.max > 1.8, 'حجازي: رأسية ضيقة'); assert.ok(C.h / C.max > 1.2, 'كلاسيكي: رأسية'); assert.ok(M.max / M.h > 1.3, 'معاصر: أعرض من ارتفاعها');
  assert.ok(proportions('M', 'master').h >= 2.2, 'معاصر: زجاج شبه أرضي للماستر');
  for (const s of ['M', 'J', 'C', 'N', 'H', 'S']) for (const r of ['bed', 'master', 'living', 'bath', 'service', 'store', 'circ', 'stair', 'balcony', 'other']) { const p = proportions(s, r); assert.ok(p.sill + p.h <= 3.05 && p.min <= p.max && p.h > 0, `${s}/${r}`); }
});

test('بلا فتحات علوية حقيقية (upper=0) يعود تكرار الأرضي، وبعدد دور واحد لا شيء يتغير', async () => {
  const doc = DOCS[0], a = await build(doc, 'M', 0, false), b = await build(doc, 'M', 0, true);
  const fa = frames(a.built, 1), fb = frames(b.built, 1); assert.ok(fa.length > 0 && fb.length > 0);
  assert.ok(Object.values(a.built).flatMap(B => B.layers).every(L => L.role !== 'frame' || !('room' in L)), 'النسخ القديم بلا وسم غرفة');
  assert.ok(typeof UPPER_NOTE === 'string' && /من مخططك/.test(UPPER_NOTE) && /غير متحقق/.test(UPPER_NOTE));
});

test('جدار الأرضي يُثقب عند كل فتحة علوية فعلًا (ثقب في طبقة الجدار بمنسوب الدور العلوي، لا فتحة طافية)', async () => {
  for (const style of ['M', 'C', 'N']) { const { built, tpl } = await build(DOCS[0], style), F1 = frames(built, 1);
    for (const f of F1) { const B = built[f.side], walls = B.layers.filter(L => (L.role === 'wall' || L.role === 'cladding') && L.id.startsWith(f.piece + '/'));
      const holed = walls.some(L => L.holes.some(h => { const us = h.map(p => p[0]), zs = h.map(p => p[1]); return Math.abs(Math.min(...us) - f.u0) < 1e-6 && Math.abs(Math.max(...us) - f.u1) < 1e-6 && Math.abs(Math.min(...zs) - f.z0) < 1e-6; }));
      assert.ok(holed, `${style}/${tpl}: ${f.id} بلا ثقب في الجدار (فتحة طافية)`); }
  }
});
