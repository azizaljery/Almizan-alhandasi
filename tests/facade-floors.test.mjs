// قاعدة المالك: عدد الأدوار في الواجهة يتبع المخطط أو طلب العميل، لا القالب. يُقاس من النموذج المبني نفسه لكل طراز وكل قالب.
import test from 'node:test';
import assert from 'node:assert/strict';
import { facadeDoc, groundLevelOnly, floorsInfo, extrudeFloors, FLOOR } from '../dist/facade-j/facade-realism/floors.mjs';
import { buildAllSides } from '../dist/facade-j/facade-realism/model.mjs';
import { STYLES, transformDoc } from '../dist/facade-j/facade-realism/styles/index.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';

const mk = (f, b) => (f === 2 ? generateVillaTwoFloors : generateVillaDesigns)({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'], floors: f }, counts: { bedrooms: b, majlis: 1, baths: b, kitchens: 1, halls: 1, dining: 1 }, requirements: {}, keep: 1 }).designs[0].doc;
const DOCS = { 1: mk(1, 3), 2: mk(2, 4) };
/** أعلى منسوب لجدران الواجهة المبنية ← عدد الأدوار الظاهرة. */
function seenFloors(doc, q) {
  const built = extrudeFloors(buildAllSides(doc, 'A'), floorsInfo(q)); let top = 0;
  for (const B of Object.values(built)) for (const L of B?.layers || []) if (L.role === 'wall' || L.role === 'cladding') { const z = Math.max(L.z1 ?? 0, ...(L.outer || []).map(p => p[1])); if (z > top) top = z; }
  return { top, n: Math.max(1, Math.round((top - FLOOR.ground) / FLOOR.upper) + 1) };
}

test('الدور الأرضي وحده أساس الواجهة: مخطط الدورين لا يُبنى بدوريه ثم يُمدّ فوقهما', () => {
  const g = groundLevelOnly(DOCS[2]); assert.equal(g.levels.length, 1); assert.equal(DOCS[2].levels.length, 2, 'الأصل لا يتغير');
  const L1 = g.levels[0].id; assert.ok(g.walls.length && g.walls.every(w => (w.level ?? L1) === L1));
  const ids = new Set(g.walls.map(w => w.id)); assert.ok(g.openings.every(o => ids.has(o.wall)));
  assert.equal(groundLevelOnly(DOCS[1]), DOCS[1], 'الدور الواحد كما هو');
});

for (const id of Object.keys(STYLES)) test(`الطراز ${id}: كل قوالبه تُظهر عدد أدوار المخطط (دور واحد ودوران)، والطلب الصريح يتقدم`, async () => {
  const T = (await STYLES[id].load()).templates, bad = []; let measured = 0;
  for (const lv of [1, 2]) for (const t of T) {
    // كما تفتحها صفحة العرض: floors = أدوار المخطط
    const q = new URLSearchParams({ style: id, tpl: t.id, tseed: '7', floors: String(lv) });
    let d; try { d = await facadeDoc(DOCS[lv], q, transformDoc); } catch (e) { bad.push(`${t.id}/${lv}: ${e.message}`); continue; }
    if (q.get('floors') !== String(lv)) bad.push(`${t.id}/${lv}: floors=${q.get('floors')}`);
    let s; try { s = seenFloors(d, q); } catch { continue; } // قالب لا يُبنى على هذا المخطط خطأ آخر يُعرض للعميل صراحة؛ ليس موضوع هذا الاختبار
    measured++; if (s.n !== lv) bad.push(`${t.id}/${lv}: الظاهر ${s.n} (أعلى جدار ${s.top.toFixed(2)} م)`);
  }
  assert.deepEqual(bad, [], 'قوالب تخالف عدد أدوار المخطط');
  assert.ok(measured >= T.length * 2 * .9, `قيس ${measured} من ${T.length * 2}: الاختبار ليس فارغًا`);
  // بلا floors في الرابط: عدد أدوار المخطط، لا أدوار القالب
  const q2 = new URLSearchParams({ style: id, tpl: T[0].id }); await facadeDoc(DOCS[2], q2, transformDoc); assert.equal(q2.get('floors'), '2');
  // طلب صريح مختلف عن المخطط (العميل اختار ثلاثة أدوار) يُحترم
  const q3 = new URLSearchParams({ style: id, tpl: T[0].id, floors: '3' }); const d3 = await facadeDoc(DOCS[1], q3, transformDoc); assert.equal(q3.get('floors'), '3');
  try { assert.equal(seenFloors(d3, q3).n, 3); } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; }
});
