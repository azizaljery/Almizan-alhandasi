// الجولة التاسعة: تنظيمات الدورين بموضع سلم مختلف مع اتساق التراكب (جدران العلوي فوق جدران الأرضي أو بجسور ≤ 5 م، ولا غرف
// علوية فوق فراغ أرضي)، والبهو المزدوج الارتفاع (فراغ «void» بدرابزين)، وحد الرئيسية الأرضية ≤ 24 م²، وغرف النوم على الصالة
// العائلية فقط في «الصالة الموزِّعة» وبباب في طرف الجدار، والكتلة المقسومة بحديقة بديلًا مختلفًا على الأرض الضيقة.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors, qualityGates } from '../dist/villa-layout-v2.mjs';
import { stackingReport, stackingGates, STACK_SPAN_MAX } from '../dist/stacking.mjs';
import { docRooms } from '../dist/rules.mjs';
import { parseDoc, applyCommand } from '../dist/draw/doc.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { ROOM_TYPES } from '../dist/draw/catalog.mjs';
import { archDifference, THRESHOLDS } from '../dist/arch-difference.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const gen = id => { const { C, r, land } = caseReq(id); return (land.floors >= 2 ? generateVillaTwoFloors : generateVillaDesigns)({ land, counts: r.counts, requirements: r, keep: C.want || 4 }); };
const ev = (stage, id, n) => parseDoc(readFileSync(new URL(`../evidence/acceptance/${stage}/${id}/alt-${n}.json`, import.meta.url), 'utf8'));

test('التراكب مقيسًا من المرسوم: بعد-8 C7 متسق (أطول جدار علوي بلا ركيزة 5 م)، وجدار علوي يعبر المجلس بلا جدار تحته يُرفض', () => {
  const d = ev('after-8', 'C7', 1), s = stackingReport(d);
  assert.ok(s.ok && s.maxUnsupportedRun <= STACK_SPAN_MAX + .05 && s.overGroundVoid === 0, JSON.stringify(s));
  assert.deepEqual(stackingGates(d), []);
  // جدار علوي في طول المجلس الأرضي (نحو 6.9 م بلا جدار تحته ولا ركيزة بين طرفيه): مخالفة
  const up = d.levels[1].id, { rooms } = docRooms(d), mj = rooms.find(r => r.li === 0 && r.type === 'majlis');
  const x = (mj.x0 + mj.x1) / 2, bad = applyCommand(d, { type: 'add-wall', level: up, a: { x, y: mj.y0 }, b: { x, y: mj.y1 }, t: .12 }).doc;
  assert.ok(stackingGates(bad).some(w => /بلا جدار تحته/.test(w)), JSON.stringify(stackingReport(bad).levels[0]));
  // دور واحد: لا تقرير
  assert.equal(stackingReport(ev('after-8', 'C1', 1)), null);
});

test('C7 دوران: ثلاثة تنظيمات بموضع سلم مختلف (محوري / على جدار الجار ببهو مزدوج / في الخلف)، وكل بديل متسق التراكب', () => {
  const out = gen('C7');
  assert.ok(out.designs.length >= 3, out.designs.map(d => d.pat).join(' '));
  const grounds = out.designs.map(d => d.pat.split('/')[0].split(':')[0]);
  assert.equal(new Set(grounds).size, grounds.length, grounds.join(' '));
  assert.ok(grounds.includes('sidestair') && grounds.includes('rearstair'), grounds.join(' '));
  // التنظيم العلوي مختلف أيضًا (لا علوي واحد على أرضيات مختلفة)
  const uppers = out.designs.map(d => d.pat.split('/')[1]); assert.ok(new Set(uppers).size >= 2, uppers.join(' '));
  for (const d of out.designs) {
    const s = stackingReport(d.doc);
    assert.ok(s.ok, `${d.pat}: ${JSON.stringify(s.levels[0])}`);
    assert.ok(s.maxUnsupportedRun <= STACK_SPAN_MAX + .05 && s.overGroundVoid <= 3, d.pat);
    const far = d.ledger.find(x => x.kind === 'far'); assert.ok(far && far.ok, `${d.pat}: ${far?.why}`);
    // السلم في الموضع نفسه في الدورين، وسلم واحد
    const st = docRooms(d.doc).rooms.filter(x => x.name === 'الدرج'); assert.equal(st.length, 2, d.pat);
    assert.ok(Math.abs(st[0].x0 - st[1].x0) < .05 && Math.abs(st[0].y0 - st[1].y0) < .05, d.pat);
    assert.equal(d.doc.stairs.length, 1, d.pat);
  }
  for (let i = 0; i < out.designs.length; i++) for (let j = i + 1; j < out.designs.length; j++) assert.ok(archDifference(out.designs[i].doc, out.designs[j].doc).total >= THRESHOLDS.cosmetic, `${i + 1}/${j + 1}`);
});

test('البهو المزدوج الارتفاع: فراغ «void» في العلوي فوق مدخل العائلة، يحده درابزين نحو الحركة فقط، ولا يُعد غرفة معزولة', () => {
  const d = gen('C7').designs.find(x => /^sidestair/.test(x.pat)); assert.ok(d, 'بديل السلم الجانبي');
  const { rooms } = docRooms(d.doc), v = rooms.find(r => r.li === 1 && r.type === 'void'), f = rooms.find(r => r.li === 0 && r.name === 'مدخل العائلة');
  assert.ok(v && f, 'الفراغ المزدوج ومدخل العائلة');
  assert.ok(Math.abs(v.x0 - f.x0) < .2 && Math.abs(v.x1 - f.x1) < .2 && Math.abs(v.y0 - f.y0) < .2 && Math.abs(v.y1 - f.y1) < .2, 'الفراغ فوق البهو نفسه');
  assert.ok(ROOM_TYPES.void.void && !ROOM_TYPES.void.windowRequired);
  const rails = d.doc.walls.filter(w => w.level === d.doc.levels[1].id && w.kind === 'parapet');
  assert.ok(rails.length >= 1 && rails.every(w => w.h > .9 && w.h < 1.3), 'درابزين');
  assert.ok(!reviewDoc(d.doc).some(i => i.code === 'UNREACHABLE_ROOM' && /فراغ مزدوج/.test(i.message)));
  assert.ok(d.review.passed, d.review.rejectReasons_ar.join(' | '));
});

test('دور واحد: الرئيسية ≤ 24 م² صافية ما لم تُطلب كبيرة (بوابة على المرسوم)، وفي كل بدائل الحالات العشر', () => {
  // بعد-8: C8-3 رئيسية 30.8 م² — ترفضها البوابة، ولا ترفضها إن طلب العميل ماستر كبيرة
  assert.ok(qualityGates(ev('after-8', 'C8', 3)).some(w => /الرئيسية» \d+(\.\d+)? م² متضخمة/.test(w)));
  assert.ok(!qualityGates(ev('after-8', 'C8', 3), null, { masterAsked: true }).some(w => /متضخمة/.test(w)));
  for (const C of CASES) {
    if ((C.land.floors || 1) > 1) continue;
    for (const [i, d] of gen(C.id).designs.entries()) for (const m of docRooms(d.doc).rooms.filter(r => r.type === 'master' && r.li === 0)) assert.ok(m.area <= 24.05, `${C.id}-${i + 1}: الرئيسية ${m.area}`);
  }
});

test('غرف النوم على الصالة العائلية: مرفوضة خارج «الصالة الموزِّعة»، وفيها بباب في طرف الجدار (≤ 1.4 م)', () => {
  const d = ev('after-8', 'C1', 1); // centralhall: غرف تفتح على الصالة
  assert.ok(qualityGates(d, null, { hallDistributor: false }).some(w => /تفتح على الصالة العائلية مباشرة/.test(w)));
  // البدائل الحالية: كل غرفة نوم (عدا كبار السن والضيوف) تفتح على الصالة هي في الصالة الموزِّعة وبابها في الطرف
  for (const id of ['C1', 'C3', 'C10']) for (const x of gen(id).designs) {
    const gates = qualityGates(x.doc, null, { hallDistributor: /^(centralhall|rearhall)/.test(x.pat) });
    assert.ok(!gates.some(w => /الصالة العائلية مباشرة|في وسط جدار الصالة/.test(w)), `${id} ${x.pat}: ${gates.join(' | ')}`);
  }
});

test('الأرض الضيقة (C4): بيت بكتلتين وحديقة جانبية ورواق بديل مختلف عن الكتلة المصمتة', () => {
  const out = gen('C4');
  assert.ok(out.designs.length >= 2, out.designs.map(d => d.pat).join(' '));
  assert.ok(out.designs.some(d => /^split/.test(d.pat)), out.designs.map(d => d.pat).join(' '));
  assert.ok(archDifference(out.designs[0].doc, out.designs[1].doc).total >= THRESHOLDS.cosmetic);
});

test('C2: الصالة الكبيرة على الحديقة الخلفية وغرف الأبناء متجاورة وكبار السن قرب الصالة في البديل المعروض', () => {
  const out = gen('C2');
  assert.ok(out.designs.length >= 1);
  const led = out.designs[0].ledger;
  for (const re of [/الصالة» على الواجهة الخلفية/, /غرف الأبناء» متجاورة/, /كبار السن» قرب «الصالة/]) { const l = led.find(x => re.test(x.text)); assert.ok(l && l.ok, `${re}: ${l?.why}`); }
  if (out.designs.length < 4) assert.match(out.shortfall_ar || '', /من 4 مطلوبة/);
});
