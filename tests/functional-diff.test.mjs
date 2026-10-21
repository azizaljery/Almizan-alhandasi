// مقياس الاختلاف الوظيفي v2 (dist/arch-difference.mjs): السلم والغلاف لا يُحتسبان بذاتهما، والحكم «مختلف معماريًا» يتطلب
// اختلافًا جوهريًا في بعدين من أربعة، والشرح بالعربية، والتوافق مع v1، ودليل المعايرة على الأحكام البشرية.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { archSignatureV2, archDifferenceV2, archMatrixV2, explainDifference, verdictV2, archDifference, archSignature,
  DIMENSIONS_V2, WEIGHTS_V2, SUBSTANTIVE_V2, ARCH_DIFF_V2_VERSION, ARCH_DIFF_VERSION, RELATION_GROUPS } from '../dist/arch-difference.mjs';
import { loadBase, mirrorX } from '../scripts/defect-corpus.mjs';

const after9 = loadBase('after-9');
const get = (c, n) => after9.find(b => b.case === c && b.file === `alt-${n}.json`).doc;
const clone = d => JSON.parse(JSON.stringify(d));

test('الأبعاد الأربعة معلنة، والأوزان مجموعها 1، والحكم بعدد الأبعاد الجوهرية لا بالإجمالي', () => {
  assert.deepEqual([...DIMENSIONS_V2], ['zoning', 'circulation', 'privacy', 'relations']);
  assert.equal(Math.round(DIMENSIONS_V2.reduce((s, k) => s + WEIGHTS_V2[k], 0) * 1000), 1000);
  const T = SUBSTANTIVE_V2;
  // بعد واحد كبير جدًا لا يكفي (مثل تغيير السلم الذي يغيّر الحركة وحدها)
  assert.equal(verdictV2({ zoning: 0, circulation: 1, privacy: 0, relations: 0 }).verdict, 'partial');
  assert.equal(verdictV2({ zoning: T.zoning, circulation: T.circulation, privacy: 0, relations: 0 }).verdict, 'distinct');
  assert.equal(verdictV2({ zoning: T.zoning - 0.01, circulation: T.circulation - 0.01, privacy: T.privacy - 0.01, relations: T.relations - 0.01 }).verdict, 'variant');
});

test('المستند مع نفسه = 0، ومع نسخته المعكوسة = 0 لكل بدائل after-9 (والتماثل d(a,b) = d(b,a))', () => {
  for (const b of after9) {
    assert.equal(archDifferenceV2(b.doc, b.doc).total, 0, b.case + b.file);
    const m = archDifferenceV2(b.doc, mirrorX(b.doc));
    assert.equal(m.total, 0, `${b.case}/${b.file} معكوس = ${m.total}`);
    assert.equal(m.verdict, 'variant');
  }
  const x = archDifferenceV2(get('C10', 1), get('C10', 4)), y = archDifferenceV2(get('C10', 4), get('C10', 1));
  for (const k of ['total', ...DIMENSIONS_V2]) { assert.ok(Math.abs(x[k] - y[k]) < 0.005, k); assert.ok(x[k] >= 0 && x[k] <= 1, k); }
});

test('شكل الغلاف وحده لا يُحتسب: تمديد المبنى 25% عرضًا ≈ 0 ونسخة معدّلة', () => {
  for (const [c, n] of [['C5', 1], ['C10', 2], ['C7', 1]]) {
    const d = get(c, n), s = clone(d), k = 1.25, horiz = new Set(s.walls.filter(w => Math.abs(w.a.y - w.b.y) < 1e-6).map(w => w.id));
    for (const w of s.walls) { w.a.x *= k; w.b.x *= k; }
    for (const o of s.openings) if (horiz.has(o.wall)) o.at *= k;
    for (const l of s.labels) l.seed.x *= k;
    for (const f of s.fixtures) f.x *= k;
    for (const st of s.stairs) st.x *= k;
    s.plot.polygon = s.plot.polygon.map(p => ({ ...p, x: p.x * k }));
    const r = archDifferenceV2(d, s);
    assert.ok(r.total < 0.06, `${c}/${n} ممطوط = ${r.total}`);
    assert.equal(r.verdict, 'variant', `${c}/${n}: ${JSON.stringify(r.substantive)}`);
  }
});

test('موضع السلم وحده لا يُحتسب: نقل السلم إلى موضع الخزانة في الدورين (C7 بعد-9) = نسخة معدّلة، ويُذكر «غير محتسب»', () => {
  const d = get('C7', 1), s = clone(d);
  // في كل دور: تبادل وسمَي «الدرج» و«خزانة ملابس» (الخزانة فوق الخزانة)، ونقل السلم نفسه إلى موضع الخزانة
  let moved = null;
  for (const L of s.levels) {
    const st = s.labels.find(l => l.level === L.id && l.type === 'stairs'), cl = s.labels.find(l => l.level === L.id && l.type === 'storage' && /خزانة/.test(l.name));
    assert.ok(st && cl, 'سلم وخزانة في الدور ' + L.id);
    [st.seed, cl.seed] = [cl.seed, st.seed];
    if (L.id === s.levels[0].id) moved = st.seed;
  }
  s.stairs[0].x = moved.x; s.stairs[0].y = moved.y;
  const r = archDifferenceV2(d, s), ex = explainDifference(r);
  assert.equal(r.verdict, 'variant', JSON.stringify({ z: r.zoning, c: r.circulation, p: r.privacy, r: r.relations }));
  assert.ok(r.zoning < 0.05 && r.privacy < 0.05 && r.relations < 0.05, JSON.stringify(r));
  assert.ok(ex.ignored.some(t => /موضع السلم/.test(t)), ex.ignored.join(' | '));
});

test('C7 بعد-9: البدائل الثلاثة ليست حلولًا مختلفة — 1↔2 نسخة معدّلة (سلم وانعكاس)، ولا زوج «مختلف معماريًا»', () => {
  const m = archMatrixV2([1, 2, 3].map(n => get('C7', n)));
  const p12 = m.pairs.find(p => p.i === 0 && p.j === 1);
  assert.equal(p12.verdict, 'variant');
  assert.ok(m.pairs.every(p => p.verdict !== 'distinct'), JSON.stringify(m.pairs.map(p => [p.i + 1, p.j + 1, p.verdict])));
  const ex = explainDifference(get('C7', 1), get('C7', 2));
  assert.match(ex.text, /نسخة معدّلة/);
  assert.ok(ex.ignored.some(t => /السلم/.test(t)) && ex.ignored.some(t => /الغلاف/.test(t)));
});

test('حلول حقيقية تُعرف: C3 بعد-9 (جناح بممر / صالة موزِّعة / جناحان) كلها «مختلف معماريًا» ببعدين على الأقل', () => {
  const m = archMatrixV2([1, 2, 3].map(n => get('C3', n)));
  for (const p of m.pairs) { assert.equal(p.verdict, 'distinct', `${p.i + 1}-${p.j + 1}`); assert.ok(p.substantive.length >= 2); }
});

test('الشرح العربي: جملة لكل بعد، والأبعاد الجوهرية مسماة، والعلاقات المتغيرة مذكورة', () => {
  const ex = explainDifference(get('C10', 1), get('C10', 4));
  assert.equal(ex.sentences.length, 4);
  for (const w of ['توزيع الوظائف', 'بنية الحركة', 'تدرّج الخصوصية', 'العلاقات الأساسية']) assert.ok(ex.text.includes(w), w);
  assert.match(ex.text, /الحكم: مختلف معماريًا/);
  assert.match(ex.text, /موزّع بالصالة/);
  assert.ok(/[؀-ۿ]/.test(ex.sentences[0]));
});

test('التوقيع: نطاقات بلا سلم ولا ممرات، والعمق العلوي من الصالة العلوية، ومجموعات العلاقات الأربع', () => {
  const s = archSignatureV2(get('C7', 1));
  assert.equal(s.version, ARCH_DIFF_V2_VERSION);
  assert.equal(s.floors.length, 2);
  assert.deepEqual(Object.keys(s.floors[0].zones).sort(), ['family', 'guest', 'private', 'service']);
  assert.equal(s.floors[1].origin, 'hall');
  assert.equal(s.floors[1].routeType, 'hall');
  assert.ok(s.relations['master-kids'] && s.relations['elderly-living'] && s.relations['majlis-guestWC']);
  assert.deepEqual(Object.keys(RELATION_GROUPS), ['family', 'bedrooms', 'elderly', 'guest']);
});

test('v1 باقٍ كما هو للتوافق (archDifference/archSignature بالإصدار 1.0.0)', () => {
  assert.equal(ARCH_DIFF_VERSION, 'arch-difference/1.0.0');
  const v1 = archDifference(get('C7', 1), get('C7', 2));
  assert.ok('adjacency' in v1 && 'zoning' in v1 && v1.verdict);
  assert.equal(archSignature(get('C1', 1)).version, 'arch-difference/1.0.0');
});

test('دليل المعايرة مكتوب: الانعكاس 0، والتمديد صغير، ولا خطأ جسيم مع الأحكام البشرية، والصارم ≥ 30/42', () => {
  const ev = JSON.parse(readFileSync(new URL('../evidence/review-proof/functional-difference-r9.json', import.meta.url), 'utf8'));
  assert.equal(ev.version, ARCH_DIFF_V2_VERSION);
  assert.equal(ev.invariance.mirrorMax, 0); assert.ok(ev.invariance.stretchMax < 0.06);
  assert.ok(ev.human.every(h => h.lenient), ev.human.filter(h => !h.lenient).map(h => `${h.stage} ${h.case} ${h.pair}`).join(', '));
  assert.ok(ev.human.filter(h => h.strict).length >= 30);
  // لا زوج حكم عليه الإنسان «نسخة معدّلة» يقبله v2 مختلفًا
  assert.ok(ev.human.filter(h => h.human === 'same').every(h => h.verdict === 'variant'));
});
