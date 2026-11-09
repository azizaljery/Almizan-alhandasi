// المصعد: بئر متراصّ في الصالة على الدورين، بباب على الصالة وكابينة، مع فهم شرعاء (محلي ومزوّد وهمي للذكاء).
// كل ردود المزوّد محاكاة؛ لا مفتاح حقيقي ولا اتصال. أبعاد البئر «غير متحقق» (ELEVATOR_SPEC.verified === false).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEVATOR_SPEC, ROOM_TYPES, FIXTURES } from '../dist/draw/catalog.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { SharaSession, generateInitialDesign } from '../dist/home-flow.mjs';
import { generateVillaTwoFloors, generateVillaDesigns, checkDoc } from '../dist/villa-layout.mjs';
import { planElevator, elevatorCandidates } from '../dist/elevator-plan.mjs';
import { validateDoc } from '../dist/draw/doc.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { computeDocQuantities } from '../dist/draw/quantities-doc.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { fixtureSymbol } from '../dist/draw/plan-annot.mjs';
import { BRIEF_SCHEMA, createWorker } from '../worker/server.mjs';

const ORIGIN = 'https://mizan.example';
const TXT = 'فيلا دورين مجلس وثلاث غرف نوم ومصعد';
const land = (w, l, floors = 2) => ({ width: w, length: l, streets: ['s'], entries: ['s'], floors });
const design = async (w = 20, l = 30, text = TXT) => {
  const b = buildBrief(text, { land: { width: w, length: l, floors: 2 } });
  return generateInitialDesign({ land: land(w, l), rooms: [], idea: text, counts: b.counts, requirements: b.requirements });
};
const lifts = doc => doc.labels.filter(x => x.type === 'elevator');

test('الكتالوج: نوع الغرفة والكابينة وثابت الأبعاد المعلَن «غير متحقق»', () => {
  assert.equal(ROOM_TYPES.elevator.ar, 'مصعد');
  assert.ok(FIXTURES['elevator-car'].rooms.includes('elevator'));
  assert.equal(ELEVATOR_SPEC.verified, false, 'لا مصدر موثق لأبعاد البئر فلا تُدّعى متحققة');
  assert.ok(ELEVATOR_SPEC.cabW < ELEVATOR_SPEC.shaftW - 2 * ELEVATOR_SPEC.wall * .5 && ELEVATOR_SPEC.cabD < ELEVATOR_SPEC.shaftD - ELEVATOR_SPEC.wall, 'الكابينة داخل البئر');
  const sym = fixtureSymbol({ kind: 'elevator-car', x: 0, y: 0, w: 1.1, d: 1.4, rot: 0 });
  assert.ok(sym.lines.length >= 3 && sym.rects.length === 1, 'رمز 2D: مستطيل وقطران وخط الباب');
});

test('الفهم المحلي: مصعد/اسانسير/ليفت طلب مدعوم، والنفي لا يُعدّ طلبًا', () => {
  for (const t of ['ابي مصعد', 'فيلا دورين ومصعد', 'ابغى اسانسير', 'فيه ليفت ودورين', 'نبي المصعد']) {
    const r = extractRequirements(t, {});
    assert.equal(r.prefs.elevator, true, t);
    assert.ok(!r.unsupported.some(u => /المصعد/.test(u)), 'لا يقال غير مدعوم: ' + t);
  }
  for (const t of ['ما ابي مصعد', 'بدون مصعد', 'لا ابغى اسانسير', 'مو محتاج ليفت']) assert.ok(!extractRequirements(t, {}).prefs.elevator, t);
});

test('المولّد: بئر واحد على الدورين بالموضع نفسه، بباب وكابينة، والمستند سليم والسجل ناجح', async () => {
  const out = await design();
  const doc = out.doc, L = lifts(doc);
  assert.equal(L.length, 2, 'تسمية على كل دور');
  assert.deepEqual(L[0].seed, L[1].seed, 'متراصّ');
  assert.equal(new Set(L.map(x => x.level)).size, 2);
  const cars = doc.fixtures.filter(f => f.kind === 'elevator-car'); assert.equal(cars.length, 2);
  for (const c of cars) assert.ok(Math.abs(c.x - L[0].seed.x) < .01 && Math.abs(c.y - L[0].seed.y) < .01);
  // باب لكل بئر: فتحة على أحد جدرانه
  for (const l of L) {
    const near = doc.walls.filter(w => w.level === l.level && w.t === ELEVATOR_SPEC.wall && [w.a, w.b].every(p => Math.abs(p.x - l.seed.x) < 1.2 && Math.abs(p.y - l.seed.y) < 1.2));
    assert.ok(doc.openings.some(o => near.some(w => w.id === o.wall)), 'باب المصعد على ' + l.level);
  }
  assert.deepEqual(validateDoc(doc), []); assert.ok(checkDoc(doc).ok);
  assert.ok(!reviewDoc(doc).some(i => i.code === 'ELEVATOR_ALIGN' || i.code === 'UNREACHABLE_ROOM' && /المصعد/.test(i.message)));
  const e = out.ledger.find(x => x.id === 'E-elevator'); assert.ok(e && e.ok, JSON.stringify(e));
  assert.ok(out.notes.some(n => /المصعد/.test(n) && /غير متحقق/.test(n)), 'الملاحظة تعلن أن الأبعاد غير متحققة');
});

test('المراجعة: بئر ناقص أو غير متراصّ يُنبَّه إليه', async () => {
  const { doc } = await design();
  const bad = structuredClone(doc); const l = lifts(bad)[1]; l.seed = { x: l.seed.x + 1.5, y: l.seed.y };
  assert.ok(reviewDoc(bad).some(i => i.code === 'ELEVATOR_ALIGN'));
  const one = structuredClone(doc); one.labels = one.labels.filter(x => !(x.type === 'elevator' && x.level === one.levels[1].id));
  assert.ok(reviewDoc(one).some(i => i.code === 'ELEVATOR_ALIGN' && /لا يصل/.test(i.message)));
  const led = verifyRequest(bad, { prefs: { elevator: true } }, { entry: 's' }).find(x => x.id === 'E-elevator'); assert.equal(led.ok, false);
});

test('الكميات: عدد الآبار وتوقفاتها، وجهاز المصعد غير قابل للحساب بلا مواصفة', async () => {
  const { doc } = await design();
  const rows = computeDocQuantities(doc).rows;
  assert.equal(rows.find(r => r.id === 'elevators').value, 1);
  assert.equal(rows.find(r => r.id === 'elevatorStops').value, 2);
  const unit = rows.find(r => r.id === 'elevatorUnit'); assert.equal(unit.grade, 'unavailable'); assert.equal(unit.value, null);
  const none = computeDocQuantities(generateVillaTwoFloors({ land: land(20, 30), counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1 }, requirements: { prefs: { floors: 2 } }, keep: 1 }).designs[0].doc).rows;
  assert.ok(!none.some(r => r.id === 'elevators'), 'بلا طلب لا صفوف مصعد');
});

test('التخطيط: مرشحون صالحون، ورفض صادق بدور واحد، وبلا طلب لا يتغير شيء', () => {
  const r = generateVillaTwoFloors({ land: land(20, 30), counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1 }, requirements: { prefs: { floors: 2 } }, keep: 1 });
  const d = r.designs[0].doc;
  assert.ok(!lifts(d).length);
  const c = elevatorCandidates(d); assert.ok(c.length > 0);
  for (const k of c) { assert.ok(k.tucked >= 1); assert.ok(k.door.dg >= ELEVATOR_SPEC.landing); }
  const one = generateVillaDesigns({ land: land(20, 30, 1), counts: { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1 }, requirements: { prefs: { elevator: true } }, keep: 1 }).designs[0];
  assert.ok(!lifts(one.doc).length, 'بدور واحد لا يُرسم');
  assert.ok(one.notes.some(n => /المصعد يلزمه دوران/.test(n)), 'ملاحظة صادقة');
  const e = one.ledger.find(x => x.id === 'E-elevator'); assert.ok(e && !e.ok);
  const same = planElevator(one.doc); assert.equal(same.doc, one.doc); assert.ok(same.report.missing);
});

test('شرعاء: المصعد مفهوم لا غير مدعوم، ودور واحد صريح ملاحظة، وبلا أدوار سؤال', () => {
  const two = buildBrief(TXT, { land: { width: 20, length: 30 } });
  assert.equal(two.requirements.prefs.elevator, true); assert.ok(!two.unsupported.some(u => /المصعد/.test(u)));
  assert.ok(two.understood.some(u => /مصعد/.test(u)));
  assert.ok(!two.questions.some(q => q.id === 'elevator_floors'), 'دورين مذكورة');
  const open = buildBrief('ابي مصعد وثلاث غرف ومجلس', { land: { width: 20, length: 30 } });
  const q = open.questions.find(x => x.id === 'elevator_floors'); assert.ok(q, 'سؤال عدد الأدوار'); assert.deepEqual(q.options.map(o => o.id), ['two', 'one']);
  const one = buildBrief('دور واحد مع مصعد', { land: { width: 20, length: 30 } });
  assert.ok(one.notes.some(n => /المصعد يربط دورين/.test(n))); assert.ok(!one.questions.some(x => x.id === 'elevator_floors'));
  const neg = buildBrief('ما ابي مصعد ودورين', { land: { width: 20, length: 30 } });
  assert.ok(!neg.requirements.prefs.elevator);
});

test('محادثة سعودية: «أسانسير» ثم الجواب «دورين» يصل إلى التصميم', async () => {
  const s = new SharaSession({ land: land(22, 30, 1) }); s.start(); s.answer('mode', 'free');
  const out = s.answer('free', 'ابغى فيلا فيها اسانسير ومجلس وثلاث غرف');
  const ask = out.find(m => m.kind === 'ask' && m.id === 'elevator_floors'); assert.ok(ask, 'سؤال الأدوار');
  s.answer('elevator_floors', { picks: ['two'], text: '' });
  assert.equal(s.brief.floors, 2); assert.equal(s.brief.requirements.prefs.elevator, true);
});

test('مسار Claude (مزوّد وهمي): المصعد يصل إلى الخطة ولا يُعرض كغير مدعوم', async () => {
  const ENV = { ANTHROPIC_API_KEY: 'unit-test-only', MIZAN_ACCESS_CODE: 'c', ALLOWED_ORIGIN: ORIGIN };
  const worker = createWorker({}, async (url, init) => {
    assert.match(JSON.parse(init.body).system, /المصعد \(مصعد/);
    return Response.json({ stop_reason: 'tool_use', model: 'm', content: [{ type: 'tool_use', id: 't', name: 'submit_home_brief', input: { summary: 's', assumptions: [], questions: [], unhandled: ['المصعد غير ممثل في rooms'], rooms: [{ name: 'غرفة نوم', type: 'bedroom', area: 16, position: 'back', side: 'any' }], requirements: { rules: [], unclear: ['مصعد'] } } }] });
  });
  const text = 'فيلا دورين وفيها مصعد';
  const r = await worker.fetch(new Request('https://w/api/assistant', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Mizan-Access-Code': 'c' }, body: JSON.stringify({ prompt: text, plot: { width: 22, length: 32, floors: 2, streets: { s: true } } }) }), ENV);
  assert.equal(r.status, 200);
  const { brief } = await r.json();
  const s = new SharaSession({ land: land(22, 32) }); s.start(); s.answer('mode', 'free');
  const msgs = s.answer('free', { text, counts: {}, requirements: brief.requirements, assumptions: brief.assumptions, questions: [...brief.questions, ...brief.unhandled] });
  assert.equal(s.brief.requirements.prefs.elevator, true);
  assert.deepEqual(s.brief.requirements.unclear, []);
  assert.ok(!JSON.stringify(msgs).includes('غير ممثل'), 'ضجيج الذكاء عن المصعد لا يُعرض');
  s.answer('counts', { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 });
  const out = await generateInitialDesign({ land: land(22, 32), counts: s.counts, requirements: s.requirements });
  const e = out.ledger.find(x => x.id === 'E-elevator'); assert.ok(e && e.ok, JSON.stringify(e));
  assert.equal(lifts(out.doc).length, 2);
});

test('نطاق الأرض: نسبة وضع المصعد عالية، وما لا يتسع يُعلَن بصدق لا يُرسم قسرًا', async () => {
  let placed = 0, total = 0, honest = 0;
  for (const [w, l] of [[20, 30], [25, 30], [15, 25], [30, 30], [18, 28], [25, 40], [20, 20], [12, 25]]) {
    const out = await design(w, l);
    for (const a of out.alternatives) {
      total++;
      if (lifts(a.doc).length === 2) { placed++; assert.ok(checkDoc(a.doc).ok, `${w}×${l}`); assert.deepEqual(validateDoc(a.doc), [], `${w}×${l}`); }
      else if ((a.notes || []).some(n => /لم أجد داخل الصالة|لم يسلم أيها/.test(n))) honest++;
    }
  }
  assert.equal(placed + honest, total, 'كل بديل إمّا فيه مصعد أو يقول بصدق لماذا لا');
  assert.ok(placed / total >= .7, `نسبة الوضع ${placed}/${total}`);
});
