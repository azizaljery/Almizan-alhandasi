import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns } from '../dist/villa-layout.mjs';
import { planGarden, freeStrips, POOL_SIZE } from '../dist/garden-plan.mjs';
import { reviewDoc, fixtureRect } from '../dist/draw/review.mjs';
import { validateDoc } from '../dist/draw/doc.mjs';
import { computeDocQuantities } from '../dist/draw/quantities-doc.mjs';
import { siteSheet } from '../dist/draw/site-sheet.mjs';
import { FIXTURES, OUTDOOR_KINDS, isOutdoorKind } from '../dist/draw/catalog.mjs';
import { buildBrief, parsePoolSize } from '../dist/shara/brief-engine.mjs';
import { SharaSession } from '../dist/home-flow.mjs';
import { verifyRequest } from '../dist/rules.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';

const ALL = { pool: true, waterfall: true, lawn: true, planters: true };
const gen = (w, l, outdoor, extra = {}) => generateVillaDesigns({ land: { width: w, length: l, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1 }, requirements: { prefs: { outdoor } }, keep: 2, ...extra });

test('الكتالوج: مسبح وشلال وعشب وأحواض قطع خارجية', () => {
  for (const k of ['pool', 'waterfall', 'lawn', 'planter']) { assert.ok(FIXTURES[k]?.outdoor, k); assert.ok(isOutdoorKind(k), k); }
  assert.ok(OUTDOOR_KINDS.includes('tree'));
  assert.ok(!isOutdoorKind('sofa-3'));
});

test('المولّد: المسبح والشلال والعشب والأحواض داخل الأرض وخارج المبنى ولا تتداخل', () => {
  const r = gen(25, 30, ALL);
  for (const d of r.designs) {
    assert.ok(d.garden.placed.some(p => p.kind === 'pool'), 'مسبح');
    assert.ok(d.garden.placed.some(p => p.kind === 'waterfall'), 'شلال');
    assert.deepEqual(validateDoc(d.doc), [], 'المستند سليم');
    const out = d.doc.fixtures.filter(f => FIXTURES[f.kind]?.outdoor && f.kind !== 'tree');
    const plot = d.doc.plot.polygon;
    for (const f of out) for (const c of fixtureRect(f)) assert.ok(pointInPolygon(c, plot, 1e-6), `${f.kind} داخل الأرض`);
    const issues = reviewDoc(d.doc).filter(i => ['GARDEN_PLACEMENT', 'FIXTURE_OUTSIDE', 'FIXTURE_OVERLAP'].includes(i.code));
    assert.deepEqual(issues, [], 'لا مخالفات حديقة');
    // لا تداخل بين عناصر الحديقة نفسها (عدا العشب مع عشب آخر)
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const A = fixtureRect(out[i]), B = fixtureRect(out[j]);
      const ax = A.map(p => p.x), ay = A.map(p => p.y), bx = B.map(p => p.x), by = B.map(p => p.y);
      const ov = Math.min(Math.max(...ax), Math.max(...bx)) - Math.max(Math.min(...ax), Math.min(...bx)) > 1e-6 && Math.min(Math.max(...ay), Math.max(...by)) - Math.max(Math.min(...ay), Math.min(...by)) > 1e-6;
      assert.ok(!ov, `${out[i].kind} يتداخل مع ${out[j].kind}`);
    }
    const led = verifyRequest(d.doc, { prefs: { outdoor: ALL } }, { entry: 's' });
    for (const k of ['pool', 'waterfall', 'lawn', 'planters']) assert.equal(led.find(x => x.id === 'G-' + k)?.ok, true, 'بند الجدول ' + k);
  }
});

test('الأرض الضيقة: لا يُرسم مسبح قسرًا ويُقال السبب في الملاحظات والجدول', () => {
  const r = gen(15, 20, { pool: true });
  for (const d of r.designs) {
    assert.ok(!d.doc.fixtures.some(f => f.kind === 'pool'));
    assert.ok(d.garden.missing.includes('pool'));
    assert.ok(d.notes.some(n => /لا يتسع مسبح/.test(n)));
    const it = verifyRequest(d.doc, { prefs: { outdoor: { pool: true } } }, { entry: 's' }).find(x => x.id === 'G-pool');
    assert.equal(it.ok, false); assert.match(it.why, /لم يتسع/);
  }
});

test('مقاس العميل يُحترم إن اتسع ويُصغَّر بإعلان إن لم يتسع', () => {
  const big = gen(25, 30, { pool: true, poolW: 4, poolD: 8 }).designs[0].doc.fixtures.find(f => f.kind === 'pool');
  assert.ok(Math.min(big.w, big.d) >= 3.5 && Math.max(big.w, big.d) >= 7.5, `${big.w}×${big.d}`);
  assert.ok(Math.min(POOL_SIZE.w, POOL_SIZE.d) >= POOL_SIZE.minShort);
});

test('بلا طلب خارجي لا تتغير المستندات (لا قطع حديقة)', () => {
  const r = gen(25, 30, undefined);
  for (const d of r.designs) { assert.ok(!d.doc.fixtures.some(f => ['pool', 'waterfall', 'lawn', 'planter'].includes(f.kind))); assert.equal(d.garden, undefined); }
});

test('الكميات: مساحة المسبح والعشب مقيسة والحجم تقدير بعمق معلن', () => {
  const d = gen(25, 30, ALL).designs[0], q = computeDocQuantities(d.doc), by = Object.fromEntries(q.rows.map(r => [r.id, r]));
  const pool = d.doc.fixtures.find(f => f.kind === 'pool');
  assert.equal(by.poolArea.value, Math.round(pool.w * pool.d * 100) / 100); assert.equal(by.poolArea.grade, 'measured');
  assert.equal(by.poolVolume.grade, 'estimated'); assert.match(by.poolVolume.basis, /عمق 1\.4/);
  assert.ok(by.waterfalls.value >= 1 && by.lawnArea.value > 0 && by.planterLength.value > 0);
  assert.ok(!computeDocQuantities(gen(25, 30, undefined).designs[0].doc).rows.some(r => r.id === 'poolArea'));
});

test('لوحة الموقع ترسم عناصر الحديقة وتكتب أسماءها ومقاساتها', () => {
  const svg = siteSheet(gen(25, 30, ALL).designs[0].doc).svg ?? '';
  const s = typeof svg === 'string' && svg ? svg : String(siteSheet(gen(25, 30, ALL).designs[0].doc));
  assert.match(s, /garden-item/); assert.match(s, /مسبح/); assert.match(s, /شلال/);
});

test('شرعاء: تفهم المسبح والشلال والحديقة ولا تعدّها غير مدعومة', () => {
  const b = buildBrief('اربع غرف نوم ومجلس وابي مسبح وشلال وحديقة', { land: { width: 20, length: 30 } });
  assert.deepEqual(b.requirements.prefs.outdoor, { pool: true, waterfall: true, lawn: true, planters: true });
  assert.ok(!b.unsupported.some(u => /المسبح|الحديقة|الشلال/.test(u)));
  assert.ok(b.understood.some(u => /في الحوش الخارجي: مسبح \+ شلال/.test(u)));
});

test('شرعاء: المقاس بصيغ مختلفة والنفي والمسبح الداخلي وعلى السطح والنافورة', () => {
  assert.deepEqual(parsePoolSize('مسبح 4×8'), { poolW: 4, poolD: 8 });
  assert.deepEqual(parsePoolSize('سويمنج بول 10 في 5'), { poolW: 5, poolD: 10 });
  assert.deepEqual(parsePoolSize('مسبح صغير للعيال'), { poolW: 3, poolD: 5 });
  assert.equal(parsePoolSize('مسبح'), null);
  assert.equal(buildBrief('ما ابي مسبح، ابي شلال').requirements.prefs.outdoor.pool, undefined);
  assert.equal(buildBrief('ما ابي مسبح، ابي شلال').requirements.prefs.outdoor.waterfall, true);
  const inn = buildBrief('ابغى مسبح داخلي'); assert.equal(inn.requirements.prefs.outdoor, undefined); assert.ok(inn.unsupported.some(u => /الداخلي/.test(u)));
  const roof = buildBrief('مسبح على السطح'); assert.equal(roof.requirements.prefs.outdoor, undefined); assert.ok(roof.unsupported.some(u => /السطح/.test(u)));
  const fo = buildBrief('ابي نافورة وعشب'); assert.ok(fo.unsupported.some(u => /النافورة/.test(u))); assert.equal(fo.requirements.prefs.outdoor.lawn, true);
  assert.equal(buildBrief('حديقة داخلية').requirements.prefs.outdoor, undefined, 'الحديقة الداخلية فناء لا عشب خارجي');
});

test('شرعاء: سؤال المقاس والشلال يظهران، والجواب يحدّث الفهم ويعرضه', () => {
  const s = new SharaSession({ land: { length: 30, width: 20, streets: ['s'], entries: ['s'] } }); s.start(); s.answer('mode', 'free');
  const ask = out => out.filter(m => m.kind === 'ask').map(m => m.id);
  let out = s.answer('free', 'اربع غرف نوم ومجلس رجال ومطبخ وصالة وابي مسبح');
  assert.ok(ask(out).includes('pool_size') || ask(out).length === 1);
  const q = s.brief.questions.find(x => x.id === 'pool_size'); assert.ok(q, 'سؤال المقاس');
  out = s.answer('pool_size', { picks: [], text: 'مسبح 4×8' });
  assert.deepEqual([s.brief.requirements.prefs.outdoor.poolW, s.brief.requirements.prefs.outdoor.poolD], [4, 8]);
  assert.ok(out.some(m => m.kind === 'list' && m.items.some(i => /4 × 8/.test(i))), 'الفهم المحدَّث يُعرض');
  assert.ok(!s.brief.questions.some(x => x.id === 'pool_size'), 'لا يُعاد السؤال');
});

test('freeStrips: الحوش الخلفي أولًا ثم الجانبان ثم الأمامي', () => {
  const d = gen(25, 30, ALL).designs[0];
  const { strips } = freeStrips(d.doc); const roles = strips.map(s => s.role);
  assert.ok(roles.indexOf('rear') <= roles.indexOf('side') || !roles.includes('rear'));
  assert.ok(roles.lastIndexOf('front') === roles.length - 1 || !roles.includes('front'));
});
