// الجولة الثامنة: حدود الفراغات (المجلس الرئيسي ≥ 24 م² صلب في الاختيار، مجلس النساء ≥ 20 م² متى أتاحه البرنامج، الطعام
// ≥ 12 م²، الرئيسية العلوية ≤ 26 م² ما لم تُطلب) مقيسة من المرسوم؛ وأسلاك الواجهة: البدائل وسبب نقصها تصل إلى الجلسة،
// و«رجّع مثل أول» رجوع للتصميم الأول، وحذف فراغ غير موجود لا يُقال عنه «نُفّذ».
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors, qualityGates } from '../dist/villa-layout-v2.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { docRooms } from '../dist/rules.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const gen = id => { const { C, r, land } = caseReq(id); return (land.floors >= 2 ? generateVillaTwoFloors : generateVillaDesigns)({ land, counts: r.counts, requirements: r, keep: C.want || 4 }); };
const ev = (stage, id, n) => parseDoc(readFileSync(new URL(`../evidence/acceptance/${stage}/${id}/alt-${n}.json`, import.meta.url), 'utf8'));

test('بوابة الجودة ترفض: مجلسًا رئيسيًا < 24 م²، وطعامًا < 12 م²، ورئيسية علوية > 26 م² (من أدلة بعد-6 وبعد-7)', () => {
  assert.ok(qualityGates(ev('after-6', 'C3', 3)).some(w => /«مجلس الرجال» 18.3 م² أصغر من 24/.test(w)));
  assert.ok(qualityGates(ev('after-7', 'C4', 1)).some(w => /«صالة الطعام» 11.2 م² أصغر من 12/.test(w)));
  assert.ok(qualityGates(ev('after-7', 'C7', 1)).some(w => /الرئيسية» في الدور العلوي 31.37 م² متضخمة/.test(w)));
  // ما طلبه العميل صراحة يُعفى
  assert.ok(!qualityGates(ev('after-6', 'C3', 3), null, { majlisAsked: true }).some(w => /أصغر من 24/.test(w)));
  assert.ok(!qualityGates(ev('after-7', 'C7', 1), null, { masterAsked: true }).some(w => /متضخمة/.test(w)));
});

test('الحالات العشر: كل بديل معروض يحقق الحدود الأربعة (ومجلس النساء ≥ 20 م² حيث وُجد)', () => {
  for (const C of CASES) {
    const out = gen(C.id);
    for (const [i, d] of out.designs.entries()) {
      const { rooms } = docRooms(d.doc), tag = `${C.id}-${i + 1}`;
      const pm = rooms.find(r => r.name === 'مجلس الرجال') || rooms.find(r => r.name === 'المجلس');
      if (pm) assert.ok(pm.area >= 23.95, `${tag}: المجلس ${pm.area}`);
      const w = rooms.find(r => r.name === 'مجلس النساء'); if (w) assert.ok(w.area >= 19.95, `${tag}: مجلس النساء ${w.area}`);
      for (const dn of rooms.filter(r => r.type === 'dining')) assert.ok(dn.area >= 11.95, `${tag}: الطعام ${dn.area}`);
      for (const m of rooms.filter(r => r.type === 'master' && r.li > 0)) assert.ok(m.area <= 26.3, `${tag}: الرئيسية العلوية ${m.area}`);
    }
    if (out.designs.length < (C.want || 4)) assert.ok(out.shortfall_ar && /عُرض/.test(out.shortfall_ar), C.id);
  }
});

test('حد المجلس يتراجع فقط أمام بند صريح: غرفة ضيوف قرب المجلس على 20×30 — بديل واحد ينفّذ البند ومجلسه أقل مع ملاحظة', () => {
  const text = 'ابي غرفه للضيوف بحمامها قريبه من المجلس، ومكتب بمدخل خارجي، ومجلس النساء مستقل عن الرجال';
  const counts = { bedrooms: 3, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 };
  const r = extractRequirements(text, { counts });
  const out = generateVillaDesigns({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1 }, counts: r.counts, requirements: r, keep: 4 });
  assert.equal(out.designs[0].fails, 0, out.designs[0].ledger.filter(x => !x.ok).map(x => x.why).join('؛ '));
  const m = docRooms(out.designs[0].doc).rooms.find(x => x.name === 'مجلس الرجال');
  if (m.area < 24) assert.ok(out.designs[0].notes.some(n => /بندك الصريح يتقدم على الحد التصميمي/.test(n)));
});

test('الواجهة: البدائل وعددها المطلوب وسبب النقص وأسباب الرفض تصل إلى جلسة التصميم', async () => {
  const { r, land } = caseReq('C7');
  const out = await generateInitialDesign({ land, counts: r.counts, requirements: r, idea: CASES.find(c => c.id === 'C7').text });
  const s = createSession({ land, counts: r.counts, requirements: r, result: out });
  assert.equal(s.alternativesInfo.requested, 4);
  assert.equal(s.alternativesInfo.shown, s.alternatives.length);
  if (s.alternatives.length < 4) assert.match(s.alternativesInfo.shortfall_ar, /عُرض \d+ من 4/);
  const listed = s.alternativesInfo.rejected.reduce((a, x) => a + x.count, 0);
  assert.ok(listed <= s.alternativesInfo.rejectedCount && (s.alternativesInfo.rejectedCount === 0 || listed > 0));
  assert.ok(s.conflicts.length > 0, 'سؤال التعارض (غرفة كبار السن من ضمن العدد؟)');
});

test('جلسة تعديل: «احذف المكتب» بلا مكتب لا يُقال «نُفّذ»، و«رجّع مثل أول» يرجع للتصميم الأول حرفيًا مع الواجهة', async () => {
  const { r, land } = caseReq('C1');
  const first = await generateInitialDesign({ land, counts: r.counts, requirements: r });
  let s = createSession({ land, counts: r.counts, requirements: r, result: first });
  for (const t of ['المجلس أصغر', 'غيّر الواجهة حجر']) s = (await redesign(s, { text: t })).session;
  const del = await redesign(s, { text: 'احذف المكتب' });
  assert.deepEqual(del.reply.done, []); assert.ok(del.reply.alreadyTxt.some(t => /غير موجود/.test(t)));
  assert.ok(!/نُفّذ/.test(del.reply.summary_ar));
  const back = await redesign(del.session, { text: 'رجّع مثل أول' });
  assert.equal(back.reply.mode, 'restore'); assert.deepEqual(back.reply.unclear, []);
  const d0 = JSON.parse(back.session.designs[0].doc), d1 = JSON.parse(back.session.designs[back.session.current].doc);
  assert.deepEqual([d1.walls, d1.openings, d1.labels], [d0.walls, d0.openings, d0.labels]);
  assert.equal(d1.finish?.facade?.material ?? null, d0.finish?.facade?.material ?? null);
  assert.match(back.reply.summary_ar, /الواجهة عادت/);
});
