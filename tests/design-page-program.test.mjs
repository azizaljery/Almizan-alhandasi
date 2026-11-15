// «تصميم آخر» ببرنامج الصفحة الحقيقي: الطلب يُبنى عبر SharaSession (محادثة حرة «دور واحد …») فيحمل ما تحمله الصفحة فعلًا:
// تفضيلات (مدخل ضيوف/نساء/عائلة منفصل، حمامات خارج الصالة، حمام لكل غرفة) وقواعد مخصصة وعدد دورات مياه، ودور واحد مصرَّح به.
// قياس: 12.5×30 دور واحد بهذا البرنامج الكامل لا يتسع إلا لتوزيع واحد (المسطح القابل للبناء 9.2×25.2 م = 232 م²؛ النمط الجانبي وحده يتسع،
// وكل ترتيب آخر يسقط بعرض غرفة النوم الملحقة أو انتفاخها). تخفيف أي افتراض (الحمام لكل غرفة، القواعد، الصالة الخارجية…) لم يزد العدد، وما زاد عنه
// كان دمج مجلس النساء المطلوب صراحة، فلا يُفعل. فالمطلوب هنا: النفاد الصادق بعدده الحقيقي لا اختلاق تصاميم.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SharaSession, generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, extendSession, exhaustedMessage } from '../dist/design-session.mjs';
import { checkDoc, visualSig, visualSim, VISUAL_LIMIT, splitFails } from '../dist/villa-layout.mjs';
import { checkMunicipal } from '../dist/municipal-rules.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

const TEXT = {
  3: 'ابي فيلا دور واحد 3 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ',
  4: 'ابي فيلا دور واحد 4 غرف نوم ومجلس رجال ومجلس نساء وصالة ومطبخ وغرفة خادمة',
};
const GUARDED = ['setback_front', 'setback_street', 'setback_neighbor', 'roof_parapet', 'coverage_ground', 'coverage_first'];
// [العرض، الطول، غرف النوم، الحد الأدنى المقيس بهامش، هل يُنتظر النفاد قبل العشرين]
const CASES = [[12.5, 30, 3, 1, true], [15, 25, 3, 12, true], [15, 25, 4, 3, true], [20, 30, 3, 20, false], [20, 30, 4, 20, false]];

/** كما تفعل الصفحة: SharaSession ثم التوليد الأولي ثم إنشاء الجلسة. */
async function pageSession(w, l, beds) {
  const land = { width: w, length: l, floors: 1, streets: ['s'], entries: ['s'] };
  const sh = new SharaSession({ land }); sh.start(); sh.answer('mode', 'free'); sh.answer('free', TEXT[beds]);
  assert.equal(sh.requirements.prefs.floors, 1, 'الدور الواحد مصرَّح به كما في الصفحة');
  const result = await generateInitialDesign({ land, rooms: [], discovery: sh.discovery(), idea: sh.idea, counts: sh.counts, requirements: sh.requirements });
  return createSession({ land, counts: sh.counts, requirements: sh.requirements, discovery: sh.discovery(), idea: sh.idea, result });
}

for (const [w, l, beds, min, ends] of CASES) test(`برنامج الصفحة ${w}×${l} دور واحد · ${beds} غرف: لا أقل من ${min}، بلا نسخ ولا مخالفة، ونفاد صادق`, async () => {
  let s = await pageSession(w, l, beds);
  const first = s.designs.length;
  for (let guard = 0; guard < 60 && s.designs.length < 20; guard++) { const o = await extendSession(s, { target: 20, relaxed: true }); s = o.session; if (!o.added) break; }
  const n = s.designs.length, tag = `${w}×${l} · ${beds}`;
  assert.ok(n >= min, `${tag}: ${n} تصميمًا فقط (الأول ${first})`);
  assert.ok(s.designs.every(d => d.floors === 1), tag + ': كل التصاميم بدور واحد كما طُلب');
  if (ends && n < 20) {
    assert.ok(s.exhausted, tag + ': أقل من العشرين بلا إعلان نفاد');
    assert.equal(s.exhausted.count, n, 'العدد المعلن هو عدد ما عُرض فعلًا');
    assert.match(exhaustedMessage(n), new RegExp(`وصلنا إلى كل التوزيعات المختلفة الممكنة لأرضك وبرنامجك \\(${n} تصميمًا\\)`));
    // الأرض الضيقة بدور واحد مصرَّح: الإعلان يقترح الدورين بعدد مقيس (قيس 7 لـ12.5×30)، ولا يقترحهما حيث لا يزيدان العدد
    if (w === 12.5) {
      assert.ok(s.exhausted.twoFloors >= 4 && s.exhausted.twoFloors > n, `12.5×30: قياس الدورين ${s.exhausted.twoFloors}`);
      assert.match(exhaustedMessage(n, s.exhausted.twoFloors), new RegExp(`جرّب دورين.*قِسْتُ ${s.exhausted.twoFloors} تصاميم`));
    } else if (!s.exhausted.twoFloors) assert.doesNotMatch(exhaustedMessage(n, null), /جرّب دورين/);
  }
  const sigs = s.designs.map(d => visualSig(JSON.parse(d.doc)));
  for (let j = 1; j < n; j++) {
    let worst = 0; for (let i = 0; i < j; i++) worst = Math.max(worst, visualSim(sigs[j], sigs[i]));
    assert.ok(worst <= VISUAL_LIMIT.relaxed + 1e-9, `${tag}: التصميم ${j + 1} يشبه سابقًا بنسبة ${Math.round(worst * 100)}٪`);
    if (worst > VISUAL_LIMIT.strict + 1e-9 && j >= first) assert.ok((s.designs[j].notes || []).some(t => /يختلف (?:بـ|عنه) \d+٪ على الأقل/.test(t)), `${tag}: التصميم ${j + 1} يشبه سابقًا بنسبة ${Math.round(worst * 100)}٪ بلا إعلان`);
  }
  assert.equal(new Set(s.designs.map(d => d.doc)).size, n, 'مستندان متطابقان');
  const hard0 = splitFails(s.designs[0].ledger || [], s.input.requirements).hard;
  for (const [i, d] of s.designs.entries()) {
    const doc = parseDoc(d.doc), t = `${tag} · ${i + 1}`;
    assert.ok(checkDoc(doc).ok, t + ': مخطط سليم');
    assert.ok(splitFails(d.ledger || [], s.input.requirements).hard <= hard0, t + ': بنود طلب أخفقت أكثر من الأول');
    const res = checkMunicipal(doc, s.input.land);
    for (const id of GUARDED) { const it = res.items.find(x => x.id === id); assert.ok(it, t + ': بند ' + id); assert.notEqual(it.verdict, 'fail', `${t}: ${id} — ${it.text}`); }
    // لا يُسقَط مجلس النساء ولا الرجال (طلب صريح) ولو لتوسيع العدد
    const names = (doc.labels || []).map(r => r.name || '');
    assert.ok(names.some(x => /مجلس الرجال|المجلس/.test(x)) && names.some(x => /مجلس النساء/.test(x)), t + ': مجلسا الرجال والنساء قائمان');
  }
});
