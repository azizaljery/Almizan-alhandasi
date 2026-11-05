// (عينة جودة العرض المعزولة HQ، C1) بيئة HDR موثقة، أرضية ومحيط، إعدادات ظل مضبوطة، وزجاج بانعكاس فعلي.
// الأصل: quarry_01_1k.hdr من Poly Haven (ترخيص CC0) عبر مستودع three.js (examples/textures/equirectangular، الإيداع 7e26babb).
// لا يغيّر أي طبقة من طبقات المبنى: يضيف فقط الإضاءة والمحيط ويستبدل خامات الزجاج/الداخل/الأرض في هذه العينة.
import clip from '../facade-kit/vendor/polygon-clipping.mjs';
export async function enhanceScene(THREE, { scene, renderer, sun, S, lib, q, RGBELoader, doc, Sky }) {
  const envMode = q.get('env') || 'sky';
  // اتجاه الشمس (يُستعمل للسماء والضوء معًا حتى تتسق الخلفية والانعكاس والظل)
  const az0 = Number(q.get('az') ?? 250), el0 = Number(q.get('el') ?? 35), azr = az0 * Math.PI / 180, elr = el0 * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(elr) * Math.sin(azr), Math.sin(elr), -Math.cos(elr) * Math.cos(azr));
  const pmrem = new THREE.PMREMGenerator(renderer); let env, hdrName = null;
  if (envMode === 'hdr') { hdrName = q.get('hdr') || 'quarry_01_1k.hdr'; const hdr = await new RGBELoader().loadAsync('./facade-realism/assets/' + hdrName); hdr.mapping = THREE.EquirectangularReflectionMapping; env = pmrem.fromEquirectangular(hdr).texture; }
  else if (envMode === 'none') { env = null; }
  else { // سماء صافية تحليلية (نموذج Preetham) بالشمس نفسها: البيئة والخلفية من مصدر واحد
    const skyScene = new THREE.Scene(), sky = new Sky(); sky.scale.setScalar(1000); skyScene.add(sky); const U = sky.material.uniforms;
    U.turbidity.value = Number(q.get('turb') ?? 3.2); U.rayleigh.value = Number(q.get('ray') ?? 1.1); U.mieCoefficient.value = .004; U.mieDirectionalG.value = .8; U.sunPosition.value.copy(sunDir); if (U.cloudCoverage) U.cloudCoverage.value = 0; U.radianceScale.value = Number(q.get('skys') ?? .06); U.showSunDisc.value = 0; // سماء صافية بلا غيوم إجرائية
    env = pmrem.fromScene(skyScene, 0, .1, 1100).texture; if (q.get('nobg') === '1') { pmrem.dispose(); scene.environment = env; return {}; }
    // الخلفية من سماء المصدر نفسه عبر كاميرا مكعبة (لا تُضاف السماء كجسم في المشهد الرئيسي)
    const crt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType }); U.radianceScale.value = Number(q.get('bgs') ?? .35); new THREE.CubeCamera(1, 2000, crt).update(renderer, skyScene); U.radianceScale.value = Number(q.get('skys') ?? .06); scene.background = crt.texture; // الخلفية أسطع من البيئة بالمعامل نفسه للمصدر نفسه (التعريض فقط)
  }
  pmrem.dispose(); scene.environment = env; const envI = Number(q.get('envi') ?? (envMode === 'hdr' ? .35 : 1)); // r160 لا يدعم scene.environmentIntensity: تُضبط شدة البيئة لكل خامة (envMapIntensity) scene.environmentIntensity = Number(q.get('envi') ?? .35);
  if (envMode === 'hdr') scene.background = skyTexture(THREE);
  renderer.toneMappingExposure = Number(q.get('exp') ?? .82);
  // الإضاءة المحيطة القديمة (نصف كرة) تُطفأ: الضوء المحيط من HDR
  scene.traverse(o => { if (o.isHemisphereLight) o.intensity = 0; });
  // ظل: إطار ضيق حول المبنى (22×22 م)، خريطة 4096، وانحياز عادي أكبر — الاختبار أثبت أن الخطوط المائلة تخطيط ظل (تختفي بإطفاء الظل)
  sun.intensity = Number(q.get('sun') ?? 5); sun.color.set('#fff1dc');
  const az = az0, el = el0; // سمت الشمس من الشمال باتجاه عقارب الساعة، والارتفاع بالدرجات (افتراضي: عصرًا من الغرب-الجنوب الغربي، شمس مائلة تُظهر العمق)
  const ar = az * Math.PI / 180, er = el * Math.PI / 180, T = new THREE.Vector3(9, 2, -12); sun.target.position.copy(T); sun.position.set(T.x + 40 * Math.cos(er) * Math.sin(ar), T.y + 40 * Math.sin(er), T.z - 40 * Math.cos(er) * Math.cos(ar)); sun.target.updateMatrixWorld();
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } sun.shadow.mapSize.set(4096, 4096); const F = 15; Object.assign(sun.shadow.camera, { left: -F, right: F, top: F, bottom: -F, near: 1, far: 90 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2;
  // زجاج: انعكاس حاد من HDR، لون مائل للأخضر الرمادي كزجاج منخفض الانبعاث، ومجال داخلي غير أسود تمامًا
  // (2026-11-05) زجاج فيزيائي بنفاذية حقيقية (transmission): انعكاس البيئة بفرينل + لون رمادي مزرق خفيف، ويُرى الداخل خلفه
  const night = q.get('night') === '1';
  const glass = new THREE.MeshPhysicalMaterial({ color: '#e4edf0', metalness: 0, roughness: .02, transmission: .86, thickness: .012, ior: 1.52, attenuationColor: '#9fb6bd', attenuationDistance: .25, specularIntensity: 1, envMapIntensity: night ? .6 : 2.2, clearcoat: 1, clearcoatRoughness: .02 }); glass.name = 'glass';
  // الداخل: ستارة كتان فاتحة بطيات رأسية وفجوة يظهر منها عمق الغرفة (نهارًا إنارة داخلية خافتة، ليلًا دافئة)
  const curtain = curtainTexture(THREE, renderer);
  const interior = new THREE.MeshStandardMaterial({ map: curtain, roughness: .95, emissive: '#ffe7c4', emissiveMap: curtain, emissiveIntensity: night ? .9 : .08 }); interior.name = 'interior';
  const door = doorMaterial(THREE, renderer), jointMat = new THREE.MeshStandardMaterial({ color: '#9d9586', roughness: .98 }); jointMat.name = 'joint';
  const stoneFace = new Map();
  for (const m of S.meshes) { const n = m.material?.name || '';
    if (n === 'glass') m.material = glass; else if (n === 'interior') m.material = interior;
    else if (m.userData?.role === 'door') { m.material = door.mat; fitDoorUV(THREE, m); }
    else if (/Joint$/.test(n)) m.material = jointMat;
    else if (m.userData?.part === 'blocks') { tintBlocks(THREE, m); if (!stoneFace.has(n)) { const c = m.material.clone(); c.vertexColors = true; stoneFace.set(n, c); } m.material = stoneFace.get(n); } }
  // ستارة داخلية فاتحة خلف بعض الزجاج (عمق 30 سم) تعطي قراءة داخلية بدل الفراغ الأسود
  // المحيط: أرض موقع مرصوفة (بلاطات 40×20 سم بمقياس صحيح) داخل القطعة، ورمل/حصى حولها
  const pav = paverTexture(THREE, renderer); const sand = sandTexture(THREE, renderer);
  const site = S.meshes.find(m => m.name === 'ground'); if (site) { site.material = new THREE.MeshStandardMaterial({ map: pav.map, bumpMap: pav.bump, bumpScale: .6, roughness: .92, color: '#ffffff' }); site.material.name = 'paving'; }
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ map: sand.map, roughness: 1, color: '#ffffff' })); outer.rotation.x = -Math.PI / 2; outer.position.set(10, -.02, -15); outer.receiveShadow = true; scene.add(outer);
  // رصيف ونطاق شارع أمام القطعة (جنوبًا)
  const curb = new THREE.Mesh(new THREE.BoxGeometry(60, .15, .3), new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: .9 })); curb.position.set(10, .075, 1.2); curb.castShadow = curb.receiveShadow = true; scene.add(curb);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 9), new THREE.MeshStandardMaterial({ color: '#3d3e40', roughness: .95 })); road.rotation.x = -Math.PI / 2; road.position.set(10, -.01, 5.9); road.receiveShadow = true; scene.add(road);
  // قرار المالك (تجميد الهندسة): السقف والدرج والعتبة مُعطّلة افتراضيًا؛ المقبض المجسم تفصيل للباب نفسه
  if (q.get('roof') === '1') addRoof(THREE, scene, doc);
  if (q.get('handles') !== '0') addEntranceDetails(THREE, scene, S, { steps: q.get('steps') === '1' });
  return { hdrName, envMode };
}
function cnv(S) { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }
function rnd(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** بلاطات رصف 40×20 سم بنمط متداخل؛ القماش يغطي 2×2 م ويُكرر بمقياس صحيح. */
function paverTexture(THREE, renderer) {
  const S = 1024, [c, x] = cnv(S), [b, y] = cnv(S), r = rnd(7), px = S / 2; // 1 م = 512 بكسل
  x.fillStyle = '#b9ad97'; x.fillRect(0, 0, S, S); y.fillStyle = '#000'; y.fillRect(0, 0, S, S);
  const w = .4 * px, h = .2 * px, j = 3;
  for (let row = 0; row * h < S; row++) for (let i = -1; i * w < S; i++) { const ox = (row % 2) * w / 2, X = i * w + ox, Y = row * h; const v = 168 + Math.floor(r() * 26);
    x.fillStyle = `rgb(${v + 22},${v + 12},${v - 6})`; x.fillRect(X + j, Y + j, w - 2 * j, h - 2 * j); y.fillStyle = '#fff'; y.fillRect(X + j, Y + j, w - 2 * j, h - 2 * j);
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(90,80,60,${r() * .08})`; x.fillRect(X + r() * w, Y + r() * h, 2, 2); } }
  const T = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 15); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: T(c, true), bump: T(b, false) };
}
function sandTexture(THREE, renderer) {
  const S = 512, [c, x] = cnv(S), r = rnd(11); x.fillStyle = '#cbb894'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 9000; k++) { const v = r(); x.fillStyle = v < .5 ? `rgba(150,130,95,${r() * .25})` : `rgba(235,222,195,${r() * .25})`; x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 70); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return { map: t };
}

/** ستارة إجرائية: القماش 2.4 م عرضًا (UV بالأمتار)، طيات رأسية كل ~12 سم بظلال ناعمة، وفجوة ~35% يظهر منها الداخل الأغمق. */
function curtainTexture(THREE, renderer) { const W = 1024, H = 64, [c, x] = cnvWH(W, H), img = x.createImageData(W, H), d = img.data, r = rnd(31), ph = [];
  for (let k = 0; k < 4; k++) ph.push(r() * 6.28);
  for (let px = 0; px < W; px++) { const u = px / W * 2.4, fold = .5 + .5 * Math.sin(u / .12 * 6.28 + ph[0] + .6 * Math.sin(u * 3 + ph[1])), gap = u > 1.45 && u < 2.25;
    const edge = Math.min(Math.abs(u - 1.45), Math.abs(u - 2.25)), sh = gap ? .32 + .06 * Math.sin(u * 9) : (.74 + .2 * fold) * (edge < .04 ? .7 : 1);
    for (let py = 0; py < H; py++) { const i = (py * W + px) * 4, v = sh * (1 + (r() - .5) * .03); d[i] = 255 * Math.min(1, v); d[i + 1] = 255 * v * .96; d[i + 2] = 255 * v * .88; d[i + 3] = 255; } }
  x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 2.4, 1); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; }
function skyTexture(THREE) { const [c, x] = cnv(512); const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#5f95c4'); g.addColorStop(.55, '#a9c9e2'); g.addColorStop(.8, '#dfe6e6'); g.addColorStop(1, '#ece6da'); x.fillStyle = g; x.fillRect(0, 0, 512, 512); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
/** تفاوت لوني طفيف لكل بلاطة (±4%) كحجر طبيعي من محجر واحد — لون رأسي لكل مثلثات البلاطة نفسها. */
function tintBlocks(THREE, m) { const g = m.geometry, pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), r = rnd(3); let k = 0;
  // ExtrudeGeometry لكل بلاطة دُمجت متتالية: نقسم بالتقارب المكاني (مفتاح شبكي 0.6×0.3)
  const v = new THREE.Vector3(), key = new Map();
  for (let i = 0; i < n; i += 3) { v.fromBufferAttribute(pos, i); const kk = Math.round(v.x / .6 * 2) + ':' + Math.round(v.y / .3 * 2) + ':' + Math.round(v.z / .6 * 2); let t = key.get(kk); if (t === undefined) { t = .96 + r() * .08; key.set(kk, t); } const w = t, ww = t * (0.99 + r() * .0);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = w; col[(i + j) * 3 + 1] = ww * .995; col[(i + j) * 3 + 2] = ww * .985; } }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
/** باب مصمت بإطار وألواح غائرة ومقبض (خامة مرسومة بمقياس الباب نفسه + خريطة نتوء) — لا يغيّر فتحة الباب. */
function doorMaterial(THREE, renderer) { const W = 512, H = 1024, [c, x] = cnvWH(W, H), [b, y] = cnvWH(W, H);
  x.fillStyle = '#3a2f26'; x.fillRect(0, 0, W, H); for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(${20 + Math.random() * 30},${14 + Math.random() * 20},10,.25)`; x.beginPath(); const X = Math.random() * W; x.moveTo(X, 0); x.bezierCurveTo(X + 8, H / 3, X - 8, 2 * H / 3, X + 4, H); x.stroke(); }
  y.fillStyle = '#808080'; y.fillRect(0, 0, W, H);
  const panel = (X, Y, w, h) => { x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 6; x.strokeRect(X, Y, w, h); x.strokeStyle = 'rgba(255,220,180,.12)'; x.lineWidth = 2; x.strokeRect(X + 5, Y + 5, w - 10, h - 10); y.fillStyle = '#5a5a5a'; y.fillRect(X, Y, w, h); y.fillStyle = '#707070'; y.fillRect(X + 10, Y + 10, w - 20, h - 20); };
  panel(70, 80, W - 140, 380); panel(70, 540, W - 140, 400); // المقبض صار مجسمًا (addEntranceDetails)
  const T = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
  const mat = new THREE.MeshStandardMaterial({ map: T(c, true), bumpMap: T(b, false), bumpScale: 2, roughness: .62, metalness: .0 }); mat.name = 'door-hq'; return { mat }; }
/** خرائط UV للباب: من صندوقه في مستوى الواجهة إلى [0,1] حتى تطابق الألواح أبعاد الباب الفعلية. */
function fitDoorUV(THREE, m) { const g = m.geometry; g.computeBoundingBox(); const bb = g.boundingBox, pos = g.attributes.position, uv = g.attributes.uv, dx = bb.max.x - bb.min.x, dz = bb.max.z - bb.min.z, dy = bb.max.y - bb.min.y, alongX = dx >= dz;
  for (let i = 0; i < pos.count; i++) { const a = alongX ? (pos.getX(i) - bb.min.x) / dx : (pos.getZ(i) - bb.min.z) / dz; uv.setXY(i, a, (pos.getY(i) - bb.min.y) / dy); } uv.needsUpdate = true; }
function cnvWH(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }

/** سقف الدور: بلاطة بسماكة 25 سم، منسوب علوي = ارتفاع الدروة الكلي − الدروة (من roof.parapet في المسقط)، داخل محيط الجدران الخارجي. */
function addRoof(THREE, scene, doc) {
  const rects = (doc.walls || []).map(w => { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * (w.t || .2) / 2, ny = dx / L * (w.t || .2) / 2; return [[[w.a.x + nx, w.a.y + ny], [w.b.x + nx, w.b.y + ny], [w.b.x - nx, w.b.y - ny], [w.a.x - nx, w.a.y - ny], [w.a.x + nx, w.a.y + ny]]]; });
  const U = clip.union(...rects); if (!U.length) return; const big = U.slice().sort((a, b) => area(b[0]) - area(a[0]))[0][0];
  const level = (doc.levels || [])[0] || { height: 3.2 }, top = (level.elevation || 0) + level.height + .45; // الدور 3.20 + قاعدة 0.45 = منسوب السقف الإنشائي (يتطابق مع الكورنيش 3.59–3.75)
  const shape = new THREE.Shape(big.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: .25, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, top, 0); // (x,y) → (X, Z=-y)؛ rotateX يقلب y إلى −Z
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: .95 })); m.name = 'roof-slab-hq'; m.castShadow = m.receiveShadow = true; scene.add(m);
}
const area = r => Math.abs(r.reduce((s, p, i) => { const n = r[(i + 1) % r.length]; return s + p[0] * n[1] - n[0] * p[1]; }, 0) / 2);
/** مقبض مجسم لكل باب (وردة + ذراع، فولاذ مصقول)، وعتبة مدخل رخامية، ودرجة مدخل أمام كل باب على أرض الموقع. */
function addEntranceDetails(THREE, scene, S, { steps = false } = {}) {
  const steel = new THREE.MeshStandardMaterial({ color: '#cfd2d4', metalness: 1, roughness: .28 }), marble = new THREE.MeshStandardMaterial({ color: '#e4ded2', roughness: .35 }), step = new THREE.MeshStandardMaterial({ color: '#d8d0c0', roughness: .7 });
  for (const d of S.meshes.filter(m => m.userData?.role === 'door' && m.userData.side === 's')) {
    const bb = new THREE.Box3().setFromObject(d), z = bb.max.z, hx = bb.max.x - .09, hy = bb.min.y + 1.0;
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .012, 24), steel); rose.rotation.x = Math.PI / 2; rose.position.set(hx, hy, z + .006);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .055, 16), steel); neck.rotation.x = Math.PI / 2; neck.position.set(hx, hy, z + .04);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(.13, .018, .018), steel); lever.position.set(hx - .055, hy, z + .066);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.03, .09, .006), steel); plate.position.set(hx, hy - .075, z + .003);
    for (const o of [rose, neck, lever, plate]) { o.castShadow = true; scene.add(o); }
    if (!steps) continue;
    const sill = new THREE.Mesh(new THREE.BoxGeometry(bb.max.x - bb.min.x + .06, .03, .24), marble); sill.position.set((bb.min.x + bb.max.x) / 2, bb.min.y - .015, z - .02); sill.receiveShadow = sill.castShadow = true; scene.add(sill);
    // درجتان من منسوب الموقع إلى عتبة الباب (ارتفاع الباب عن الأرض من النموذج)، أمام الواجهة بالكامل على أرض القطعة
    const rise = bb.min.y - .03, n = Math.max(1, Math.round(rise / .16)), h = rise / n;
    for (let i = 0; i < n; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(bb.max.x - bb.min.x + .5, h, .32 * (n - i)), step); st.position.set((bb.min.x + bb.max.x) / 2, h * (i + .5), z + .16 * (n - i) + .02); st.castShadow = st.receiveShadow = true; scene.add(st); }
  }
}
