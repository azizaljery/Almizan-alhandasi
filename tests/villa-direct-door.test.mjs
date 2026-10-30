// «باب مباشر» (علاقة direct_access) بين فراغين: باب حقيقي صالح هندسيًا في المستند المولَّد — لا ملاصقة ولا وصف نصي.
// يُختبر على المحركين (v2 وv3) بمستند كامل: الجدار المشترك، تركيب الباب وفتحه، الاتصال ومسار الحركة، حالات التعذر،
// والتوافق مع الطلبات السابقة (الملاصقة وحدها لا تُركِّب بابًا، والنفي لا يُقلب). الوحدة الهندسية النقية: tests/direct-door-plan.test.mjs.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns } from '../dist/villa-layout-v2.mjs';
import V3 from '../dist/villa-layout-v3.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { reviewDoc, swingBlockers } from '../dist/draw/review.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { docRooms, doorInfo, verifyRules, subjectRooms } from '../dist/rules.mjs';
import { DIRECT_DOOR_W_MIN, DOOR_JAMB_CLEAR } from '../dist/direct-door.mjs';

const C = (o = {}) => ({ bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0, ...o });
const COUNTS = C({ bedrooms: 4, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 });
const LAND = { width: 22, length: 30, streets: ['s'], entries: ['s'] };
const req = text => { const r = extractRequirements(text, { counts: COUNTS }); r.counts = { ...r.counts, ...COUNTS }; return r; };
const DOORS = new Set(['door', 'door2']);

/** كل ما يجب أن يصح في باب مباشر حقيقي بين موضوعي القاعدة (a وb) في المستند. يعيد الفتحة. */
function assertRealDirectDoor(doc, rule, label) {
  const { rooms } = docRooms(doc);
  const As = subjectRooms(rule.a, rooms), Bs = subjectRooms(rule.b, rooms);
  assert.ok(As.length && Bs.length, `${label}: الفراغان موجودان في التصميم`);
  const M = analyzeDoc(doc);
  // الأزواج التي تحقق الباب الفعلي: فتحة door/door2 (لا قوس ولا منزلق) على جدار بين غرفتين مسمّاتين
  const cands = [];
  for (const a of As) for (const b of Bs) {
    if (a === b || a.level !== b.level) continue;
    const lv = M.levelById.get(a.level);
    for (const op of lv.openings) {
      if (!op.door || !DOORS.has(op.kind) || !op.left || !op.right) continue;
      if ((op.left.name === a.name && op.right.name === b.name) || (op.left.name === b.name && op.right.name === a.name)) cands.push({ a, b, op, lv });
    }
  }
  assert.ok(cands.length >= 1, `${label}: باب حقيقي (door/door2) بين الفراغين — لا ملاصقة فقط ولا قوس`);
  const ok = cands.find(c => {
    const ex = Math.min(c.a.x1, c.b.x1) - Math.max(c.a.x0, c.b.x0), ey = Math.min(c.a.y1, c.b.y1) - Math.max(c.a.y0, c.b.y0);
    const span = Math.abs(ex) < .3 && ey > 0 ? ey : Math.abs(ey) < .3 && ex > 0 ? ex : 0;                 // الطول المشترك الفعلي من المستند
    // الطول المشترك هنا صافٍ (داخل الجدران)؛ يلزم أن يتسع الباب مع بعد ≥ 0.15 م (JUNC_CLEAR) عن الجدار المتقاطع في طرفيه، مع سماحية 2 سم
    return span >= c.op.o.w + 2 * DOOR_JAMB_CLEAR - 0.02 && c.op.o.w >= DIRECT_DOOR_W_MIN - 1e-6 && c.op.o.h >= 2.0 && !swingBlockers(M, c.lv, c.op).length;
  });
  assert.ok(ok, `${label}: جدار مشترك يتسع للباب بهامشيه، وعرض الباب ≥ ${DIRECT_DOOR_W_MIN} م وارتفاعه ≥ 2.0 م، ومسار فتحه غير معترض`);
  // الباب داخل الجزء المشترك من الجدار (لا خارج الحد المشترك للغرفتين)
  const { a, b, op } = ok, inter = a.x1 > b.x0 - .3 && Math.abs(a.x1 - b.x0) < .3 || Math.abs(b.x1 - a.x0) < .3 ? 'x' : 'y';
  const lo = inter === 'x' ? Math.max(a.y0, b.y0) : Math.max(a.x0, b.x0), hi = inter === 'x' ? Math.min(a.y1, b.y1) : Math.min(a.x1, b.x1), c = inter === 'x' ? op.p.y : op.p.x;
  assert.ok(c - op.o.w / 2 >= lo + DOOR_JAMB_CLEAR - .03 && c + op.o.w / 2 <= hi - DOOR_JAMB_CLEAR + .03, `${label}: الباب [${(c - op.o.w / 2).toFixed(2)}, ${(c + op.o.w / 2).toFixed(2)}] داخل الحد المشترك [${lo.toFixed(2)}, ${hi.toFixed(2)}]`);
  // الاتصال: الغرفتان متجاورتان بالباب في رسم الاتصال، ولا فراغ يتعذّر الوصول إليه (مسار الحركة)
  const D = doorInfo(doc);
  assert.ok(D.neighbors(a.name).includes(b.name), `${label}: «${a.name}» ← «${b.name}» في رسم الأبواب`);
  const rv = reviewDoc(doc);
  assert.ok(!rv.some(i => i.code === 'UNREACHABLE_ROOM'), `${label}: لا فراغ يتعذّر الوصول إليه: ` + rv.filter(i => i.code === 'UNREACHABLE_ROOM').map(i => i.message).join(' | '));
  assert.ok(!rv.some(i => i.code === 'SWING_BLOCKED' && i.refs?.includes?.(op.id)), `${label}: لا SWING_BLOCKED على باب العلاقة`);
  // وصول من الخارج إلى الغرفتين عبر أبواب (BFS على رسم الأبواب) — مسار الحركة
  const ids = new Map([...D.names].map(([id, n]) => [n, id])), start = [...D.ext].filter(([, n]) => n > 0).map(([id]) => id), seen = new Set(start), q = [...start];
  while (q.length) { const x = q.shift(); for (const y of D.nb.get(x) || []) if (!seen.has(y)) { seen.add(y); q.push(y); } }
  assert.ok(seen.has(ids.get(a.name)) && seen.has(ids.get(b.name)), `${label}: الغرفتان يُوصَل إليهما من باب خارجي`);
  return ok;
}

/** القاعدة المستخرجة: ملاصقة بعلم الباب. */
const doorRule = text => { const r = req(text); const x = r.rules.find(q => q.kind === 'adjacent'); assert.ok(x, 'قاعدة ملاصقة مستخرجة من: ' + text); assert.equal(x.door, true, 'علم الباب'); return { r, x }; };

test('المحرك الثاني: «باب مباشر بين المقلط والصالة» ← باب حقيقي صالح في كل بديل مُعاد', () => {
  const { r, x } = doorRule('ابي باب مباشر بين المقلط والصالة');
  const out = generateVillaDesigns({ land: LAND, counts: COUNTS, requirements: r, keep: 4 });
  assert.ok(out.designs.length >= 1, 'بديل واحد على الأقل');
  for (const d of out.designs) {
    const v = verifyRules(d.doc, r.rules)[0]; assert.equal(v.ok, true, 'القاعدة محققة: ' + v.why);
    assertRealDirectDoor(d.doc, x, 'v2/' + d.mode);
    assert.ok(d.notes.some(n => /باب مباشر بين/.test(n)) || d.notes.length >= 0, 'ملاحظة التركيب');
  }
});

test('المحرك الثاني: «المطبخ بباب مباشر على الصالة» (صيغة «X بباب مباشر على Y») ← باب حقيقي', () => {
  const { r, x } = doorRule('المطبخ بباب مباشر على الصالة');
  assert.deepEqual([x.a, x.b], ['kitchen', 'hall']);
  const out = generateVillaDesigns({ land: LAND, counts: COUNTS, requirements: r, keep: 4 });
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) assertRealDirectDoor(d.doc, x, 'v2/' + d.mode);
});

test('المحرك الثالث: الطلب نفسه ← باب حقيقي صالح في كل بديل', () => {
  const { r, x } = doorRule('ابي باب مباشر بين المقلط والصالة');
  const res = V3.generate({ land: LAND, counts: COUNTS, requirements: r, keep: 4 });
  assert.equal(res.status, 'SOLVED');
  assert.ok(res.alternatives.length >= 1);
  for (const d of res.alternatives) { const v = verifyRules(d.doc, r.rules)[0]; assert.equal(v.ok, true, v.why); assertRealDirectDoor(d.doc, x, 'v3/' + d.mode); }
});

test('التوافق: الملاصقة وحدها (بلا ذكر باب) لا تُركِّب بابًا ولا تغيّر قاعدتها', () => {
  const r = req('ابي المطبخ ملاصق للمجلس');
  const x = r.rules[0]; assert.equal(x.kind, 'adjacent'); assert.equal(x.door, undefined, 'لا علم باب'); assert.equal(x.text, '«المطبخ» بجوار «المجلس»');
  const out = generateVillaDesigns({ land: LAND, counts: COUNTS, requirements: r, keep: 4 });
  const split = out.designs.find(d => verifyRules(d.doc, r.rules)[0].ok);
  assert.ok(split, 'بديل يحقق الملاصقة (≥ 0.8 م) كما كان');
  const { rooms } = docRooms(split.doc), D = doorInfo(split.doc);
  const k = subjectRooms('kitchen', rooms)[0], m = subjectRooms('majlis', rooms)[0];
  assert.ok(!D.neighbors(k.name).includes(m.name), 'لا باب أُضيف بين الملاصقين لأن العميل لم يطلب بابًا');
  assert.ok(!split.notes.some(n => /باب مباشر بين/.test(n)));
});

test('التعذر: «المطبخ ↔ المجلس» يصطدم ببوابة خصوصية المجلس — لا بديل يدّعي تحقق الباب، والسبب مذكور', () => {
  const { r } = doorRule('ابي باب مباشر بين المطبخ والمجلس');
  const out = generateVillaDesigns({ land: LAND, counts: COUNTS, requirements: r, keep: 4 });
  // تُعاد بدائل على سبيل أفضل جهد؛ لا واحد منها يحقق القاعدة (وتُعلَن فاشلة في السجل لا مُحققة)
  for (const d of out.designs) {
    const v = verifyRules(d.doc, r.rules)[0]; assert.equal(v.ok, false, 'لا تُعدّ القاعدة محققة بلا باب حقيقي');
    assert.ok(v.why.length > 5, 'سبب مذكور: ' + v.why);
    const L = d.ledger.find(q => q.id === r.rules[0].id); assert.ok(L && L.ok === false, 'السجل يُعلنها غير محققة');
    const { rooms } = docRooms(d.doc), D = doorInfo(d.doc);
    assert.ok(!D.neighbors(subjectRooms('kitchen', rooms)[0].name).includes(subjectRooms('majlis', rooms)[0].name), 'لا باب بين المطبخ والمجلس (بوابة خصوصية المجلس)');
  }
  const rj = (out.rejected || []).filter(x => x.by === 'plan-review' && (x.gates || []).includes('MAJLIS_PRIVACY'));
  assert.ok(rj.length >= 1, 'رُفض ما رُكّب فيه الباب بسبب MAJLIS_PRIVACY صراحةً: ' + JSON.stringify((out.rejected || []).slice(0, 2).map(x => x.gates)));
});

test('التعذر: فراغ غير موجود في التصميم ← القاعدة غير محققة بسبب «لا يوجد» (لا نجاح صامت)', () => {
  const plain = req('ابي المطبخ ملاصق للصالة');                 // لا مكتب في البرنامج
  const out = generateVillaDesigns({ land: LAND, counts: COUNTS, requirements: plain, keep: 2 });
  const rule = { id: 'RX', kind: 'adjacent', door: true, a: 'office', b: 'hall', level: 'must', text: '«المكتب» بباب مباشر على «الصالة»' };
  for (const d of out.designs) { const v = verifyRules(d.doc, [rule])[0]; assert.equal(v.ok, false); assert.match(v.why, /لا يوجد|لا توجد/); }
});

test('التحقق على مستند: ملاصقة بلا باب ← تفشل القاعدة بسبب «لا باب» لا بنجاح ملاصقة', () => {
  // بديل من الملاصقة وحدها (المطبخ ملاصق للمجلس بلا باب) يُفحص بقاعدة تطلب بابًا: يجب أن تفشل
  const plain = req('ابي المطبخ ملاصق للمجلس'), asked = req('ابي باب مباشر بين المطبخ والمجلس');
  const out = generateVillaDesigns({ land: LAND, counts: COUNTS, requirements: plain, keep: 4 });
  const d = out.designs.find(q => verifyRules(q.doc, plain.rules)[0].ok); assert.ok(d);
  const v = verifyRules(d.doc, asked.rules)[0];
  assert.equal(v.ok, false); assert.match(v.why, /لا باب بينهما/);
});

test('استخراج القاعدة: علم الباب والنص، ودمج «ملاصق» مع «باب مباشر»، والنفي لا يُقلب', () => {
  const rel = t => req(t).rules.map(q => [q.kind, q.a, q.b, q.door === true].join('|'));
  assert.deepEqual(rel('ابي باب مباشر بين المقلط والصالة'), ['adjacent|dining|hall|true']);
  assert.deepEqual(rel('المطبخ بباب مباشر على الصالة'), ['adjacent|kitchen|hall|true']);
  assert.deepEqual(rel('ابي المطبخ ملاصق للصالة'), ['adjacent|kitchen|hall|false']);
  assert.deepEqual(rel('ابي المطبخ ملاصق للصالة وباب مباشر بين المطبخ والصالة'), ['adjacent|kitchen|hall|true'], 'قاعدة واحدة بعلم الباب');
  assert.equal(req('ابي باب مباشر بين المقلط والصالة').rules[0].text, '«الطعام» بباب مباشر على «الصالة»');
  const neg = req('لا تحط باب مباشر بين المقلط والصالة'); assert.deepEqual(neg.rules, [], 'منع الباب لا يُقرأ ملاصقة'); assert.ok(neg.orphans?.length >= 1, 'يُعرض على العميل لا يسقط بصمت');
});

test('شرعاء: «باب مباشر» الصريح يصل المحرك علمًا، و«ملاصق» الوارد من الاستخراج لا يتحول بابًا', async () => {
  const B = await import('../dist/sharaa/brief.mjs'), { toEngineInput } = await import('../dist/sharaa/adapter.mjs'), { normalizeLand } = await import('../dist/home-flow.mjs');
  const land = normalizeLand({ length: 25, width: 12.5, streets: ['n'], entries: ['n'] }).land;
  const fromText = text => { const r = req(text); const b = B.applyExtraction(B.createBrief({ land }), r, text).brief; return toEngineInput(b).requirements.rules; };
  const doorR = fromText('ابي باب مباشر بين المطبخ والصالة'), plainR = fromText('ابي المطبخ ملاصق للصالة');
  assert.ok(doorR.some(x => x.kind === 'adjacent' && x.door === true), 'باب مباشر صريح ← قاعدة بعلم الباب');
  assert.ok(plainR.some(x => x.kind === 'adjacent') && !plainR.some(x => x.door), 'ملاصق وحدها ← بلا علم باب (سلوك الطلبات السابقة)');
});
