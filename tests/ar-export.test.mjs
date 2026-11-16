// الواقع المعزز: نموذج 1:1 بالمتر، GLB، USDZ، كشف الدعم، آلة حالات الوضع. كله نقي (بلا متصفح ولا جهاز).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleVilla } from '../dist/draw/samples.mjs';
import { applyCommand } from '../dist/draw/doc.mjs';
import { buildArModel, triangulate } from '../dist/ar-model.mjs';
import { encodeGlb } from '../dist/ar-glb.mjs';
import { encodeUsdz, buildUsda, crc32 } from '../dist/ar-usdz.mjs';
import { detectArSupport, AR_MESSAGES } from '../dist/ar-support.mjs';
import { createPlacement, fingerAngle, angleDelta, yawFromTwist } from '../dist/ar-viewer.mjs';

const twoLevels = () => { const d = sampleVilla(); return applyCommand(d, { type: 'add-level', height: 3, copyFrom: 'L1' }).doc; };
// الأبعاد المتوقعة من المستند نفسه دون مرور بنموذج AR: مستطيل الجدران الخارجية + نصف السماكة من كل جهة + المناسيب
const expected = doc => {
  const xs = doc.walls.flatMap(w => [w.a.x, w.b.x]), ys = doc.walls.flatMap(w => [w.a.y, w.b.y]), t = 0.25;
  const H = doc.levels.reduce((s, l) => s + l.height, 0);
  return { w: Math.max(...xs) - Math.min(...xs) + t, d: Math.max(...ys) - Math.min(...ys) + t, h: 0.45 + H + doc.roof.parapet };
};
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

function parseGlb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(dv.getUint32(0, true), 0x46546C67, 'magic glTF'); assert.equal(dv.getUint32(4, true), 2); assert.equal(dv.getUint32(8, true), bytes.length, 'length header');
  const jl = dv.getUint32(12, true); assert.equal(dv.getUint32(16, true), 0x4E4F534A); assert.equal(jl % 4, 0);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl)));
  const bo = 20 + jl, bl = dv.getUint32(bo, true); assert.equal(dv.getUint32(bo + 4, true), 0x004E4942); assert.equal(bl % 4, 0); assert.equal(bo + 8 + bl, bytes.length);
  return { json, bin: bytes.subarray(bo + 8, bo + 8 + bl), dv };
}

test('نموذج AR: أبعاد الصندوق المحيط تطابق المبنى في المستند (دور واحد ودوران)', () => {
  for (const doc of [sampleVilla(), twoLevels()]) {
    const m = buildArModel(doc), e = expected(doc);
    near(m.size[0], e.w); near(m.size[2], e.d); near(m.size[1], e.h);
    assert.equal(m.bbox.min[1], 0, 'القاعدة على الأرض'); near((m.bbox.min[0] + m.bbox.max[0]) / 2, 0, 1e-4); near((m.bbox.min[2] + m.bbox.max[2]) / 2, 0, 1e-4);
    assert.equal(m.units, 'm'); assert.ok(m.stats.triangles > 500 && m.stats.triangles < 20000, 'نموذج خفيف');
    assert.ok(m.stats.windows > 0 && m.stats.doors > 0);
  }
  assert.equal(buildArModel(twoLevels()).stats.levels, 2);
});

test('نموذج AR: رفض مستند بلا جدران، وتثليث المضلع غير المحدّب', () => {
  assert.throws(() => buildArModel({ walls: [], levels: [], openings: [] }), /AR_NO_WALLS/);
  const L = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }];
  const tris = triangulate(L), area = tris.reduce((s, [a, b, c]) => s + Math.abs((L[b].x - L[a].x) * (L[c].y - L[a].y) - (L[b].y - L[a].y) * (L[c].x - L[a].x)) / 2, 0);
  near(area, 4 + 2, 1e-9); assert.equal(tris.length, 4);
});

test('GLB: هيدر glTF وJSON وعدّادات accessors ومطابقة البيانات الثنائية والصندوق المحيط', () => {
  const doc = twoLevels(), m = buildArModel(doc), { json, bin, dv } = parseGlb(encodeGlb(m));
  assert.equal(json.asset.version, '2.0'); assert.equal(json.scenes.length, 1); assert.equal(json.nodes[0].mesh, 0);
  const prims = json.meshes[0].primitives; assert.equal(prims.length, m.meshes.length);
  assert.equal(json.buffers.length, 1); assert.equal(json.buffers[0].byteLength, bin.length);
  const gmn = [Infinity, Infinity, Infinity], gmx = [-Infinity, -Infinity, -Infinity]; let tri = 0;
  prims.forEach((p, i) => {
    const pos = json.accessors[p.attributes.POSITION], nor = json.accessors[p.attributes.NORMAL], idx = json.accessors[p.indices], src = m.meshes[i];
    assert.equal(pos.count, src.positions.length / 3); assert.equal(nor.count, pos.count); assert.equal(idx.count, src.indices.length); assert.equal(idx.count % 3, 0);
    assert.equal(pos.type, 'VEC3'); assert.equal(pos.componentType, 5126); assert.equal(idx.type, 'SCALAR'); assert.ok([5123, 5125].includes(idx.componentType));
    for (const a of [pos, nor, idx]) { const bv = json.bufferViews[a.bufferView], sz = a === idx ? (a.componentType === 5123 ? 2 : 4) : 12; assert.ok(bv.byteOffset % 4 === 0 && bv.byteOffset + bv.byteLength <= bin.length); assert.equal(bv.byteLength, a.count * sz); }
    // أول موضع وأقصى فهرس داخل المدى
    const bv = json.bufferViews[pos.bufferView], first = [0, 1, 2].map(k => dv.getFloat32(20 + json.buffers[0].byteLength * 0 + (dv.getUint32(12, true)) + 8 + bv.byteOffset + k * 4, true));
    for (let k = 0; k < 3; k++) near(first[k], src.positions[k], 1e-6);
    for (let k = 0; k < 3; k++) { gmn[k] = Math.min(gmn[k], pos.min[k]); gmx[k] = Math.max(gmx[k], pos.max[k]); }
    tri += idx.count / 3; assert.ok(p.material >= 0 && p.material < json.materials.length);
  });
  const e = expected(doc); near(gmx[0] - gmn[0], e.w); near(gmx[2] - gmn[2], e.d); near(gmx[1] - gmn[1], e.h); near(gmn[1], 0, 1e-6);
  assert.equal(tri, m.stats.triangles);
  assert.ok(json.materials.some(x => x.alphaMode === 'BLEND'));
});

test('GLB وUSDA بلا أسماء/مسارات/روابط خارجية ولا نص المشروع', () => {
  const doc = sampleVilla(); doc.title = 'مشروع-سري-123';
  const m = buildArModel(doc), glb = JSON.stringify(parseGlb(encodeGlb(m)).json), usda = buildUsda(m); // نص JSON (القطعة الثنائية أرقام فقط)
  for (const s of [glb, usda]) { assert.ok(!/https?:|:\/\/|file:|\.\.\/|\\|@|\.(png|jpg|jpeg|bin|usd[ac]?)\b/i.test(s.replace('model.usda', '')), 'لا مراجع خارجية'); assert.ok(!s.includes('مشروع-سري')); }
  assert.ok(!/"uri"/.test(glb)); assert.ok(!/مشروع/.test(new TextDecoder('utf-8', { fatal: false }).decode(encodeGlb(m))));
});

function parseZip(z) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength), files = [];
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054b50, 'EOCD'); const n = dv.getUint16(z.length - 22 + 10, true), cdOff = dv.getUint32(z.length - 22 + 16, true), cdSize = dv.getUint32(z.length - 22 + 12, true);
  assert.equal(cdOff + cdSize + 22, z.length);
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50); const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csz = dv.getUint32(p + 20, true), usz = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(z.subarray(p + 46, p + 46 + nl));
    assert.equal(dv.getUint32(lho, true), 0x04034b50); const lnl = dv.getUint16(lho + 26, true), lel = dv.getUint16(lho + 28, true), dataOff = lho + 30 + lnl + lel;
    files.push({ name, method, crc, csz, usz, dataOff, data: z.subarray(dataOff, dataOff + usz) }); p += 46 + nl;
  }
  return files;
}

test('USDZ: zip غير مضغوط بمحاذاة 64 بايت وUSDA أول الملفات وسليم البنية', () => {
  const m = buildArModel(twoLevels()), z = encodeUsdz(m), files = parseZip(z);
  assert.equal(files.length, 1); const f = files[0];
  assert.match(f.name, /^[A-Za-z0-9_.-]+\.usda$/); assert.equal(f.method, 0); assert.equal(f.csz, f.usz); assert.equal(f.dataOff % 64, 0, 'محاذاة 64'); assert.equal(crc32(f.data), f.crc);
  const t = new TextDecoder().decode(f.data); assert.ok(t.startsWith('#usda 1.0')); assert.match(t, /metersPerUnit = 1\b/); assert.match(t, /upAxis = "Y"/); assert.match(t, /defaultPrim = "Root"/);
  assert.equal([...t].filter(c => c === '{').length, [...t].filter(c => c === '}').length, 'توازن الأقواس');
  // لكل Mesh: عدّادات الأوجه والفهارس والنقاط والعمودي متسقة ومربوطة بمادة معرّفة
  const mats = new Set([...t.matchAll(/def Material "(\w+)"/g)].map(x => x[1])); let tri = 0, meshes = 0;
  for (const blk of t.split('def Mesh ').slice(1)) {
    meshes++;
    const counts = blk.match(/faceVertexCounts = \[([^\]]*)\]/)[1].split(',').map(Number), idx = blk.match(/faceVertexIndices = \[([^\]]*)\]/)[1].split(',').map(Number);
    const pts = (blk.match(/points = \[(.*)\]/)[1].match(/\(/g) || []).length, nrm = (blk.match(/normals = \[(.*)\] \(/)[1].match(/\(/g) || []).length;
    assert.ok(counts.every(c => c === 3)); assert.equal(counts.length * 3, idx.length); assert.ok(Math.max(...idx) < pts); assert.equal(pts, nrm); tri += counts.length;
    assert.ok(mats.has(blk.match(/material:binding = <\/Root\/Materials\/(\w+)>/)[1]));
  }
  assert.equal(meshes, m.meshes.length); assert.equal(tri, m.stats.triangles);
  assert.ok(!/NaN|Infinity|undefined/.test(t));
});

test('USDZ: ناتج حتمي (نفس المدخل = نفس البايتات)', () => {
  const m = buildArModel(sampleVilla()); assert.deepEqual(encodeUsdz(m), encodeUsdz(buildArModel(sampleVilla())));
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

const nav = (o = {}) => ({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126', maxTouchPoints: 5, ...o });
const docWith = ar => ({ createElement: () => ({ relList: { supports: t => t === 'ar' && ar } }) });

test('كشف الدعم: Android مع WebXR → webxr؛ يُسأل immersive-ar تحديدًا', async () => {
  const asked = [], n = nav({ xr: { isSessionSupported: async m => { asked.push(m); return m === 'immersive-ar'; } } });
  const r = await detectArSupport({ navigator: n, document: docWith(false), isSecureContext: true });
  assert.deepEqual([r.mode, r.platform, r.message], ['webxr', 'android', '']); assert.deepEqual(asked, ['immersive-ar']);
});

test('كشف الدعم: iPhone Safari (rel=ar) → quicklook؛ وiPad بوضع سطح المكتب أيضًا', async () => {
  const iph = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1', maxTouchPoints: 5 };
  assert.equal((await detectArSupport({ navigator: iph, document: docWith(true), isSecureContext: true })).mode, 'quicklook');
  const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', maxTouchPoints: 5 };
  assert.equal((await detectArSupport({ navigator: ipad, document: docWith(true), isSecureContext: true })).platform, 'ios');
  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605', maxTouchPoints: 0 };
  assert.equal((await detectArSupport({ navigator: mac, document: docWith(true), isSecureContext: true })).mode, 'none', 'ماك بلا لمس لا يدّعي واقعًا معززًا');
});

test('كشف الدعم: بلا دعم → رسائل عربية صادقة حسب المنصة، دون ادعاء', async () => {
  const d = await detectArSupport({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126', maxTouchPoints: 0 }, document: docWith(false), isSecureContext: true });
  assert.deepEqual([d.mode, d.platform, d.message], ['none', 'desktop', AR_MESSAGES.desktop]); assert.match(d.message, /GLB/);
  const a = await detectArSupport({ navigator: nav({ xr: { isSessionSupported: async () => false } }), document: docWith(false), isSecureContext: true });
  assert.equal(a.mode, 'none'); assert.match(a.message, /ARCore/);
  const thrown = await detectArSupport({ navigator: nav({ xr: { isSessionSupported: async () => { throw new Error('x'); } } }), document: docWith(false), isSecureContext: true });
  assert.equal(thrown.mode, 'none');
  const ins = await detectArSupport({ navigator: nav({ xr: { isSessionSupported: async () => true } }), document: docWith(false), isSecureContext: false });
  assert.equal(ins.mode, 'none'); assert.match(ins.message, /HTTPS/);
  const ios = await detectArSupport({ navigator: { userAgent: 'Mozilla/5.0 (iPhone) CriOS/126', maxTouchPoints: 5 }, document: docWith(false), isSecureContext: true });
  assert.equal(ios.mode, 'none'); assert.match(ios.message, /Safari/);
  for (const msg of Object.values(AR_MESSAGES)) assert.match(msg, /[؀-ۿ]/);
});

test('آلة حالات الوضع والتدوير: بحث ← وضع ← تثبيت ← إعادة، والتدوير معطّل بعد التثبيت', () => {
  const p = createPlacement(); assert.equal(p.state.phase, 'searching'); assert.equal(p.confirm(), false);
  p.hit({ x: 1, y: 0, z: -2 }); assert.equal(p.state.phase, 'positioning'); p.hit({ x: 2, y: 0, z: -2 }); assert.deepEqual(p.state.hit, { x: 2, y: 0, z: -2 });
  p.rotate(Math.PI / 2); near(p.state.yaw, Math.PI / 2, 1e-9);
  assert.equal(p.confirm(), true); assert.equal(p.state.phase, 'placed'); assert.deepEqual(p.state.anchor, { x: 2, y: 0, z: -2 });
  p.hit({ x: 9, y: 0, z: 9 }); p.rotate(1); near(p.state.yaw, Math.PI / 2, 1e-9); assert.deepEqual(p.state.anchor, { x: 2, y: 0, z: -2 });
  p.reset(); assert.equal(p.state.phase, 'positioning'); assert.equal(p.state.anchor, null); p.rotate(-Math.PI); near(p.state.yaw, -Math.PI / 2 + 2 * Math.PI, 1e-9);
  const q = createPlacement(); q.hit({ x: 0, y: 0, z: 0 }); q.hit(null); assert.equal(q.state.phase, 'searching');
});

test('زاوية الإصبعين: التفاف باتجاه عقارب الساعة على الشاشة يعطي دوران yaw سالبًا، وتطوي القفزة عند ±π', () => {
  const a0 = fingerAngle({ x: 0, y: 0 }, { x: 10, y: 0 }), a1 = fingerAngle({ x: 0, y: 0 }, { x: 10, y: 10 }); // الإصبع الثاني ينزل = مع عقارب الساعة
  assert.ok(angleDelta(a0, a1) > 0); assert.ok(yawFromTwist(angleDelta(a0, a1)) < 0);
  near(angleDelta(3.1, -3.1), 2 * Math.PI - 6.2, 1e-9);
});

test('ar-ui لا يستورد شيئًا خارجيًا، وصفحة العرض تحوي الزر والنص الإلزامي', () => {
  for (const f of ['ar-model', 'ar-glb', 'ar-usdz', 'ar-support', 'ar-viewer', 'ar-ui']) { const s = readFileSync(new URL(`../dist/${f}.mjs`, import.meta.url), 'utf8'); for (const [, spec] of s.matchAll(/(?:from\s+|import\()\s*'([^']+)'/g)) assert.ok(spec.startsWith('./'), `${f}: ${spec}`); assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(s), `${f} لا يرسل شيئًا`); }
  const h = readFileSync(new URL('../dist/view3d.html', import.meta.url), 'utf8');
  assert.match(h, /id="arBtn"[^>]*>اعرضه في أرضي بالواقع المعزز/); assert.match(h, /id="glbBtn"[^>]*>تنزيل النموذج \(GLB\)/); assert.match(h, /العرض تقريبي لتصور الحجم، وليس مخططًا تنفيذيًا/);
});
