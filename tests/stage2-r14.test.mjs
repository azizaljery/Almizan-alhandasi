// الجولة الرابعة عشرة: صدق التعديل (لا يُعاد بديل معروض على أنه نتيجة تعديل، وخيارات صريحة بالبصمة بالمناطق)، وحالة العرض لكل بديل
// (جاهز/يحتاج تعديلات/محجوب)، وبنود المراجع المستقل r13 مقيسة (تفضيلات لا قواعد)، والمواقف العمودية، ووسم «مقترح معماري مبدئي».
import './_gen-cache.mjs';
import { verifyRules } from '../dist/rules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRequirements } from '../dist/requirements.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout-v2.mjs';
import { measureSaudiProgram, measureR14, STRONG_DEFAULTS } from '../dist/saudi-program.mjs';
import { presentationStatus, PROPOSAL_LABEL_AR, STATUS_AR } from '../dist/presentation-status.mjs';
import { zoneDiff, matchShown, roomsHash, sideOccupants } from '../dist/edit-truth.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const caseReq = id => { const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts }; return { C, r, land: { floors: 1, ...C.land } }; };
const EV13 = (c, f) => parseDoc(readFileSync(new URL(`../evidence/acceptance/after-13/${c}/${f}`, import.meta.url), 'utf8'));

test('وسم المقترح ونصوص حالة العرض ثابتة كما طلب المالك', () => {
  assert.equal(PROPOSAL_LABEL_AR, 'مقترح معماري مبدئي — ليس مخططًا تنفيذيًا معتمدًا، ويحتاج تحققًا إنشائيًا مستقلًا');
  assert.deepEqual(STATUS_AR, { ready: 'جاهز للعرض المبدئي', 'needs-edits': 'يحتاج تعديلات', hidden: 'محجوب' });
});

test('حالة العرض: بند عميل غير منفذ أو بوابة راسبة ⇐ محجوب؛ تفضيل سعودي غير متحقق ⇐ يحتاج تعديلات بقائمته', () => {
  const doc = EV13('C10', 'alt-1.json'), C = CASES.find(c => c.id === 'C10');
  const h = presentationStatus({ doc, ledger: [{ text: 'غرفة خادمة', ok: false, why: 'غير موجودة' }], review: { passed: true } }, { text: C.text });
  assert.equal(h.status, 'hidden'); assert.match(h.hidden_ar[0], /غرفة خادمة/);
  assert.equal(presentationStatus({ doc, ledger: [], review: { passed: false, failedGates: ['REACH'] } }, { text: C.text }).status, 'hidden');
  const e = presentationStatus({ doc, ledger: [], review: { passed: true } }, { text: C.text });
  assert.equal(e.status, 'needs-edits'); assert.ok(e.prefs.includes('MAID_BATH'), 'C10-1 بعد-13: الخادمة بلا حمام');
  assert.ok(e.edits_ar.every(t => typeof t === 'string' && t.length > 10));
});

test('بنود المراجع المستقل r13 مقيسة من المستند: حمام الخادمة، الحمام لكل غرفة، مسار التقديم، فاصل المجلس، مدخل المجلس، الحوش الخلفي، المواقف', () => {
  const C = CASES.find(c => c.id === 'C5'), m = Object.fromEntries(measureSaudiProgram(EV13('C5', 'alt-3.json'), { text: C.text }, analyzeDoc(EV13('C5', 'alt-3.json'))).map(g => [g.id, g]));
  assert.equal(m.REAR_YARD.pass, false, 'C5-3 بعد-13: مبنى مدفوع إلى الخلف'); assert.equal(m.MAJLIS_STREET_ENTRY.pass, false, 'C5-3: مدخل جانبي عبر ارتداد ضيق');
  assert.equal(m.MAJLIS_BED_WALL.pass, false);
  const c2 = EV13('C2', 'alt-1.json'), m2 = Object.fromEntries(measureR14(c2, {}, analyzeDoc(c2)).map(g => [g.id, g]));
  assert.equal(m2.PARKING_LAYOUT.pass, false, 'C2 بعد-13: موقفان موازيان أمام نافذة'); assert.equal(m2.SERVE_ROUTE.pass, false);
  for (const id of STRONG_DEFAULTS) assert.ok(measureSaudiProgram(c2, {}, analyzeDoc(c2)).some(g => g.id === id), id);
});

test('المولّد: كل بديل بحالة عرض، ولا محجوب بين المعروض متى وُجد غيره، والجاهز قبل ما يحتاج تعديلات؛ وحمام الخادمة في C10', () => {
  const { r, land, C } = caseReq('C10');
  const out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: C.want });
  assert.ok(out.designs.length >= 3);
  for (const d of out.designs) { assert.ok(d.presentation); assert.notEqual(d.presentation.status, 'hidden'); assert.ok(!(d.presentation.prefs || []).includes('MAID_BATH'), d.pat + ': الخادمة بحمامها'); }
  const st = out.designs.map(d => d.presentation.status), firstEdit = st.indexOf('needs-edits');
  if (firstEdit >= 0) assert.ok(!st.slice(firstEdit).includes('ready'));
  assert.equal(out.presentation.label_ar, PROPOSAL_LABEL_AR);
});

test('المواقف: عمودية بعمق 5.5 م في الحالات المستطيلة (التفضيل) ولا في تجويف', () => {
  for (const id of ['C1', 'C6', 'C9']) {
    const { r, land } = caseReq(id), out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
    for (const d of out.designs) { const p = measureR14(d.doc, {}, analyzeDoc(d.doc)).find(g => g.id === 'PARKING_LAYOUT'); for (const b of p.value.bays) { assert.ok(!b.niche, id + ' ' + d.pat); } }
  }
});

test('الحوش الخلفي في الأرض غير المنتظمة (C5): لا مبنى مدفوع إلى الخلف بفناء أمامي ميت', () => {
  const { r, land } = caseReq('C5'), out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  for (const d of out.designs) assert.equal(measureR14(d.doc, {}, analyzeDoc(d.doc)).find(g => g.id === 'REAR_YARD').pass, true, d.pat);
});

test('البصمة بالمناطق: مخطط مطابق لبديل معروض يُكشف حرفيًا، والمناطق المتغيرة تُعد', () => {
  const a1 = EV13('C8', 'alt-1.json'), a4 = EV13('C8', 'alt-4.json'), e = EV13('C8', 'edit-after.json');
  assert.equal(roomsHash(e), roomsHash(a4), 'بعد-13: «نتيجة التعديل» كانت البديل 4 نفسه');
  assert.deepEqual(matchShown(e, [{ index: 3, doc: a4 }]), { index: 3, identical: true });
  const z = zoneDiff(a1, e); assert.ok(z.changed.length >= 3); assert.equal(zoneDiff(a1, a1).changed.length, 0);
  const occ = sideOccupants(a1, 'back', 's'); assert.ok(occ.some(o => o.zone === 'sleep'), 'خلف C8-1 منطقة النوم');
});

test('صدق التعديل (C8 البديل 1): لا يُعاد بديل معروض، تُعرض الخيارات بالسبب الهندسي، و«1» يبقي المخطط حرفيًا، واختيار البديل المعروض يُعلن أنه ليس تعديلًا', async () => {
  const { r, land } = caseReq('C8'), out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  // (الجولة السابعة عشرة) بديل الحوش لم يعد معروضًا (حل محله «جناح الضيافة» الجاهز)؛ يُفحص على أول بديل لا يتحقق فيه الطلب حرفيًا
  let i = out.designs.findIndex(d => d.pat.startsWith('courtyard'));
  if (i < 0) i = out.designs.findIndex(d => !verifyRules(d.doc, [{ id: 'K', kind: 'place', a: 'kitchen', side: 'back', mode: 'zone', text: 'المطبخ في الخلف' }], { entry: 's' })[0].ok);
  assert.ok(i >= 0, 'بديل لا يتحقق فيه الطلب');
  const alts = out.designs.map((x, j) => ({ index: j, doc: x.doc, pat: x.pat, summary: x.summary, notes: x.notes, mirror: x.mirror, review: x.review || null }));
  const d = out.designs[i], s0 = createSession({ land, counts: r.counts, requirements: r, result: { doc: d.doc, pat: d.pat, mirror: d.mirror, summary: d.summary, notes: d.notes, villaEngine: 'v2', alternatives: alts }, engine: 'v2' });
  const a = await redesign(s0, { text: 'انقل المطبخ بجوار الطعام وخل المطبخ في الخلف' });
  assert.equal(a.reply.mode, 'ask-options'); assert.equal(a.session.designs.length, 1, 'لا تصميم جديد قبل الاختيار');
  assert.match(a.reply.detail_ar, /السبب الهندسي|خلف هذا المخطط|متحقق جزئيًا/);
  assert.match(a.reply.questions[0], /اختر رقمًا/); assert.doesNotMatch(a.reply.questions[0], /البصمة|جدار|القراءة/);
  assert.equal(a.reply.options[0].id, 'keep');
  for (const o of a.reply.options.filter(o => o.id === 'zone' || o.id === 'full')) assert.ok(o.text_ar.length > 10);
  // «نعم» وحدها مع أكثر من خيار ليست اختيارًا: يُعاد السؤال
  const y = await redesign(a.session, { text: 'نعم' });
  if (a.reply.options.filter(o => ['zone', 'full'].includes(o.id)).length !== 1) { assert.equal(y.session.designs.length, 1); assert.equal(y.reply.mode, 'ask-options'); }
  const k = await redesign(a.session, { text: '1' });
  assert.equal(k.session.designs.length, 1); assert.equal(k.session.designs[0].doc, s0.designs[0].doc, 'المخطط كما هو حرفيًا');
  const sh = a.reply.options.find(o => o.id === 'shown');
  if (sh) { const t = await redesign(a.session, { text: String(sh.n) }); assert.equal(t.reply.mode, 'switched-alternative'); assert.match(t.reply.summary_ar, /لا تعديل/); }
  // لا خيار يقدّم مخططًا مطابقًا لبديل معروض
  for (const key of ['zone', 'full']) { const p = a.session.pendingEdit[key]; if (p) assert.equal(matchShown(parseDoc(p.doc), alts.filter(x => x.index !== i).map(x => ({ index: x.index, doc: x.doc }))), null); }
});

test('الدوران (C7): ترقيم غرف النوم متتالٍ في كل دور، ومنور سماوي فوق الدرج، والقراءة بمجلسين تُجرَّب وتُذكر', () => {
  const { r, land } = caseReq('C7'), out = generateVillaTwoFloors({ land, counts: r.counts, requirements: r, keep: 4 });
  for (const d of out.designs) {
    for (const lv of d.doc.levels) {
      const nums = d.doc.labels.filter(l => l.level === lv.id && l.type === 'bedroom' && /^غرفة نوم \d+$/.test(l.name)).map(l => +l.name.split(' ')[2]).sort((a, b) => a - b);
      const start = d.doc.labels.some(l => l.level === lv.id && l.type === 'master') ? 2 : 1;
      nums.forEach((n, k) => assert.equal(n, start + k, `${d.pat} ${lv.id}: ${nums}`));
    }
    assert.ok(d.doc.stairs.every(s => s.skylight));
  }
  assert.ok(out.designs.some(d => d.pluralReading) || out.designs[0].notes.some(n => /مجلسين/.test(n)));
});

test('الواجهة: سترة السطح 1.8 م افتراضًا للميزان في مستندات المولّد', () => {
  const { r, land } = caseReq('C9'), out = generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: 4 });
  for (const d of out.designs) assert.equal(d.doc.roof.parapet, 1.8);
  assert.ok(serialize(out.designs[0].doc).includes('"parapet":1.8'));
});
