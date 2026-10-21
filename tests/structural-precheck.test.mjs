// المراجعة الإنشائية المبدئية (dist/structural-precheck.mjs): «استقرار الأدوار المتعددة وتوافقها الإنشائي المبدئي».
// مستندات مصنوعة بعيب واحد معروف + بدائل C7 الحقيقية (الجولة التاسعة) + عيوب الدرج من مجموعة المخططات المعيبة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralPrecheck, precheckTextAr, proposeColumnGrid, clearSpan, PRECHECK_DISCLAIMER } from '../dist/structural-precheck.mjs';
import { miniDoc, rect, loadDoc, FORBIDDEN_CLAIMS } from './_mini-docs.mjs';

const codes = (r, sev) => r.findings.filter(f => !sev || f.severity === sev).map(f => f.code);
const has = (r, code, sev) => r.findings.some(f => f.code === code && (!sev || f.severity === sev));

test('كل مخرج يحمل التنبيه، ولا يصف أي تصميم بالأمان أو الجاهزية للتنفيذ', () => {
  const docs = [
    miniDoc({ levels: [{ walls: [...rect(0, 0, 10, 7), [5, 0, 5, 7]], labels: [['صالة', 'living', 2.5, 3.5], ['مجلس', 'majlis', 7.5, 3.5]] }] }),
    loadDoc('evidence/acceptance/after-9/C7/alt-3.json'),
  ];
  for (const d of docs) {
    const r = structuralPrecheck(d);
    assert.equal(r.disclaimer, PRECHECK_DISCLAIMER);
    assert.equal(r.status, 'preliminary');
    assert.ok(r.summary.startsWith(PRECHECK_DISCLAIMER));
    for (const L of r.levels) assert.equal(L.disclaimer, PRECHECK_DISCLAIMER);
    for (const f of r.findings) assert.equal(f.disclaimer, PRECHECK_DISCLAIMER, f.code);
    assert.ok(precheckTextAr(r).startsWith(PRECHECK_DISCLAIMER));
    assert.doesNotMatch(JSON.stringify(r), FORBIDDEN_CLAIMS);
    assert.doesNotMatch(precheckTextAr(r), FORBIDDEN_CLAIMS);
    assert.ok(r.notChecked.length >= 4 && r.assumptions.length >= 2);
  }
});

test('بحر صافٍ 7 م = جسيم، وجدار علوي يعبر الفراغ 7 م بلا ركيزة = جسيم، ولا درج بين دورين = جسيم', () => {
  const d = miniDoc({ levels: [
    { walls: rect(0, 0, 10, 7), labels: [['الصالة', 'living', 5, 3.5]] },
    { walls: [...rect(0, 0, 10, 7), [5, 0, 5, 7]], labels: [['غرفة نوم 1', 'bedroom', 2.5, 3.5], ['غرفة نوم 2', 'bedroom', 7.5, 3.5]] },
  ] });
  const r = structuralPrecheck(d);
  const span = r.findings.find(f => f.code === 'SLAB_SPAN' && f.level === 'L1');
  assert.equal(span?.severity, 'serious'); assert.ok(Math.abs(span.value - 6.8) < 0.1, `البحر ${span?.value}`);
  const wall = r.findings.find(f => f.code === 'WALL_UNSUPPORTED');
  assert.ok(wall && wall.severity === 'serious' && wall.elements.includes('w9'), JSON.stringify(codes(r)));
  assert.ok(has(r, 'STAIR_MISSING', 'serious'));
  // الأعمدة: تقاطعا الجدار العلوي (5،0) و(5،7) يجدان الأعمدة الوسيطة السفلية على البحر 10 م؛ والعمود الوسيط الذي اقترحته
  // الوحدة على الجدار العلوي نفسه لا يُعدّ «مزروعًا» (خطورته في ملاحظة الجدار)
  const L2 = r.levels[1];
  assert.equal(L2.columnContinuity.none, 0); assert.equal(L2.columnContinuity.intermediate, 1);
  assert.ok(!has(r, 'COLUMN_PLANTED'));
});

test('فتحة 3.5 م تحت جدار علوي = تنبيه عتب، ودوران متطابقان بلا ملاحظات استمرارية', () => {
  const lower = { walls: [...rect(0, 0, 10, 7), [5, 0, 5, 7]], openings: [[4, 'arch', 3.5, 3.5]], labels: [['الصالة', 'living', 2.5, 3.5], ['الطعام', 'dining', 7.5, 3.5]] };
  const upper = { walls: [...rect(0, 0, 10, 7), [5, 0, 5, 7]], labels: [['غرفة نوم 1', 'bedroom', 2.5, 3.5], ['غرفة نوم 2', 'bedroom', 7.5, 3.5]] };
  const r = structuralPrecheck(miniDoc({ levels: [lower, upper] }));
  const lt = r.findings.find(f => f.code === 'LINTEL_SPAN');
  assert.ok(lt && lt.severity === 'warn' && lt.value === 3.5 && lt.elements.includes('w5') && lt.elements.includes('w10'), JSON.stringify(lt));
  for (const c of ['WALL_UNSUPPORTED', 'WALL_ON_BEAM', 'WALL_OFFSET', 'COLUMN_PLANTED', 'COLUMN_OFFSET', 'COLUMN_ON_WALL', 'CANTILEVER', 'SLAB_SPAN']) assert.ok(!has(r, c), `${c}: ${JSON.stringify(codes(r))}`);
  assert.equal(r.levels[1].columnContinuity.pct, 100);
});

test('بروز الدور العلوي 2 م = تنبيه كابولي، والجدار فوق الفراغ = جسيم؛ وجدار مُزاح 40 سم = تنبيه', () => {
  const r = structuralPrecheck(miniDoc({ levels: [
    { walls: [...rect(0, 0, 10, 7), [5, 0, 5, 7]], labels: [['أ', 'living', 2.5, 3.5], ['ب', 'dining', 7.5, 3.5]] },
    { walls: [...rect(0, 0, 10, 9), [5.4, 0, 5.4, 9]], labels: [['غرفة 1', 'bedroom', 2.5, 4], ['غرفة 2', 'bedroom', 7.5, 4]] },
  ] }));
  const c = r.findings.find(f => f.code === 'CANTILEVER');
  assert.ok(c && c.severity === 'warn' && Math.abs(c.value - 2) < 0.25, JSON.stringify(c));
  assert.ok(has(r, 'WALL_OVER_VOID', 'serious'));
  const off = r.findings.find(f => f.code === 'WALL_OFFSET');
  assert.ok(off && Math.abs(off.value - 0.4) < 0.01);
});

test('حمام علوي فوق غرفة نوم = تنبيه صرف، وفوق حمام = متراكب', () => {
  const lower = { walls: [...rect(0, 0, 8, 6), [4, 0, 4, 6]], labels: [['غرفة نوم', 'bedroom', 2, 3], ['حمام', 'bath', 6, 3]] };
  const upper = { walls: [...rect(0, 0, 8, 6), [4, 0, 4, 6]], labels: [['حمام علوي 1', 'bath', 2, 3], ['حمام علوي 2', 'bath', 6, 3]] };
  const r = structuralPrecheck(miniDoc({ levels: [lower, upper] }));
  const wet = r.findings.filter(f => f.code === 'WET_NOT_STACKED');
  assert.equal(wet.length, 1); assert.equal(wet[0].severity, 'warn'); assert.match(wet[0].message, /حمام علوي 1/);
  assert.deepEqual(r.levels[1].wetStacking, { upper: 2, stacked: 1, pct: 50 });
});

test('شبكة الأعمدة المقترحة: زوايا المحيط دائمًا، وتباعد ≤ 6 م على كل خط، والبحر الصافي = الضلع الأقصر', () => {
  const walls = rect(0, 0, 14, 8).map(([x0, y0, x1, y1], i) => ({ id: 'w' + i, a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, t: 0.2 }));
  const outline = [{ polygon: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 8 }, { x: 0, y: 8 }] }];
  const g = proposeColumnGrid(walls, outline);
  for (const p of [[0, 0], [14, 0], [14, 8], [0, 8]]) assert.ok(g.columns.some(c => c.x === p[0] && c.y === p[1]), `زاوية ${p}`);
  const onBottom = g.columns.filter(c => c.y === 0).map(c => c.x).sort((a, b) => a - b);
  for (let i = 1; i < onBottom.length; i++) assert.ok(onBottom[i] - onBottom[i - 1] <= 6 + 1e-6);
  assert.equal(clearSpan([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }]).span, 4);
});

test('بدائل C7 الحقيقية (الجولة التاسعة): نافذة تعبر تقاطع جدار، وفتحة الدرج داخل غرفة الدرج، وكل بديل < 2 ث', () => {
  const want = { 'alt-1': 'o15', 'alt-2': 'o23', 'alt-3': 'o20' };
  for (const [alt, op] of Object.entries(want)) {
    const t0 = performance.now(), r = structuralPrecheck(loadDoc(`evidence/acceptance/after-9/C7/${alt}.json`)), ms = performance.now() - t0;
    assert.ok(ms < 2000, `${alt} ${ms}ms`);
    assert.equal(r.levels.length, 2);
    const cio = r.findings.find(f => f.code === 'COLUMN_IN_OPENING');
    assert.ok(cio && cio.elements.includes(op), `${alt}: ${JSON.stringify(codes(r, 'serious'))}`);
    assert.ok(has(r, 'STAIR_HOLE', 'info'), `${alt}: فتحة الدرج`);
    assert.ok(!has(r, 'STAIR_HOLE_ROOM') && !has(r, 'STAIR_HOLE_WALL') && !has(r, 'STAIR_MISSING'));
    assert.ok(r.levels[1].columnContinuity.total > 10);
  }
});

test('عيوب الدرج من مجموعة المخططات المعيبة تُكشف', () => {
  assert.ok(has(structuralPrecheck(loadDoc('evidence/review-proof/corpus/stairs-deleted__C7-alt-1.json')), 'STAIR_MISSING', 'serious'));
  const moved = structuralPrecheck(loadDoc('evidence/review-proof/corpus/stairs-moved-out__C7-alt-1.json'));
  assert.ok(has(moved, 'STAIR_OUTSIDE', 'serious') && has(moved, 'STAIR_HOLE_OUTSIDE', 'serious'));
});
