// «تصميم آخر» = تصميم مختلف جذريًا بطلب العميل وحده: لا توليد تلقائي في الخلفية، الأول وحده عند البدء، وكل ضغطة تضيف تصميمًا واحدًا،
// ولا يتشابه زوج مما عُرض هيكليًا (موضع الصالة والسلّم والمجالس والمطبخ) فوق الحد إلا بإعلانه في ملاحظات التصميم.
// شكوى المالك: «لم يتغير شي ومازال يعطيني نفس التصاميم … ولا أريد أن تطلع كل التصاميم دفعة واحدة».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, extendSession, redesign } from '../dist/design-session.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { macroSig, macroSim, MACRO_LIMIT, checkDoc } from '../dist/villa-layout.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

const TEXT = 'ابي فيلا دورين 4 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ';
async function start(w, l, floors, text = TEXT) {
  const land = { width: w, length: l, floors, streets: ['s'], entries: ['s'] }, b = buildBrief(text, { land });
  const result = await generateInitialDesign({ land, rooms: [], discovery: b.discovery, idea: text, counts: b.counts, requirements: b.requirements });
  return createSession({ land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: text, result });
}
/** ضغطة «تصميم آخر» كما تفعلها الصفحة: الصارم أولًا، وإن وقف عند المختلف بوضوح فالأقرب بإعلانه. */
async function press(s) {
  let o = await extendSession(s, { target: s.designs.length + 1, relaxed: !!s.softEnd });
  if (o.softEnd && !o.added) o = await extendSession(o.session, { target: s.designs.length + 1, relaxed: true });
  return o;
}
const macros = s => s.designs.map(d => macroSig(parseDoc(d.doc)));

test('الواجهة: لا توليد تلقائي في الخلفية ولا شريط «أُعدّ لك المزيد»', () => {
  const src = fs.readFileSync(new URL('../dist/design.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /startBg|bgLoop|settleBg/, 'لا حلقة توليد خلفية');
  assert.doesNotMatch(src, /وأُعدّ لك المزيد/, 'لا شريط إعداد المزيد');
  // التوليد الإضافي يُستدعى من «تصميم آخر» وحده
  const uses = src.split('\n').filter(l => /extendInWorker\(/.test(l) && !/^import/.test(l));
  const fn = src.slice(src.indexOf('async function onNext()'), src.indexOf('function show(index)'));
  assert.ok(uses.length >= 1 && uses.every(l => fn.includes(l.trim())), 'extendInWorker خارج onNext');
});

test('البصمة الهيكلية: المطابق 1، والمقلوب يمينًا/يسارًا هو التصميم نفسه، والهيكل المختلف دون العتبة', async () => {
  const s = await start(15, 25, 2);
  const m = macroSig(parseDoc(s.designs[0].doc));
  assert.ok(m && m.hall && m.stair && m.majM && m.kit, 'ميزات الهيكل مستخرجة');
  assert.equal(macroSim(m, m), 1);
  const flip = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' && 'u' in v ? { ...v, u: 1 - v.u } : v]));
  assert.ok(macroSim(m, flip(m)) > .999, 'المقلوب = نفسه');
  const far = { ...m, hall: { ...m.hall, v: .1, w: .3, d: .9 }, stair: { u: .5, v: .1 }, majM: { u: .5, v: .9 }, kit: { u: .5, v: .1 }, majW: { u: .5, v: .1 }, ent: { u: .5, v: .9 } };
  assert.ok(macroSim(m, far) < MACRO_LIMIT.strict, 'هيكل مختلف كليًا تحت العتبة');
});

test('أرض الصورة 15×25 دورين: الأول وحده عند البدء، وكل ضغطة تضيف تصميمًا واحدًا، ولا زوج متشابه هيكليًا فوق الحد بلا إعلان', async () => {
  let s = await start(15, 25, 2);
  assert.equal(s.designs.length, 1, 'تصميم واحد فقط عند البدء (بلا بدائل التوليد الأولي)');
  assert.equal(s.seen.length, 1);
  const before0 = JSON.stringify(s);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(JSON.stringify(s), before0, 'لا شيء يتولّد من تلقاء نفسه');
  let added = 0;
  for (let k = 0; k < 8; k++) {
    const n = s.designs.length, o = await press(s);
    if (!o.added) { assert.ok(o.exhausted || o.softEnd, 'توقف صادق'); assert.equal(o.session.designs.length, n, 'لا إضافة عند النفاد'); break; }
    assert.equal(o.session.designs.length, n + 1, 'ضغطة واحدة = تصميم واحد'); s = o.session; added++;
    assert.equal(s.current, n === 0 ? 0 : s.current);
  }
  assert.ok(added >= 1, 'ضغطة «تصميم آخر» الأولى تعطي تصميمًا');
  const M = macros(s);
  for (let j = 1; j < M.length; j++) {
    let worst = 0; for (let i = 0; i < j; i++) worst = Math.max(worst, macroSim(M[j], M[i]));
    assert.ok(worst <= MACRO_LIMIT.relaxed + 1e-9, `التصميم ${j + 1} يشبه سابقًا هيكليًا بنسبة ${Math.round(worst * 100)}٪`);
    if (worst > MACRO_LIMIT.strict + 1e-9) assert.ok((s.designs[j].notes || []).some(t => /تشابهه الهيكلي/.test(t)), `التصميم ${j + 1} فوق ${MACRO_LIMIT.strict * 100}٪ بلا إعلان`);
  }
  // ما عُرض سليم، والأول والثاني لا يتشابهان هيكليًا (قبل: أغلب التصاميم من هيكل واحد بتشابه حتى 90٪)
  for (const d of s.designs) assert.ok(checkDoc(parseDoc(d.doc)).ok);
  if (M.length >= 2) assert.ok(macroSim(M[0], M[1]) <= MACRO_LIMIT.strict + 1e-9, 'أول «تصميم آخر» مختلف هيكليًا جذريًا');
});

test('أرض أوسع (20×30 دور): كل زوج من المعروض تحت الحد الهيكلي الأقصى، ويُفضَّل نمط لم يُعرض', async () => {
  let s = await start(20, 30, 1, 'ابي فيلا 4 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ');
  assert.equal(s.designs.length, 1);
  for (let k = 0; k < 4; k++) { const n = s.designs.length, o = await press(s); if (!o.added) break; assert.equal(o.session.designs.length, n + 1); s = o.session; }
  assert.ok(s.designs.length >= 3, 'ثلاثة تصاميم على الأقل');
  const M = macros(s);
  for (let j = 1; j < M.length; j++) for (let i = 0; i < j; i++) assert.ok(macroSim(M[j], M[i]) <= MACRO_LIMIT.relaxed + 1e-9);
  assert.ok(new Set(s.designs.map(d => String(d.pat).split('|')[0])).size >= 2, 'نمطان على الأقل من أول ثلاثة');
});

test('تعديل طلب محدد على تصميم معروض لا يستهلك التنوع ولا يُجري توليدًا إضافيًا', async () => {
  const s = await start(15, 25, 2);
  const o = await redesign(s, { picks: ['hall_big'] });
  assert.equal(o.session.designs.length, 2, 'تصميم جديد واحد لهذا الطلب');
});
