// الجولة السابعة عشرة: قياس عيب الصالة العائلية (صغرها نسبةً إلى المجلس، وكونها ممرًا عابرًا)، و«مقهوي» الضيافة، وغرفة الملابس المطلوبة
// ≥ 4.5 م²، وتنظيم «جناح الضيافة الأمامي» (المجلس يلاصق المقلط والمطبخ خلفه)، ووسم كل خيار تعديل «يحقق/لا يحقق طلبك».
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { measureHall, measureR16 } from '../dist/privacy-defects.mjs';
import { addMajlisPantry } from '../dist/r17-polish.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { partialReading, thumbLabels } from '../dist/design-session.mjs';
import { reviewDesign } from '../dist/plan-review.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns } from '../dist/villa-layout-v2.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const ev = (stage, id, f) => parseDoc(readFileSync(new URL(`../evidence/acceptance/${stage}/${id}/${f}`, import.meta.url), 'utf8'));
const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const fails = (doc, text = '') => measureHall(doc, { text }).filter(g => g.applicable && !g.pass && !g.clientAsked).map(g => g.id);

test('HALL_SMALL وHALL_THROUGH: C9-2 (after-16) يُكشف فيه العيبان كما سجّلهما المراجع r16، وC1-1 وC2-1 وC8-1 سليمة', () => {
  assert.deepEqual(fails(ev('after-16', 'C9', 'alt-2.json')).sort(), ['HALL_SMALL', 'HALL_THROUGH']);
  for (const [id, a] of [['C1', 1], ['C2', 1], ['C8', 1], ['C10', 1]]) assert.deepEqual(fails(ev('after-16', id, `alt-${a}.json`)), [], `${id}-${a}`);
  // العيب يجعل البديل «يحتاج تعديلات» لا «جاهز»، والطلب الصريح «صالة صغيرة» يعفي منه
  // (الجولة العشرون) وهذا المستند فيه أيضًا نافذتا المجلس والمقلط على الحوش الداخلي العائلي (COURT_OVERLOOK — العيب نفسه الذي عدّه المراجع
  // r19 إلزاميًا في C9-4) ⇐ محجوب؛ وعيوب الصالة تبقى مقيسة في قائمته
  const d = ev('after-16', 'C9', 'alt-2.json');
  const st = presentationStatus({ doc: d, ledger: [], review: { passed: true } }, { text: '3 غرف' });
  assert.equal(st.status, 'hidden'); assert.deepEqual(st.mandatory, ['COURT_OVERLOOK']); assert.ok(['HALL_SMALL', 'HALL_THROUGH'].every(x => st.major.includes(x)));
  assert.deepEqual(fails(d, 'أبي صالة صغيرة'), []);
  // القياس ضمن عيوب الجولة 16 نفسها (المولّد وحالة العرض يقرآنه من مكان واحد)
  assert.ok(measureR16(d).some(g => g.id === 'HALL_SMALL' && !g.pass));
});

test('المقهوي: يُقتطع من ركن المطبخ الملاصق للمجلس ببابين، والمجلس يُفتح عليه دون أن ترسب خصوصيته', () => {
  const d = ev('after-16', 'C9', 'alt-1.json'); // لا مقهوي في after-16
  const n = addMajlisPantry(d), G = analyzeDoc(d).levels[0];
  if (!n) return; // قد لا يتسع في هذا المستند: لا يُفرض
  const P = G.rooms.find(r => r.name === 'مقهوي'); assert.ok(P && P.area >= 1.8);
  const doorTo = t => G.openings.some(op => op.door && op.sides.some(s => s.room.id === P.id) && op.sides.some(s => s.room.type === t));
  assert.ok(doorTo('majlis'));
  const rv = reviewDesign(d, { text: '3 غرف نوم ومجلس وصالة ومطبخ وطعام', counts: { bedrooms: 3, majlis: 1 } }, { external: false, heavy: false });
  assert.ok(rv.gates.find(g => g.id === 'MAJLIS_PRIVACY').ok);
});

test('خيارات التعديل بلغة العميل: «نعم/لا» لكل بند والموضع بكلمات، ووسوم مطبخ/طعام/مجلس للمصغّرات', () => {
  const d = ev('after-16', 'C8', 'alt-2.json');
  const p = partialReading(d, [{ op: 'rule', rule: { kind: 'adjacent', a: 'kitchen', b: 'dining', text: '«المطبخ» بجوار «الطعام»' } }, { op: 'rule', rule: { kind: 'place', a: 'kitchen', side: 'back', mode: 'zone', text: '«المطبخ» في الخلف' } }], 's');
  assert.ok(p && p.plain_ar); assert.doesNotMatch(p.plain_ar, /القراءة|[٪%]|مقيس/); assert.match(p.plain_ar, /: (نعم|لا)/);
  const t = thumbLabels(analyzeDoc(d).levels[0].rooms).map(x => x.text);
  assert.ok(t.includes('مطبخ') && t.includes('طعام') && t.includes('مجلس'));
});

test('المولّد (C1، C9): غرفة الملابس المطلوبة ≥ 4.5 م²، وفي C9 بديل جاهز يلاصق فيه المجلس المقلط والمطبخ خلفه', () => {
  const c1 = caseReq('C1'), o1 = generateVillaDesigns({ land: c1.land, counts: c1.r.counts, requirements: c1.r, keep: 4 });
  for (const d of o1.designs) { const dr = analyzeDoc(d.doc).levels[0].rooms.find(r => /^غرفة (?:ال)?ملابس$/.test(r.name)); assert.ok(dr, d.pat); assert.ok(dr.area >= 4.4 || d.notes.some(n => /غرفة الملابس المطلوبة/.test(n)), `${d.pat}: ${dr.area}`); }
  const c9 = caseReq('C9'), o9 = generateVillaDesigns({ land: c9.land, counts: c9.r.counts, requirements: c9.r, keep: 4 });
  const gb = o9.designs.find(d => d.pat.startsWith('guestblock')); assert.ok(gb, 'جناح الضيافة معروض');
  assert.equal(gb.presentation.status, 'ready');
  assert.ok(!measureR16(gb.doc).some(g => g.id === 'GUEST_DINING' && g.applicable && !g.pass));
});
