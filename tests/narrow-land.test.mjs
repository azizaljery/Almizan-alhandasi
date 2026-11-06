// أرض ضيقة وشكل L: إن اتسعت الأرض للشكل تُبنى تصاميمه سليمة وموصولة، وإلا يُعلن الفشل مع الحد الأدنى المحسوب بالأرقام،
// والمقاس الذي تذكره الملاحظة يُبنى فعلًا بشكل L.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, checkDoc } from '../dist/villa-layout.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';

const L = (width, length, floors = 1) => ({ width, length, floors, streets: ['s'], entries: ['s'] });
const C = (o = {}) => ({ bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0, ...o });
const PROGRAM = C({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 });
const shapeL = (w, l) => generateVillaDesigns({ land: L(w, l), counts: PROGRAM, requirements: { prefs: { shape: 'L' } } });
const MIN_RE = /مسطحًا قابلًا للبناء (\d+(?:\.\d+)?) × (\d+(?:\.\d+)?) م على الأقل، أي أرضًا لا تقل عن (\d+(?:\.\d+)?) × (\d+(?:\.\d+)?) م/;

/** كل بديل سليم (checkDoc ونظام الفراغات) مهما كان الشكل؛ ثم: إما كلها L، أو الملاحظة تذكر الحد الأدنى بالأرقام. */
function assertLOrNumericMinimum(out) {
  for (const d of out.designs) {
    const c = checkDoc(d.doc);
    assert.ok(c.ok, c.problems.join(' | '));
    assert.ok(!reviewDoc(d.doc).some(i => i.code === 'UNREACHABLE_ROOM'), 'كل فراغ موصول');
  }
  if (out.designs.every(d => d.mode === 'L')) return null;
  const note = out.designs[0].notes.find(n => n.includes('تعذّر توزيع'));
  assert.ok(note, 'إعلان التعذّر في الملاحظة');
  const m = note.match(MIN_RE);
  assert.ok(m, 'الملاحظة تذكر الحد الأدنى بالأرقام: ' + note);
  return { buildable: [Number(m[1]), Number(m[2])], land: [Number(m[3]), Number(m[4])] };
}

test('18x30 وطلب L: تصاميم L سليمة وموصولة، أو إعلان بالحد الأدنى الرقمي', () => {
  const out = shapeL(18, 30);
  const min = assertLOrNumericMinimum(out);
  assert.ok(out.designs.length >= 1);
  if (!min) for (const d of out.designs) assert.ok(d.notes.some(n => n.includes('شكل L')), 'ملاحظة الشكل');
});

test('15x25 وطلب L: تصاميم L سليمة، أو إعلان بالحد الأدنى الرقمي', () => {
  const out = shapeL(15, 25);
  assert.ok(out.designs.length >= 1);
  assertLOrNumericMinimum(out);
});

test('16x28 وطلب L: تصاميم L سليمة، أو إعلان بالحد الأدنى الرقمي', () => {
  const out = shapeL(16, 28);
  assert.ok(out.designs.length >= 1);
  assertLOrNumericMinimum(out);
});

test('الحد الأدنى المذكور في الملاحظة يُبنى فعلًا بشكل L', () => {
  const out = shapeL(15, 25);
  const min = assertLOrNumericMinimum(out);
  if (!min) return; // الأرض الحالية تتسع للشكل؛ لا حد يُختبر
  const again = shapeL(...min.land);
  assert.ok(again.designs.length >= 1 && again.designs.every(d => d.mode === 'L'), 'L عند الأرض المذكورة ' + min.land.join(' × '));
  for (const d of again.designs) { const c = checkDoc(d.doc); assert.ok(c.ok, c.problems.join(' | ')); }
});
