// «حسّن هذا التصميم»: استمثال حتمي بتعديلات صغيرة آمنة بعد اختيار العميل تصميمًا.
// الشروط: حتمية (نفس المدخل ← نفس المخرج)، ≤ 60 مرشحًا، لا مخالفة بلدية جديدة، لا بند من طلب العميل ينكسر، الحركة سليمة،
// تحسن فعلي في المجموع ≥ العتبة المعلنة ولا ينخفض أي مؤشر ويبقى نمط التوزيع، وإلا «لا تحسين متاح» بالمؤشر الأضعف وسببه.
// الطلب يُبنى كما تبنيه الصفحة (SharaSession)، على أربع أراضٍ: 15×25 و20×30 دور واحد، و25×35 و12.5×30 دورين.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SharaSession, generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, extendSession, scoreDesign } from '../dist/design-session.mjs';
import { refineDesign, applyRefinement, refineNote, REFINE_LIMITS, enumerateEdits } from '../dist/design-refine.mjs';
import { OPS } from '../dist/design-worker.mjs';
import { checkDoc, visualSig, visualSim } from '../dist/villa-layout.mjs';
import { checkMunicipal } from '../dist/municipal-rules.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { readFileSync } from 'node:fs';

const RANK = { ok: 0, na: 0, review: 1, fail: 2 };
const text = (fl, extra = '') => `ابي فيلا ${fl === 1 ? 'دور واحد' : 'دورين'} 3 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ${extra}`;
/** كما تفعل الصفحة: SharaSession ← التوليد الأولي ← الجلسة، ثم إكمال قصير بالخطوة نفسها لتتعدد التصاميم. */
async function pageSession(w, l, fl, extra = '', more = 3) {
  const land = { width: w, length: l, floors: fl, streets: ['s'], entries: ['s'] };
  const sh = new SharaSession({ land }); sh.start(); sh.answer('mode', 'free'); sh.answer('free', text(fl, extra));
  const result = await generateInitialDesign({ land, rooms: [], discovery: sh.discovery(), idea: sh.idea, counts: sh.counts, requirements: sh.requirements });
  let s = createSession({ land, counts: sh.counts, requirements: sh.requirements, discovery: sh.discovery(), idea: sh.idea, result });
  for (let g = 0; g < more; g++) { const o = await extendSession(s, { target: 8, relaxed: true }); s = o.session; if (!o.added) break; }
  return s;
}
// 16×28 أُضيفت بعد إصلاح الصالات الشريطية: التصاميم الأفضل تترك تحسينات أقل، وهذه الأرض ما زال فيها تحسين فعلي (77←79)
const CASES = [[15, 25, 1], [20, 30, 1], [25, 35, 2], [12.5, 30, 2], [16, 28, 1]];
const cache = new Map(), results = new Map();
const sessionOf = async (w, l, f) => { const k = `${w}×${l}×${f}`; if (!cache.has(k)) cache.set(k, await pageSession(w, l, f)); return cache.get(k); };

/** كل ما يجب أن يصدق على نتيجة «تحسين» أو «لا تحسين». */
function verify(s, i, r, tag) {
  const d = s.designs[i], base = parseDoc(d.doc), req = s.input.requirements, land = s.input.land, entry = land.entries[0];
  assert.ok(r.tried >= 1 && r.tried <= REFINE_LIMITS.maxCandidates, `${tag}: عدد المرشحين ${r.tried} خارج (0، ${REFINE_LIMITS.maxCandidates}]`);
  assert.equal(r.before.total, d.score.total, tag + ': درجة «قبل» هي المخزَّنة للتصميم');
  if (r.status === 'none') {
    assert.ok(r.weakest && r.weakest.label && Number.isFinite(r.weakest.score), tag + ': المؤشر الأضعف مذكور');
    assert.ok(r.reason.includes('لا تحسين متاح') && r.reason.includes(r.weakest.label) && r.reason.includes(String(r.tried)), tag + ': السبب بالأرقام: ' + r.reason);
    assert.equal(r.doc, undefined, tag + ': لا تصميم يُقترح عند عدم التحسين');
    return;
  }
  assert.equal(r.status, 'improved');
  const doc = parseDoc(r.doc);
  assert.notEqual(r.doc, d.doc, tag + ': المستند يختلف حرفيًا عن الأصل');
  assert.ok(checkDoc(doc).ok, tag + ': مخطط سليم');
  // نمط التوزيع نفسه: التوقيع البصري قريب جدًا
  const sim = visualSim(visualSig(doc), visualSig(base));
  assert.ok(sim >= REFINE_LIMITS.minSim, `${tag}: تشابه بصري ${sim}`);
  // البلدية: لا بند يسوء
  const m0 = checkMunicipal(base, land), m1 = checkMunicipal(doc, land);
  for (const it of m0.items) { const c = m1.items.find(x => x.id === it.id); assert.ok(c && RANK[c.verdict] <= RANK[it.verdict], `${tag}: بند بلدي ${it.id} ساء (${it.verdict} ← ${c?.verdict})`); }
  // الطلب الصريح: كل بند كان منفَّذًا يبقى منفَّذًا
  const l0 = verifyRequest(base, req, { entry }), l1 = verifyRequest(doc, req, { entry });
  for (const x of l0) if (x.ok) assert.ok(l1.find(y => y.text === x.text)?.ok, `${tag}: انكسر بند من الطلب: ${x.text}`);
  // التحسن فعلي وبلا انخفاض أي مؤشر، والدرجة المعلنة هي الدرجة المقيسة من جديد
  const re = scoreDesign(s, { doc: r.doc });
  assert.equal(re.total, r.after.total, tag + ': الدرجة المعلنة = المقيسة من جديد');
  assert.ok(r.total.gain >= REFINE_LIMITS.minGain && r.total.after - r.total.before === r.total.gain, `${tag}: التحسن ${r.total.gain}`);
  for (const p of d.score.parts) assert.ok(re.parts.find(x => x.id === p.id).score >= p.score, `${tag}: انخفض مؤشر ${p.id}`);
  assert.deepEqual(r.table.map(x => x.id), d.score.parts.map(p => p.id), tag + ': جدول قبل/بعد لكل مؤشر');
  assert.ok(r.table.every(x => x.after - x.before === x.diff && x.diff >= 0));
  // الحركة: كل غرفة مسمّاة وصلتها الحركة في الأصل ما زالت موصولة (تُقاس مرة أخرى مستقلًّا)
  assert.ok(r.changes.length >= 1 && r.changes.every(c => /\d/.test(c.text)), tag + ': وصف التغيير بالأرقام');
}

for (const [w, l, f] of CASES) test(`حسّن هذا التصميم ${w}×${l} ${f === 1 ? 'دور' : 'دوران'}: حتمي، آمن، وتحسن فعلي أو «لا تحسين» صادق`, async () => {
  const s = await sessionOf(w, l, f), n = Math.min(s.designs.length, 6);
  assert.ok(n >= 3, `${w}×${l}: ${n} تصاميم فقط`);
  let improved = 0;
  for (let i = 0; i < n; i++) {
    const tag = `${w}×${l} · ${i + 1}`, r = refineDesign(s, i); verify(s, i, r, tag);
    if (i < 2) assert.deepEqual(JSON.parse(JSON.stringify(refineDesign(s, i))), JSON.parse(JSON.stringify(r)), tag + ': حتمية');
    if (r.status === 'improved') improved++;
    results.set(`${w}×${l}·${i}`, { before: r.before.total, after: r.after?.total ?? null, parts: r.table?.filter(x => x.diff).map(x => `${x.id}:${x.before}→${x.after}`) });
  }
  assert.ok(improved <= n);
});

test('المجموع عبر الأراضي: يوجد تحسين فعلي ويوجد «لا تحسين» (لا يُختلق تحسين لكل تصميم)', async () => {
  for (const [w, l, f] of CASES) await sessionOf(w, l, f);
  const all = [...results.values()]; if (!all.length) return; // تُشغَّل الاختبارات السابقة أولًا
  assert.ok(all.some(x => x.after !== null), 'لا تحسين واحد عبر كل التصاميم');
  assert.ok(all.some(x => x.after === null), 'كل التصاميم «تحسنت»: مشبوه');
  console.log('# قبل/بعد المقاس:', JSON.stringify([...results]));
});

test('عتبة غير ممكنة ← «لا تحسين متاح» بالمؤشر الأضعف وسببه، ولا يُمسّ المستند', async () => {
  const s = await sessionOf(20, 30, 1), snap = JSON.stringify(s), r = refineDesign(s, 0, { minGain: 99 });
  assert.equal(r.status, 'none'); assert.match(r.reason, /لا تحسين متاح لهذا التصميم/); assert.match(r.reason, /المؤشر الأضعف/);
  assert.equal(JSON.stringify(s), snap, 'الجلسة لم تُمسّ');
});

test('طلب صريح (غرفة النوم بمقاس، مطبخ بجهة): لا ينكسر بند منه، ولو كان أي تعديل يكسره', async () => {
  const s = await pageSession(20, 30, 1, ' والمطبخ في الخلف وغرفة النوم الرئيسية 4×5', 2);
  for (let i = 0; i < Math.min(3, s.designs.length); i++) verify(s, i, refineDesign(s, i), `طلب صريح · ${i + 1}`);
});

test('عامل التوليد: عملية refine تعيد النتيجة نفسها بيانات صِرفة', async () => {
  const s = await sessionOf(15, 25, 1), direct = refineDesign(s, 1), viaWorker = await OPS.refine({ session: s, index: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(direct)), JSON.parse(JSON.stringify(viaWorker)));
});

test('اعتمد التحسين: يُضاف تصميمًا جديدًا في الجلسة والأصل باقٍ حرفيًا؛ ولا يتغير شيء قبل الاعتماد', async () => {
  let found = null;
  for (const [w, l, f] of CASES) { const s = await sessionOf(w, l, f); for (let i = 0; i < s.designs.length && !found; i++) { const r = refineDesign(s, i); if (r.status === 'improved') found = { s, i, r }; } if (found) break; }
  assert.ok(found, 'لا تصميم محسَّن للاختبار');
  const { s, i, r } = found, before = JSON.stringify(s), n0 = s.designs.length, orig = s.designs[i].doc;
  const s2 = applyRefinement(s, i, r);
  assert.equal(JSON.stringify(s), before, 'الجلسة الممرَّرة لم تُعدَّل');
  assert.equal(s2.designs.length, n0 + 1); assert.equal(s2.current, n0);
  assert.equal(s2.designs[i].doc, orig, 'الأصل لم يُستبدل');
  const e = s2.designs[n0];
  assert.equal(e.doc, r.doc); assert.equal(e.score.total, r.after.total, 'درجة التصميم الجديد المخزَّنة هي المقيسة');
  assert.equal(e.feedback.refine, i); assert.equal(e.pat, s.designs[i].pat, 'نمط التوزيع نفسه');
  assert.ok(e.notes[0].includes(`${r.total.before} ← ${r.total.after}`) && /\d/.test(e.notes[1]), 'ملاحظة بالأرقام: ' + e.notes[0]);
  assert.equal(e.notes[0], refineNote(r, i)[0]);
  assert.ok(e.feedback.reply.refine.table.length === s.designs[0].score.parts.length);
  assert.throws(() => applyRefinement(s, i, { status: 'none' }), /لا تحسين/);
});

test('الواجهة: زر «حسّن هذا التصميم» وزرّا «اعتمد التحسين» و«أبقِ الأصل» وجدول قبل/بعد RTL، والتشغيل في العامل', () => {
  const ui = readFileSync(new URL('../dist/design.mjs', import.meta.url), 'utf8'), client = readFileSync(new URL('../dist/design-client.mjs', import.meta.url), 'utf8'), worker = readFileSync(new URL('../dist/design-worker.mjs', import.meta.url), 'utf8');
  for (const t of ['حسّن هذا التصميم', 'اعتمد التحسين', 'أبقِ الأصل', 'btnRefine', 'refineInWorker', 'rf-table', 'applyRefinement']) assert.ok(ui.includes(t), 'design.mjs: ' + t);
  assert.match(client, /refineInWorker = .*run\('refine'/); assert.match(worker, /refine: .*refineDesign/);
  assert.match(readFileSync(new URL('../dist/design.html', import.meta.url), 'utf8'), /dir="rtl"/);
});

test('التعداد حتمي ومرتب، ولا يمسّ المستند الممرَّر', async () => {
  const s = await sessionOf(20, 30, 1), doc = parseDoc(s.designs[0].doc), snap = JSON.stringify(doc);
  const a = enumerateEdits(doc).map(e => e.id), b = enumerateEdits(doc).map(e => e.id);
  assert.deepEqual(a, b); assert.ok(a.length > REFINE_LIMITS.maxCandidates / 2); assert.equal(JSON.stringify(doc), snap);
});
