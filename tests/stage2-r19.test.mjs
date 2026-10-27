// الجولة التاسعة عشرة (توجيه المالك 2026-10-24): المخالفة الإلزامية تحجب البديل في كل الحالات (اتساق الحكم)، وقياسا الدور العلوي
// (تراكب الحمامات، وباب الرئيسية والدرج)، والمقاس الصريح ضلعًا ضلعًا (±0.05 م)، والخصوصية المتكاملة (النافذة العلوية لا تُدفع من الإضاءة
// ولا الحركة)، ولا خط أبعاد فوق موقف، ولا بطاقة خيار فارغة، والمدخل الثاني إلى الدهليز.
// المراجع المستقل وكيل ذكاء اصطناعي (Claude) بدور معماري — ليس معماريًا مرخّصًا؛ ولا يُعدّ أي حكم آلي هنا اعتمادًا هندسيًا أو إنشائيًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';
import { measureR16, MANDATORY_R16 } from '../dist/privacy-defects.mjs';
import { R20_MANDATORY, R20_MAJOR } from '../dist/r20-checks.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { planTests } from '../dist/plan-states.mjs';
import { extractRequirements, applyLiteralReadings, DIM_TOL } from '../dist/requirements.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';

const root = new URL('../', import.meta.url).pathname;
const STAGE = 'after-19', dir = id => `${root}evidence/acceptance/${STAGE}/${id}/`;
const ev = (stage, id, f) => parseDoc(readFileSync(`${root}evidence/acceptance/${stage}/${id}/${f}`, 'utf8'));
const have = existsSync(`${root}evidence/acceptance/${STAGE}/summary.json`);
const results = () => CASES.filter(C => existsSync(dir(C.id) + 'result.json')).map(C => ({ C, res: JSON.parse(readFileSync(dir(C.id) + 'result.json', 'utf8')) }));
const reqOf = C => { const req = extractRequirements(C.text, { counts: C.counts }); req.counts = { ...req.counts, ...C.counts }; const land = { floors: 1, ...C.land }; applyLiteralReadings(req, land); return { req, land, rq: { text: C.text, counts: { ...C.counts, ...req.counts }, land, rules: req.rules || [] } }; };

test('اتساق الحكم في كل الحالات: لا بديل معروض (غير محجوب) فيه مخالفة إلزامية — بند صريح، أو بوابة، أو مخالفة الميزان الإلزامية', { skip: !have }, () => {
  let n = 0;
  for (const { C, res } of results()) {
    const { req, land, rq } = reqOf(C);
    res.designs.forEach((d, i) => {
      const doc = ev(STAGE, C.id, d.file), ledger = verifyRequest(doc, req, { entry: land.entries[0] });
      const st = presentationStatus({ doc, ledger, review: d.review }, rq);
      const mand = measureR16(doc, rq).filter(g => g.applicable && !g.pass && !g.clientAsked && MANDATORY_R16.includes(g.id) && !R20_MANDATORY.includes(g.id)); // مخالفات r20 تُفسَّر أدناه
      const client = ledger.filter(x => !x.ok && !['unverified', 'pending-render'].includes(x.status));
      if (mand.length || client.length || d.review?.passed === false) assert.equal(d.presentation.status, 'hidden', `${C.id}-${i + 1}: ${[...mand.map(g => g.id), ...client.map(x => x.text)].join('، ')}`);
      // (الجولة العشرون) قياسات r20 (بعد المراجعة العمياء r19) تُعيد الحكم على أدلة r19 المحفوظة: الفرق مسموح فقط إن كان كله من معرفات r20
      // (FAMILY_WC، HALL_LT_MAJLIS، HALL_DAYLIGHT عيوبًا، وMAJLIS_ISOLATED، COURT_OVERLOOK إلزاميتين) — أي فرق آخر يرسب كما كان
      if (st.status !== d.presentation.status) {
        const R20 = new Set([...R20_MANDATORY, ...R20_MAJOR]), newMand = st.mandatory.filter(x => !R20.has(x)), newMajor = st.major.filter(x => !R20.has(x));
        const explained = d.presentation.status === 'ready' ? (st.status === 'needs-edits' ? !st.mandatory.length && (st.major.length > 0 || planTests(doc).failing_ar.length > 0) && !newMajor.length /* (الجولة 21) اختبارات الخصوصية/الحركة لكل فراغ عيب معماري جديد يفسّر الفرق */ : st.status === 'hidden' && st.mandatory.length > 0 && !newMand.length && !newMajor.length)
          : d.presentation.status === 'needs-edits' && st.status === 'hidden' && st.mandatory.length > 0 && !newMand.length;
        assert.ok(explained, `${C.id}-${i + 1}: الحالة المحفوظة ${d.presentation.status} والمقيسة ${st.status} (${[...st.mandatory, ...st.major]}) — فرق لا تفسره قياسات r20`);
      }
      n++;
    });
    // المحجوب لا يُعرض بديلًا صالحًا: لا يبقى في القائمة ما دام غيره ظاهرًا
    if (res.designs.some(d => d.presentation.status !== 'hidden')) assert.ok(res.designs.every(d => d.presentation.status !== 'hidden'), C.id);
  }
  assert.ok(n >= 10);
});

test('C7: لا يُعرض بديل يعبر فيه الضيف العائلة؛ وقراءة «المجالس» غير المعروضة تُقال للعميل مع السؤال', { skip: !have }, () => {
  const r = JSON.parse(readFileSync(dir('C7') + 'result.json', 'utf8'));
  for (const d of r.designs) assert.ok(!(d.presentation.r16 || []).includes('GUEST_DINING'), d.pat);
  const hid = (r.hidden || []);
  if (hid.length) assert.match(r.shortfallReason || r.designs[0].summary + '', /المجالس|مخالفة إلزامية/);
});

test('قياسا الدور العلوي على C7-1 (after-18): تراكب الحمامات فوق الجاف، وباب الرئيسية على فراغ الدرج المفتوح — ومعهما «مراجعة متخصصة»', () => {
  const C = CASES.find(c => c.id === 'C7'), { rq } = reqOf(C);
  const m = measureR16(ev('after-18', 'C7', 'alt-1.json'), rq);
  const wet = m.find(g => g.id === 'WET_STACK'), door = m.find(g => g.id === 'MASTER_STAIR_DOOR');
  assert.equal(wet.pass, false); assert.ok(wet.specialist); assert.ok(wet.reasons_ar.some(x => /صالة الطعام/.test(x)));
  assert.equal(door.applicable, true); assert.equal(door.pass, false);
  // دور واحد: لا ينطبقان
  const one = measureR16(ev('after-18', 'C1', 'alt-1.json'), { text: CASES[0].text });
  assert.ok(!one.some(g => ['WET_STACK', 'MASTER_STAIR_DOOR'].includes(g.id)));
  // الحالة تفصل: العيب المعماري في edits_ar، والمراجعة المتخصصة في specialist_ar
  const st = presentationStatus({ doc: ev('after-18', 'C7', 'alt-1.json'), ledger: [] }, rq);
  assert.ok(st.specialist_ar.length >= 1); assert.equal(st.categories.mandatory, 0);
});

test('C7 (after-19): باب الرئيسية لا يُفتح على فراغ الدرج المفتوح', { skip: !have }, () => {
  const C = CASES.find(c => c.id === 'C7'), { rq } = reqOf(C), r = JSON.parse(readFileSync(dir('C7') + 'result.json', 'utf8'));
  for (const d of r.designs) { const g = measureR16(ev(STAGE, 'C7', d.file), rq).find(x => x.id === 'MASTER_STAIR_DOOR'); assert.equal(g.pass, true, d.pat + ': ' + g.reasons_ar.join('؛ ')); }
});

test('المقاس الصريح ضلعًا ضلعًا: 3.86×4.96 لا يطابق 4×5 (السماحية ±0.05 م معلنة)، وC6 في after-19 يطابق المطبخ والمجلس', { skip: !have }, () => {
  assert.equal(DIM_TOL.default, .05);
  const req = extractRequirements('المطبخ 4×5', {}); assert.equal(req.dims.kitchen.tol, .05);
  assert.equal(extractRequirements('المطبخ تقريبا 4×5', {}).dims.kitchen.tol, .3);
  const C = CASES.find(c => c.id === 'C6'), { req: rq6, land } = reqOf(C);
  // مستند after-18 (المطبخ 3.86×4.96) يرسب الآن
  const old = verifyRequest(ev('after-18', 'C6', 'alt-1.json'), rq6, { entry: 's' }).find(x => x.kind === 'dims' && /المطبخ/.test(x.text));
  assert.equal(old.ok, false); assert.match(old.why, /لكل ضلع/);
  const r = JSON.parse(readFileSync(dir('C6') + 'result.json', 'utf8'));
  const shown = r.designs.filter(d => d.presentation.status !== 'hidden');
  for (const d of shown) for (const x of verifyRequest(ev(STAGE, 'C6', d.file), rq6, { entry: land.entries[0] }).filter(x => x.kind === 'dims')) {
    assert.ok(x.ok, x.text + ' ' + x.why);
    assert.ok(Math.abs(x.actual.s - x.want.s) <= .05 + 1e-9 && Math.abs(x.actual.l - x.want.l) <= .05 + 1e-9, x.text);
  }
});

test('الخصوصية المتكاملة: النافذة العلوية لمجلس النساء/الطعام لا تُدفع من الإضاءة (زجاج الغرفة ≥ 5٪) ولا الحركة والسلامة (بوابات المراجعة ناجحة)', { skip: !have }, () => {
  let checked = 0;
  for (const { C, res } of results()) res.designs.forEach((d, i) => {
    const doc = ev(STAGE, C.id, d.file), G = analyzeDoc(doc).levels[0];
    for (const room of G.rooms.filter(r => r.type === 'dining' || (r.type === 'majlis' && /النساء/.test(r.name || '')))) {
      const wins = G.openings.filter(op => op.window && op.sides.some(s => s.room.id === room.id && s.exterior));
      if (!wins.some(op => (op.o.sill ?? 0) >= 1.6 - 1e-6)) continue;
      const glass = wins.reduce((t, op) => t + op.o.w * (op.o.h ?? 1.2), 0);
      assert.ok(glass >= .05 * room.area - 1e-6, `${C.id}-${i + 1} ${room.name}: زجاج ${glass.toFixed(2)} م² لأرضية ${room.area.toFixed(1)} م²`);
      checked++;
    }
    if (d.presentation.status !== 'hidden') { assert.notEqual(d.review?.passed, false, `${C.id}-${i + 1}`); for (const g of ['DAYLIGHT', 'REACH', 'MIN_WIDTH']) assert.notEqual(d.review?.gates?.[g]?.ok, false, `${C.id}-${i + 1} ${g}`); }
  });
  assert.ok(checked >= 1, 'نافذة علوية واحدة على الأقل طُبقت وفُحصت');
});

test('لا خط أبعاد يقطع موقف سيارة في أي مستند معروض', { skip: !have }, () => {
  for (const { C, res } of results()) for (const d of res.designs) {
    const doc = ev(STAGE, C.id, d.file), bays = (doc.zones || []).filter(z => z.type === 'garage');
    for (const dm of doc.dimensions || []) {
      const ux = dm.b.x - dm.a.x, uy = dm.b.y - dm.a.y, L = Math.hypot(ux, uy) || 1, n = { x: -uy / L, y: ux / L }, off = dm.offset ?? .6;
      for (let t = 0; t <= 1.0001; t += .05) { const p = { x: dm.a.x + ux * t + n.x * off, y: dm.a.y + uy * t + n.y * off }; for (const z of bays) assert.ok(!pointInPolygon(p, z.polygon), `${C.id} ${d.file}: بُعد ${dm.id} فوق موقف`); }
    }
  }
});

test('خيارات التعديل: لا بطاقة خيار بلا مخطط («لم أجد توزيعًا جديدًا» جملة لا بطاقة)', { skip: !have }, () => {
  for (const { res } of results()) for (const e of [res.edit, ...(res.editAll || [])].filter(Boolean)) for (const o of e.options || []) assert.ok(!o.info && o.id !== 'none-new', JSON.stringify(o).slice(0, 120));
});

test('C3: المدخل الثاني من الشارع الشرقي إلى دهليز الرجال لا إلى المجلس مباشرة', { skip: !have }, () => {
  const r = JSON.parse(readFileSync(dir('C3') + 'result.json', 'utf8'));
  for (const d of r.designs) { const G = analyzeDoc(ev(STAGE, 'C3', d.file)).levels[0]; const ext = G.openings.filter(op => op.door && op.sides.some(s => s.exterior && s.other === 'outside')); for (const op of ext) { const s = op.sides.find(x => x.other === 'outside'); assert.ok(!(s.room.type === 'majlis'), `${d.pat}: باب خارجي على «${s.room.name}»`); } }
});
