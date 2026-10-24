// (الجولة التاسعة عشرة — شرط المالك) المعيار المجمّد: التنظيم نفسه منقولًا أو مكبّرًا/مصغّرًا أو معكوسًا ليس «مختلفًا معماريًا» ولا «بديلًا جديدًا»،
// وتنظيمان مختلفان فعلًا في الحالة نفسها يُحكم عليهما «مختلف». docs/research/arch-difference-criterion-r19.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { ARCH_CRITERION_R19, sameOrDifferent } from '../dist/arch-criterion.mjs';
import { SUBSTANTIVE_V2 } from '../dist/arch-difference.mjs';
import { mirrorX } from '../scripts/defect-corpus.mjs';

const root = new URL('../', import.meta.url).pathname, f = (c, n) => `${root}evidence/acceptance/after-19/${c}/${n}`;
const have = existsSync(f('C9', 'alt-4.json'));
const r3 = v => Math.round(v * 1000) / 1000;
/** إزاحة وتكبير/تصغير كل عناصر المستند (التنظيم نفسه). */
function affine(doc, s, dx, dy) {
  const d = JSON.parse(JSON.stringify(doc)), P = p => p && { ...p, x: r3(p.x * s + dx), y: r3(p.y * s + dy) };
  for (const w of d.walls) { w.a = P(w.a); w.b = P(w.b); }
  for (const o of d.openings) o.at = r3(o.at * s);
  for (const l of d.labels) l.seed = P(l.seed);
  for (const x of [...d.fixtures, ...d.stairs, ...(d.columns || [])]) { const q = P(x); x.x = q.x; x.y = q.y; }
  for (const z of d.zones || []) z.polygon = z.polygon.map(P);
  for (const m of d.dimensions || []) { m.a = P(m.a); m.b = P(m.b); }
  d.plot.polygon = d.plot.polygon.map(P); return d;
}

test('المعيار مجمّد بالأبعاد الأربعة والعتبات وبُعدين جوهريين', () => {
  assert.deepEqual([...ARCH_CRITERION_R19.dimensions], ['zoning', 'circulation', 'privacy', 'relations']);
  assert.deepEqual({ ...ARCH_CRITERION_R19.thresholds }, { zoning: .25, circulation: .25, privacy: .2, relations: .2 });
  assert.deepEqual({ ...SUBSTANTIVE_V2 }, { ...ARCH_CRITERION_R19.thresholds });
  assert.equal(ARCH_CRITERION_R19.distinctMinSubstantive, 2);
});

test('الإزاحة والتكبير والتصغير والانعكاس للتنظيم نفسه: «نفسه» لا «مختلف» ولا «جزئي»', { skip: !have }, () => {
  for (const [c, n] of [['C5', 'alt-3.json'], ['C9', 'alt-1.json'], ['C10', 'alt-1.json'], ['C7', 'alt-1.json']]) {
    const doc = parseDoc(readFileSync(f(c, n), 'utf8'));
    for (const [nm, d2] of [['إزاحة', affine(doc, 1, 3.2, -1.7)], ['تكبير 6٪', affine(doc, 1.06, 0, 0)], ['تصغير 5٪', affine(doc, .95, 0, 0)], ['انعكاس', mirrorX(doc)], ['انعكاس وإزاحة وتكبير', affine(mirrorX(doc), 1.04, -2, 1)]]) {
      const r = sameOrDifferent(doc, d2);
      assert.equal(r.different, false, `${c} ${nm}`); assert.deepEqual(r.substantive, [], `${c} ${nm}`); assert.ok(r.total <= .01, `${c} ${nm}: ${r.total}`);
    }
  }
});

test('ضبط مقابل: تنظيمان مختلفان في الحالة نفسها (C9-1 جناح ضيافة أمامي، C9-4 حوشان) «مختلف معماريًا»', { skip: !have }, () => {
  const r = sameOrDifferent(parseDoc(readFileSync(f('C9', 'alt-1.json'), 'utf8')), parseDoc(readFileSync(f('C9', 'alt-4.json'), 'utf8')));
  assert.equal(r.different, true); assert.ok(r.substantive.length >= 2);
});
