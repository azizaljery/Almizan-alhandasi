// كتلة الواجهة: تراس الدور العلوي من المخطط، مفردات كتلة لكل طراز، الثبات، حدود الأرض، وممر المدخل.
// كل فحص يُحسب من مخرجات massingPlan/buildMassing نفسها مقابل هندسة مستقلة (المخطط وطبقات النموذج)، لا من ادعاء الوحدة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { facadeDoc, floorsInfo, extrudeFloors, floorLevel, FLOOR } from '../dist/facade-j/facade-realism/floors.mjs';
import { buildAllSides, sideTransform } from '../dist/facade-j/facade-realism/model.mjs';
import { STYLES, transformDoc } from '../dist/facade-j/facade-realism/styles/index.mjs';
import { massingPlan, buildMassing, findTerraces, terraceElements, clipMeshOutsideBox, VOCAB, MASSING_NOTE } from '../dist/facade-j/facade-realism/massing.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as THREE from '../dist/facade-j/vendor/three.module.js';

const land = f => ({ width: 20, length: 30, streets: ['s'], entries: ['s'], floors: f });
const counts = b => ({ bedrooms: b, majlis: 1, baths: b, kitchens: 1, halls: 1, dining: 1 });
const ONE = generateVillaDesigns({ land: land(1), counts: counts(3), requirements: {}, keep: 1 }).designs[0].doc;
const TWO = generateVillaTwoFloors({ land: land(2), counts: counts(4), requirements: {}, keep: 1 }).designs[0].doc;
const TER = (() => { const ds = generateVillaTwoFloors({ land: land(2), counts: counts(4), requirements: extractRequirements('ابي فيلا دورين 4 غرف نوم ومجلس وصالة ومطبخ وتراس فوق', {}), keep: 6 }).designs; return (ds.find(d => /terrace-front/.test(d.idea)) || ds.find(d => /terrace/.test(d.idea))).doc; })();

/** يبني نموذج الواجهة كما تفعل صفحة العرض، بأول قالب من الطراز يقبل هذا المخطط. */
async function build(doc, style, skip = 0) {
  const T = (await STYLES[style].load()).templates; let n = 0;
  for (const t of T) {
    const q = new URLSearchParams({ style, tpl: t.id, tseed: '1' });
    try { const d = await facadeDoc(doc, q, transformDoc), FI = floorsInfo(q), built = extrudeFloors(buildAllSides(d, 'A'), FI); if (n++ < skip) continue; return { built, FI, tpl: t.id }; } catch { /* قالب لا يُبنى على هذا المخطط: التالي */ }
  }
  throw new Error('لا قالب يُبنى للطراز ' + style);
}
const overlap = (a, b, e = .01) => a.min[0] < b.max[0] - e && a.max[0] > b.min[0] + e && a.min[1] < b.max[1] - e && a.max[1] > b.min[1] + e && a.min[2] < b.max[2] - e && a.max[2] > b.min[2] + e;
/** فتحات الواجهة الأمامية بإحداثيات المشهد، مستقلة عن الوحدة: من طبقات الإطارات والأبواب. */
function frontOpenings(built) {
  const B = built.s, M = sideTransform('s', B.off), out = [];
  for (const pc of B.F.pieces) for (const L of B.layers) {
    if (L.role !== 'frame' || !L.id.startsWith(pc.id + '/')) continue;
    const us = L.outer.map(p => p[0]), ys = L.outer.map(p => p[1]), base = String(L.opening).split('@')[0], o = pc.openings.find(x => x.id === base), ground = !(L.floor > 0);
    const x0 = M[0][0] * Math.min(...us) + M[0][3], x1 = M[0][0] * Math.max(...us) + M[0][3], z = pc.C + pc.t / 2;
    out.push({ id: L.opening, entry: ground && !!o?.entry && !/^window/.test(o.kind), box: { min: [x0, Math.min(...ys), z - .2], max: [x1, Math.max(...ys), z + 3.5] } });
  }
  return out;
}

test('مخطط علويه أصغر: تراس من المخطط بدرابزين وباب منزلق، وعدد الأدوار صحيح، والكتلة العليا مرتدة', async () => {
  const T = findTerraces(TER); assert.equal(T.length, 1, 'تراس واحد في العلوي');
  const t = T[0]; assert.equal(t.level, 1); assert.ok(t.x1 - t.x0 >= 2.5 && t.y1 - t.y0 >= 2.5, 'أبعاد التراس من المخطط');
  assert.ok(Object.values(t.edges).includes('open') && Object.values(t.edges).includes('wall'), 'حواف مكشوفة وحواف على الكتلة المرتدة');
  assert.ok(t.doors.length >= 1, 'باب منزلق من المخطط');
  // حدود التراس مطابقة لجدران/حواجز الدور العلوي في المخطط
  const up = TER.levels[1].id, at = (axis, v) => TER.walls.some(w => w.level === up && Math.abs(w.a[axis] - v) < 1e-6 && Math.abs(w.b[axis] - v) < 1e-6);
  assert.ok(at('x', t.x0) && at('x', t.x1) && at('y', t.y0) && at('y', t.y1));
  assert.equal(findTerraces(TWO).length, 0, 'بلا تراس في المخطط: لا تراس في الواجهة'); assert.equal(findTerraces(ONE).length, 0);
  for (const [style, rail] of [['M', 'rail-glass'], ['J', 'rail-glass'], ['C', 'baluster'], ['N', 'parapet'], ['H', 'spindle'], ['S', 'parapet']]) {
    const { built, FI } = await build(TER, style), plan = massingPlan({ doc: TER, built, style, exterior: {}, floors: FI.n });
    assert.equal(plan.terraces.length, 1, style); assert.equal(plan.terraces[0].FL, floorLevel(1));
    const E = terraceElements(plan.terraces[0], { top: plan.wallTop }), parts = new Set(E.map(x => x.part));
    assert.ok(parts.has(rail), `${style}: درابزين التراس (${rail}) — الموجود: ${[...parts].join('،')}`);
    assert.ok(parts.has('floor') && parts.has('wall') && parts.has('slider'), style + ': أرضية وجدار مرتد وباب منزلق');
    assert.ok(E.every(x => x.plan === true), 'عناصر التراس موسومة «من المخطط»');
    // الدرابزين على الحواف المكشوفة فقط وبارتفاع أمان ≥ 0.9 م فوق أرضية التراس
    const rails = E.filter(x => /rail|parapet|baluster|spindle|pier|curb|coping/.test(x.part) && x.part !== 'coping' || x.part === 'parapet'); assert.ok(Math.max(...rails.map(x => x.max[1])) - plan.terraces[0].FL >= .9);
    // عدد الأدوار يتبع المخطط: أعلى جدار دوران، والجدار المرتد يبلغه
    const top = Math.max(...Object.values(built).flatMap(B => B.layers.filter(L => L.role === 'wall').map(L => Math.max(...L.outer.map(p => p[1])))));
    assert.equal(Math.round((top - FLOOR.ground) / FLOOR.upper) + 1, 2, style + ': دوران'); assert.equal(FI.n, 2);
    assert.ok(Math.abs(Math.max(...E.filter(x => x.part === 'wall').map(x => x.max[1])) - top) < 1e-6, 'الجدار المرتد بارتفاع المبنى');
    // لا عنصر زخرفي داخل فراغ التراس
    assert.ok(plan.elements.every(el => !overlap(el, plan.terraces[0].void)), style + ': زخرفة فوق التراس');
  }
});

test('قصّ ما فوق التراس: الجدار الممتد يُقصّ عند الفراغ ولا يبقى شيء داخله، وبناء المشهد يضيف التراس ويحرر موارده', async () => {
  const { built, FI } = await build(TER, 'M'), plan = massingPlan({ doc: TER, built, style: 'M', exterior: {}, floors: FI.n }), v = plan.terraces[0].void;
  const scene = new THREE.Scene(), top = plan.wallTop;
  // جدار أمامي ممتد بارتفاع المبنى كله عند وجه الواجهة، وزخرفة داخل الفراغ كليًّا
  const wall = new THREE.Mesh(new THREE.BoxGeometry(13.5, top, .25), new THREE.MeshStandardMaterial()); wall.position.set(10, top / 2, -3); wall.userData = { role: 'wall', side: 's' }; scene.add(wall);
  const deco = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshStandardMaterial()); deco.position.set((v.min[0] + v.max[0]) / 2, v.min[1] + 2, -3); scene.add(deco);
  const m = buildMassing(THREE, { scene, S: { meshes: [wall] }, plan });
  assert.equal(deco.visible, false, 'ما كان كله داخل الفراغ أُخفي');
  const P = wall.geometry.attributes.position, p = new THREE.Vector3(); let inside = 0, above = 0; wall.updateMatrixWorld();
  for (let i = 0; i < P.count; i += 3) { const c = new THREE.Vector3(); for (let k = 0; k < 3; k++) c.add(p.fromBufferAttribute(P, i + k).applyMatrix4(wall.matrixWorld)); c.multiplyScalar(1 / 3);
    if (c.x > v.min[0] + .01 && c.x < v.max[0] - .01 && c.y > v.min[1] + .01 && c.z > v.min[2] + .01 && c.z < v.max[2] - .01) inside++; if (c.y > v.min[1] + .5 && c.x < v.min[0] - .5) above++; }
  assert.equal(inside, 0, 'لا مثلث من الجدار داخل فراغ التراس'); assert.ok(above > 0, 'الجدار خارج التراس باقٍ بارتفاعه');
  assert.ok(m.info.carved.clipped >= 1 && m.info.carved.hidden >= 1); assert.equal(m.info.terraces, 1); assert.equal(m.info.railing, 'glass'); assert.equal(m.info.note, MASSING_NOTE);
  // دمج لكل خامة: شبكة واحدة غير مكررة لكل خامة، والمكرر (كاسرات، قوائم) instanced
  const plain = m.group.children.filter(o => !o.isInstancedMesh).map(o => o.userData.matKey); assert.equal(new Set(plain).size, plain.length, 'شبكة مدموجة واحدة لكل خامة');
  assert.ok(m.group.children.some(o => o.isInstancedMesh && o.count >= 2), 'العناصر المكررة instanced'); assert.ok(m.group.children.length <= 12, 'عدد الشبكات المضافة ' + m.group.children.length);
  assert.ok(scene.children.includes(m.group)); m.dispose(); assert.ok(!scene.children.includes(m.group) && m.group.children.length === 0, 'تحرير الموارد');
  // صندوق خارج الفراغ لا يُمَسّ
  const far = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); far.position.set(-50, 1, 0); assert.equal(clipMeshOutsideBox(THREE, far, new THREE.Box3(new THREE.Vector3(...v.min), new THREE.Vector3(...v.max))), 0);
});

for (const style of Object.keys(STYLES)) test(`الطراز ${style}: مفردة كتلة واحدة على الأقل من قائمته، ضمن حدود الأرض، ولا تسدّ فتحة ولا ممر المدخل (دور، دوران، تراس)`, async () => {
  for (const [name, doc] of [['دور', ONE], ['دوران', TWO], ['تراس', TER]]) for (const skip of [0, 3]) {
    let b; try { b = await build(doc, style, skip); } catch { if (skip) continue; throw new Error(`${style}/${name}: لا قالب`); }
    const { built, FI, tpl } = b, tag = `${style}/${tpl}/${name}`, plan = massingPlan({ doc, built, style, exterior: {}, floors: FI.n });
    const mine = plan.vocab.filter(v => VOCAB[style].includes(v));
    assert.ok(mine.length >= 1, tag + ': لا مفردة كتلة'); assert.deepEqual(plan.vocab.filter(v => !VOCAB[style].includes(v)), [], tag + ': مفردة خارج قائمة الطراز');
    assert.ok(plan.elements.length >= 3, tag + ': عناصر ' + plan.elements.length + ' — ' + plan.dropped.map(d => d.id + '/' + d.part + ':' + d.why).join('؛ ')); assert.ok(plan.elements.every(el => el.deco === true && VOCAB[style].includes(el.id)), tag + ': كل عنصر موسوم زخرفة وبمفردته');
    // هندسة حقيقية: لكل عنصر حجم موجب في الأبعاد الثلاثة
    for (const el of plan.elements) for (let k = 0; k < 3; k++) assert.ok(el.max[k] - el.min[k] > .003 && Number.isFinite(el.min[k] + el.max[k]), `${tag}: ${el.id}/${el.part} بلا حجم`);
    // حدود الأرض والارتداد الجانبي (من المخطط مباشرة)
    const P = doc.plot.polygon, sb = doc.plot.setbacks, x0 = Math.min(...P.map(p => p.x)), x1 = Math.max(...P.map(p => p.x)), y0 = Math.min(...P.map(p => p.y)), y1 = Math.max(...P.map(p => p.y));
    for (const el of plan.elements) {
      assert.ok(el.min[0] >= x0 + sb.w - 1e-6 && el.max[0] <= x1 - sb.e + 1e-6, `${tag}: ${el.id}/${el.part} يتجاوز الارتداد الجانبي (${el.min[0].toFixed(2)}..${el.max[0].toFixed(2)})`);
      assert.ok(-el.max[2] >= y0 + .25 && -el.min[2] <= y1 - .25, `${tag}: ${el.id}/${el.part} يتجاوز حد الأرض أمامًا/خلفًا`);
      assert.ok(el.min[1] >= -1e-6, `${tag}: ${el.id}/${el.part} تحت الأرض`);
    }
    // البروز عن وجه الجدار الحامل: المعلّق (فوق 2.4 م) ≤ 1.5 م، وأي عنصر ≤ 2.2 م؛ والدخول في الارتداد الأمامي يبقى داخل الأرض ويُقاس
    assert.ok(plan.upperProjectionM <= 1.5 + 1e-6 && plan.maxProjectionM <= 2.2 + 1e-6, `${tag}: بروز ${plan.maxProjectionM}/${plan.upperProjectionM}`);
    assert.ok(Math.abs(plan.maxProjectionM - Math.max(...plan.elements.map(el => el.proj))) < 1e-9 && plan.encroachFrontM >= 0 && plan.encroachFrontM <= sb.s - .25, `${tag}: دخول الارتداد الأمامي ${plan.encroachFrontM}`);
    // الفتحات: لا عنصر مصمت أمام فتحة، ولا أي عنصر (ولا ساتر) في ممر المدخل
    const ops = frontOpenings(built), entry = ops.filter(o => o.entry);
    for (const el of plan.elements) {
      for (const o of entry) assert.ok(!overlap(el, o.box), `${tag}: ${el.id}/${el.part} يتقاطع مع فتحة المدخل ${o.id}`);
      if (!el.screen) for (const o of ops) assert.ok(!overlap(el, o.box), `${tag}: ${el.id}/${el.part} مصمت أمام الفتحة ${o.id}`);
    }
    if (entry.length) assert.ok(plan.entry, tag + ': ممر المدخل معرّف');
  }
});

test('الثبات: نفس المخطط والذوق ← نفس الكتلة؛ ذوق آخر أو مخطط آخر ← كتلة أخرى', async () => {
  for (const style of ['M', 'C', 'N', 'H', 'S', 'J']) {
    const a = await build(TWO, style), b = await build(TWO, style), ext = { entrance: 'grand', openings: 'wide', screen: 'yes', feel: 'grand' };
    const p1 = massingPlan({ doc: TWO, built: a.built, style, exterior: ext, floors: 2 }), p2 = massingPlan({ doc: JSON.parse(JSON.stringify(TWO)), built: b.built, style, exterior: { ...ext, night: 'lit', notes: 'x' }, floors: 2 });
    assert.deepEqual(p2.elements, p1.elements, style + ': الكتلة تغيّرت بين بناءين'); assert.equal(p2.seed, p1.seed); assert.deepEqual(p2.vocab, p1.vocab);
    const p3 = massingPlan({ doc: TWO, built: a.built, style, exterior: { entrance: 'simple', feel: 'simple' }, floors: 2 });
    assert.notEqual(p3.seed, p1.seed); assert.notDeepEqual(p3.elements, p1.elements, style + ': الذوق لا يغيّر الكتلة');
    // 'auto' كالغياب
    assert.equal(massingPlan({ doc: TWO, built: a.built, style, exterior: { entrance: 'auto', feel: 'auto' }, floors: 2 }).seed, massingPlan({ doc: TWO, built: a.built, style, exterior: {}, floors: 2 }).seed);
  }
  const t = await build(TER, 'M'), w = await build(TWO, 'M');
  assert.notEqual(massingPlan({ doc: TER, built: t.built, style: 'M', floors: 2 }).seed, massingPlan({ doc: TWO, built: w.built, style: 'M', floors: 2 }).seed, 'مخطط آخر ← بذرة أخرى');
});

test('صفحة العرض: نص الصدق يذكر التراس من المخطط وعناصر الواجهة الزخرفية، والذوق يُمرَّر إلى صفحة الواجهة', async () => {
  const { readFile } = await import('node:fs/promises'), root = new URL('../dist/', import.meta.url);
  const v = await readFile(new URL('view3d.html', root), 'utf8'), f = await readFile(new URL('facade-j/index.html', root), 'utf8');
  assert.match(v, /تراس الدور العلوي وارتداد كتلته من مخططك/); assert.match(v, /عناصر الواجهة الزخرفية/); assert.match(v, /تنسيق موقع إيضاحي/); assert.match(v, /مراجعة اشتراطات البلدية/);
  assert.match(v, /&ext=/); assert.match(f, /massingPlan\(/); assert.match(f, /q\.get\('mass'\) !== '0'/); assert.match(f, /massing\?\.dispose\(\)/);
  assert.match(MASSING_NOTE, /من مخططك/); assert.match(MASSING_NOTE, /الزخرفية/);
});
