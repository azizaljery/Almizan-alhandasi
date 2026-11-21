// وضع الجوال «العرض الخفيف»: الأثاث الغني مطفأ، ميزانية المثلثات، الخامات ≤512، وبقاء الوضع الكامل كاملًا (مسار الصورة الاحترافية)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import { buildPiece } from '../dist/draw/interior-pieces.mjs';
import { buildFixture } from '../dist/draw/fixtures3d.mjs';
import { DrawViewer } from '../dist/draw/viewer-draw.mjs';
import { parseDoc } from '../dist/draw/doc.mjs';

// الواجهة بلا متصفح: نوافذ مزيّفة تكفي لإنشاء المشاهد وبنائه بلا WebGL
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {}; globalThis.requestAnimationFrame ??= () => 1; globalThis.cancelAnimationFrame ??= () => {};

const docs = ['b1', 'b2'].map(k => parseDoc(readFileSync(new URL(`./fixtures/mobile-villa-${k}.json`, import.meta.url), 'utf8')));
const THEMES = ['luxury', 'najdi', 'contemporary', 'classic', 'dark'];
const lite = (doc, theme) => buildBuildingScene(doc, THREE, { textures: false, interior: true, interiorTheme: theme, detail: 'lite', quality: .5 });
const full = (doc, theme) => buildBuildingScene(doc, THREE, { textures: false, interior: true, interiorTheme: theme });
const tris = g => { let n = 0; g.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };

// ميزانية الجوال: ~80 ألف مثلث (الأكبر بين الأمثلة قد يتجاوزها قليلًا)، وسقف صارم 90 ألفًا؛ والوضع الكامل يبقى غنيًا (أكثر من ضعف الخفيف)
test('العرض الخفيف يلتزم بميزانية المثلثات في كل طراز ويقلّ عن نصف الكامل', () => {
  for (const doc of docs) for (const th of THEMES) {
    const L = lite(doc, th), F = full(doc, th);
    assert.ok(L.stats.triangles <= 90000, `${th}: ${L.stats.triangles} مثلثًا في العرض الخفيف`);
    assert.ok(F.stats.triangles > L.stats.triangles * 2, `${th}: الكامل ${F.stats.triangles} لا يتجاوز ضعف الخفيف ${L.stats.triangles}`);
    assert.ok(L.stats.meshes <= F.stats.meshes + 5, 'عدد الشبكات (استدعاءات الرسم) لا يزيد');
  }
});

test('العرض الخفيف يطفئ الأثاث الغني وزينة الأرقام الدقيقة: لا userData.rich ولا حلقات ستائر ولا كتب', () => {
  const doc = docs[0];
  const seenRich = [];
  const L = buildBuildingScene(doc, THREE, { textures: false, interior: true, interiorTheme: 'luxury', detail: 'lite', quality: .5 });
  L.group.traverse(o => { if (o.userData?.rich) seenRich.push(o.name); });
  assert.equal(seenRich.length, 0);
  // الستارة الخفيفة بلا حلقات: مثلثاتها أقل من عُشر الكاملة
  const M = n => ({ name: n });
  const dims = { w: 2.2, d: .12, h: 2.8 };
  const cf = tris(buildPiece(THREE, 'curtain', dims, M, { style: 'luxury' })), cl = tris(buildPiece(THREE, 'curtain', dims, M, { style: 'luxury', low: true }));
  assert.ok(cl * 8 < cf, `ستارة خفيفة ${cl} مقابل ${cf}`);
  const chf = tris(buildPiece(THREE, 'chandelier', {}, M, {})), chl = tris(buildPiece(THREE, 'chandelier', {}, M, { low: true }));
  assert.ok(chl * 8 < chf, `ثريا خفيفة ${chl} مقابل ${chf}`);
  const bf = tris(buildPiece(THREE, 'bookcase', { w: 1.2, d: .35, h: 2 }, M, {})), bl = tris(buildPiece(THREE, 'bookcase', { w: 1.2, d: .35, h: 2 }, M, { low: true }));
  assert.ok(bl < bf);
});

test('الأجسام المستديرة في الوضع الخفيف أقل مقاطع (أشجار وأجهزة) والمسار الافتراضي لم يتغيّر', () => {
  const mats = null;
  for (const kind of ['tree', 'shrub', 'wc', 'basin', 'bed-double']) {
    const a = tris(buildFixture(THREE, kind, {}, mats)), b = tris(buildFixture(THREE, kind, { low: true }, mats));
    assert.ok(b < a, `${kind}: ${b} !< ${a}`);
  }
  const a1 = tris(buildFixture(THREE, 'tree', {}, mats)), a2 = tris(buildFixture(THREE, 'tree', { low: false }, mats));
  assert.equal(a1, a2);
});

test('بناء الكامل مع detail الافتراضي مطابق لما قبل (لا تراجع في مسار الصورة الاحترافية: الأثاث الغني يبقى مفعّلًا)', () => {
  const doc = docs[0];
  const def = buildBuildingScene(doc, THREE, { textures: false, interior: true, interiorTheme: 'luxury' });
  const exp = buildBuildingScene(doc, THREE, { textures: false, interior: true, interiorTheme: 'luxury', detail: 'full' });
  assert.equal(def.stats.triangles, exp.stats.triangles);
  assert.ok(def.stats.triangles > 150000, 'الكامل غني');
  const photo = buildBuildingScene(doc, THREE, { textures: false, interior: false, richFurniture: true, furnitureStyle: 'luxury' });
  const plain = buildBuildingScene(doc, THREE, { textures: false, interior: false });
  assert.ok(photo.stats.triangles > plain.stats.triangles * 1.5, 'مسار الصورة الاحترافية (أثاث غني بلا واجهة الديكور) سليم');
});

// ---- المشاهد: يقرأ وضع الجوال من الجهاز ويطبّق الحدود دون WebGL حقيقي (عارض مزيّف) ----
function fakeRenderer(T) {
  const calls = { pr: [], size: [] };
  class R { constructor() { this.domElement = { style: {}, tabIndex: 0, addEventListener() {}, removeEventListener() {}, remove() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 500 }) }; this.shadowMap = { enabled: false, type: 0, autoUpdate: true }; this.capabilities = { getMaxAnisotropy: () => 16, maxTextureSize: 4096 }; this.info = { render: {}, memory: {} }; }
    setPixelRatio(v) { calls.pr.push(v); this._pr = v; } getPixelRatio() { return this._pr ?? 1; } setSize(w, h) { calls.size.push([w, h]); } render() {} dispose() {} getContext() { return {}; } }
  return { R, calls };
}
test('المشاهد على جوال: lowPower يفعّل الخفيف، سقف نسبة البكسل 1.5، ظل 1024، الجودة .5 والأثاث الغني مطفأ', async () => {
  const saved = { matchMedia: globalThis.matchMedia, innerWidth: globalThis.innerWidth, dpr: globalThis.devicePixelRatio };
  globalThis.matchMedia = q => ({ matches: /coarse/.test(q) }); globalThis.innerWidth = 390; globalThis.devicePixelRatio = 3;
  const { R, calls } = fakeRenderer(THREE);
  const T = { ...THREE, WebGLRenderer: R, PMREMGenerator: class { fromScene() { return { texture: {}, dispose() {} }; } dispose() {} } };
  const host = { clientWidth: 390, clientHeight: 500, appendChild() {}, addEventListener() {} };
  try {
    const v = new DrawViewer(host, { THREE: T, shadowSize: 2048, maxPixelRatio: 2, adaptive: false });
    assert.equal(v.detail, 'lite'); assert.equal(v.lowPower, true);
    assert.equal(v.maxPixelRatio, 1.5); assert.ok(calls.pr.every(p => p <= 1.5), JSON.stringify(calls.pr));
    assert.equal(v.sun.shadow.mapSize.x, 1024);
    v.setDoc(docs[0]);
    assert.equal(v.built.options.detail, 'lite'); assert.equal(v.built.options.quality, .5);
    assert.ok(v.built.stats.triangles <= 90000, String(v.built.stats.triangles));
    // الاختيار اليدوي «كامل» يعيد الغنى والحدّ 2 ويُعاد «خفيف»
    v.setDetail('full'); assert.equal(v.detail, 'full'); assert.equal(v.maxPixelRatio, 2); assert.ok(v.built.stats.triangles > 150000);
    v.setDetail('lite'); assert.equal(v.detail, 'lite'); assert.equal(v.maxPixelRatio, 1.5); assert.ok(v.built.stats.triangles <= 90000);
    v.dispose?.();
  } finally { Object.assign(globalThis, { matchMedia: saved.matchMedia, innerWidth: saved.innerWidth, devicePixelRatio: saved.dpr }); }
});

test('المشاهد على سطح المكتب يبقى كاملًا، والتدهور التلقائي يخفّض بالترتيب: نسبة البكسل ثم الخفيف ثم 1 ثم الظلال', async () => {
  const saved = { matchMedia: globalThis.matchMedia, innerWidth: globalThis.innerWidth, dpr: globalThis.devicePixelRatio };
  globalThis.matchMedia = () => ({ matches: false }); globalThis.innerWidth = 1366; globalThis.devicePixelRatio = 2;
  const { R } = fakeRenderer(THREE);
  const T = { ...THREE, WebGLRenderer: R, PMREMGenerator: class { fromScene() { return { texture: {}, dispose() {} }; } dispose() {} } };
  const host = { clientWidth: 1000, clientHeight: 600, appendChild() {}, addEventListener() {} };
  try {
    const v = new DrawViewer(host, { THREE: T, shadowSize: 2048, maxPixelRatio: 2 });
    assert.equal(v.detail, 'full'); assert.equal(v.maxPixelRatio, 2);
    v.setDoc(docs[0]); assert.ok(v.built.stats.triangles > 150000);
    const steps = []; v.onState = e => { if (e.type === 'perf') steps.push({ d: e.detail.detail, pr: v.maxPixelRatio, sh: e.detail.shadows }); };
    // 20 إطارًا بطيئة (80 مللي ثانية) أثناء حركة مستمرة => خطوة تدهور واحدة
    const feed = () => { let t = 1000; for (let i = 0; i < 22; i++) { t += 80; v.perfWatch(t, true); } };
    feed(); feed(); feed(); feed(); feed();
    assert.deepEqual(steps.map(s => [s.d, s.pr, s.sh]), [['full', 1.25, true], ['lite', 1.25, true], ['lite', 1, true], ['lite', 1, false]]);
    assert.equal(v.degrade(), null, 'لا مزيد بعد إطفاء الظلال');
    // توقّف الحركة لا يُحسب بطئًا
    const n = steps.length; v.perfWatch(5000, false); v.perfWatch(9000, true); v.perfWatch(9080, true); assert.equal(steps.length, n);
    v.dispose?.();
  } finally { Object.assign(globalThis, { matchMedia: saved.matchMedia, innerWidth: saved.innerWidth, devicePixelRatio: saved.dpr }); }
});

test('مسار الصورة الداخلية الاحترافية يطلب الجودة الكاملة صراحة ولا يتدهور تلقائيًا', () => {
  const src = readFileSync(new URL('../dist/interior/interior-view.mjs', import.meta.url), 'utf8');
  assert.match(src, /detail: 'full'/); assert.match(src, /adaptive: false/);
});
