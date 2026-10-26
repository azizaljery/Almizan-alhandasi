// الجولة 21 — الإصلاح 02b (قرار المالك: «إعادة للتعديل» — docs/owner/decision-r21-fix02-2026-10-25.md على dev/architect-v2): المقاسات الصريحة
// قاعدة عامة لكل غرفة. الاختبارات الإلزامية العشرة في القرار (سادسًا)، على دوال المستودع الفعلية. غير معتمد؛ فرع dev/stage2-r21-proposal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements, DIM_TOL } from '../dist/requirements.mjs';
import { programV2, DIMS_KIT, TREE_KIT } from '../dist/villa-layout-v2.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { verifyRequest, docRooms } from '../dist/rules.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { buildWallSolids, pointBlocked, openingConsistency } from '../dist/draw/wall-geometry.mjs';
import { lintClientText } from '../dist/client-language.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { HELDOUT2 } from '../scripts/heldout2-cases.mjs';

const { dimPlan, wallPair, EXT, INT, MEN_LOBBY_D } = DIMS_KIT;
const req = (text, counts) => { const r = extractRequirements(text, { counts }); r.counts = { ...r.counts, ...counts }; return r; };
const C3 = { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
const LAND = (w, l, s = 's') => ({ width: w, length: l, streets: [s], entries: [s], floors: 1 });
const memo = new Map();
const gen = (key, text, counts, land, keep = 2) => {
  if (!memo.has(key)) { const r = req(text, counts); memo.set(key, { r, land, o: V3.generateVillaDesigns({ land, counts: r.counts, requirements: r, keep: r.want || keep }) }); }
  return memo.get(key);
};
const dims = (d, r, entry = 's') => verifyRequest(d.doc, r, { entry }).filter(x => x.kind === 'dims');
const shown = o => o.designs.filter(d => d.presentation?.status !== 'hidden');

test('02b (1) «بالضبط» و«تقريبًا» وبلا وصف: السماحية من تفسير الطلب الموثق (DIM_TOL)، ومقاس «بالضبط» يُرسم ضمن ±0.03 م لكل ضلع', { timeout: 900000 }, () => {
  assert.deepEqual({ ...DIM_TOL }, { exact: .03, default: .05, approx: .3 });
  const r = req('دور واحد، 3 غرف نوم، مجلس 5×6 بالضبط، المطبخ 4×4 تقريبًا، غرفة النوم الرئيسية 4.5×5', C3);
  assert.equal(r.dims.majlis.tol, DIM_TOL.exact); assert.equal(r.dims.kitchen.tol, DIM_TOL.approx); assert.equal(r.dims.master.tol, DIM_TOL.default);
  const { r: r1, o } = gen('exact', 'دور واحد، 3 غرف نوم، مجلس 5×6 بالضبط، المطبخ 4×4 تقريبًا', C3, LAND(22, 30));
  const d = shown(o)[0]; assert.ok(d, 'بديل غير محجوب');
  for (const x of dims(d, r1)) { assert.equal(x.ok, true, x.text + ' ' + x.why); }
  const m = dims(d, r1).find(x => x.id === 'D-majlis'); assert.ok(Math.abs(m.actual.s - 5) <= .03 && Math.abs(m.actual.l - 6) <= .03, JSON.stringify(m.actual));
});

test('02b (2) غرف نوم بمقاسات صريحة: كل غرفة نوم (بالمعنى نفسه في السجل) مقيسة بعد التفصيل طولًا وعرضًا ضمن ±0.05 م', { timeout: 900000 }, () => {
  const { r, o } = gen('beds', 'دور واحد، 3 غرف نوم كل غرفة 4×5، مجلس، صالة، مطبخ، طعام', C3, LAND(24, 30));
  const ok = shown(o); assert.ok(ok.length >= 1);
  for (const d of ok) {
    const x = dims(d, r).find(z => z.id === 'D-bedroom'); assert.equal(x.ok, true, x.why);
    const beds = docRooms(d.doc).rooms.filter(q => q.type === 'bedroom' && !/كبار السن|الضيوف/.test(q.name));
    assert.ok(beds.length >= 2);
    for (const b of beds) { const s = [b.x1 - b.x0, b.y1 - b.y0].sort((p, q) => p - q); assert.ok(Math.abs(s[0] - 4) <= .05 && Math.abs(s[1] - 5) <= .05, b.name + ' ' + s); }
  }
});

test('02b (3) الجدار الخارجي والداخلي والمشترك: كل طرف نصف سماكة جداره الفعلي (لا 0.2 م ولا جداران بلا تمييز)، والامتداد = الصافي + الطرفان', () => {
  assert.equal(wallPair(true, true), EXT); assert.equal(wallPair(false, false), INT); assert.equal(wallPair(true, false), EXT / 2 + INT / 2);
  const r = req('مطبخ 4×5', C3), P = programV2(r.counts, r), k = P.blocks.find(b => b.id === 'kitchen1');
  assert.deepEqual(k.dimNet, { s: 4, l: 5, tol: .05 });
  // جدار مشترك بين غرفتين داخليتين: لكل منهما نصفه (INT/2) فقط
  assert.equal(dimPlan(k, 5, wallPair(false, false), 'x').run, 4 + INT);
  // على حد الغلاف من جهة: EXT/2 + INT/2
  assert.equal(dimPlan(k, 5, wallPair(true, false), 'x').run, 4 + EXT / 2 + INT / 2);
});

test('02b (4) مجلس الرجال بدهليزه: الدهليز (1.5 م) يُضاف على محوره فقط، والضلع الآخر صافٍ، والاتجاه بقابلية التحقيق', () => {
  const r = req('مجلس رجال 5×6', { ...C3, majlis: 1 }), P = programV2(r.counts, r), m = P.blocks.find(b => b.kind === 'majlis' && b.men);
  if (!m?.guestWc) return; // البرنامج بلا شريط ضيافة: لا دهليز يُختبر هنا
  const ends = wallPair(false, false);
  const px = dimPlan(m, 6 + MEN_LOBBY_D, ends, 'x'); assert.equal(px.v, 'lobby'); assert.equal(px.run, 5 + ends); assert.equal(px.c, 6);
  const py = dimPlan(m, 5, ends, 'y'); assert.equal(py.run, 6 + MEN_LOBBY_D + ends); assert.equal(py.c, 5);
});

test('02b (5) المطبخ مع المخزن: الزائد في العمود مخزن حقيقي، والمطبخ يُقطع على صافيه بجداريه (لا يُمطّ)', () => {
  const r = req('مطبخ 4×4', C3), P = programV2(r.counts, r), k = P.blocks.find(b => b.id === 'kitchen1');
  const { Z, solve } = TREE_KIT;
  const sol = solve(Z([k], 'y0', 'x'), 4 + INT, 7);
  assert.ok(sol, 'يتسع');
  const kit = sol.placed.find(q => q.block.id === 'kitchen1'), pan = sol.placed.find(q => q.block.pantry);
  assert.ok(pan, 'مخزن'); const net = v => Math.round(v * 100) / 100;
  const kw = kit.r.x1 - kit.r.x0, kh = kit.r.y1 - kit.r.y0;
  assert.ok(Math.abs(kw - (4 + EXT / 2 + EXT / 2)) < .011 || Math.abs(kh - 4 - INT / 2 - EXT / 2) < .011, `المطبخ ${net(kw)}×${net(kh)}`);
});

test('02b (6) مساحة لا تستوعب المقاس المطلوب: رسالة صادقة بلا مصطلحات، ولا مخطط يخالف المقاس', () => {
  const r = req('دور واحد، 3 غرف نوم، مجلس 9×16', C3);
  assert.throws(() => V3.generateVillaDesigns({ land: LAND(14, 20), counts: r.counts, requirements: r, keep: 2 }), e => {
    assert.equal(e.code, 'VILLA_INFEASIBLE'); assert.match(e.message, /9×16|16/); assert.deepEqual(lintClientText(e.message), []); return true;
  });
});

test('02b (7) تدوير الغرفة وتبديل اتجاهها: الضلع العرضي يُختار بأقرب مطابقة للعرض المتاح (لا عتبة 0.30)، والمربع اتجاه واحد', () => {
  const r = req('مطبخ 4×5، طعام 4×4', C3), P = programV2(r.counts, r), k = P.blocks.find(b => b.id === 'kitchen1'), dn = P.blocks.find(b => b.kind === 'dining');
  const e = wallPair(false, false);
  assert.equal(dimPlan(k, 5.0, e, 'x').c, 5); assert.equal(dimPlan(k, 4.0, e, 'x').c, 4);
  // الحالة الحدية للعتبة القديمة (العرض أقصر من الضلع الطويل بـ 0.25 م): الأقرب هو الطويل (فرق 0.25) لا القصير (0.75)
  assert.equal(dimPlan(k, 4.75, e, 'x').c, 5); assert.equal(dimPlan(k, 4.4, e, 'x').c, 4);
  // الاتجاهان كلاهما مرشح؛ والمختار أقل فرقًا
  const p = dimPlan(k, 4.6, e, 'x'); assert.ok(p.err <= Math.min(Math.abs(4.6 - 5), Math.abs(4.6 - 4)) + 1e-9);
  assert.equal(dimPlan(dn, 3.9, e, 'x').a, 4); assert.equal(dimPlan(dn, 3.9, e, 'x').c, 4);
});

test('02b (8) شبكة 1 سم مقابل 5 سم: كل إحداثيات طلب المقاس على 1 سم، والغرف ذات المقاس لا تنحرف عن قطوعها، والأبواب والنوافذ داخل جدار واحد عند الوصلات', { timeout: 900000 }, () => {
  for (const key of ['exact', 'beds']) {
    const { o } = memo.get(key) || gen(key, key === 'exact' ? 'دور واحد، 3 غرف نوم، مجلس 5×6 بالضبط، المطبخ 4×4 تقريبًا' : 'دور واحد، 3 غرف نوم كل غرفة 4×5، مجلس، صالة، مطبخ، طعام', C3, LAND(key === 'exact' ? 22 : 24, 30));
    for (const d of shown(o)) {
      for (const w of d.doc.walls) for (const p of [w.a, w.b]) for (const v of [p.x, p.y]) assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `إحداثي ${v} ليس على 1 سم`);
      const oc = openingConsistency(d.doc); assert.equal(oc.ok, true, JSON.stringify(oc.issues.filter(i => i.major).slice(0, 3)));
    }
  }
  // طلب بلا مقاس صريح: الشبكة 5 سم كما كانت (لا تغيير لغير المعني)
  const { o } = gen('plain', 'دور واحد، 3 غرف نوم، مجلس، صالة، مطبخ، طعام', C3, LAND(22, 30));
  const d = o.designs[0];
  // الإحداثيات المطلقة مزاحة بموضع المبنى في الأرض؛ الشبكة نسبية: كل إحداثي على المحور نفسه يختلف عن غيره بمضاعفات 5 سم
  const ws = d.doc.walls.filter(w => !['fence', 'parapet'].includes(w.kind) && w.level === d.doc.levels[0].id);
  for (const ax of ['x', 'y']) { const v = ws.flatMap(w => [w.a[ax], w.b[ax]]), o0 = v[0], off = v.filter(z => Math.abs((z - o0) / .05 - Math.round((z - o0) / .05)) > 1e-6);
    assert.ok(off.length <= v.length * .1, `محور ${ax}: ${off.length} من ${v.length} خارج شبكة 5 سم النسبية في طلب بلا مقاس`); }
});

test('02b (9) تطابق 2D و3D: المجسم يُبنى من جدران المستند نفسها؛ كل وجه داخلي لكل غرفة في المسقط هو وجه جدار في المجسم (1 سم داخله حر، و1 سم خارجه داخل الجدار)', { timeout: 900000 }, () => {
  for (const key of ['exact', 'beds']) {
    const { o } = key === 'exact' ? gen(key, 'دور واحد، 3 غرف نوم، مجلس 5×6 بالضبط، المطبخ 4×4 تقريبًا', C3, LAND(22, 30)) : gen(key, 'دور واحد، 3 غرف نوم كل غرفة 4×5، مجلس، صالة، مطبخ، طعام', C3, LAND(24, 30));
    for (const d of shown(o)) {
      for (const lv of d.doc.levels) {
        const walls = d.doc.walls.filter(w => w.level === lv.id), solids = buildWallSolids(walls, d.doc.openings.filter(op => walls.some(w => w.id === op.wall)), { levelHeight: lv.height || 3.2 });
        // كل ضلع من المضلع الصافي للغرفة في المسقط (لا الصندوق المحيط: الوجه قد ينكسر حيث يتغير نوع الجدار وسماكته)
        const L = analyzeDoc(d.doc).levels.find(x => x.id === lv.id) || analyzeDoc(d.doc).levels[0];
        const rooms = L.rooms.filter(q => ['bedroom', 'master', 'majlis', 'kitchen', 'dining'].includes(q.type) && q.net?.length);
        assert.ok(rooms.length);
        for (const q of rooms) {
          const P = q.net, cx = P.reduce((a, p) => a + p.x, 0) / P.length, cy = P.reduce((a, p) => a + p.y, 0) / P.length, e = .01;
          for (let k = 0; k < P.length; k++) {
            const a = P[k], b = P[(k + 1) % P.length], len = Math.hypot(b.x - a.x, b.y - a.y); if (len < .3) continue;
            const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
            if ((cx - m.x) * nx + (cy - m.y) * ny < 0) { nx = -nx; ny = -ny; } // نحو داخل الغرفة
            assert.equal(pointBlocked(solids, { x: m.x + nx * e, y: m.y + ny * e }, 2.9, 3.0), false, `${q.name}: 1 سم داخل الوجه محجوب في المجسم`);
            assert.equal(pointBlocked(solids, { x: m.x - nx * e, y: m.y - ny * e }, 2.9, 3.0), true, `${q.name}: 1 سم خارج الوجه ليس جدارًا في المجسم`);
          }
        }
      }
    }
  }
});

test('02b (10) لا بديل محجوب بلا سبب: كل محجوب يحمل المرشح والمرحلة والقاعدة ومصدر الشرط ونص العميل، والمقيس والحد لبنود المقاس', { timeout: 900000 }, () => {
  // وحدة: بند مقاس راسب
  const st = presentationStatus({ pat: 'X1', doc: gen('beds', 'دور واحد، 3 غرف نوم كل غرفة 4×5، مجلس، صالة، مطبخ، طعام', C3, LAND(24, 30)).o.designs[0].doc, ledger: [{ id: 'D-bedroom', kind: 'dims', text: 'غرف الأبناء بأبعاد 4×5', ok: false, actual: { s: 4, l: 5 }, failing: { name: 'غرفة نوم 4', s: 3.93, l: 4.56 }, want: { s: 4, l: 5 }, tol: .3, why: 'فرق 0.44 م' }], review: { passed: true } }, { text: '' });
  assert.equal(st.status, 'hidden');
  const h = st.hiddenReasons[0];
  // (02c، حزمة المالك review-evidence) الحقول الموحدة: المرحلة «dimensions»، والمقيس والحد رقمان للضلع الأسوأ (الطول 4.56 من 5 هنا)، والتفصيل كما كان
  assert.deepEqual([h.candidate, h.stage, h.rule, h.source], ['X1', 'dimensions', 'D-bedroom', 'client']);
  assert.deepEqual([h.measured, h.limit, h.unit, h.tol], [4.56, 5, 'م', .3]);
  assert.deepEqual(h.measuredDetail, { name: 'غرفة نوم 4', s: 3.93, l: 4.56 }); assert.deepEqual(h.limitDetail, { s: 4, l: 5, tol: .3 }); assert.ok(h.reason_ar.length > 20);
  // تكامل: كل البدائل المولدة في هذا الملف
  for (const { o } of memo.values()) for (const d of o.designs) {
    const p = d.presentation; if (p.status !== 'hidden') continue;
    assert.ok(p.hiddenReasons?.length > 0 && p.hiddenReasons.length === p.hidden_ar.length, d.pat);
    for (const x of p.hiddenReasons) for (const k of ['candidate', 'stage', 'rule', 'source', 'reason_ar']) assert.ok(x[k], `${d.pat}: ${k} فارغ`);
  }
});

test('02b H10 (معروفة): العدد المطلوب 3 من المصدر الموحد، وبديل غير محجوب بمقاساته الثلاثة (المجلس والمطبخ وغرف النوم) مقيسة بعد التفصيل', { timeout: 900000 }, () => {
  const C = HELDOUT2.find(c => c.id === 'H10');
  const { r, o } = gen('H10', C.text, C.counts, { floors: 1, ...C.land }, 3);
  assert.equal(r.want, 3); assert.match(o.shortfall_ar || '', /من 3/);
  const ok = shown(o); assert.ok(ok.length >= 1, JSON.stringify(o.designs.map(d => d.presentation?.hiddenReasons)));
  for (const x of dims(ok[0], r, 'e')) assert.equal(x.ok, true, x.text + ' ' + x.why);
});
