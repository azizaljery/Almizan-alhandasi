// شرعاء تتعاون: تفهم النفي واليمين واليسار و«جنب بعض» و«بين»، وتقول بصدق ما لم تفهمه،
// وتطبّق التعديل على التصميم المعروض نفسه بدل توزيع جديد، وترد بما نفّذته وما لم تستطعه.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRules, docRooms, doorInfo } from '../dist/rules.mjs';
import { extractRequirements, normalizeAr } from '../dist/requirements.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign, ledgerFor } from '../dist/design-session.mjs';

const R = t => extractRules(normalizeAr(t)).rules.map(r => [r.kind, r.a, r.b || r.side || r.floor, r.mode || ''].join(':'));
const LAND = (o = {}) => ({ width: 20, length: 30, streets: ['s'], entries: ['s'], floors: 1, ...o });
const BASE = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
async function design(text, counts = BASE, land = LAND()) {
  const req = extractRequirements(text, { counts });
  const out = await generateInitialDesign({ land, counts: req.counts, requirements: req, idea: text });
  return { out, req, ledger: out.ledger };
}

test('النفي لا ينقلب: «لا تحط غرف النوم على الشارع» = لا تلامس الواجهة', () => {
  assert.deepEqual(R('لا تحط غرف النوم على الشارع'), ['place:bedrooms:front:avoid']);
  assert.deepEqual(R('المطبخ ما يكون في الخلف'), ['place:kitchen:front:half']);
  assert.deepEqual(R('لا تخلي المجلس جنب المطبخ'), ['apart:majlis:kitchen:']);
});
test('يمين ويسار الداخل، والوسط، و«جنب بعض»، و«بين»، والعطف بحرف الجر', () => {
  assert.deepEqual(R('المجلس يكون يمين المدخل والمطبخ يسار'), ['place:majlis:right:zone', 'place:kitchen:left:zone']);
  assert.deepEqual(R('خل الصاله وسط البيت'), ['place:hall:center:center']);
  assert.deepEqual(R('غرف العيال جنب بعض'), ['cluster:kids::']);
  assert.deepEqual(R('المجلس والمقلط جنب بعض'), ['adjacent:majlis:dining:']);
  assert.deepEqual(R('المقلط يكون بين المجلس والمطبخ'), ['adjacent:dining:majlis:', 'adjacent:dining:kitchen:']);
  assert.deepEqual(R('ابغى غرفة الماستر بعيده عن الشارع وعن المجلس'), ['place:master:back:half', 'far:master:majlis:']);
  // «الماستر ومجلس» نكرة بلا حرف جر: بقية قائمة البرنامج لا معطوف على العلاقة
  assert.deepEqual(R('4 غرف وغرف الأولاد قريبة من الماستر ومجلس'), ['near:kids:master:']);
});
test('ما لم يُفهم يُقال للعميل نصًا، وما فُهم لا يُعرض كغير مفهوم', () => {
  const r = extractRequirements('ابي فيلا فيها 4 غرف نوم ومجلس وصالة ومطبخ، والمطبخ في الخلف، وابي الاضاءة طبيعية في كل مكان، والدرج يكون عريض', {});
  assert.deepEqual(r.unclear, ['ابي الاضاءة طبيعية في كل مكان', 'الدرج يكون عريض']);
  assert.deepEqual(extractRequirements('ابي بيت دور واحد فيه اربع غرف نوم وحده منها ماستر بحمامها وغرفة ملابس والباقي يتشاركون حمامين', {}).unclear, []);
  const u = extractRequirements('ابي ملحق خارجي وسطح', {}); assert.equal(u.unsupported.length, 2);
});
test('المجلس يمين الداخل (مدخل جنوبي: الشرق) والمطبخ يساره — منفذ ومقيس', async () => {
  const { out, ledger } = await design('المجلس يكون يمين المدخل والمطبخ يسار');
  assert.ok(ledger.filter(x => x.id.startsWith('R')).every(x => x.ok), ledger.map(x => x.text + ' ' + x.why).join('؛ '));
  const { rooms, B } = docRooms(out.doc), m = rooms.find(r => /مجلس/.test(r.name)), k = rooms.find(r => r.name === 'المطبخ');
  assert.ok((m.x0 + m.x1) / 2 > (B.x0 + B.x1) / 2 && (k.x0 + k.x1) / 2 < (B.x0 + B.x1) / 2);
});
test('غرفة ضيوف بحمامها قرب المجلس، ومكتب بمدخل خارجي، وفصل مجلس النساء', async () => {
  const { out, ledger } = await design('ابي غرفه للضيوف بحمامها قريبه من المجلس، ومكتب بمدخل خارجي، ومجلس النساء مستقل عن الرجال', { ...BASE, majlis: 2, baths: 6 });
  const bad = ledger.filter(x => !x.ok); assert.equal(bad.length, 0, bad.map(x => x.text + ' ' + x.why).join('؛ '));
  const D = doorInfo(out.doc); assert.ok(D.extDoors('المكتب') > 0);
  assert.ok(docRooms(out.doc).rooms.some(r => r.name === 'غرفة الضيوف'));
  assert.ok(ledger.find(x => x.id === 'C-bed').ok, 'غرفة الضيوف لا تُعد من غرف النوم المطلوبة');
});
test('التعديل يُطبَّق على التصميم المعروض نفسه، والرد يذكر ما نُفّذ', async () => {
  const req = extractRequirements('3 غرف ومجلس', { counts: BASE });
  const first = await generateInitialDesign({ land: LAND(), counts: req.counts, requirements: req });
  const s0 = createSession({ land: LAND(), counts: req.counts, requirements: req, result: first });
  const { session, reply } = await redesign(s0, { text: 'المطبخ بجانب الطعام' });
  assert.equal(session.designs[1].pat, session.designs[0].pat, 'نفس التوزيع');
  assert.deepEqual(reply.done, ['«المطبخ» بجوار «الطعام»']);
  assert.ok(reply.kept);
  // «توزيع مختلف» صراحة: نمط آخر
  const { session: s2 } = await redesign(session, { picks: ['layout'] });
  assert.notEqual(s2.designs[2].pat, session.designs[1].pat);
});
test('ملاحظة غير مفهومة لا تولّد تصميمًا عشوائيًا بل تطلب إعادة الصياغة', async () => {
  const req = extractRequirements('3 غرف ومجلس', { counts: BASE });
  const first = await generateInitialDesign({ land: LAND(), counts: req.counts, requirements: req });
  const s0 = createSession({ land: LAND(), counts: req.counts, requirements: req, result: first });
  await assert.rejects(() => redesign(s0, { text: 'خل التصميم عصري ومريح' }), e => e.code === 'SHARA_UNCLEAR' && /عصري/.test(e.message));
  const led = ledgerFor(s0); assert.ok(Array.isArray(led));
});
