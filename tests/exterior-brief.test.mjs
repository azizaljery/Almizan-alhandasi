// الشكل الخارجي: حوار شرعاء بعد اعتماد المخطط، وتحويل الجواب إلى طراز وقالب معماري يخص المخطط وذوق صاحبه.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exteriorQuestions, EXTERIOR_QUESTIONS, EXTERIOR_STYLES, normalizeExterior, readExterior, setExterior, parseExteriorText, applyExteriorText, describeExterior,
  resolveStyle, pickTemplate, chooseExterior, storeExterior, loadExterior, isAutoExterior, EXTERIOR_KEY } from '../dist/exterior-brief.mjs';
import { STYLES } from '../dist/facade-j/facade-realism/styles/index.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';

const load = async id => (await STYLES[id].load()).templates;
const gen = (w, l, floors, beds, keep = 3) => (floors === 2 ? generateVillaTwoFloors : generateVillaDesigns)({ land: { width: w, length: l, streets: ['s'], entries: ['s'], floors }, counts: { bedrooms: beds, majlis: 1, baths: beds, kitchens: 1, halls: 1, dining: 1 }, requirements: {}, keep }).designs.map(d => d.doc);
const session = (prefs = {}) => ({ v: 1, input: { requirements: { prefs } }, designs: [{}], current: 0 });

test('الحوار: يبدأ بما يستهوي العميل، والطرز خمسة فقط، وكل سؤال له سبب وخيار «دع الميزان يقترح»', () => {
  const qs = exteriorQuestions({});
  assert.deepEqual(qs.map(q => q.id), ['feel', 'style', 'tone', 'openings', 'entrance', 'night']);
  assert.deepEqual(EXTERIOR_STYLES.map(s => s.label), ['سلماني', 'معاصر', 'حجازي', 'نجدي', 'كلاسيكي']);
  for (const q of EXTERIOR_QUESTIONS) { assert.ok(q.reason.length > 20, q.id); assert.equal(q.options.at(-1).id, 'auto', q.id); }
});
test('الحوار: الأسئلة اللاحقة تتبع الجواب السابق', () => {
  const her = exteriorQuestions({ feel: 'heritage' }).find(q => q.id === 'style');
  assert.deepEqual(her.options.filter(o => o.suggested).map(o => o.id), ['N', 'H', 'S'], 'التراث يقدّم الطرز التراثية');
  assert.match(her.reason, /الأصالة والتراث/);
  assert.deepEqual(exteriorQuestions({ style: 'N' }).find(q => q.id === 'tone').options.map(o => o.id), ['warm', 'light', 'stone', 'auto'], 'مواد النجدي فقط');
  assert.match(exteriorQuestions({ style: 'N' }).find(q => q.id === 'openings').reason, /النجدي/);
  assert.ok(!exteriorQuestions({ openings: 'private' }).some(q => q.id === 'screen'));
  assert.deepEqual(exteriorQuestions({ openings: 'wide' }).map(q => q.id), ['feel', 'style', 'tone', 'openings', 'screen', 'entrance', 'night'], 'الساتر يُسأل بعد الزجاج الواسع فقط');
});
test('التخزين: الجواب في prefs.exterior، والطراز الصريح يوحّد prefs.style، والأصل لا يتغير', () => {
  const s0 = session({ taste: ['privacy'] }), s1 = setExterior(s0, { style: 'N', tone: 'warm', bogus: 1, openings: 'nonsense' });
  assert.equal(readExterior(s0), null); assert.equal(s0.input.requirements.prefs.exterior, undefined);
  assert.deepEqual(readExterior(s1), { feel: 'auto', style: 'N', tone: 'warm', openings: 'auto', screen: 'auto', entrance: 'auto', night: 'auto', notes: '' });
  assert.equal(s1.input.requirements.prefs.style, 'najdi'); assert.equal(s1.input.requirements.prefs.styleWish, 'نجدي'); assert.deepEqual(s1.input.requirements.prefs.taste, ['privacy']);
  const mem = new Map(), st = { setItem: (k, v) => mem.set(k, v), getItem: k => mem.get(k) ?? null };
  assert.ok(storeExterior(st, { style: 'H' })); assert.ok(mem.has(EXTERIOR_KEY)); assert.equal(loadExterior(st).style, 'H');
  assert.ok(isAutoExterior(normalizeExterior({}))); assert.ok(!isAutoExterior({ tone: 'stone' }));
});
test('الكلام الحر: يُفهم ما يخص الواجهة ويُطبَّق على الجلسة (واجهة لوحة شرعاء)', () => {
  const r = parseExteriorText('احب الهيبة وابيها نجدية بحجر ومدخل غائر ومشربيات وتكون مضاءة بالليل');
  assert.deepEqual(r.found, { style: 'N', tone: 'stone', screen: 'yes', entrance: 'recessed', night: 'lit', feel: 'grand' });
  const a = applyExteriorText(session(), 'غيّر الواجهة إلى حجازي بلون فاتح وزجاج واسع');
  assert.ok(a.changed); assert.deepEqual(a.understood, ['حجازي', 'فاتح: أبيض أو عاجي', 'زجاج واسع وإطلالة']);
  assert.equal(readExterior(a.session).style, 'H'); assert.match(readExterior(a.session).notes, /حجازي/);
  const same = applyExteriorText(a.session, 'حجازي'); assert.equal(same.changed, false); assert.equal(same.session, a.session, 'بلا تغيير تعود الجلسة نفسها');
  const none = applyExteriorText(a.session, 'كبّر المطبخ'); assert.deepEqual(none.understood, []); assert.equal(none.changed, false);
  assert.deepEqual(describeExterior({ style: 'C', entrance: 'grand' }), ['كلاسيكي', 'مدخل بارز مهيب']);
});
test('الطراز: جواب العميل ثم ما يستهويه ثم ذوقه السابق ثم اقتراح الميزان؛ و«معاصر» يُحسم بالمواد', () => {
  const [doc] = gen(20, 30, 1, 3, 1);
  assert.deepEqual([resolveStyle(doc, { style: 'N' }).id, resolveStyle(doc, { style: 'N' }).source], ['N', 'answer']);
  assert.equal(resolveStyle(doc, { style: 'modern', tone: 'stone' }).id, 'J'); assert.equal(resolveStyle(doc, { style: 'modern', tone: 'light' }).id, 'M');
  const f = resolveStyle(doc, { feel: 'heritage' }); assert.equal(f.source, 'feel'); assert.ok(['N', 'H', 'S'].includes(f.id)); assert.match(f.reason, /الأصالة والتراث/);
  assert.deepEqual([resolveStyle(doc, {}, { style: 'hijazi' }).id, resolveStyle(doc, {}, { style: 'hijazi' }).source], ['H', 'taste']);
  const m = resolveStyle(doc, {}); assert.equal(m.source, 'mizan'); assert.notEqual(m.id, 'J', 'المعاصر الحجري لا يُقترح إلا بطلب');
});
test('القالب: حتمي، يطابق عدد أدوار المخطط، ويتبع الجواب معماريًا', async () => {
  const [d1] = gen(20, 30, 1, 3, 1), [d2] = gen(20, 30, 2, 4, 1);
  for (const id of Object.keys(STYLES)) for (const [doc, lv] of [[d1, 1], [d2, 2]]) {
    const T = await load(id), a = pickTemplate(T, { doc, exterior: {}, styleId: id }), b = pickTemplate(T, { doc, exterior: {}, styleId: id });
    assert.deepEqual(a, b, id + ': حتمي'); const t = T.find(x => x.id === a.tpl), fl = t.p.floors ?? t.p.fl ?? t.p.flr;
    assert.equal(fl, lv, `${id} ${a.tpl}: أدوار القالب ${fl} ≠ أدوار المخطط ${lv}`);
  }
  const M = await load('M');
  const wide = pickTemplate(M, { doc: d2, exterior: { openings: 'wide', screen: 'yes' }, styleId: 'M' }), priv = pickTemplate(M, { doc: d2, exterior: { openings: 'private' }, styleId: 'M' });
  assert.notEqual(wide.tpl, priv.tpl, 'الزجاج الواسع والخصوصية قالبان مختلفان'); assert.ok(wide.matched.length, 'الزجاج الواسع خلف ساتر له قوالب مطابقة في المعاصر الخفيف');
  const N = await load('N'); const calm = pickTemplate(N, { doc: d1, exterior: { feel: 'simple' }, styleId: 'N' }), rich = pickTemplate(N, { doc: d1, exterior: { feel: 'grand', entrance: 'grand' }, styleId: 'N' });
  assert.notEqual(calm.tpl, rich.tpl, 'البساطة والهيبة قالبان مختلفان');
  assert.equal(pickTemplate([], { doc: d1 }), null);
});
test('البصمة: مخططات مختلفة بلا جواب تحصل على واجهات مختلفة، والذوق السابق يُحترم', async () => {
  const docs = [...gen(20, 30, 1, 3), ...gen(20, 30, 2, 4), ...gen(25, 35, 2, 5), ...gen(18, 27, 1, 4)], seen = new Set();
  for (const doc of docs) { const c = await chooseExterior({ doc, exterior: {}, prefs: {}, loadTemplates: load }); assert.ok(c.tpl && c.why.includes('قالب')); seen.add(c.style + ':' + c.tpl); }
  assert.ok(seen.size >= Math.ceil(docs.length * .6), `واجهات مختلفة ${seen.size} من ${docs.length}`);
  const c = await chooseExterior({ doc: docs[0], exterior: {}, prefs: { style: 'najdi', taste: ['privacy'] }, loadTemplates: load });
  assert.equal(c.style, 'N'); assert.equal(c.source, 'taste');
  const fail = await chooseExterior({ doc: docs[0], exterior: { style: 'C' }, loadTemplates: async () => { throw new Error('x'); } });
  assert.equal(fail.style, 'C'); assert.equal(fail.tpl, '', 'تعذّر تحميل القوالب: الطراز بلا قالب');
});
