import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveParams, designHash } from '../dist/facade-j/facade-realism/variation.mjs';
import { rankStyles, parseWish } from '../dist/facade-j/facade-realism/choose-style.mjs';
import { designList, DESIGNS } from './fixtures/facade-designs.mjs';

const Q = s => new URLSearchParams(s);
const docs = designList();

test('deriveParams حتمي: نفس التصميم يعطي نفس المعاملات', () => {
  for (const [, d] of docs) {
    const a = deriveParams(d, Q('seed=3'), 'N'), b = deriveParams(structuredClone(d), Q('seed=3'), 'N');
    assert.equal(a.seed, b.seed); assert.deepEqual(a.mass, b.mass); assert.equal(a.palette, b.palette); assert.equal(a.density, b.density);
    for (const k of [0, 1, 7, 99]) assert.equal(a.rnd(k), b.rnd(k));
    assert.ok(a.density >= 0 && a.density <= 1); assert.ok(['centre', 'left', 'right', 'corners'].includes(a.mass.emphasis));
  }
});
test('البصمة لا تتأثر بالعنوان ولا بترتيب الجدران', () => {
  const d = DESIGNS.sample(), e = structuredClone(d); e.title = 'عنوان آخر'; e.walls.reverse(); e.openings.reverse();
  assert.equal(designHash(d), designHash(e));
});
test('تصاميم مختلفة تعطي بذورًا مختلفة، وseed صريح يغيّر المعاملات', () => {
  const seeds = docs.map(([, d]) => deriveParams(d, Q(''), 'J').seed);
  assert.equal(new Set(seeds).size, docs.length);
  const d = docs[0][1], a = deriveParams(d, Q('seed=0'), 'J'), b = deriveParams(d, Q('seed=1'), 'J');
  assert.notEqual(a.seed, b.seed); assert.equal(a.designSeed, b.designSeed); assert.deepEqual(a.mass.entryU, b.mass.entryU);
});
test('موضع الكتلة يتبع المدخل الحقيقي', () => {
  assert.equal(deriveParams(DESIGNS.narrowLeft(), Q(''), 'J').mass.emphasis, 'left');
  assert.equal(deriveParams(DESIGNS.wideRight(), Q(''), 'J').mass.emphasis, 'right');
});
test('rankStyles: ثلاثة أنماط مختلفة على الأقل في الصدارة عبر 6 تصاميم', () => {
  const tops = docs.map(([, d]) => rankStyles(d, '')[0].id);
  assert.ok(new Set(tops).size >= 3, 'tops=' + tops);
  for (const [, d] of docs) { const r = rankStyles(d, ''); assert.equal(r.length, 6); assert.ok(r.every(x => x.reason)); }
});
test('رغبة العميل الصريحة تُحترم دائمًا', () => {
  for (const [, d] of docs) {
    assert.equal(rankStyles(d, 'أريد واجهة سلمانية')[0].id !== undefined, true);
    assert.equal(rankStyles(d, 'أريد نمط نجدي')[0].id, 'N');
    assert.equal(rankStyles(d, 'حجازي')[0].id, 'H');
    assert.equal(rankStyles(d, 'سلماني')[0].id, 'S');
    assert.equal(rankStyles(d, 'تصميم كلاسيكي')[0].id, 'C');
    assert.equal(rankStyles(d, 'معاصر')[0].id, 'J');
    assert.equal(rankStyles(d, 'معاصر خفيف')[0].id, 'M');
    assert.equal(rankStyles(d, 'حديث')[0].id, 'M');
    assert.equal(rankStyles(d, { style: 'C', text: 'نجدي' })[0].id, 'C');
    assert.ok(rankStyles(d, 'نجدي')[0].explicit);
  }
  assert.deepEqual(parseWish('نجدي ثم كلاسيكي'), ['N', 'C']);
});

// ---- بديل آخر / فضاء التصميم ----
import { createHistory, markShown, nextAlternative, proposeAlternatives, EXHAUSTED_MSG } from '../dist/facade-j/facade-realism/alternatives.mjs';
import { regionDistance, baseRegion, viableRegions, regionId } from '../dist/facade-j/facade-realism/variation.mjs';

test('تغيير اللوحة/البذرة وحدها ليس تصميمًا جديدًا (المنطقة نفسها)', () => {
  for (const [, d] of docs) {
    const a = deriveParams(d, Q('seed=0'), 'N'), b = deriveParams(d, Q('seed=5'), 'N');
    assert.equal(a.region.id, b.region.id); assert.equal(regionDistance(a.region, b.region), 0);
    const h = createHistory(); markShown(h, 'N', baseRegion(d));
    assert.equal(h.shown.get('N').length, 1); markShown(h, 'N', baseRegion(d)); assert.equal(h.shown.get('N').length, 1); // تكرار = لا جديد
  }
});
test('المعاملات تتبع هندسة المبنى: واجهات مختلفة لنفس الطراز تعطي مناطق/كتلًا مختلفة', () => {
  const ids = docs.map(([, d]) => deriveParams(d, Q(''), 'N').region.id);
  assert.ok(new Set(ids).size >= 4, ids.join(' '));
  const p = deriveParams(DESIGNS.symmetric(), Q(''), 'N'); assert.ok(p.building.symmetry > .5); assert.equal(p.building.floors, 2);
});
test('الضغط المتكرر على «بديل آخر» لا يعيد منطقة معروضة ثم يعلن النفاد بصدق', () => {
  for (const [, d] of docs) {
    const h = createHistory(), start = baseRegion(d); markShown(h, 'H', start); const seen = [start]; let st, n = 0;
    while ((st = nextAlternative(d, 'H', h)).status === 'NEW_ALTERNATIVE') {
      for (const s of seen) assert.ok(regionDistance(s, st.region) >= 2, 'قريب/مكرر ' + regionId(s) + ' ' + regionId(st.region));
      seen.push(st.region); assert.ok(++n < 400);
    }
    assert.equal(st.status, 'DESIGN_SPACE_EXHAUSTED'); assert.equal(st.message, EXHAUSTED_MSG); assert.equal(st.region, null);
    assert.ok(Array.isArray(st.exhaustedFamilies));
    assert.equal(nextAlternative(d, 'H', h).status, 'DESIGN_SPACE_EXHAUSTED'); // يبقى منتهيًا
    // لم يُغيّر الطراز ولا هندسة المبنى: كل المناطق ضمن المناطق الممكنة للمبنى
    const via = viableRegions(d).map(regionId); assert.ok(seen.every(r => via.includes(regionId(r))));
  }
});
test('اقتراح حتى 3 بدائل متباعدة ولا يتجاوز 3', () => {
  for (const [, d] of docs) { const h = createHistory(), p = proposeAlternatives(d, 'S', h); assert.ok(p.length <= 3);
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) assert.ok(regionDistance(p[i], p[j]) >= 2); }
});
test('الاختيار التلقائي لا يقترح J ضمنيًا، ورغبة العميل بـ J تُحترم', () => {
  for (const [, d] of docs) { assert.notEqual(rankStyles(d, '')[0].id, 'J'); assert.equal(rankStyles(d, 'معاصر')[0].id, 'J'); }
});
