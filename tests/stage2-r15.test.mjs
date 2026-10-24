// الجولة الخامسة عشرة: التعديل الصادق المفيد (التحقق الجزئي بالقراءة النسبية لـ«في الخلف» بالنص نفسه في السجل والرد)، ومعايرة حالة
// العرض (العيب الجوهري «يحتاج تعديلات» والتفضيل الطفيف ملاحظة)، و«بعيدة عن الدرج» بمسار المشي من وصول الدرج، والتنظيمات الجديدة.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRequirements } from '../dist/requirements.mjs';
import { verifyRules, stairPathTo, docRooms, FAR_STAIR_PATH } from '../dist/rules.mjs';
import { partialReading } from '../dist/design-session.mjs';
import { presentationStatus, MAJOR_PREFS } from '../dist/presentation-status.mjs';
import { PARTI_AR, VILLA_V2_ENGINE_VERSION } from '../dist/villa-layout-v2.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const EV14 = (c, f) => parseDoc(readFileSync(new URL(`../evidence/acceptance/after-14/${c}/${f}`, import.meta.url), 'utf8'));
const editRules = () => extractRequirements('انقل المطبخ بجوار الطعام وخل المطبخ في الخلف').rules;

test('«المطبخ في الخلف» في C8-alt1 بعد-14: غير متحقق حرفيًا ومتحقق نسبيًا (خلف الطعام والمجلس) — بالنص نفسه في السجل', () => {
  const doc = EV14('C8', 'alt-1.json'), v = verifyRules(doc, editRules(), { entry: 's' });
  const adj = v.find(x => x.kind === 'adjacent'), back = v.find(x => x.kind === 'place');
  assert.equal(adj.ok, true); assert.equal(back.ok, false);
  assert.ok(back.partial, 'قراءة نسبية'); assert.match(back.partial.text_ar, /خلف «صالة الطعام»/); assert.match(back.partial.literal_ar, /لا يلامس الواجهة الخلفية/);
  // البديل 2 (الصالة في الخلف): (الجولة السادسة عشرة، قراءة واحدة لـ«في الخلف») المطبخ مفتوح على الخلف لكن مركزه على 40% من العمق
  // — كان يُعدّ حرفيًا بقراءة «مفتوح على الخلف»؛ صار «متحققًا جزئيًا» كما حكم المراجع المستقل على C6-2
  const v2 = verifyRules(EV14('C8', 'alt-2.json'), editRules(), { entry: 's' });
  assert.ok(v2.find(x => x.kind === 'adjacent').ok);
  const b2 = v2.find(x => x.kind === 'place'); assert.equal(b2.ok, false); assert.ok(b2.partial); assert.match(b2.partial.text_ar, /بلا فراغ مبني خلفه/);
});

test('رد التعديل: «الشرط متحقق جزئيًا» يذكر المتحقق حرفيًا والنسبي، ولا شيء إن تحقق الطلب كله', () => {
  const intents = editRules().map(rule => ({ op: 'rule', rule }));
  const p = partialReading(EV14('C8', 'alt-1.json'), intents, 's');
  assert.ok(p); assert.deepEqual(p.ok, ['«المطبخ» بجوار «الطعام»']); assert.equal(p.partial.length, 1);
  assert.match(p.text_ar, /متحقق حرفيًا \(مقيس\)/); assert.match(p.text_ar, /بالقراءة النسبية/);
  // (الجولة السادسة عشرة) البديل 2 متحقق جزئيًا أيضًا (القراءة الحرفية الواحدة)؛ و«لا شيء» حين يتحقق الطلب كله حرفيًا
  assert.equal(partialReading(EV14('C8', 'alt-2.json'), intents, 's').partial.length, 1);
  assert.equal(partialReading(EV14('C8', 'alt-1.json'), intents.slice(0, 1), 's'), null);
});

test('«بعيدة عن الدرج» بمسار المشي: C7 بعد-14 باب الرئيسية على 5.8 م من وصول الدرج (< 6 م) فلا تحقق', () => {
  const doc = EV14('C7', 'alt-1.json'), m = docRooms(doc).rooms.find(r => r.type === 'master');
  const pd = stairPathTo(doc, m); assert.ok(pd && pd.dist > 5 && pd.dist < FAR_STAIR_PATH, String(pd?.dist));
  const rule = extractRequirements('الماستر في الدور العلوي بعيدة عن الدرج').rules.filter(r => r.kind === 'far');
  const v = verifyRules(doc, rule, { entry: 's' });
  assert.equal(v[0].ok, false); assert.match(v[0].why, /مسار المشي من وصول الدرج/);
});

test('معايرة حالة العرض: عيوب جوهرية محددة، والطفيفة ملاحظات لا تجعل البديل «يحتاج تعديلات»، والمحجوب لا يُرفع', () => {
  assert.deepEqual([...MAJOR_PREFS].sort(), ['BED_BATH', 'MAID_BATH', 'MAJLIS_LOBBY', 'MAJLIS_STREET_ENTRY']);
  const C6 = CASES.find(c => c.id === 'C6');
  // C6-alt1 بعد-14: دورة مياه يومية ملاحظة لا عيب؛ (الجولة السادسة عشرة) لكن نافذة غرفة نوم 2 فوق المواقف (أثبتها المراجع r15) ⇐
  // يحتاج تعديلات بهذا العيب وحده، والملاحظة تبقى ملاحظة
  const a = presentationStatus({ doc: EV14('C6', 'alt-1.json'), ledger: [], review: { passed: true } }, { text: C6.text });
  assert.equal(a.status, 'needs-edits'); assert.ok(a.notes_ar.length >= 1); assert.deepEqual(a.major, ['WINDOW_PARKING']);
  // C5-alt3 بعد-14: مجلس يلاصق الرئيسية ومدخله من ارتداد ضيق ⇐ يحتاج تعديلات
  const C5 = CASES.find(c => c.id === 'C5');
  const b = presentationStatus({ doc: EV14('C5', 'alt-3.json'), ledger: [], review: { passed: true } }, { text: C5.text });
  assert.equal(b.status, 'needs-edits'); assert.ok(b.major.includes('MAJLIS_STREET_ENTRY'));
  // بند عميل غير متحقق ⇐ محجوب مهما كانت التفضيلات
  assert.equal(presentationStatus({ doc: EV14('C6', 'alt-1.json'), ledger: [{ text: 'x', ok: false }], review: { passed: true } }, { text: C6.text }).status, 'hidden');
  // مقاس ضمن السماح لا مطابق ⇐ ملاحظة صريحة
  const t = presentationStatus({ doc: EV14('C6', 'alt-1.json'), ledger: [{ kind: 'dims', text: '«المجلس» بأبعاد 5×6 م (±0.3 م)', ok: true, actual: { s: 5.01, l: 5.76 }, want: { s: 5, l: 6 } }], review: { passed: true } }, { text: C6.text });
  assert.ok(t.notes_ar.some(n => /ضمن السماح/.test(n)));
});

test('ثلاثة تنظيمات جديدة موصوفة، وإصدار المولّد partis-11 أو أحدث', () => {
  for (const m of ['gardenl', 'twincourt', 'sidecourt']) assert.ok(PARTI_AR[m] && PARTI_AR[m].length > 30, m);
  assert.match(VILLA_V2_ENGINE_VERSION, /partis-1[1-9]/);
});
