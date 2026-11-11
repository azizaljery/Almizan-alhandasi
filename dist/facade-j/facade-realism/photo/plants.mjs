// نباتات إجرائية بلا نماذج ولا صور: نخيل (جذع وسعف)، زيتون، سرو، شجيرات وحشائش وصخور.
// كل النباتات في بضع InstancedMesh (نداء رسم واحد لكل نوع هندسة)، بأطلس أوراق مرسوم إجرائيًا (alpha test) وظلال مطابقة لشكل الورق.
import { rnd, lerp, canvas, texFromData, canvasTex } from './util.mjs';

const TILES = { frond: [0, .5], olive: [.5, .5], shrub: [0, 0], grass: [.5, 0] };

/** أطلس 2×2: سعفة نخل، غصن زيتون، غصن شجيرة، خصلة حشائش. الخلفية الشفافة تُلوَّن بلون الورق حتى لا تظهر هالة داكنة في المستويات الصغرى. */
function leafAtlas(THREE, S) {
  const T = S / 2, [c, x] = canvas(S), r = rnd(4242);
  const col = (h, s, l) => `hsl(${h | 0},${s | 0}%,${l | 0}%)`;
  // سعفة: محور أفقي من اليسار (القاعدة) إلى اليمين (الطرف)، وريقات مائلة للأمام على الجانبين
  x.save(); x.translate(0, 0); const cy = T / 2;
  x.strokeStyle = '#7d7a45'; x.lineWidth = T * .016; x.beginPath(); x.moveTo(T * .03, cy); x.lineTo(T * .97, cy); x.stroke();
  for (let i = 0; i < 90; i++) for (const sd of [-1, 1]) { const t = i / 89, px = T * (.06 + .9 * t), len = T * .43 * Math.pow(Math.sin(Math.PI * Math.min(1, t * .9 + .1)), .6) * (1 - .35 * t) * (.9 + r() * .2), ang = lerp(1.25, .5, t) + (r() - .5) * .14;
    const ex = px + Math.cos(ang) * len, ey = cy + sd * Math.sin(ang) * len; x.strokeStyle = col(66 + r() * 22, 26 + r() * 16, 36 + r() * 18); x.lineWidth = T * (.008 + r() * .006) * (1 - .5 * t); x.lineCap = 'round';
    x.beginPath(); x.moveTo(px, cy); x.quadraticCurveTo(px + Math.cos(ang) * len * .5, cy + sd * Math.sin(ang) * len * .62, ex, ey); x.stroke(); }
  x.restore();
  const spray = (ox, oy, opt) => { x.save(); x.translate(ox, oy);
    for (let b = 0; b < opt.twigs; b++) { const a0 = -Math.PI / 2 + (b / (opt.twigs - 1) - .5) * opt.fan + (r() - .5) * .2, L = T * (opt.len[0] + r() * (opt.len[1] - opt.len[0])); let px = T / 2, py = T * .97, a = a0;
      x.strokeStyle = opt.twig; x.lineWidth = T * .008; const n = opt.leaves;
      for (let k = 0; k < n; k++) { const nx = px + Math.cos(a) * L / n, ny = py + Math.sin(a) * L / n; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke(); px = nx; py = ny; a += (r() - .5) * opt.wander;
        for (const sd of [-1, 1]) { if (r() < opt.skip) continue; const la = a + sd * (opt.spread + (r() - .5) * .5), ll = T * (opt.leaf[0] + r() * (opt.leaf[1] - opt.leaf[0])), lw = ll * opt.aspect;
          x.save(); x.translate(px, py); x.rotate(la); x.fillStyle = col(opt.h[0] + r() * (opt.h[1] - opt.h[0]), opt.s[0] + r() * (opt.s[1] - opt.s[0]), opt.l[0] + r() * (opt.l[1] - opt.l[0]));
          x.beginPath(); x.ellipse(ll / 2, 0, ll / 2, lw / 2, 0, 0, 6.3); x.fill(); x.restore(); } } }
    x.restore(); };
  spray(T, 0, { twigs: 9, fan: 2.5, len: [.55, .92], leaves: 13, wander: .35, skip: .12, spread: .85, leaf: [.07, .12], aspect: .27, twig: '#6b6248', h: [70, 95], s: [12, 26], l: [34, 58] }); // زيتون: ورق رمحي فضي
  spray(0, T, { twigs: 8, fan: 2.7, len: [.5, .9], leaves: 10, wander: .5, skip: .08, spread: 1.0, leaf: [.06, .1], aspect: .5, twig: '#4f4a34', h: [80, 104], s: [20, 34], l: [30, 48] });  // شجيرة: ورق عريض أخضر
  x.save(); x.translate(T, T); for (let i = 0; i < 70; i++) { const a = -Math.PI / 2 + (r() - .5) * 1.5, L = T * (.45 + r() * .5), bx = T / 2 + (r() - .5) * T * .16, bend = (r() - .5) * T * .35; // حشائش: نصال رفيعة مقوّسة
    x.strokeStyle = col(58 + r() * 40, 20 + r() * 26, 34 + r() * 26); x.lineWidth = T * (.007 + r() * .008); x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, T * .98); x.quadraticCurveTo(bx + Math.cos(a) * L * .5, T * .98 + Math.sin(a) * L * .6, bx + Math.cos(a) * L + bend, T * .98 + Math.sin(a) * L); x.stroke(); } x.restore();
  const img = x.getImageData(0, 0, S, S), d = img.data, out = new Uint8Array(S * S * 4), base = [[112, 118, 70], [128, 134, 100], [70, 96, 52], [126, 130, 84]];
  for (let y = 0; y < S; y++) for (let X = 0; X < S; X++) { const i = (y * S + X) * 4, o = ((S - 1 - y) * S + X) * 4, a = d[i + 3], b = base[(y >= T ? 2 : 0) + (X >= T ? 1 : 0)];
    if (a < 8) { out[o] = b[0]; out[o + 1] = b[1]; out[o + 2] = b[2]; out[o + 3] = 0; } else { out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = a; } }
  const t = texFromData(THREE, out, S, S, { srgb: true, aniso: 4, repeat: false }); return t;
}

function leafMaterial(THREE, atlas, { spherical }) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: .4, side: THREE.DoubleSide, roughness: .78, metalness: 0, envMapIntensity: .35 }); m.name = spherical ? 'foliage-cards' : 'foliage-fronds'; m.userData.pd = false;
  const patchV = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aTile; attribute vec3 aCtr;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vMapUv * 0.5 + aTile;\n#endif'); };
  m.onBeforeCompile = sh => { patchV(sh);
    if (spherical) { sh.vertexShader = sh.vertexShader.replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n#ifdef USE_INSTANCING\n transformedNormal = normalize( normalMatrix * normalize( ( instanceMatrix * vec4( position, 1.0 ) ).xyz - aCtr ) );\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize( vNormal );'); } };
  m.customProgramCacheKey = () => 'photo-leaf-' + (spherical ? 's' : 'f');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: .4, side: THREE.DoubleSide }); depth.onBeforeCompile = patchV; depth.customProgramCacheKey = () => 'photo-leaf-depth';
  return { m, depth };
}

/** سعفة: شريط مقوّس مطويّ على هيئة V، قاعدته عند الأصل ويمتد على +X بطول 1. */
function frondGeometry(THREE) {
  const N = 9, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) { const t = i / N, X = t * (1 - .2 * t * t), Y = .46 * t - .98 * t * t, w = .2 * (1 - .25 * t);
    for (const [s, dy] of [[-1, -.05], [0, 0], [1, -.05]]) { pos.push(X, Y + dy * (1 - t * .5), s * w); uv.push(.02 + .96 * t, .5 + s * .49); } }
  for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function trunkTexture(THREE) { // ندوب قواعد السعف: معينات متراكبة
  const W = 256, H = 256, [c, x] = canvas(W, H), [b, y] = canvas(W, H), r = rnd(77); x.fillStyle = '#7a6650'; x.fillRect(0, 0, W, H); y.fillStyle = '#555'; y.fillRect(0, 0, W, H);
  for (let row = 0; row < 9; row++) for (let k = -1; k < 7; k++) { const cx = (k + (row % 2) * .5) * W / 6, cy = row * H / 8, w = W / 6, h = H / 6.4, v = .8 + r() * .35;
    for (const [ctx, f] of [[x, `rgb(${128 * v | 0},${106 * v | 0},${82 * v | 0})`], [y, '#d0d0d0']]) { ctx.fillStyle = f; ctx.beginPath(); ctx.moveTo(cx, cy - h * .55); ctx.quadraticCurveTo(cx + w * .55, cy, cx, cy + h * .5); ctx.quadraticCurveTo(cx - w * .55, cy, cx, cy - h * .55); ctx.fill(); }
    x.strokeStyle = 'rgba(40,30,22,.55)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - w * .3, cy + h * .1); x.quadraticCurveTo(cx, cy + h * .55, cx + w * .3, cy + h * .1); x.stroke(); }
  const map = canvasTex(THREE, c), bump = canvasTex(THREE, b, { srgb: false }); map.repeat.set(2, 9); bump.repeat.set(2, 9); return { map, bump };
}

export function createPlants(THREE, { tier, seed = 1 }) {
  const R = rnd(seed * 31 + 7), k = tier.plants, cards = [], fronds = [], trunks = [], limbs = [], rocks = [], boots = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), Sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const tint = (h, s, l) => new THREE.Color().setHSL(h, s, l);
  const card = (x, y, z, size, tile, ctr, color, upright = false) => { if (upright) E.set(0, R() * 6.28, (R() - .5) * .3); else E.set(R() * 6.28, R() * 6.28, R() * 6.28); Q.setFromEuler(E); cards.push({ m: new THREE.Matrix4().compose(V.set(x, y, z), Q, Sc.set(size, size, size)), tile: TILES[tile], ctr, color }); };
  const limb = (p0, p1, r0) => { const d = new THREE.Vector3().subVectors(p1, p0), L = d.length(); Q.setFromUnitVectors(UP, d.normalize()); limbs.push(new THREE.Matrix4().compose(p0, Q, Sc.set(r0, L, r0))); };
  const api = {
    palm({ x, z, h = 6, lean = .04, y = 0 }) {
      const a = R() * 6.28, lx = Math.cos(a) * lean * h, lz = Math.sin(a) * lean * h, r0 = .2 + R() * .05;
      Q.setFromUnitVectors(UP, V.set(lx, h, lz).normalize()); trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q, Sc.set(r0, Math.hypot(h, lx, lz), r0)));
      const top = new THREE.Vector3(x + lx, y + h, z + lz); boots.push(new THREE.Matrix4().compose(top.clone().setY(top.y - .1), Q, Sc.set(r0 * 1.9, .55, r0 * 1.9)));
      const n = Math.max(14, Math.round(38 * Math.min(1, k + .25))), L = 2.9 + R() * .9;
      for (let i = 0; i < n; i++) { const t = (i + .5) / n, az = i * 2.39996 + R() * .3, phi = lerp(1.2, -.62, Math.pow(t, .8)) + (R() - .5) * .2;
        E.set((R() - .5) * .5, az, phi, 'YZX'); Q.setFromEuler(E); const s = L * (.8 + .3 * Math.sin(t * Math.PI));
        fronds.push({ m: new THREE.Matrix4().compose(top, Q, Sc.set(s, s, s * (1 + R() * .25))), color: tint(.19 + R() * .04, .22 + R() * .1, t > .85 ? .5 : .62 + R() * .12) }); }
      return api; },
    olive({ x, z, h = 3.6, r = 1.6, y = 0 }) {
      const base = new THREE.Vector3(x, y, z), fork = new THREE.Vector3(x + (R() - .5) * .35, y + h * .34, z + (R() - .5) * .35), ctr = new THREE.Vector3(x, y + h * .5, z); limb(base, fork, .13 + R() * .04);
      const nb = 3 + (R() * 2 | 0), per = Math.max(8, Math.round(30 * k));
      for (let b = 0; b <= nb; b++) { const a = b / nb * 6.28 + R(), rr = b === nb ? 0 : r * (.45 + R() * .25), end = new THREE.Vector3(x + Math.cos(a) * rr, y + h * (b === nb ? .88 : .62 + R() * .16), z + Math.sin(a) * rr), mid = fork.clone().lerp(end, .5).add(V.set((R() - .5) * .3, .12, (R() - .5) * .3).clone());
        limb(fork, mid, .075); limb(mid, end, .05); const rc = r * (.5 + R() * .18);
        for (let i = 0; i < per; i++) { const u = R() * 2 - 1, th = R() * 6.28, q = Math.sqrt(1 - u * u), d = rc * Math.pow(R(), .35); card(end.x + q * Math.cos(th) * d, end.y + u * d * .78, end.z + q * Math.sin(th) * d, .62 + R() * .5, 'olive', ctr, tint(.19 + R() * .05, .16 + R() * .1, .5 + R() * .16)); } }
      return api; },
    cypress({ x, z, h = 3.8, y = 0 }) { limb(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h * .3, z), .07); const n = Math.max(14, Math.round(60 * k));
      for (let i = 0; i < n; i++) { const t = R(), yy = y + .25 + t * (h - .25), rr = (.42 * Math.sin(Math.PI * Math.pow(t, .7)) + .08) * (.5 + R() * .5), th = R() * 6.28; card(x + Math.cos(th) * rr, yy, z + Math.sin(th) * rr, .5 + R() * .3, 'shrub', new THREE.Vector3(x, yy - .4, z), tint(.27 + R() * .04, .32, .3 + R() * .08)); } return api; },
    shrub({ x, z, r = .45, y = 0, kind = 'shrub' }) { const ctr = new THREE.Vector3(x, y - .15, z), n = Math.max(5, Math.round(12 * (k * .6 + .4)));
      for (let i = 0; i < n; i++) { const u = R(), th = R() * 6.28, q = Math.sqrt(1 - u * u) * r * (.4 + R() * .6); card(x + Math.cos(th) * q, y + .12 + u * r * .95, z + Math.sin(th) * q, r * (1.1 + R() * .5), kind, ctr, kind === 'olive' ? tint(.2, .14 + R() * .08, .56 + R() * .12) : tint(.23 + R() * .06, .22 + R() * .1, .5 + R() * .14)); } return api; },
    grass({ x, z, s = .7, y = 0 }) { const ctr = new THREE.Vector3(x, y - 3, z), c = R() < .35 ? tint(.13, .32, .6 + R() * .1) : tint(.21 + R() * .05, .26, .5 + R() * .12); for (let i = 0; i < 3; i++) card(x + (R() - .5) * .12, y + s * .47, z + (R() - .5) * .12, s, 'grass', ctr, c, true); return api; },
    rock({ x, z, s = .4, y = 0 }) { E.set(R(), R() * 6.28, R()); Q.setFromEuler(E); rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + s * .22, z), Q, Sc.set(s * (1 + R() * .5), s * (.55 + R() * .2), s * (.8 + R() * .4)))); return api; },
    build() {
      const group = new THREE.Group(); group.name = 'site-plants'; const disposables = [];
      const atlas = leafAtlas(THREE, tier.tex >= 1024 ? 1024 : 512); disposables.push(atlas);
      const inst = (geo, mat, list, get, depth) => { if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((it, i) => { im.setMatrixAt(i, get ? it.m : it); if (get && it.color) im.setColorAt(i, it.color); }); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; if (depth) im.customDepthMaterial = depth; group.add(im); disposables.push(geo, mat); if (depth) disposables.push(depth); return im; };
      const lc = leafMaterial(THREE, atlas, { spherical: true }), lf = leafMaterial(THREE, atlas, { spherical: false });
      const cg = new THREE.PlaneGeometry(1, 1); cg.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(cards.flatMap(c => c.tile)), 2)); cg.setAttribute('aCtr', new THREE.InstancedBufferAttribute(new Float32Array(cards.flatMap(c => [c.ctr.x, c.ctr.y, c.ctr.z])), 3));
      const cm = inst(cg, lc.m, cards, true, lc.depth); if (cm) cm.name = 'plant-cards';
      const fg = frondGeometry(THREE); fg.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(fronds.flatMap(() => TILES.frond)), 2)); fg.setAttribute('aCtr', new THREE.InstancedBufferAttribute(new Float32Array(fronds.length * 3), 3));
      const fm = inst(fg, lf.m, fronds, true, lf.depth); if (fm) fm.name = 'palm-fronds';
      const tt = trunkTexture(THREE); disposables.push(tt.map, tt.bump);
      const tm = new THREE.MeshStandardMaterial({ map: tt.map, bumpMap: tt.bump, bumpScale: 3, roughness: .95, envMapIntensity: .3 }); tm.name = 'palm-trunk'; tm.userData.pd = false;
      const tg = new THREE.CylinderGeometry(.78, 1.08, 1, 10, 1, true); tg.translate(0, .5, 0); inst(tg, tm, trunks);
      const bm = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 1, envMapIntensity: .3 }); bm.name = 'palm-boot'; inst(new THREE.SphereGeometry(1, 8, 6), bm, boots);
      const lm = new THREE.MeshStandardMaterial({ color: '#5b5145', roughness: 1, envMapIntensity: .3 }); lm.name = 'tree-limb'; const lg = new THREE.CylinderGeometry(.72, 1, 1, 6, 1, true); lg.translate(0, .5, 0); inst(lg, lm, limbs);
      const rg = new THREE.IcosahedronGeometry(1, 1), rp = rg.attributes.position, rr = rnd(9); for (let i = 0; i < rp.count; i++) { const f = .8 + ((Math.sin(rp.getX(i) * 12.9 + rp.getY(i) * 78.2 + rp.getZ(i) * 37.7) * 43758.5) % 1 + 1) % 1 * .32; rp.setXYZ(i, rp.getX(i) * f, rp.getY(i) * f, rp.getZ(i) * f); } rg.computeVertexNormals(); void rr;
      const rm = new THREE.MeshStandardMaterial({ color: '#b3a48c', roughness: .95, flatShading: false, envMapIntensity: .3 }); rm.name = 'site-rock-stone'; inst(rg, rm, rocks);
      return { group, dispose() { for (const d of disposables) d.dispose?.(); }, counts: { cards: cards.length, fronds: fronds.length, palms: trunks.length, limbs: limbs.length, rocks: rocks.length } };
    },
  };
  return api;
}
