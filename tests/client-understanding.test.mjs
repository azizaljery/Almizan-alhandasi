// فهم العميل: «ورّني وين نفّذت طلبي» (كل بند يعرف فراغاته في المخطط)، ومقارنة تصميمين بأرقام مقيسة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign, ledgerFor, currentDoc } from '../dist/design-session.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { compareDesigns, movedRooms } from '../dist/compare-designs.mjs';

async function session(text, l = { width: 20, length: 30, floors: 1 }) {
  const land = { ...l, streets: ['s'], entries: ['s'] }, b = buildBrief(text, { land });
  const result = await generateInitialDesign({ land, rooms: [], discovery: b.discovery, idea: text, counts: b.counts, requirements: b.requirements });
  return createSession({ land, counts: b.counts, requirements: b.requirements, discovery: b.discovery, idea: text, result });
}

test('كل بند في «هل نُفّذ طلبك؟» يحمل فراغاته الموجودة فعلًا في المخطط', async () => {
  const s = await session('4 غرف نوم ومجلس رجال بمدخل مستقل ومجلس نساء ومقلط ومطبخ مفتوح على الطعام وصالة، المطبخ في الخلف، حمام خاص لكل غرفة، غرفة خادمة بحمام');
  const doc = currentDoc(s), names = new Set(doc.labels.map(l => l.name)), led = ledgerFor(s);
  assert.ok(led.length >= 10);
  for (const it of led) {
    if (it.id === 'P-floors') continue;
    assert.ok(Array.isArray(it.where) && it.where.length > 0, 'بند بلا موضع: ' + it.id + ' ' + it.text);
    for (const w of it.where) { assert.ok(names.has(w.name), `«${w.name}» غير موجود في المخطط (${it.id})`); assert.ok(doc.levels.some(l => l.id === w.level)); }
  }
  const g = led.find(x => x.id === 'P-guest'); assert.ok(g.where.some(w => /مدخل الرجال/.test(w.name)) && g.where.some(w => /مجلس الرجال|المجلس/.test(w.name)), 'المدخل المستقل يضيء المدخل والمجلس');
  const open = led.find(x => x.id === 'P-open'); assert.deepEqual(new Set(open.where.map(w => w.name)), new Set(['المطبخ', 'صالة الطعام']));
});

test('دوران: البنود تحمل الدور الصحيح لكل فراغ', async () => {
  const s = await session('5 غرف نوم ومجلس ومطبخ وصالة، غرفة النوم الرئيسية في الدور الأول', { width: 20, length: 30, floors: 2 });
  const doc = currentDoc(s);
  for (const it of ledgerFor(s)) for (const w of it.where || []) assert.ok(doc.labels.some(l => l.name === w.name && l.level === w.level), `${w.name} @ ${w.level}`);
});

test('مقارنة تصميمين: نسبة تشابه، وما تغيّر موضعه، وفروق مقيسة، وعناوين مختصرة', async () => {
  let s = await session('4 غرف نوم ومجلس رجال ومقلط ومطبخ وصالة');
  if (s.designs.length < 2) s = (await redesign(s, {})).session;
  const A = JSON.parse(s.designs[0].doc), B = JSON.parse(s.designs[1].doc);
  const c = compareDesigns(A, B, { ledgerA: ledgerFor({ ...s, current: 0 }, A), ledgerB: ledgerFor({ ...s, current: 1 }, B), nameA: '1', nameB: '2' });
  assert.ok(c.sim >= 0 && c.sim < 100, 'ليسا متطابقين: ' + c.sim);
  assert.ok(c.moved.a.length > 0 && c.moved.b.length > 0, 'فراغات تغيّر موضعها');
  assert.ok(c.headlines.length >= 1 && c.headlines.length <= 4);
  const built = c.rows.find(r => r.label === 'مسطح البناء'); assert.ok(built.a > 0 && built.b > 0 && built.diff === Math.round((built.b - built.a) * 10) / 10);
  // التصميم مع نفسه: تطابق تام ولا فراغ تغيّر موضعه
  const same = compareDesigns(A, A); assert.equal(same.sim, 100); assert.equal(movedRooms(A, A).a.length, 0);
});
