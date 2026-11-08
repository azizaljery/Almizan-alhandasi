// جودة المخطط: تناسب الصالة الرئيسية (صافي ≥ 4.5 م ونسبة ≤ 1:1.6) أو إعلان صريح بالأرقام، وتناسب المجلس وغرف النوم،
// ورفض غرفة نوم بلا نافذة، وحصة الممرات وطولها، وفحص اتساع الأثاث — على أراضٍ بدور ودورين وبطلب U وL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, planMetrics, quality, HALL_LIMITS, PLAN_LIMITS } from '../dist/villa-layout.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';

const L = (width, length, floors = 1) => ({ width, length, floors, streets: ['s'], entries: ['s'] });
const C = b => ({ bedrooms: b, majlis: 1, baths: b + 1, kitchens: 1, halls: 1, dining: 1 });
const hallOk = h => h.ratio <= HALL_LIMITS.ratio + .02 && h.w >= HALL_LIMITS.minNetW - .02;
const declared = (d, upper) => d.notes.some(n => n.includes(upper ? 'الصالة العلوية صافيها' : 'الصالة الرئيسية صافيها') && /\d/.test(n) && n.includes('دون المستهدف'));

/** الحدود المشتركة لكل بديل معروض. */
function assertSound(d) {
  const m = planMetrics(d.doc);
  m.levels.forEach((lv, i) => {
    if (lv.hall && !hallOk(lv.hall)) assert.ok(declared(d, i > 0), `الصالة ${lv.hall.w}×${lv.hall.l} دون الحد بلا إعلان بالأرقام`);
    for (const r of lv.rooms) {
      if (['bedroom', 'master'].includes(r.type)) assert.ok(r.ratio <= PLAN_LIMITS.rejectRatio + .01, `${r.name} نسبتها 1:${r.ratio}`);
      if (r.type === 'majlis') assert.ok(r.ratio <= PLAN_LIMITS.rejectRatio + .01, `${r.name} نسبته 1:${r.ratio}`);
    }
    assert.ok(lv.corridorShare <= .16, 'حصة الممرات ' + lv.corridorShare);
  });
  const noWin = reviewDoc(d.doc).filter(i => i.code === 'NO_WINDOW' && /غرفة نوم/.test(i.message));
  assert.equal(noWin.length, 0, 'غرفة نوم بلا نافذة: ' + noWin.map(i => i.message).join(' | '));
  return m;
}

test('دور واحد 20×30 و18×30: الصالة الرئيسية في البديل الأول متناسبة (صافي ≥ 4.5 م ونسبة ≤ 1:1.6)', () => {
  for (const [w, l] of [[20, 30], [18, 30]]) {
    const out = generateVillaDesigns({ land: L(w, l), counts: C(4) });
    assert.ok(out.designs.length >= 2);
    const m = assertSound(out.designs[0]);
    const h = m.levels[0].hall;
    assert.ok(hallOk(h), `${w}×${l}: الصالة ${h.w} × ${h.l} (1:${h.ratio})`);
    for (const d of out.designs) assertSound(d);
    // أغلب البدائل المعروضة متناسبة الصالة (لا صالة ممرية طويلة)
    const good = out.designs.filter(d => hallOk(planMetrics(d.doc).levels[0].hall)).length;
    assert.ok(good >= Math.ceil(out.designs.length / 2), 'صالات متناسبة: ' + good + '/' + out.designs.length);
  }
});

test('أرض أضيق 15×25: كل بديل سليم، والصالة إما متناسبة أو يُعلن قصورها بالأرقام', () => {
  const out = generateVillaDesigns({ land: L(15, 25), counts: C(3) });
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) assertSound(d);
});

test('طلب U (فناء): كل البدائل فناء، وصالتها ليست شريطًا ضحلًا', () => {
  const out = generateVillaDesigns({ land: L(20, 30), counts: C(4), requirements: { prefs: { courtyard: true } } });
  assert.ok(out.designs.length >= 1 && out.designs.every(d => d.mode === 'court'));
  for (const d of out.designs) { const m = assertSound(d); assert.ok(m.levels[0].hall.w >= HALL_LIMITS.minNetW - .02, 'عمق صالة الفناء ' + m.levels[0].hall.w); }
});

test('طلب L بمجلس واحد على 20×30: كل البدائل L وسليمة', () => {
  const out = generateVillaDesigns({ land: L(20, 30), counts: C(4), requirements: { prefs: { shape: 'L' } } });
  assert.ok(out.designs.length >= 1 && out.designs.every(d => d.mode === 'L'));
  for (const d of out.designs) assertSound(d);
});

test('دوران 20×30: الصالة الأرضية والعلوية متناسبتان أو مُعلنتان بالأرقام، والسلم داخل الصالة الأرضية', () => {
  const out = generateVillaTwoFloors({ land: L(20, 30, 2), counts: C(5) });
  assert.ok(out.designs.length >= 1);
  for (const d of out.designs) {
    const m = assertSound(d);
    assert.equal(m.levels.length, 2);
    // الصالة الأرضية بالسلم: الطول يشمل السلم؛ لا تتجاوز 1:2 في أي بديل معروض
    assert.ok(m.levels[0].hall.ratio <= 2.0, 'الصالة الأرضية 1:' + m.levels[0].hall.ratio);
  }
});

test('مقاييس المخطط: الحدود معلنة، وفحص الأثاث يكشف المجلس الضيق، وquality تعيد المقاييس والتكلفة', () => {
  assert.equal(HALL_LIMITS.ratio, 1.6); assert.equal(HALL_LIMITS.minNetW, 4.5);
  assert.equal(PLAN_LIMITS.majlisRatio, 1.8); assert.equal(PLAN_LIMITS.bedRatio, 1.5); assert.equal(PLAN_LIMITS.rejectRatio, 2.2);
  const out = generateVillaDesigns({ land: L(20, 30), counts: C(4), keep: 2 });
  const d = out.designs[0], q = quality(d.doc, { bedrooms: 4 }), m = q.metrics;
  assert.ok(m.levels[0].gross > 100 && m.levels[0].rooms.length > 8);
  for (const r of m.levels[0].rooms.filter(x => x.type === 'majlis')) {
    const need = PLAN_LIMITS.majlisClear + 2 * PLAN_LIMITS.seatDepth, failed = m.levels[0].fails.some(f => f.what === 'majlis' && f.room === r.name);
    assert.equal(failed, r.w < need - .01, `${r.name} ${r.w} م مقابل ${need} م`);
    if (failed) assert.ok(q.issues.FURNITURE_MAJLIS >= 1);
  }
  for (const r of m.levels[0].rooms.filter(x => ['bedroom', 'master'].includes(x.type))) assert.ok(r.l >= PLAN_LIMITS.bed.w && r.w >= PLAN_LIMITS.bed.d, `${r.name} يتسع لسرير كينج بخلوصه: ${r.w}×${r.l}`);
  assert.ok(m.levels[0].corridorRun <= PLAN_LIMITS.corridorRun + 6, 'أطول ممر بلا انقطاع ' + m.levels[0].corridorRun);
});
