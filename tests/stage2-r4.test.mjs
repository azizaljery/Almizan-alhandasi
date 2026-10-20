// الجولة الرابعة: تحقق معماري صادق من «X في الخلف» (zone)، وتنفيذه فعلًا في المولّد الثاني (C1، C6، C8 وتعديله)،
// وغرفة كبار السن ملاصقة للصالة مع صالة غير شريطية بمساحة بقدر البرنامج (C2)، و«الماستر بعيدة عن الدرج» (C7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRules, verifyRules, verifyRequest, docRooms, zoneCheck } from '../dist/rules.mjs';
import { extractRequirements, normalizeAr } from '../dist/requirements.mjs';
import { createDoc, applyCommand, parseDoc } from '../dist/draw/doc.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout-v2.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const rules = t => extractRules(normalizeAr(t)).rules;
const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };

/** مستند يدوي: غلاف W×D وخطوط جدران داخلية وتسميات. +y شمال = الخلف (المدخل جنوبي). */
function handDoc(W, D, lines, labels) {
  let doc = createDoc({ title: 'اختبار' }); const L = doc.levels[0].id;
  doc = applyCommand(doc, { type: 'add-rect', level: L, a: { x: 0, y: 0 }, b: { x: W, y: D } }).doc;
  for (const [x0, y0, x1, y1] of lines) doc = applyCommand(doc, { type: 'add-wall', level: L, a: { x: x0, y: y0 }, b: { x: x1, y: y1 } }).doc;
  for (const [name, roomType, x, y] of labels) doc = applyCommand(doc, { type: 'add-label', level: L, name, roomType, seed: { x, y } }).doc;
  return doc;
}
const ok = (doc, text) => verifyRules(doc, rules(text), { entry: 's' });

test('الفهم: «في الخلف/ورا/في الأمام/الشرقي» = zone (الافتراضي)، «بعيد عن الشارع» = half، «يطل على الحوش الخلفي» = touch', () => {
  const m = t => rules(t).map(r => `${r.a}:${r.side}:${r.mode}`);
  assert.deepEqual(m('المطبخ في الخلف'), ['kitchen:back:zone']);
  assert.deepEqual(m('المطبخ ورا'), ['kitchen:back:zone']);
  assert.deepEqual(m('المطبخ في الأمام'), ['kitchen:front:zone']);
  assert.deepEqual(m('المجلس في الجهة الشرقية'), ['majlis:e:zone']);
  assert.deepEqual(m('الغرف بعيدة عن الشارع'), ['bedrooms:back:half']);
  assert.deepEqual(m('الصالة تطل على الحوش الخلفي'), ['hall:back:touch']);
  // نفي الجهة: «ما يكون في الخلف» = النصف الأمامي (متساهل عن قصد)
  assert.deepEqual(m('المطبخ ما يكون في الخلف'), ['kitchen:front:half']);
});

// 12 × 15: صف أمامي (مجلس | مدخل) 0–5، صالة 5–9.5، ثم الخلف
const FRONT = [[0, 5, 12, 5], [6, 0, 6, 5], [0, 9.5, 12, 9.5]];
const FRONT_L = [['المجلس', 'majlis', 3, 2.5], ['مدخل العائلة', 'entrance', 9, 2.5], ['الصالة', 'living', 6, 7]];

test('إيجابي: المطبخ يلامس الواجهة الخلفية = في الخلف', () => {
  const doc = handDoc(12, 15, [...FRONT, [5, 9.5, 5, 15]], [...FRONT_L, ['المطبخ', 'kitchen', 2.5, 12], ['غرفة نوم 2', 'bedroom', 8.5, 12]]);
  const [r] = ok(doc, 'المطبخ في الخلف'); assert.equal(r.ok, true, r.why);
});

test('إيجابي: المطبخ في الثلث الخلفي وخلفه مخزن (خدمة لا سكن) = في الخلف ولو لم يلامس الواجهة', () => {
  const doc = handDoc(12, 15, [...FRONT, [5, 9.5, 5, 15], [0, 13.5, 5, 13.5]], [...FRONT_L, ['المطبخ', 'kitchen', 2.5, 11.5], ['المخزن', 'storage', 2.5, 14.2], ['غرفة نوم 2', 'bedroom', 8.5, 12]]);
  const { rooms, B } = docRooms(doc), k = rooms.find(x => x.name === 'المطبخ');
  assert.ok(B.y1 - k.y1 > .45, 'لا يلامس الواجهة الخلفية');
  const [r] = ok(doc, 'المطبخ في الخلف'); assert.equal(r.ok, true, r.why);
});

test('سلبي: المطبخ في النصف الخلفي لكن غرفة نوم بينه وبين الواجهة الخلفية = ليس في الخلف (و«بعيد عن الشارع» المتساهل يتحقق)', () => {
  const doc = handDoc(12, 15, [...FRONT, [0, 12, 12, 12], [5, 9.5, 5, 12]], [...FRONT_L, ['المطبخ', 'kitchen', 2.5, 10.7], ['صالة الطعام', 'dining', 8.5, 10.7], ['غرفة نوم 2', 'bedroom', 6, 13.5]]);
  const { rooms, B } = docRooms(doc), k = rooms.find(x => x.name === 'المطبخ');
  assert.ok((k.y0 + k.y1) / 2 > (B.y0 + B.y1) / 2, 'مركزه في النصف الخلفي (كان يُحسب «نُفّذ» بالاختبار القديم)');
  const [r] = ok(doc, 'المطبخ في الخلف');
  assert.equal(r.ok, false); assert.match(r.why, /غرفة نوم 2/);
  const [h] = ok(doc, 'المطبخ بعيد عن الشارع'); assert.equal(h.ok, true, 'half يبقى متساهلًا كما وُثّق');
});

test('سلبي من الأدلة: مستند C8 «بعد-3» (المطبخ وسط اليسار وجناح النوم خلفه) لا يُحسب «المطبخ في الخلف»', () => {
  for (const f of ['edit-before', 'edit-after']) {
    const doc = parseDoc(readFileSync(new URL(`../evidence/acceptance/after-3/C8/${f}.json`, import.meta.url), 'utf8'));
    const r = ok(doc, 'انقل المطبخ بجوار الطعام وخل المطبخ في الخلف').find(x => x.kind === 'place');
    assert.equal(r.ok, false, f); assert.match(r.why, /غرفة النوم الرئيسية/);
  }
});

test('الجهات الأخرى بالمعيار نفسه: الأمام والشرق', () => {
  // المطبخ على الواجهة الأمامية (يمين المدخل) ثم مطبخ خلف المجلس
  const a = handDoc(12, 15, [[0, 5, 12, 5], [4, 0, 4, 5], [8, 0, 8, 5], [0, 10, 12, 10]], [['المطبخ', 'kitchen', 2, 2.5], ['مدخل العائلة', 'entrance', 6, 2.5], ['المجلس', 'majlis', 10, 2.5], ['الصالة', 'living', 6, 7.5], ['غرفة نوم 2', 'bedroom', 6, 12.5]]);
  assert.equal(ok(a, 'المطبخ في الأمام')[0].ok, true);
  const b = handDoc(12, 15, [[0, 5, 12, 5], [6, 0, 6, 5], [6, 5, 6, 9], [0, 9, 12, 9]], [['المجلس', 'majlis', 3, 2.5], ['مدخل العائلة', 'entrance', 9, 2.5], ['المطبخ', 'kitchen', 3, 7], ['الصالة', 'living', 9, 7], ['غرفة نوم 2', 'bedroom', 6, 12]]);
  const [f] = ok(b, 'المطبخ في الأمام'); assert.equal(f.ok, false); assert.match(f.why, /المجلس/);
  // الشرق (+x): المطبخ على الجدار الشرقي، ثم مطبخ غربي
  assert.equal(ok(a, 'المجلس في الجهة الشرقية')[0].ok, true);
  assert.equal(ok(a, 'المطبخ في الجهة الشرقية')[0].ok, false);
  // zoneCheck مباشرة: الثلث الخارجي بلا عائق = 0
  const B = { x0: 0, y0: 0, x1: 10, y1: 30 }, r = { x0: 0, x1: 4, y0: 21, y1: 28 };
  assert.equal(zoneCheck(r, 'y1', B, [], []).def, 0);
  const bed = { x0: 0, x1: 10, y0: 28, y1: 30 }; assert.ok(zoneCheck(r, 'y1', B, [bed], [bed]).def > 0, 'غرفة سكنية بينه وبين الواجهة');
});

const kBack = (doc, entry = 's') => verifyRules(doc, rules('المطبخ في الخلف'), { entry })[0];

test('C1 وC6: كل بديل معروض يحقق «المطبخ في الخلف» بالاختبار الصارم وبقية البنود', () => {
  for (const id of ['C1', 'C6']) {
    const { C, r, land } = caseReq(id);
    const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 });
    assert.ok(out.designs.length >= 2, id);
    for (const d of out.designs) {
      const k = kBack(d.doc); assert.equal(k.ok, true, `${id} ${d.pat}: ${k.why}`);
      // بنود الموضع والتباعد كلها منفّذة في كل بديل معروض (البدائل المخالفة لها لا تُعرض)
      const fails = verifyRequest(d.doc, r, { entry: 's' }).filter(x => !x.ok && ['place', 'far'].includes(x.kind)); assert.deepEqual(fails.map(x => x.text), [], `${id} ${d.pat}`);
    }
  }
});

// تعديل C8 على كل بديل بالتحقق الصارم: في tests/stage2-r3.test.mjs (اختبار التعديل نفسه، بفحص zone مستقل لكل بديل)

test('C2: غرفة كبار السن ملاصقة للصالة في كل بديل، والصالة غير شريطية (≤ 2.0) ومساحتها بقدر البرنامج', () => {
  const { C, r, land } = caseReq('C2');
  const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want || 4 });
  assert.ok(out.designs.length >= 2);
  for (const d of out.designs) {
    const { rooms } = docRooms(d.doc), e = rooms.find(x => x.name === 'غرفة كبار السن'), h = rooms.find(x => x.name === 'الصالة');
    const near = verifyRules(d.doc, rules('غرفة لأمي قريبة من الصالة'), { entry: 's' })[0];
    assert.equal(near.ok, true, `${d.pat}: ${near.why}`);
    const gap = Math.hypot(Math.max(0, Math.max(e.x0, h.x0) - Math.min(e.x1, h.x1)), Math.max(0, Math.max(e.y0, h.y0) - Math.min(e.y1, h.y1)));
    assert.ok(gap <= 2.0, `${d.pat}: بين غرفة كبار السن والصالة ${gap} م`);
    const w = h.x1 - h.x0, l = h.y1 - h.y0;
    assert.ok(Math.max(w, l) / Math.min(w, l) <= 2.0 + 1e-6, `${d.pat}: الصالة ${w}×${l}`);
    assert.ok(h.area <= 40.5 * 1.35, `${d.pat}: مساحة الصالة ${h.area}`);
    assert.deepEqual(verifyRequest(d.doc, r, { entry: 's' }).filter(x => !x.ok && ['place', 'far'].includes(x.kind)).map(x => x.text), [], d.pat);
  }
});

test('C7: «الماستر بعيدة عن الدرج» متحقق في كل بديل معروض (لا يُعرض بديل يخالفه لسد العدد)', () => {
  const { C, r, land } = caseReq('C7');
  const out = generateVillaTwoFloors({ land, counts: r.counts, requirements: r, keep: C.want || 4 });
  assert.ok(out.designs.length >= 2);
  for (const d of out.designs) {
    const x = verifyRequest(d.doc, r, { entry: 's' }).find(q => q.kind === 'far' && /الدرج/.test(q.text));
    assert.ok(x && x.ok, `${d.pat}: ${x?.why}`);
  }
});
