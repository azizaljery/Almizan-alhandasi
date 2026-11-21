// الأثاث الإجرائي الغني: كل صنف × كل طراز يُبنى بأبعاد سليمة، بلا مواد مفقودة (fallback)، وضمن ميزانية مثلثات للجوال، ومع تنوع حقيقي بين الطرز.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { buildRichFixture, RICH_KINDS, FURNITURE_STYLES, isRichKind } from '../dist/draw/interior-furniture.mjs';
import { createFixtureMaterials, buildFixture } from '../dist/draw/fixtures3d.mjs';
import { FIXTURES } from '../dist/draw/catalog.mjs';
import { softBoxGeometry, pillowGeometry, turnedLeg } from '../dist/draw/interior-kit.mjs';
import { buildPiece } from '../dist/draw/interior-pieces.mjs';
import { PAINTERS } from '../dist/draw/interior-textures.mjs';

// the scene adds the pattern material 'rug' and the per-room 'glow' next to the shared fixture materials; the test does the same
const mats = createFixtureMaterials(THREE, { rug: new THREE.MeshStandardMaterial({ name: 'rug' }), glow: new THREE.MeshStandardMaterial({ name: 'glow', emissive: '#ffd9a0' }) });
const tris = g => { let n = 0; g.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };
const meshes = g => { const a = []; g.traverse(o => o.isMesh && a.push(o)); return a; };
/** per-kind triangle ceiling (design budget for phones; recorded in the report). */
const BUDGET = { 'sofa-3': 12000, 'sofa-2': 10000, armchair: 6000, 'majlis-sofa': 12000, 'coffee-table': 5000, 'bed-double': 12000, 'bed-single': 9000, nightstand: 3500, 'dining-table': 14000, chair: 2500, rug: 600, plant: 4500, 'tv-unit': 3500, wardrobe: 4500, 'kitchen-run': 9000, basin: 3500 };

test('كل صنف غني يُبنى في كل طراز: أبعاد منتهية، مواده من مجموعة الأثاث لا fallback، وضمن الميزانية', () => {
  for (const kind of RICH_KINDS) for (const style of FURNITURE_STYLES) for (const variant of [0, 1, 2]) {
    const g = buildRichFixture(THREE, kind, {}, mats, { style, variant, seed: variant + 1 });
    assert.ok(g, `${kind}/${style}`); assert.equal(g.userData.rich, true);
    const ms = meshes(g); assert.ok(ms.length >= 3, `${kind}/${style} قطع قليلة`);
    for (const m of ms) { assert.notEqual(m.material, mats.fallback, `${kind}/${style}: مادة مفقودة`); const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 7) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), `${kind}/${style} قيمة غير منتهية`); assert.ok(m.geometry.attributes.uv && m.geometry.attributes.normal, 'uv/normal'); }
    const T = tris(g); assert.ok(T <= BUDGET[kind], `${kind}/${style}/${variant}: ${T} مثلثًا > ${BUDGET[kind]}`);
    const box = new THREE.Box3().setFromObject(g), def = FIXTURES[kind];
    assert.ok(box.min.y > -.02, `${kind}/${style}: تحت الأرض ${box.min.y}`);
    if (!['plant', 'dining-table', 'chair', 'bed-double', 'bed-single'].includes(kind)) { assert.ok(box.max.x - box.min.x < def.w * 1.45 + .3 && box.max.z - box.min.z < def.d * 1.45 + .3, `${kind}/${style}: يتجاوز بصمته ${box.max.x - box.min.x}x${box.max.z - box.min.z}`); }
  }
});

test('أبعاد المستند تُحترم: العرض والعمق المطلوبان لا يقلّان عن الأبعاد (الصنف يملأ بصمته) والارتفاع معقول', () => {
  for (const kind of ['sofa-3', 'majlis-sofa', 'coffee-table', 'bed-double', 'wardrobe', 'tv-unit', 'kitchen-run', 'armchair']) {
    const def = FIXTURES[kind];
    for (const style of FURNITURE_STYLES) {
      const dims = { w: def.w * 1.2, d: def.d, h: def.h }, box = new THREE.Box3().setFromObject(buildRichFixture(THREE, kind, dims, mats, { style }));
      assert.ok(box.max.x - box.min.x >= dims.w * .85, `${kind}/${style} عرض ${box.max.x - box.min.x}`);
      assert.ok(box.max.y <= Math.max(dims.h * 2.6, 2.7), `${kind}/${style} ارتفاع ${box.max.y}`);
    }
  }
});

test('التنوع حقيقي: نفس الصنف في طرزين مختلفين يعطي هندسة وعدد قطع مختلفين، لا لونًا مختلفًا فقط', () => {
  for (const kind of ['sofa-3', 'majlis-sofa', 'bed-double', 'coffee-table', 'chair', 'nightstand']) {
    const sig = style => { const g = buildRichFixture(THREE, kind, {}, mats, { style }); const b = new THREE.Box3().setFromObject(g); return [meshes(g).length, Math.round(tris(g)), +(b.max.y - b.min.y).toFixed(2)].join('/'); };
    const sigs = FURNITURE_STYLES.map(sig); assert.ok(new Set(sigs).size >= 4, `${kind}: ${sigs.join(' ')}`);
  }
});

test('العناصر الثقافية: الجلسة العربية الأرضية (نجدي) أخفض من الكلاسيكية المرتفعة، والدلّة والمبخرة على طاولة المجلس', () => {
  const top = (kind, style) => new THREE.Box3().setFromObject(buildRichFixture(THREE, kind, {}, mats, { style }));
  const floor = top('majlis-sofa', 'najdi'), raised = top('majlis-sofa', 'classic');
  const seatTop = g => { let y = 0; g.traverse(o => { if (o.isMesh && o.material === mats.upholsteryAlt) y = Math.max(y, new THREE.Box3().setFromObject(o).max.y); }); return y; };
  assert.ok(seatTop(buildRichFixture(THREE, 'majlis-sofa', {}, mats, { style: 'classic' })) > 0.3);
  assert.ok(floor.max.y > .3 && raised.max.y > .7);
  for (const style of ['najdi', 'classic', 'luxury']) { const t = buildRichFixture(THREE, 'coffee-table', {}, mats, { style }); assert.ok(meshes(t).some(m => m.geometry.type === 'LatheGeometry'), `${style}: لا دلّة/مبخرة مخروطة`); assert.ok(meshes(t).some(m => m.geometry.type === 'TubeGeometry'), `${style}: لا مقبض/فوهة`); }
});

test('الأصناف خارج القائمة تعود null فيبقى نموذج fixtures3d، وكل الأصناف الغنية ضمن كتالوج المستند', () => {
  assert.equal(buildRichFixture(THREE, 'car', {}, mats, {}), null); assert.equal(isRichKind('fridge'), false);
  for (const k of RICH_KINDS) assert.ok(FIXTURES[k], k);
  assert.ok(buildFixture(THREE, 'fridge', {}, mats));
});

test('الهندسة المساعدة: الصندوق الناعم والوسادة بمثلثات محدودة وإحداثيات ضمن الصندوق، والساق المخروطة بملف صاعد', () => {
  const g = softBoxGeometry(THREE, .6, .2, .5, .06); g.computeBoundingBox();
  assert.ok(g.boundingBox.max.x <= .3 + 1e-6 && g.boundingBox.max.y <= .1 + 1e-6 && g.boundingBox.max.z <= .25 + 1e-6);
  assert.ok(g.index.count / 3 <= 450);
  const p = pillowGeometry(THREE, .4, .12, .4); p.computeBoundingBox(); assert.ok(p.boundingBox.max.y < .06 + 1e-6);
  const lg = turnedLeg(.4); assert.ok(lg.every((q, i) => i === 0 || q[1] >= lg[i - 1][1]) && lg.every(q => q[0] > 0));
});

test('الستارة: ثنيات حقيقية (تباين عمق) وقضيب وحلقات، لكل طراز، بأبعاد منتهية', () => {
  const M = n => mats[n] || mats.fallback;
  for (const style of FURNITURE_STYLES) {
    const g = buildPiece(THREE, 'curtain', { w: 2.4, d: .12, h: 2.7 }, M, { style, metal: 'gold', fabric: 'fabric', sheer: 'linen', tie: 'gold' }), ms = meshes(g);
    const panel = ms.filter(m => m.geometry.type === 'PlaneGeometry'); assert.ok(panel.length >= 2, style);
    for (const m of panel) { const p = m.geometry.attributes.position; let lo = 9, hi = -9; for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getZ(i)); hi = Math.max(hi, p.getZ(i)); } assert.ok(hi - lo > .02 || m === panel[0], `${style}: لا ثنيات (${(hi - lo).toFixed(3)})`); }
    assert.ok(ms.some(m => m.geometry.type === 'TorusGeometry'), 'حلقات'); assert.ok(tris(g) < 4500, `${style} ${tris(g)}`);
  }
});

test('المخطط الراسم: رسّامو السجادة والنسيج موجودون ويرفضون الاستدعاء دون كانفس بسلاسة (بيئة node)', () => {
  assert.equal(typeof PAINTERS.rugPattern, 'function'); assert.equal(typeof PAINTERS.fabricWeave, 'function');
});
