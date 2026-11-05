import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemplate, blendParams, mutateParams } from '../dist/facade-j/facade-realism/templates.mjs';
import { designDna, sha256Hex, createDnaLog } from '../dist/facade-j/facade-realism/dna.mjs';
import { analyzeSolar, bearingOf } from '../dist/facade-j/facade-realism/solar.mjs';
import { STYLES } from '../dist/facade-j/facade-realism/styles/index.mjs';
import { solarTessellation } from '../dist/facade-j/facade-realism/styles/modern-light.mjs';
import { designList } from './fixtures/facade-designs.mjs';

const Q = s => new URLSearchParams(s);
const MODS = {}; for (const id of Object.keys(STYLES)) MODS[id] = await STYLES[id].load();

test('كل طراز يصدّر مكتبة قوالب بمعرّفات فريدة ومفاتيح منفصلة', () => {
  let total = 0;
  for (const [id, m] of Object.entries(MODS)) {
    assert.ok(Array.isArray(m.templates) && m.templates.length >= 12, id + ': أقل من 12 قالبًا');
    assert.equal(new Set(m.templates.map(t => t.id)).size, m.templates.length, id + ': معرّفات مكررة');
    for (const t of m.templates) { assert.ok(t.id.startsWith(id)); assert.ok(t.ar && typeof t.p === 'object'); for (const v of Object.values(t.p)) assert.ok(['number', 'string', 'boolean'].includes(typeof v)); }
    assert.equal(typeof m.docTransform, 'function', id + ': لا docTransform');
    total += m.templates.length;
  }
  assert.ok(total >= 110, 'المجموع ' + total);
});
test('الدمج: tpl=A+B و"A B" (فراغ من الرابط) يعطيان النتيجة نفسها، والتطفير يغيّر مفاتيح ضمن التعدادات', () => {
  const T = MODS.N.templates, a = resolveTemplate(T, Q('tpl=N01+N04&tseed=2')), b = resolveTemplate(T, Q('tpl=N01 N04&tseed=2'));
  assert.deepEqual(a.p, b.p); assert.deepEqual(a.parents, ['N01', 'N04']);
  for (const k of Object.keys(a.p)) assert.ok([T[0].p[k], T[3].p[k]].includes(a.p[k]));
  const m = resolveTemplate(T, Q('tpl=N02&mut=0.9&mseed=7')), m2 = resolveTemplate(T, Q('tpl=N02&mut=0.9&mseed=7'));
  assert.ok(m.mutated.length > 0); assert.deepEqual(m.p, m2.p);
  for (const k of m.mutated) assert.ok(T.some(t => t.p[k] === m.p[k]), 'قيمة خارج التعدادات: ' + k);
  assert.deepEqual(resolveTemplate(T, Q('tpl=N02')).p, T[1].p);
});
test('docTransform لكل قالب على التصاميم الستة يُرجع مستندًا صالحًا ولا يمس الأصل', () => {
  for (const [, d] of designList()) for (const [id, m] of Object.entries(MODS)) for (const t of m.templates) {
    const src = structuredClone(d), q = Q('style=' + id + '&tpl=' + t.id), out = m.docTransform(src, q);
    assert.deepEqual(src, d, t.id + ': الأصل تغيّر');
    assert.ok(out && Array.isArray(out.walls) && out.walls.length >= 4 && Array.isArray(out.openings), t.id);
    const byId = new Map(out.walls.map(w => [w.id, w]));
    for (const o of out.openings) assert.ok(byId.has(o.wall), t.id + ': فتحة على جدار غير موجود');
    assert.ok(out.openings.some(o => o.entry || /door|arch/i.test(o.kind || '')), t.id + ': لا باب');
    const fl = +q.get('floors'); if (q.has('floors')) assert.ok(fl >= 1 && fl <= 3);
  }
});
test('بصمة التصميم SHA-256 حتمية وتتغير بتغيّر القالب أو التطفير', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const a = designDna({ hash: 123, style: 'N', tpl: 'N01' }), b = designDna({ hash: 123, style: 'N', tpl: 'N01' }), c = designDna({ hash: 123, style: 'N', tpl: 'N01', mut: .4, mseed: 9 });
  assert.equal(a, b); assert.notEqual(a, c); assert.equal(a.length, 64);
  const log = createDnaLog(); assert.equal(log.mark(a), false); assert.equal(log.mark(a), true);
});
test('التحليل الشمسي يحترم doc.north ويرفع أنماط الظل الذاتي للواجهات الحارة', () => {
  assert.equal(bearingOf('s', 0), 180); assert.equal(bearingOf('s', 90), 270); assert.equal(bearingOf('n', 0), 0);
  assert.equal(analyzeSolar({ entry: 'w', north: 0 }).risk, 'CRITICAL_WEST_GLARE');
  assert.equal(analyzeSolar({ entry: 's', north: 180 }).requiresSelfShading, false);
  assert.deepEqual(analyzeSolar({ entries: ['w'] }).advice.styles, ['H', 'N', 'S']);
});
test('الساتر التموجي الشمسي: الثلث الأعلى أضيق من مستوى العين، والنتيجة حتمية', () => {
  const t = solarTessellation(2.4, 2.5, {}), u = solarTessellation(2.4, 2.5, {});
  assert.ok(t.bands.top < t.bands.mid, JSON.stringify(t.bands)); assert.ok(t.ratio > .1 && t.ratio < .6); assert.equal(t.signature, u.signature);
});
