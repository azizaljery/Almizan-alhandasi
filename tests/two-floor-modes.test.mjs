// الدوران بعد سقوف المقاسات: الفناء وصف الخدمة يعودان بلا تضخم، والطعام يجاور المجلس عبر مغاسله بباب فعلي.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaTwoFloors, checkDoc, ROOM_CAPS } from '../dist/villa-layout.mjs';
import { verifyRules, doorInfo } from '../dist/rules.mjs';

const land = (w, l) => ({ width: w, length: l, streets: ['s'], entries: ['s'], floors: 2 });
const counts = (beds, majlis = 1) => ({ bedrooms: beds, majlis, baths: beds, kitchens: 1, halls: 1, dining: 1 });

test('دوران على أرض متسعة: فناء داخلي بلا غرفة نوم متضخمة، والفائض جلسة مسمّاة معلنة', () => {
  for (const [w, l, beds] of [[20, 30, 4], [25, 30, 5]]) {
    const { designs } = generateVillaTwoFloors({ land: land(w, l), counts: counts(beds), requirements: {}, keep: 5 });
    const court = designs.find(d => d.mode === 'court'); assert.ok(court, `${w}×${l}: ${designs.map(d => d.mode).join(',')}`);
    assert.ok(checkDoc(court.doc).ok);
    for (const d of designs) assert.ok(d.maxBed <= ROOM_CAPS.bedNet.master + 1, `${d.mode}: غرفة نوم ${d.maxBed} م²`);
    assert.ok(court.doc.labels.some(r => r.name === 'جلسة الحديقة'), 'فائض جناحي الفناء جلسة مطلة على الحديقة');
    assert.ok(court.notes.some(n => /لم يطلبها العميل/.test(n)), 'الفراغ المضاف معلن');
  }
});
test('فراغات الفائض في الدورين معًا لا تُعرض لنمط له بديل سليم بغلاف أصغر', () => {
  const { designs } = generateVillaTwoFloors({ land: land(20, 30), counts: counts(4), requirements: {}, keep: 5 });
  const dbl = d => d.fill[0] > 0 && d.fill[1] > 0, lean = new Set(designs.filter(d => !dbl(d)).map(d => d.mode));
  // يُسمح بعودة المزدوج فقط لإكمال ثلاثة بدائل
  assert.ok(designs.filter(d => dbl(d) && lean.has(d.mode)).length <= Math.max(0, 3 - designs.filter(d => !(dbl(d) && lean.has(d.mode))).length));
});
test('عرف «الطعام بجوار المجلس»: بديل ينفّذه عبر مغاسل المجلس بباب فعلي، ولا يُحسب جوارًا بلا باب', () => {
  const rules = [{ id: 'R1', kind: 'adjacent', a: 'dining', b: 'majlis', text: '«الطعام» بجوار «المجلس»' }, { id: 'R2', kind: 'adjacent', a: 'dining', b: 'kitchen', text: '«الطعام» بجوار «المطبخ»' }];
  const { designs } = generateVillaTwoFloors({ land: land(20, 30), counts: counts(4), requirements: { rules }, keep: 5 });
  const d = designs[0]; assert.equal(d.fails, 0, d.ledger.filter(x => !x.ok).map(x => x.why).join(' | '));
  const D = doorInfo(d.doc);
  if (d.doc.labels.some(r => r.name === 'مغاسل') && !D.neighbors('المجلس').includes('صالة الطعام')) {
    assert.ok(D.neighbors('مغاسل').includes('صالة الطعام'), 'باب المغاسل إلى الطعام');
    // بلا الباب لا يُعدّ جوارًا
    const doc2 = { ...d.doc, openings: d.doc.openings.filter(o => !(o.kind === 'door' && o.w === .9)) };
    const led = verifyRules(doc2, rules.slice(0, 1), { entry: 's' });
    if (!doorInfo(doc2).neighbors('مغاسل').includes('صالة الطعام')) assert.equal(led[0].ok, false);
  }
});
