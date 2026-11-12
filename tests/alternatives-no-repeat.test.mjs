// «تصميم آخر» لا يكرر تصميمًا عُرض (بالبصمة البصرية للمخطط المبني لا بتوقيع المولّد)، حتى خمسة بدائل متتالية،
// وطلب البديل نصًا يُفهم، ودمج تصميمين يعطي توزيعًا سليمًا جديدًا ليس نسخة من أحدهما.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign, mergeDesigns, currentDoc, wantsAlternative } from '../dist/design-session.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { checkDoc, visualSim, visualSig, VISUAL_LIMIT, BLEND_COPY, patIdea, IDEA_CAP } from '../dist/villa-layout.mjs';

async function session(l, text) {
  const land = { ...l, streets: ['s'], entries: ['s'] }, b = buildBrief(text, { land });
  const result = await generateInitialDesign({ land, rooms: [], discovery: b.discovery, idea: text, counts: b.counts, requirements: b.requirements });
  return createSession({ land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: text, result });
}
async function fiveNoRepeat(l, text, ask = {}) {
  let s = await session(l, text);
  const shown = s.designs.map(d => visualSig(JSON.parse(d.doc)));
  for (let i = 0; i < 5; i++) {
    let o; try { o = await redesign(s, ask); } catch (e) { assert.equal(e.code, 'VILLA_EXHAUSTED', e.message); return { s, n: i }; }
    s = o.session; const doc = currentDoc(s), sig = visualSig(doc);
    assert.ok(checkDoc(doc).ok, 'تصميم سليم');
    const worst = Math.max(...shown.map(x => visualSim(sig, x)));
    assert.ok(worst <= VISUAL_LIMIT.relaxed, `البديل ${i + 1} يشبه تصميمًا سابقًا بنسبة ${Math.round(worst * 100)}٪`);
    shown.push(sig);
  }
  return { s, n: 5 };
}

test('طلب البديل نصًا يُفهم طلبًا لتوزيع مختلف', () => {
  for (const t of ['ابي تصميم بديل', 'أبغى تصميم آخر', 'توزيع مختلف لو سمحت', 'غيره', 'ما عجبني', 'ابي شي ثاني', 'مخطط جديد']) assert.ok(wantsAlternative(t), t);
  for (const t of ['المطبخ في الخلف', 'المجلس أكبر', 'غرفة النوم 4×5']) assert.ok(!wantsAlternative(t), t);
});

for (const [name, l, text] of [
  ['دور واحد 20×30', { width: 20, length: 30, floors: 1 }, '4 غرف نوم ومجلس رجال ومقلط ومطبخ وصالة وغرفة خادمة'],
  ['دوران 20×30', { width: 20, length: 30, floors: 2 }, '5 غرف نوم ومجلسين ومقلط ومطبخ وصالة'],
  ['شكل L', { width: 20, length: 30, floors: 1 }, 'ابي مبنى على شكل L، 4 غرف نوم ومجلس ومطبخ وصالة'],
  ['فناء U', { width: 25, length: 30, floors: 1 }, 'ابي مبنى على شكل U والمنتصف حديقة، 4 غرف نوم ومجلس ومطبخ وصالة'],
]) test(`${name}: «تصميم آخر» المتتالي بلا تكرار مرئي ولا تكرار للفكرة نفسها بأسماء مختلفة`, async () => {
  // شكوى المالك: «بعد المقترح الثالث يعيد المخططات نفسها ويغيّر الأسماء». الفكرة المعمارية الواحدة لا تُعرض أكثر من IDEA_CAP
  // مرات في كل ما يراه العميل (البداية + «تصميم آخر»)، ثم يُعلن النفاد بدل التكرار؛ فالمطلوب سبعة تصاميم مختلفة على الأقل لا خمسة «أخرى».
  const { s } = await fiveNoRepeat(l, text);
  const per = {}; for (const d of s.designs) per[patIdea(d.pat)] = (per[patIdea(d.pat)] || 0) + 1;
  // الشكل الذي طلبه العميل صراحةً (L أو U) تنويعاته مطلوبة فلا يُحدّ؛ ما عداه لا تتكرر فكرته فوق الحد
  const asked = /شكل L/.test(text) ? 'L' : /شكل U/.test(text) ? 'court' : null;
  assert.ok(s.designs.length >= (asked ? 6 : 7), `أقل من ${asked ? 'ستة' : 'سبعة'} تصاميم مختلفة: ${s.designs.length}`);
  assert.ok(Math.max(...Object.entries(per).filter(([k]) => k !== asked).map(([, v]) => v), 0) <= IDEA_CAP, 'فكرة تكررت فوق الحد: ' + JSON.stringify(per));
  if (!asked) assert.ok(Object.keys(per).length >= 4, 'أربع أفكار تنظيم مختلفة على الأقل: ' + Object.keys(per).join('، '));
});

test('كتابة «ابي تصميم بديل مختلف» تعطي بديلًا مختلفًا لا رسالة «لم أفهم»', async () => {
  // بعد سقوف المقاسات صار المعروض من البداية أربعة تصاميم (كان اثنين)، والتوزيعات المتضخمة لم تعد تُحسب بدائل؛
  // فالمطلوب: الطلب النصي يُفهم ويعطي بدائل مختلفة، ومجموع ما يراه العميل لا يقل عن سبعة، ثم يُعلن النفاد بدل التكرار.
  const { n, s } = await fiveNoRepeat({ width: 18, length: 30, floors: 1 }, 'غرفتا نوم، الرئيسية بحمام خاص، ومجلس ومطبخ وصالة', { text: 'ابي تصميم بديل مختلف' });
  // بعد مطابقة المولّد للارتداد النظامي (وجه الجدار الخارجي على الخط: المسطح أضيق 30 سم) تتسع هذه الأرض (18 × 30، عرض البناء 14.7 م
  // بدل 15 م) لخمسة تصاميم مختلفة لا سبعة: أربعة من البداية وواحد بالطلب النصي، ثم يُعلن النفاد بدل التكرار (قيس قبل/بعد: 7 ← 5).
  assert.ok(n >= 1, 'بديل بالنص على الأقل: ' + n);
  assert.ok(s.designs.length >= 5, 'مجموع التصاميم المختلفة المعروضة: ' + s.designs.length);
});

test('البداية: حتى خمسة تصاميم مختلفة مرئيًا يتنقل بينها العميل', async () => {
  const s = await session({ width: 20, length: 30, floors: 1 }, '4 غرف نوم ومجلس رجال ومقلط ومطبخ وصالة');
  assert.ok(s.designs.length >= 3 && s.designs.length <= 5, 'عدد التصاميم: ' + s.designs.length);
  const sigs = s.designs.map(d => visualSig(JSON.parse(d.doc)));
  for (let i = 0; i < sigs.length; i++) for (let j = 0; j < i; j++) assert.ok(visualSim(sigs[i], sigs[j]) <= VISUAL_LIMIT.relaxed, `التصميمان ${j + 1} و${i + 1} متشابهان`);
});

for (const [name, l, text] of [
  ['دور واحد', { width: 20, length: 30, floors: 1 }, '4 غرف نوم ومجلس رجال ومقلط ومطبخ وصالة'],
  ['دوران', { width: 20, length: 30, floors: 2 }, '5 غرف نوم ومجلسين ومقلط ومطبخ وصالة'],
]) test(`دمج تصميمين (${name}): توزيع سليم جديد ليس نسخة من أحدهما، والرد يشرح ما أُخذ من كلٍّ`, async () => {
  const s = await session(l, text);
  const o = await mergeDesigns(s, 0, 1);
  const doc = currentDoc(o.session);
  assert.ok(checkDoc(doc).ok);
  const sig = visualSig(doc), a = visualSim(sig, visualSig(JSON.parse(s.designs[0].doc))), b = visualSim(sig, visualSig(JSON.parse(s.designs[1].doc)));
  assert.ok(a < BLEND_COPY && b < BLEND_COPY, `ليس نسخة: ${a} ${b}`);
  assert.ok(a > .3 && b > .3, `يأخذ من التصميمين: ${a} ${b}`);
  assert.deepEqual(o.reply.merge, [1, 2]);
  assert.ok(o.reply.fromA.length + o.reply.fromB.length + o.reply.both.length > 0);
  assert.equal(o.session.current, o.session.designs.length - 1);
  await assert.rejects(mergeDesigns(s, 0, 0), /تصميمين مختلفين/);
});
