// بناء المحيط من مخطط الموقع (site-plan.mjs): أرض القطعة بحدودها، سور وبوابات، عتبات المداخل، أحواض، رصيف وحافة وشارع، جوار، وقطع الحوش من المخطط.
// كل القطع الثابتة تُدمج في شبكة واحدة لكل خامة (نداءات رسم قليلة)، وإحداثيات UV بالأمتار (لا تمطيط).
import { rnd, canvas, canvasTex, boxGeo, mergeGeos, metricUV } from './util.mjs';
import { createPlants } from './plants.mjs';

function groundTextures(THREE, tier) {
  const S = tier.tex >= 1024 ? 512 : 256, out = {}, r = rnd(19);
  const speck = (x, n, cols, a0, a1, sz = 2) => { for (let k = 0; k < n; k++) { x.fillStyle = cols[k % cols.length].replace('A', (a0 + r() * (a1 - a0)).toFixed(2)); x.fillRect(r() * S, r() * S, 1 + r() * sz, 1 + r() * sz); } };
  const mk = (name, tile, draw) => { const [c, x] = canvas(S), [b, y] = canvas(S); y.fillStyle = '#808080'; y.fillRect(0, 0, S, S); draw(x, y); out[name] = { map: canvasTex(THREE, c, { tile, aniso: tier.aniso }), bump: canvasTex(THREE, b, { tile, srgb: false, aniso: tier.aniso }) }; };
  // بلاطات حجر كبيرة 120×60 سم بتراكب نصفي (البلاطة 2.4 م)
  mk('stone', 2.4, (x, y) => { x.fillStyle = '#a89b84'; x.fillRect(0, 0, S, S); y.fillStyle = '#303030'; y.fillRect(0, 0, S, S); const w = S / 2, h = S / 4, j = Math.max(1, S / 256);
    for (let row = 0; row < 4; row++) for (let i = -1; i < 2; i++) { const X = i * w + (row % 2) * w / 2, Y = row * h, v = 198 + r() * 22; x.fillStyle = `rgb(${v + 14 | 0},${v + 3 | 0},${v - 18 | 0})`; x.fillRect(X + j, Y + j, w - 2 * j, h - 2 * j); y.fillStyle = '#c0c0c0'; y.fillRect(X + j, Y + j, w - 2 * j, h - 2 * j); }
    speck(x, S * 12, ['rgba(120,100,70,A)', 'rgba(255,248,230,A)'], .02, .1, 3); });
  // بلاط رصيف خرساني 40×40 سم (البلاطة 2 م)
  mk('walk', 2, (x, y) => { x.fillStyle = '#8f887b'; x.fillRect(0, 0, S, S); y.fillStyle = '#303030'; y.fillRect(0, 0, S, S); const n = 5, w = S / n, j = Math.max(1, S / 300);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const v = 176 + r() * 20; x.fillStyle = `rgb(${v + 6 | 0},${v | 0},${v - 12 | 0})`; x.fillRect(a * w + j, b * w + j, w - 2 * j, w - 2 * j); y.fillStyle = '#b8b8b8'; y.fillRect(a * w + j, b * w + j, w - 2 * j, w - 2 * j); }
    speck(x, S * 14, ['rgba(70,66,60,A)', 'rgba(240,236,226,A)'], .03, .12); });
  mk('asphalt', 3, (x, y) => { x.fillStyle = '#8e8a84'; x.fillRect(0, 0, S, S); speck(x, S * 40, ['rgba(60,60,62,A)', 'rgba(180,176,168,A)', 'rgba(110,106,100,A)'], .08, .3); speck(y, S * 30, ['rgba(0,0,0,A)', 'rgba(255,255,255,A)'], .1, .4); });
  mk('gravel', 2, (x, y) => { x.fillStyle = '#c9b592'; x.fillRect(0, 0, S, S); speck(x, S * 50, ['rgba(120,100,72,A)', 'rgba(238,226,200,A)', 'rgba(170,150,118,A)'], .15, .5, 3); speck(y, S * 40, ['rgba(0,0,0,A)', 'rgba(255,255,255,A)'], .2, .6, 3); });
  mk('lawn', 2, (x, y) => { x.fillStyle = '#5f7340'; x.fillRect(0, 0, S, S); for (let k = 0; k < S * 30; k++) { x.strokeStyle = `hsla(${78 + r() * 30},${30 + r() * 25}%,${24 + r() * 26}%,.55)`; x.lineWidth = 1; const X = r() * S, Y = r() * S, a = r() * 6.28; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + Math.cos(a) * 5, Y + Math.sin(a) * 5); x.stroke(); } speck(y, S * 40, ['rgba(0,0,0,A)', 'rgba(255,255,255,A)'], .2, .6, 2); });
  mk('soil', 1.5, (x) => { x.fillStyle = '#4e3f31'; x.fillRect(0, 0, S, S); speck(x, S * 40, ['rgba(30,22,16,A)', 'rgba(120,98,74,A)'], .15, .5, 3); });
  mk('pool', 1.2, (x, y) => { x.fillStyle = '#2f9fb0'; x.fillRect(0, 0, S, S); const n = 8, w = S / n; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { x.fillStyle = `hsl(${186 + r() * 8},${52 + r() * 10}%,${42 + r() * 10}%)`; x.fillRect(a * w + 1, b * w + 1, w - 2, w - 2); } });
  return out;
}

/** خامة الجدار الأساسية للواجهة (أكبر مساحة أمامية) لتلبيس السور بها. */
function facadeWallMaterial(THREE, S) {
  let best = null, area = 0; for (const m of S.meshes) { const r = m.userData?.role; if (m.userData?.side !== 's' || !(r === 'wall' || r === 'cladding') || !m.visible) continue; const b = new THREE.Box3().setFromObject(m), a = (b.max.x - b.min.x) * (b.max.y - b.min.y); if (a > area) { area = a; best = m; } }
  if (!best) return new THREE.MeshStandardMaterial({ color: '#e6dccb', roughness: .9 });
  const c = best.material.clone(); c.vertexColors = false; c.name = (best.material.name || 'wall') + '-site'; return c;
}

/** معلومات الواجهة المبنية: الأبواب والنوافذ الأمامية (بإحداثيات المسقط) وصندوق المبنى. */
export function frontInfo(THREE, S) {
  const doors = [], windows = []; const bb = new THREE.Box3(); for (const m of S.meshes) if (m.name !== 'ground' && m.visible && m.userData?.role) bb.expandByObject(m);
  for (const m of S.meshes) { if (m.userData?.side !== 's' || !m.visible) continue; const r = m.userData.role; if (r !== 'door' && r !== 'glazing') continue; const b = new THREE.Box3().setFromObject(m);
    if (r === 'door') doors.push({ x0: b.min.x, x1: b.max.x, sill: b.min.y, top: b.max.y, entry: true, z: b.max.z }); else if (b.min.y < 3.4) windows.push({ x0: b.min.x, x1: b.max.x }); }
  // وجه الواجهة الأمامية: أبعد جدار جنوبًا
  let zf = -1e9, x0 = 1e9, x1 = -1e9, y0z = 1e9, y1z = -1e9; for (const m of S.meshes) { const r = m.userData?.role; if (!(r === 'wall' || r === 'cladding') || !m.visible) continue; const b = new THREE.Box3().setFromObject(m); zf = Math.max(zf, b.max.z); x0 = Math.min(x0, b.min.x); x1 = Math.max(x1, b.max.x); y0z = Math.min(y0z, b.min.z); y1z = Math.max(y1z, b.max.z); }
  return { doors, windows, B: { x0, x1, y0: -zf, y1: -y0z }, top: bb.max.y, bb };
}

export function buildSite(THREE, { scene, S, plan, state, tier, night = false }) {
  const { plot: P, B, wall, gates } = plan, T = wall.t, tex = groundTextures(THREE, tier), disposables = [];
  for (const t of Object.values(tex)) disposables.push(t.map, t.bump);
  const group = new THREE.Group(); group.name = 'site';
  const mats = {}, bins = {};
  const M = (key, o, kind) => { const m = new THREE.MeshStandardMaterial({ roughness: .92, envMapIntensity: .4, ...o }); m.name = 'site-' + key + (kind ? '-' + kind : ''); mats[key] = m; disposables.push(m); return m; };
  const texd = (key, t, o = {}) => M(key, { map: tex[t].map, bumpMap: tex[t].bump, bumpScale: 1.2, ...o });
  mats.wall = facadeWallMaterial(THREE, S); disposables.push(mats.wall);
  M('coping', { color: '#d8cdb9', roughness: .8 }, 'stone'); texd('stone', 'stone', { roughness: .78 }); mats.stone.name = 'site-paving-stone'; texd('walk', 'walk'); mats.walk.userData.pd = false; texd('asphalt', 'asphalt', { roughness: .96, bumpScale: .6 }); mats.asphalt.userData.pd = false;
  texd('gravel', 'gravel', { roughness: 1 }); mats.gravel.userData.pd = false; texd('lawn', 'lawn', { roughness: 1 }); mats.lawn.userData.pd = false; texd('soil', 'soil', { roughness: 1 }); mats.soil.userData.pd = false;
  M('curb', { color: '#b9b2a5', roughness: .9 }, 'concrete'); M('wood', { color: '#6a4a33', roughness: .62 }, 'timber'); M('metal', { color: '#262422', metalness: .7, roughness: .42, envMapIntensity: 1 });
  M('lamp', { color: '#fff3d6', emissive: '#ffd08a', emissiveIntensity: night ? 6 : 2.2 }); M('nb1', { color: '#e4d9c6' }, 'plaster'); M('nb2', { color: '#d3c2a6' }, 'plaster'); M('nb3', { color: '#efe8dc' }, 'plaster'); M('nbwin', { color: '#56646b', roughness: .2, metalness: .3, envMapIntensity: 1.2 });
  mats.water = new THREE.MeshPhysicalMaterial({ map: tex.pool.map, color: '#bfeef2', roughness: .06, metalness: 0, ior: 1.33, envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: .03 }); mats.water.name = 'site-water'; mats.water.userData.pd = false; disposables.push(mats.water);
  const add = (key, g) => { (bins[key] ||= []).push(g); };
  // صندوق بإحداثيات المسقط (x, y شمالًا) ← المشهد (X, Z = −y)
  const box = (key, x0, x1, y0, y1, h0, h1) => add(key, boxGeo(THREE, x0, x1, h0, h1, -y1, -y0));
  const flat = (key, x0, x1, y0, y1, h) => { const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, h, -(y0 + y1) / 2); add(key, metricUV(THREE, g)); };

  // ---- أرض القطعة: رصف حجري في الحوش الأمامي، حصى حول المبنى، عشب إن وُجد
  const Y0 = .012; for (const p of plan.paving) flat(p.kind === 'forecourt' ? 'stone' : p.kind, p.x0, p.x1, p.y0, p.y1, p.kind === 'lawn' ? Y0 + .02 : Y0);
  // ---- السور: أمامي منخفض بغطاء حجري، وجانبان وخلفي بارتفاع الخصوصية
  const cop = (x0, x1, y0, y1, h) => box('coping', x0 - .03, x1 + .03, y0 - .03, y1 + .03, h, h + wall.coping);
  for (const s of plan.frontSegs) { box('wall', s.x0, s.x1, P.y0, P.y0 + T, 0, wall.hFront); cop(s.x0, s.x1, P.y0, P.y0 + T, wall.hFront); }
  const hs = wall.hSide, step = Math.min(plan.frontDepth, 3); // الجانبان ينحدران إلى ارتفاع السور الأمامي عند الشارع
  for (const x of [P.x0, P.x1 - T]) { box('wall', x, x + T, P.y0 + step, P.y1, 0, hs); cop(x, x + T, P.y0 + step, P.y1, hs); box('wall', x, x + T, P.y0, P.y0 + step, 0, wall.hFront + .45); cop(x, x + T, P.y0, P.y0 + step, wall.hFront + .45); }
  box('wall', P.x0, P.x1, P.y1 - T, P.y1, 0, hs); cop(P.x0, P.x1, P.y1 - T, P.y1, hs);
  // ---- أكتاف البوابات وإطار بوابة المشاة ومصابيحها، والدرف الخشبية بشرائح رأسية حقيقية
  const slats = [];
  for (const p of plan.pillars) { box('wall', p.x - .225, p.x + .225, P.y0 - .08, P.y0 + .37, 0, p.h); cop(p.x - .225, p.x + .225, P.y0 - .08, P.y0 + .37, p.h);
    if (p.gate === 'ped') box('lamp', p.x - .05, p.x + .05, P.y0 - .115, P.y0 - .08, 1.55, 1.85); }
  const g = gates.ped, modern = /[MJS]/.test(plan.style);
  if (modern) { box('metal', g.x - g.w / 2 - .7, g.x + g.w / 2 + .7, P.y0 - .55, P.y0 + .6, g.h + .06, g.h + .16); box('wood', g.x - g.w / 2 - .62, g.x + g.w / 2 + .62, P.y0 - .47, P.y0 + .52, g.h + .02, g.h + .06); }
  else { box('wall', g.x - g.w / 2 - .5, g.x + g.w / 2 + .5, P.y0 - .12, P.y0 + .41, g.h + .06, g.h + .46); cop(g.x - g.w / 2 - .5, g.x + g.w / 2 + .5, P.y0 - .12, P.y0 + .41, g.h + .46); }
  const leaf = (gt, top, open) => { const n = Math.round(gt.w / .11), w = gt.w / n; for (let i = 0; i < n; i++) slats.push([gt.x - gt.w / 2 + (i + .5) * w, top, w * .8]); box('metal', gt.x - gt.w / 2, gt.x + gt.w / 2, P.y0 + .1, P.y0 + .14, .05, .11); box('metal', gt.x - gt.w / 2, gt.x + gt.w / 2, P.y0 + .1, P.y0 + .14, top - .06, top); void open; };
  leaf(g, g.h - .12); if (gates.car) leaf(gates.car, gates.car.h - .1);
  if (slats.length) { const sg = new THREE.BoxGeometry(1, 1, .035), im = new THREE.InstancedMesh(sg, mats.wood, slats.length), m4 = new THREE.Matrix4(); slats.forEach(([x, top, w], i) => im.setMatrixAt(i, m4.makeScale(w, top - .1, 1).setPosition(x, .05 + (top - .1) / 2, -(P.y0 + .17)))); im.castShadow = im.receiveShadow = true; im.name = 'site-gate-slats'; group.add(im); disposables.push(sg); }
  // ---- عتبات ودرج المداخل (الباب مرتفع عن أرض الحوش بمنسوب الدور)
  for (const l of plan.landings) { box('stone', l.x0, l.x1, l.y0, l.y1 + .05, 0, l.h - .005); const n = Math.max(1, Math.round(l.h / .16)) - 1, rise = l.h / (n + 1);
    for (let i = 0; i < n; i++) box('stone', l.x0 - .15 * (i + 1), l.x1 + .15 * (i + 1), l.y0 - .3 * (i + 1), l.y0 - .3 * i, 0, l.h - rise * (i + 1)); }
  // ---- أحواض الزراعة
  for (const b of plan.beds) { if (b.kind === 'planter') { const w = .07; box('coping', b.x0, b.x1, b.y0, b.y0 + w, 0, b.h); box('coping', b.x0, b.x0 + w, b.y0 + w, b.y1, 0, b.h); box('coping', b.x1 - w, b.x1, b.y0 + w, b.y1, 0, b.h); flat('soil', b.x0 + w, b.x1 - w, b.y0 + w, b.y1, b.h - .05); }
    else { box('curb', b.x0 - .06, b.x1 + .06, b.y0 - (b.where === 'street' ? .06 : 0), b.y0, 0, b.h + .03 + (b.where === 'street' ? .15 : 0)); flat('soil', b.x0, b.x1, b.y0, b.y1, b.h + (b.where === 'street' ? .15 : 0)); } }
  // ---- قطع الحوش من مخطط العميل
  const posts = (f, h, r = .06) => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) box('metal', f.x + sx * (f.w / 2 - .12) - r, f.x + sx * (f.w / 2 - .12) + r, f.y + sy * (f.d / 2 - .12) - r, f.y + sy * (f.d / 2 - .12) + r, 0, h); };
  for (const f of plan.fixtures) { const r = f.rect;
    if (f.kind === 'pool') { const c = .3; box('coping', r.x0 - c, r.x1 + c, r.y0 - c, r.y0, 0, .1); box('coping', r.x0 - c, r.x1 + c, r.y1, r.y1 + c, 0, .1); box('coping', r.x0 - c, r.x0, r.y0, r.y1, 0, .1); box('coping', r.x1, r.x1 + c, r.y0, r.y1, 0, .1); flat('water', r.x0, r.x1, r.y0, r.y1, .045); }
    else if (f.kind === 'lawn') flat('lawn', r.x0, r.x1, r.y0, r.y1, Y0 + .02);
    else if (f.kind === 'planter') { box('coping', r.x0, r.x1, r.y0, r.y1, 0, f.h || .5); flat('soil', r.x0 + .06, r.x1 - .06, r.y0 + .06, r.y1 - .06, (f.h || .5) + .004); }
    else if (f.kind === 'carport') { const h = f.h || 2.6; posts(f, h); box('metal', r.x0 - .15, r.x1 + .15, r.y0 - .15, r.y1 + .15, h, h + .12); box('wood', r.x0 - .1, r.x1 + .1, r.y0 - .1, r.y1 + .1, h - .04, h); flat('stone', r.x0, r.x1, r.y0, r.y1, Y0 + .012); }
    else if (f.kind === 'pergola') { const h = f.h || 2.7; posts(f, h, .07); for (const yy of [r.y0 + .05, r.y1 - .17]) box('wood', r.x0 - .2, r.x1 + .2, yy, yy + .12, h, h + .18); for (let x = r.x0; x <= r.x1; x += .3) box('wood', x - .025, x + .025, r.y0 - .15, r.y1 + .15, h + .18, h + .3); flat('stone', r.x0, r.x1, r.y0, r.y1, Y0 + .012); }
    else if (f.kind === 'fountain') { const gg = new THREE.CylinderGeometry(f.w / 2, f.w / 2 * .92, .45, 24); gg.translate(f.x, .225, -f.y); add('coping', metricUV(THREE, gg)); const wg = new THREE.CircleGeometry(f.w / 2 - .1, 24); wg.rotateX(-Math.PI / 2); wg.translate(f.x, .46, -f.y); add('water', metricUV(THREE, wg)); const cg = new THREE.CylinderGeometry(.09, .16, .9, 12); cg.translate(f.x, .45, -f.y); add('coping', metricUV(THREE, cg)); }
    else if (f.kind === 'waterfall') { box('stone', r.x0, r.x1, r.y1 - .35, r.y1, 0, f.h || 2.2); box('water', r.x0 + .25, r.x1 - .25, r.y1 - .39, r.y1 - .35, .3, (f.h || 2.2) - .15); box('coping', r.x0, r.x1, r.y0, r.y1 - .35, 0, .3); flat('water', r.x0 + .1, r.x1 - .1, r.y0 + .1, r.y1 - .4, .305); }
    else if (f.kind === 'bbq') { box('stone', r.x0, r.x1, r.y0, r.y1, 0, .9); box('metal', r.x0 + .1, r.x1 - .1, r.y0 + .08, r.y1 - .08, .9, .96); } }
  // ---- الشوارع: رصيف وحافة وأسفلت ورصيف مقابل وسور مقابل؛ والجهات الأخرى سور جار وكتل جوار مبسّطة
  const cxp = (P.x0 + P.x1) / 2, cyp = (P.y0 + P.y1) / 2, W = P.x1 - P.x0, D = P.y1 - P.y0, has = s => plan.streets.includes(s);
  const kit = (side, k) => { // إطار محلي: x على طول الشارع، z للخارج من حد القطعة
    const len = side === 's' || side === 'n' ? W : D, a0 = -len / 2, a1 = len / 2, left = { s: 'w', n: 'e', e: 's', w: 'n' }[side], right = { s: 'e', n: 'w', e: 'n', w: 's' }[side];
    const e0 = a0 - (has(left) ? 2.6 : 42), e1 = a1 + (has(right) ? 2.6 : 42), o0 = a0 - (has(left) ? 13.8 : 42), o1 = a1 + (has(right) ? 13.8 : 42), yo = k * .002;
    const mx = new THREE.Matrix4().makeRotationY({ s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[side]).setPosition(side === 'e' ? P.x1 : side === 'w' ? P.x0 : cxp, 0, side === 's' ? -P.y0 : side === 'n' ? -P.y1 : -cyp);
    const lb = (key, x0, x1, z0, z1, h0, h1) => { const gg = new THREE.BoxGeometry(x1 - x0, h1 - h0, z1 - z0); gg.translate((x0 + x1) / 2, (h0 + h1) / 2, (z0 + z1) / 2); gg.applyMatrix4(mx); add(key, metricUV(THREE, gg)); };
    lb('walk', e0, e1, 0, 2.4, -.1, .15 + yo); lb('curb', e0, e1, 2.4, 2.6, -.1, .17 + yo); lb('asphalt', a0 - 42, a1 + 42, 2.6, 11.6, -.1, .004 + yo);
    lb('curb', o0, o1, 11.6, 11.8, -.1, .17 + yo); lb('walk', o0, o1, 11.8, 13.8, -.1, .15 + yo); lb('nb2', o0, o1, 13.8, 14, 0, 2.5); lb('coping', o0, o1, 13.77, 14.03, 2.5, 2.56);
    if (side !== 's') { lb('wall', a0, a1, -T, 0, 0, hs); } // سور القطعة على شارع غير أمامي: مرتفع بلا بوابات
    for (const sgn of [-1, 1]) if (!has(sgn < 0 ? left : right)) { const b0 = sgn < 0 ? e0 : a1, b1 = sgn < 0 ? a0 : e1; lb('nb1', b0, b1, -T, 0, 0, 2.5); lb('coping', b0, b1, -T - .03, .03, 2.5, 2.56); } // أسوار الجيران على امتداد الشارع
    return mx; };
  plan.streets.forEach((s, i) => kit(s, i));
  // كتل الجوار: صناديق لياسة بدروة ونوافذ داكنة (لا تفاصيل: خلفية تملأ الأفق ويليّنها الضباب)
  const R = rnd(plan.seed ^ 0x51ed), nbWins = [];
  const neighbor = (x, y, w, d, h) => { const key = ['nb1', 'nb2', 'nb3'][R() * 3 | 0]; box(key, x - w / 2, x + w / 2, y - d / 2, y + d / 2, 0, h); box(key, x - w / 2 - .06, x + w / 2 + .06, y - d / 2 - .06, y + d / 2 + .06, h, h + .12);
    const fl = Math.max(1, Math.round(h / 3.6)); for (let f = 0; f < fl; f++) for (const [sx, sy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) { const n = 2 + (R() * 2 | 0), L = sx ? d : w; for (let i = 0; i < n; i++) { if (R() < .25) continue; const t = (i + .5) / n * L - L / 2, ww = 1 + R() * .8, y0 = f * 3.6 + 1.1, y1 = f * 3.6 + 2.6;
      if (sx) nbWins.push([x + sx * (w / 2 + .01), y + t, .04, ww, y0, y1]); else nbWins.push([x + t, y + sy * (d / 2 + .01), ww, .04, y0, y1]); } } };
  const bw = B.x1 - B.x0, bd = B.y1 - B.y0;
  if (!has('w')) for (let i = 0; i < 2; i++) neighbor(P.x0 - 1.8 - (i + .5) * (W + 1) + .5, B.y0 + bd / 2 + (R() - .5) * 2, W - 5, bd + R() * 2, R() < .6 ? 8.4 : 4.9);
  if (!has('e')) for (let i = 0; i < 2; i++) neighbor(P.x1 + 1.8 + (i + .5) * (W + 1) - .5, B.y0 + bd / 2 + (R() - .5) * 2, W - 5, bd + R() * 2, R() < .6 ? 8.4 : 4.9);
  if (!has('n')) for (let i = -1; i <= 1; i++) neighbor(cxp + i * (W + 1), P.y1 + 3 + bd / 2, W - 5, bd, R() < .6 ? 8.4 : 4.9);
  for (let i = -2; i <= 2; i++) neighbor(cxp + i * (W + 1) + (R() - .5) * 2, P.y0 - 14 - 3.5 - bd / 2, W - 5, bd, R() < .65 ? 8.4 : 4.9);
  for (const [x, y, w, d, y0, y1] of nbWins) box('nbwin', x - w / 2, x + w / 2, y - d / 2, y + d / 2, y0, y1);
  void bw;
  // ---- أرض بعيدة (رمل/حصى) تحت كل شيء
  { const gg = new THREE.PlaneGeometry(520, 520); gg.rotateX(-Math.PI / 2); gg.translate(cxp, -.03, -cyp); add('gravel', metricUV(THREE, gg)); }
  // ---- الدمج: شبكة واحدة لكل خامة
  for (const [key, geos] of Object.entries(bins)) { const mesh = new THREE.Mesh(mergeGeos(THREE, geos), mats[key]); mesh.name = 'site-' + key; mesh.castShadow = !/asphalt|gravel|lawn|soil|walk|water|lamp/.test(key); mesh.receiveShadow = key !== 'lamp'; group.add(mesh); disposables.push(mesh.geometry); }
  // ---- النباتات
  const pl = createPlants(THREE, { tier, seed: plan.seed });
  for (const p of plan.plants) { const o = { x: p.x, z: -p.y, y: (p.base || 0) + (p.outside && p.kind !== 'olive' ? 0 : 0) };
    if (p.kind === 'palm') pl.palm({ ...o, h: p.h }); else if (p.kind === 'olive') pl.olive({ ...o, h: p.h, r: p.r }); else if (p.kind === 'cypress') pl.cypress({ ...o, h: p.h }); else if (p.kind === 'grass') pl.grass({ ...o, s: p.r }); else if (p.kind === 'rock') pl.rock({ ...o, s: p.r }); else pl.shrub({ ...o, r: p.r, kind: p.kind === 'sage' ? 'olive' : 'shrub' }); }
  for (const f of plan.fixtures) { if (f.kind === 'planter') { const n = Math.max(2, Math.round(Math.max(f.w, f.d) / .55)); for (let i = 0; i < n; i++) { const t = (i + .5) / n - .5; pl.shrub({ x: f.x + (f.w > f.d ? t * f.w : 0), z: -(f.y + (f.w > f.d ? 0 : t * f.d)), y: f.h || .5, r: .32 + R() * .15, kind: R() < .5 ? 'olive' : 'shrub' }); } } else if (f.kind === 'tree') pl.olive({ x: f.x, z: -f.y, h: f.h || 3.5, r: Math.max(1, f.w * .7) }); }
  const plants = pl.build(); group.add(plants.group);
  scene.add(group);
  const bounds = new THREE.Box3(new THREE.Vector3(P.x0 - 6, -.5, -P.y1 - 4), new THREE.Vector3(P.x1 + 6, Math.max(9, state?.bounds?.max.y || 9) + 1.5, -P.y0 + 8)); // ما يُظلَّل بدقة: القطعة والرصيف ونصف الشارع
  return { group, plants: plants.counts, bounds, dispose() { scene.remove(group); plants.dispose(); for (const d of disposables) d.dispose?.(); } };
}
