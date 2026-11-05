// نمط J (عينة C1 معزولة): لغة معاصرة مستلهمة من أعمال المالك المرفقة (J18-1128 وJ18-1137 وJ19-1142).
// المستلهم: ألواح رخام فاتحة كبيرة 120×60، صناديق إطار سوداء رفيعة حول الفتحات (بروز 20 سم بإذن المالك)، شرائح خشب رأسية،
// شريط حجر رمادي بمنسوب السقف، إطار مدخل أسود، إنارة خطية. لا تُحرّك فتحة ولا جدار: الإضافات أمام وجه الجدار فقط.
// v2 (2026-11-05): رخام إجرائي بضجيج سحابي وعروق متفرعة مموهة + خشونة ونتوء؛ شرائح خشب 4×6 سم بفراغ 3 سم وخلفية داكنة؛
// المعالجة على كل الجهات (s/e/w/n) بإطار محلي لكل جهة؛ قواطع فولاذية سوداء داخل الفتحات الكبيرة؛ زجاج جانبي داخل عرض فتحة الباب فقط؛
// إظلام تماس (AO مخبوز) عند التقاء الجدار بالأرض وبالشريط وبصناديق الإطار فقط. كل الخامات إجرائية (Canvas) بلا أصول خارجية.
// الأدوار: يدعم طوابق متعددة إن عُرّف globalThis.__FLOORS = { levels: [...] } (رقم = منسوب أسفل الشريط، أو {top} أو {elevation,height})، وإلا دور واحد 3.55.
const CLASSIC = new Set(['projection', 'surround', 'cornice', 'sill', 'pediment']);
const SIDES = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }; // المتجه الخارجي (x, z)
function bandLevels() { const L = globalThis.__FLOORS?.levels; if (!Array.isArray(L) || !L.length) return [3.55];
  return L.map(l => typeof l === 'number' ? l : l.top ?? ((l.elevation ?? 0) + (l.height ?? 3.2) + .35)).filter(Number.isFinite).sort((a, b) => a - b); }
import { resolveTemplate } from './templates.mjs';
import { templates as TEMPLATES, resolveJ } from './styles/j-templates.mjs';
export const templates = TEMPLATES;
export const meta = Object.freeze({ id: 'J', ar: 'معاصر', templateCount: TEMPLATES.length });
// القيم الافتراضية = السلوك القديم تمامًا (بلا tpl). accent=1: عمود شرائح الخشب بجانب المدخل الأخير.
const DEF = { wallMat: 0, frame: 0, mull: 0, band: 0, cap: 0, crownZone: 0, portal: 0, pier: 0, accent: 1, plinth: 0, light: 1 };
export async function applyStyleJ(THREE, { scene, renderer, S, q }) {
  const TP = resolveJ(q), tpl = !!TP, p = { ...DEF, ...(TP?.p || {}) };
  if (tpl) for (const k of Object.keys(p)) if (q.has('j_' + k)) p[k] = Number(q.get('j_' + k)); // تجاوز مفتاح بعينه للفحص (j_cap=0 ...)
  const PROJ = Number(q.get('proj') ?? .20), PROF = .07, night = q.get('night') === '1', BH = .30;
  for (const m of S.meshes) if (CLASSIC.has(m.userData?.role)) m.visible = false;
  const set = wallSet(THREE, renderer, tpl ? p.wallMat : 0), marble = set.wall, grey = set.accent, wood = woodMat(THREE, renderer);
  let woodHm = null; const woodH = () => woodHm || (woodHm = (() => { const t = wood.map.clone(); t.rotation = Math.PI / 2; t.center.set(.5, .5); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: .6, roughness: .62 }); })());
  const black = new THREE.MeshStandardMaterial({ color: '#141617', metalness: .6, roughness: .34 }); black.name = 'steel-blackJ';
  const led = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe2b0', emissiveIntensity: night ? 6 : 2.4 });
  const jointJ = new THREE.MeshStandardMaterial({ color: set.joint, roughness: .85 });
  const backing = new THREE.MeshStandardMaterial({ color: '#070606', roughness: 1, envMapIntensity: .2 });
  const glassJ = S.meshes.find(m => m.material?.name === 'glass')?.material, interiorJ = S.meshes.find(m => m.material?.name === 'interior')?.material;
  for (const m of S.meshes) if (m.userData?.part === 'plate') m.material = jointJ;
  for (const m of S.meshes) if (m.userData?.part === 'blocks') m.material = marble;
  if (tpl) for (const m of S.meshes) if (m.userData?.role === 'wall' && m.userData?.part !== 'blocks' && m.userData?.part !== 'plate') m.material = marble;
  const AO = aoTexture(THREE), aoMat = a => new THREE.MeshBasicMaterial({ color: '#000', alphaMap: AO, transparent: true, opacity: a * (night ? .5 : 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const box = m => new THREE.Box3().setFromObject(m), levels = bandLevels(), up = new THREE.Vector3(0, 1, 0);
  let south = null;
  for (const [side, [nx, nz]] of Object.entries(SIDES)) {
    const sm = S.meshes.filter(m => m.userData?.side === side && m.visible); if (!sm.length) continue;
    const n = new THREE.Vector3(nx, 0, nz), t = new THREE.Vector3().crossVectors(up, n);
    const loc = b => { const us = [b.min.x * t.x + b.min.z * t.z, b.max.x * t.x + b.max.z * t.z], ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z];
      return { u0: Math.min(...us), u1: Math.max(...us), y0: b.min.y, y1: b.max.y, d0: Math.min(...ds), d1: Math.max(...ds) }; };
    const add = (su, sy, sd, mat, u, y, d, cast = true) => { const g = new THREE.BoxGeometry(Math.abs(t.x) * su + Math.abs(n.x) * sd, sy, Math.abs(t.z) * su + Math.abs(n.z) * sd);
      const o = new THREE.Mesh(g, mat); o.position.copy(t.clone().multiplyScalar(u)).addScaledVector(n, d).setY(y); o.castShadow = cast; o.receiveShadow = true; scene.add(o); return o; };
    const P = (u, y, d) => t.clone().multiplyScalar(u).addScaledVector(n, d).setY(y);
    const ao = (a, b, away, alpha) => { const A = P(...a), B = P(...b), w = new THREE.Vector3().addScaledVector(t, away[0]).addScaledVector(n, away[2]).setY(away[1]);
      const g = new THREE.BufferGeometry(), v = [A, B, B.clone().add(w), A.clone().add(w)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
      const o = new THREE.Mesh(g, aoMat(alpha)); o.renderOrder = 2; scene.add(o); };
    const walls = sm.filter(m => m.userData.role === 'wall' || m.userData.role === 'cladding').map(m => loc(box(m))); if (!walls.length) continue;
    // الوجوه: السلوك القديم = أبرز وجه فقط؛ القوالب = كل وجه متصل عند كل عمق (كتل بارزة وغائرة)
    const wallD0 = Math.max(...walls.map(w => w.d1));
    let faces; if (!tpl) { const face = walls.filter(w => w.d1 > wallD0 - .1); faces = [{ wallD: wallD0, X0: Math.min(...face.map(w => w.u0)), X1: Math.max(...face.map(w => w.u1)), top: Math.max(...face.map(w => w.y1)) }]; }
    else { const cl = []; for (const w of walls.slice().sort((a, b) => b.d1 - a.d1)) { const c = cl.find(c => Math.abs(c.d - w.d1) < .1); if (c) c.m.push(w); else cl.push({ d: w.d1, m: [w] }); }
      faces = []; for (const c of cl) { let cur = null; for (const w of c.m.slice().sort((a, b) => a.u0 - b.u0)) { if (cur && w.u0 <= cur.X1 + .3) { cur.X1 = Math.max(cur.X1, w.u1); cur.top = Math.max(cur.top, w.y1); } else { cur = { wallD: c.d, X0: w.u0, X1: w.u1, top: w.y1 }; faces.push(cur); } } }
      faces = faces.filter(f => f.X1 - f.X0 > .5); if (!faces.length) continue; }
    for (const F of faces) F.bands = levels.filter(y => y + BH < F.top - .05);
    const faceOf = (u, d) => faces.find(F => u >= F.X0 - .15 && u <= F.X1 + .15 && Math.abs(F.wallD - d) < .5) || faces.slice().sort((a, b) => Math.abs(a.wallD - d) - Math.abs(b.wallD - d))[0];
    const bandAbove = (F, y) => F.bands.find(b => b >= y - .01) ?? F.top;
    const frameBox = (b, d, prof, mat, wd) => { const x0 = b.u0 - prof, x1 = b.u1 + prof, y0 = b.y0 - prof, y1 = b.y1 + prof, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dc = wd + d / 2;
      add(x1 - x0, prof, d, mat, cx, y1 - prof / 2, dc); add(x1 - x0, prof, d, mat, cx, y0 + prof / 2, dc);
      add(prof, y1 - y0 - 2 * prof, d, mat, x0 + prof / 2, cy, dc); add(prof, y1 - y0 - 2 * prof, d, mat, x1 - prof / 2, cy, dc);
      const e = wd + .003, W = .16, al = .42; ao([x0, y1, e], [x1, y1, e], [0, W * .6, 0], al * .6); ao([x0, y0, e], [x1, y0, e], [0, -W, 0], al);
      ao([x0, y0, e], [x0, y1, e], [-W, 0, 0], al * .8); ao([x1, y0, e], [x1, y1, e], [W, 0, 0], al * .8);
      return { x0, x1, y0, y1 }; };
    const dOf = m => { const f = sm.find(x => x.userData.role === 'frame' && x.userData.opening === m.userData.opening); return loc(box(f || m)).d1; };
    const gl = sm.filter(m => m.userData.role === 'glazing').map(m => ({ m, b: loc(box(m)), d: dOf(m) })), doors = sm.filter(m => m.userData.role === 'door').map(m => ({ m, b: loc(box(m)), d: dOf(m) }));
    const Ld = p.light >= 1;
    // ---- أشرطة البلاطات والدروة وإظلام التماس لكل وجه
    for (const F of faces) { const { wallD, X0, X1, top } = F, mid = (X0 + X1) / 2;
      for (const yb of F.bands) {
        if (p.band === 0) { add(X1 - X0 + .02, BH, PROJ, grey, mid, yb + BH / 2, wallD + PROJ / 2); if (Ld) add(X1 - X0 - .2, .015, .015, led, mid, yb - .002, wallD + PROJ - .04, false); }
        else if (p.band === 1) { add(X1 - X0 + .02, BH, .03, grey, mid, yb + BH / 2, wallD + .015); add(X1 - X0 + .02, .10, .62, black, mid, yb + BH - .05, wallD + .31); if (Ld) add(X1 - X0 - .2, .012, .012, led, mid, yb + BH - .106, wallD + .58, false); }
        else if (p.band === 2) { add(X1 - X0 + .02, .50, .06, grey, mid, yb + .05, wallD + .03); add(X1 - X0 + .02, .035, .075, black, mid, yb - .215, wallD + .035); }
        else if (p.band === 3) { add(X1 - X0 + .02, .05, .03, black, mid, yb + .125, wallD + .015); }
        else { for (const k of [0, 1]) add(X1 - X0 + .02, .09, .16, grey, mid, yb + .05 + k * .2, wallD + .08); }
        ao([X0, yb, wallD + .003], [X1, yb, wallD + .003], [0, -.32, 0], p.band === 3 ? .2 : .38); ao([X0, yb + BH, wallD + .003], [X1, yb + BH, wallD + .003], [0, .14, 0], .25); }
      const w = X1 - X0 + .02;
      if (p.cap === 0) add(w, .08, .34, grey, mid, top + .04, wallD - .12);
      else if (p.cap === 1) { add(w, .06, .7, black, mid, top + .03, wallD + .15); if (p.light === 2) add(w - .3, .012, .012, led, mid, top - .004, wallD + .46, false); }
      else if (p.cap === 2) add(w, .16, .5, grey, mid, top + .08, wallD);
      else if (p.cap === 3) add(w, .04, .3, black, mid, top + .02, wallD - .1);
      else { add(w, .16, .95, grey, mid, top + .08, wallD + .2); if (Ld) add(w - .3, .012, .012, led, mid, top - .004, wallD + .66, false); }
      ao([X0, .003, wallD], [X1, .003, wallD], [0, 0, .55], .5); ao([X0, 0, wallD + .003], [X1, 0, wallD + .003], [0, .4, 0], .32); }
    // ---- فتحات النوافذ
    const bigFrame = (b, d, w, h) => { let f;
      if (p.frame === 0) f = frameBox(b, PROJ, PROF, black, d);
      else if (p.frame === 1) f = frameBox(b, .04, .045, black, d);
      else if (p.frame === 2) f = frameBox(b, .12, .16, grey, d);
      else if (p.frame === 3) f = frameBox(b, .45, .10, black, d);
      else if (p.frame === 4) { f = frameBox(b, PROJ, PROF, black, d); add(f.x1 - f.x0 + .5, .07, .45, black, (f.x0 + f.x1) / 2, f.y1 + .035, d + .225); add(f.x1 - f.x0 + .16, .06, .26, grey, (f.x0 + f.x1) / 2, f.y0 - .03, d + .13); }
      else f = frameBox(b, .18, .10, wood, d);
      if (Ld && (p.frame === 0 || p.frame === 3 || p.frame === 4)) add(f.x1 - f.x0 - .1, .012, .012, led, (f.x0 + f.x1) / 2, f.y0 - .004, d + (p.frame === 3 ? .42 : PROJ) - .03, false);
      return f; };
    const mull = (b, w, h, gd) => { const bars = (nV, wv) => { for (let i = 1; i <= nV; i++) add(wv, h, .06, black, b.u0 + w * i / (nV + 1), (b.y0 + b.y1) / 2, gd); }, hor = (ys, hh) => { for (const y of ys) add(w, hh, .06, black, (b.u0 + b.u1) / 2, y, gd); };
      if (p.mull === 0) { bars(Math.ceil(w / 1.0) - 1, .05); if (h > 1.3) hor([b.y1 - h * .3], .05); }
      else if (p.mull === 2) bars(Math.min(14, Math.ceil(w / .5) - 1), .035);
      else if (p.mull === 3) { const nH = Math.max(1, Math.floor(h / .6)); hor(Array.from({ length: nH }, (_, i) => b.y0 + h * (i + 1) / (nH + 1)), .035); bars(Math.ceil(w / 2.4) - 1, .05); }
      else if (p.mull === 4) { bars(Math.ceil(w / 1.2) - 1, .045); hor(h > 1.5 ? [b.y0 + h / 3, b.y0 + 2 * h / 3] : [b.y0 + h / 2], .04); } };
    for (const { b, d } of gl) { const w = b.u1 - b.u0, h = b.y1 - b.y0;
      if (w >= .85) { const f = bigFrame(b, d, w, h); mull(b, w, h, b.d1 + .03); }
      else if (tpl && h > 1.6) frameBox(b, .10, .05, black, d);
      else frameBox(b, tpl ? (p.frame === 3 ? .16 : .02) : .02, .12, grey, d); }
    // ---- زجاج جانبي للباب
    const sideLite = (b, d, m) => { const w = b.u1 - b.u0, leaf = .95; if (w - leaf < .25) return; const lw = w - leaf, ua = b.u0, ub = b.u0 + lw, fd = b.d1, cy = (b.y0 + b.y1) / 2, h = b.y1 - b.y0;
      if (interiorJ) add(lw, h, .006, interiorJ, (ua + ub) / 2, cy, fd + .004, false);
      if (glassJ) add(lw, h, .01, glassJ, (ua + ub) / 2, cy, fd + .03, false);
      add(.06, h, .07, black, ub, cy, fd + .035); add(lw, .05, .05, black, (ua + ub) / 2, b.y1 - .025, fd + .03); add(lw, .05, .05, black, (ua + ub) / 2, b.y0 + .025, fd + .03);
      const g = m.geometry; g.computeBoundingBox(); const bb = g.boundingBox, alongX = bb.max.x - bb.min.x >= bb.max.z - bb.min.z, low = (alongX ? t.x : t.z) > 0, f = lw / w, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const x = uv.getX(i); uv.setX(i, low ? (x - f) / (1 - f) : x / (1 - f)); } uv.needsUpdate = true; };
    const slatsF = (F, xa, xb, ya, yb, mat = wood) => { const wd = F.wallD; if (xb - xa < .2 || yb - ya < .2) return; add(xb - xa, yb - ya, .02, backing, (xa + xb) / 2, (ya + yb) / 2, wd + .01, false);
      const g = new THREE.BoxGeometry(.04, yb - ya, .06), nS = Math.floor((xb - xa) / .07), inst = new THREE.InstancedMesh(g, mat, nS), M4 = new THREE.Matrix4(), c = new THREE.Color(), r = rnd(21);
      for (let i = 0; i < nS; i++) { M4.makeTranslation(xa + .035 + i * .07, (ya + yb) / 2, wd + .05); inst.setMatrixAt(i, M4); const k = .62 + r() * .5; c.setRGB(k, k * (.95 + r() * .07), k * (.88 + r() * .12)); inst.setColorAt(i, c); }
      inst.castShadow = inst.receiveShadow = true; scene.add(inst); };
    for (const { b, d, m } of doors) { const F = faceOf((b.u0 + b.u1) / 2, d), wd = F.wallD, pt = tpl ? p.portal : 0; let f;
      const sconce = () => { for (const sx of [b.u0 - .35, b.u1 + .35]) { add(.08, .2, .08, black, sx, 2.1, wd + .04); add(.06, .01, .06, led, sx, 1.995, wd + .04, false); } };
      if (pt === 1) { f = frameBox(b, .70, .10, black, d); const hh = f.y1 + .1 - b.y0; for (const sx of [f.x0 - .25, f.x1 + .25]) add(.5, hh, .70, grey, sx, b.y0 + hh / 2, d + .35);
        add(f.x1 - f.x0 + 1.0, .1, .70, grey, (f.x0 + f.x1) / 2, f.y1 + .15, d + .35); if (Ld) add(f.x1 - f.x0, .012, .012, led, (f.x0 + f.x1) / 2, f.y1 - .09, d + .66, false); }
      else if (pt === 3) { f = frameBox(b, .30, .30, grey, d); if (Ld) add(b.u1 - b.u0, .012, .012, led, (b.u0 + b.u1) / 2, b.y1 - .012, d + .28, false); }
      else if (pt === 5) { f = frameBox(b, PROJ + .05, .09, black, d); const ya = Math.min(f.y1 + .32, (F.bands[0] ?? 3.55) - .14), pz = .62, xs = [f.x0 - .15, f.x1 + .15];
        for (const x of xs) { add(.1, ya, .1, black, x, ya / 2, d + pz); add(.08, .1, pz + .05, black, x, ya, d + pz / 2); }
        add(xs[1] - xs[0] + .1, .1, .08, black, (xs[0] + xs[1]) / 2, ya, d + pz);
        const nR = Math.floor((xs[1] - xs[0]) / .2); for (let i = 0; i <= nR; i++) add(.05, .07, pz + .05, woodH(), xs[0] + i * (xs[1] - xs[0]) / nR, ya + .085, d + pz / 2); if (Ld) add(xs[1] - xs[0], .012, .012, led, (xs[0] + xs[1]) / 2, ya - .056, d + pz - .05, false); }
      else { f = frameBox(b, PROJ + .05, .09, black, d); if (Ld) add(.25, .008, .06, led, (f.x0 + f.x1) / 2, f.y1 - .095, d + .14, false);
        if (pt === 2) { const ya = Math.min(f.y1 + .32, (F.bands[0] ?? 3.55) - .14); add(f.x1 - f.x0 + 1.4, .08, .72, black, (f.x0 + f.x1) / 2, ya, d + .36); if (Ld) add(f.x1 - f.x0 + 1.2, .01, .01, led, (f.x0 + f.x1) / 2, ya - .045, d + .68, false); }
        if (pt === 4) { const yt = f.y1 + .12; slatsF({ wallD: d }, f.x0 - .7, f.x0 - .05, b.y0, yt, wood); slatsF({ wallD: d }, f.x1 + .05, f.x1 + .7, b.y0, yt, wood); } }
      if (pt === 0 || pt === 2) sconce(); if (p.light === 2 && pt !== 1) for (const sx of [f.x0 - .03, f.x1 + .03]) add(.012, f.y1 - f.y0 - .3, .012, led, sx, (f.y0 + f.y1) / 2, d + .3, false);
      const yb = bandAbove(F, f.y1); if (yb - f.y1 > .05) add(f.x1 - f.x0, yb - f.y1, .02, grey, (f.x0 + f.x1) / 2, (f.y1 + yb) / 2, d + .01);
      sideLite(b, d, m); }
    // ---- أكتاف/زعانف بين الفتحات
    if (tpl && p.pier > 0) for (const F of faces) { const ops = [...gl, ...doors].map(o => o.b).filter(b => b.u0 >= F.X0 - .05 && b.u1 <= F.X1 + .05 && Math.abs(F.wallD - (b.d1)) < .6).sort((a, b) => a.u0 - b.u0);
      const padF = p.frame === 3 ? .14 : p.frame === 2 ? .2 : .1; if (p.portal === 1 || p.portal === 3 || p.portal === 5 || p.portal === 4) { /* مداخل بارزة: تُحسب كأطر أوسع */ }
      for (let i = 1; i < ops.length; i++) { const a = ops[i - 1], b = ops[i], g = b.u0 - a.u1, big = Math.max((a.y0 < .7 && a.y1 > 2.2) || 0, 0); let pad = padF + .06; for (const o of [a, b]) if (o.y0 < .6 && o.y1 > 2.0 && (o.u1 - o.u0) > .9) pad = Math.max(pad, p.portal === 1 ? .8 : p.portal === 3 ? .45 : p.portal === 5 ? .35 : .22);
        const wP = Math.min(p.pier === 2 ? .08 : p.pier === 3 ? .2 : .42, g - 2 * pad); if (wP < .07) continue; const dP = p.pier === 1 ? .32 : p.pier === 2 ? .45 : .22, mt = p.pier === 3 ? wood : p.pier === 2 ? black : grey, c = (a.u1 + b.u0) / 2;
        F.bands.concat([F.top]).forEach((yTop, k) => { if (k >= levels.length) return; const base = k === 0 ? .62 : levels[k - 1] + BH + .12, y1 = Math.min(yTop - .04, levels[k] - .05); if (y1 - base < .8) return; add(wP, y1 - base, dP, mt, c, (base + y1) / 2, F.wallD + dP / 2); }); } }
    // ---- قاعدة
    if (tpl && p.plinth > 0) for (const F of faces) { const hh = p.plinth === 1 ? .55 : .95, dP = p.plinth === 1 ? .05 : .06, ex = [...gl, ...doors].map(o => o.b).filter(b => b.y0 < hh + .05 && b.u1 > F.X0 && b.u0 < F.X1 && Math.abs(F.wallD - b.d1) < .6).map(b => [b.u0 - (b.y0 < .7 ? .8 : .15), b.u1 + (b.y0 < .7 ? .8 : .15)]).sort((a, b) => a[0] - b[0]);
      let cur = F.X0 + .02; const seg = (a, b) => { if (b - a > 1.0) add(b - a, hh, dP, p.plinth === 1 ? black : grey, (a + b) / 2, hh / 2, F.wallD + dP / 2); };
      for (const [a, b] of ex) { if (a > cur) seg(cur, Math.min(a, F.X1 - .02)); cur = Math.max(cur, b); } if (cur < F.X1 - .02) seg(cur, F.X1 - .02); }
    if (side === 's') south = { faces, doors, bands: faces.flatMap(F => F.bands), add, slatsF, loc, P, black, led };
  }
  if (!south) return {};
  const { faces: SF, doors, add, slatsF } = south, FF = SF.slice().sort((a, b) => b.wallD - a.wallD || (b.X1 - b.X0) - (a.X1 - a.X0))[0];
  const { X0, X1, wallD } = FF;
  for (const F of SF) { const yTop = F.bands.length ? F.bands[F.bands.length - 1] + BH : 3.85, top = F.top, wF = F.X1 - F.X0, z = tpl ? p.crownZone : 0; if (top - yTop <= .2) continue;
    const y0 = yTop, y1 = top - .02, H = y1 - y0, dc = doors.map(d => d.b).filter(b => b.u0 >= F.X0 && b.u1 <= F.X1).map(b => (b.u0 + b.u1) / 2)[0] ?? (F.X0 + F.X1) / 2;
    const inst = (g, mat, n, fn) => { const m = new THREE.InstancedMesh(g, mat, n), M4 = new THREE.Matrix4(); for (let i = 0; i < n; i++) { fn(M4, i); m.setMatrixAt(i, M4); } m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
    if (z === 0) slatsF(F, F.X0 + wF * .55, F.X1 - .05, y0, y1);
    else if (z === 1) slatsF(F, F.X0 + .05, F.X1 - .05, y0, y1);
    else if (z === 2) { const nS = Math.floor(wF / .45); inst(new THREE.BoxGeometry(.14, H, .16), grey, nS, (M, i) => M.makeTranslation(F.X0 + .225 + i * (wF - .45) / Math.max(1, nS - 1), (y0 + y1) / 2, F.wallD + .08)); }
    else if (z === 3) { add(wF - .1, H, .02, backing, (F.X0 + F.X1) / 2, (y0 + y1) / 2, F.wallD + .01, false); const nS = Math.floor((wF - .1) / .12); inst(new THREE.BoxGeometry(.03, H, .08), black, nS, (M, i) => M.makeTranslation(F.X0 + .08 + i * .12, (y0 + y1) / 2, F.wallD + .06)); }
    else if (z === 4) { add(wF - .3, H - .3, .035, darkPanel(THREE, renderer), (F.X0 + F.X1) / 2, (y0 + y1) / 2 + .05, F.wallD + .0175); if (p.light >= 1) add(wF - .3, .014, .014, led, (F.X0 + F.X1) / 2, y0 + .04, F.wallD + .04, false); }
    else if (z === 5) { add(wF - .1, H, .02, backing, (F.X0 + F.X1) / 2, (y0 + y1) / 2, F.wallD + .01, false); const nP = Math.floor(H / .14); inst(new THREE.BoxGeometry(wF - .1, .08, .05), woodH(), nP, (M, i) => M.makeTranslation((F.X0 + F.X1) / 2, y0 + .07 + i * .14, F.wallD + .045)); }
    else if (z === 7) { const hw = Math.min(1.7, wF / 2 - .1); slatsF(F, dc - hw, dc + hw, y0, y1); } }
  if (p.accent === 1 || !tpl) { const d2 = doors.map(d => d.b).sort((a, b) => b.u0 - a.u0)[0], F2 = d2 && (SF.find(F => d2.u0 >= F.X0 && d2.u1 <= F.X1) || FF); if (d2 && (!tpl || p.accent === 1)) slatsF(F2, d2.u1 + .2, d2.u1 + .9, .45, F2.bands[0] ?? 3.55); }
  if (night) {
    for (const { b, d } of doors) for (const sx of [b.u0 - .35, b.u1 + .35]) { const L = new THREE.SpotLight('#ffd9a0', 6, 4, 1.1, .6, 2); L.position.set(sx, 1.98, d + .08); L.target.position.set(sx, 0, d + .3); scene.add(L, L.target); }
    for (const F of SF) for (const yb of F.bands) for (let x = F.X0 + .8; x < F.X1; x += 1.6) { const L = new THREE.SpotLight('#ffe2b0', 4, 4.5, 1.0, .7, 2); L.position.set(x, yb - .03, F.wallD + PROJ - .05); L.target.position.set(x, yb - 2, F.wallD + .05); scene.add(L, L.target); }
  }
  return { wallZ: wallD, X0, X1 };
}

const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const rnd = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const tex = (THREE, renderer, c, srgb, rep = [1, 1]) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
/** ضجيج قيمي متدرّج + fbm. */
function noise2(seed) { const P = new Float32Array(512 * 512), r = rnd(seed); for (let i = 0; i < P.length; i++) P[i] = r();
  const h = (x, y) => P[((y & 511) << 9) | (x & 511)], f = t => t * t * (3 - 2 * t);
  const n = (x, y) => { const X = Math.floor(x), Y = Math.floor(y), u = f(x - X), v = f(y - Y); return h(X, Y) * (1 - u) * (1 - v) + h(X + 1, Y) * u * (1 - v) + h(X, Y + 1) * (1 - u) * v + h(X + 1, Y + 1) * u * v; };
  return (x, y, oct = 5) => { let s = 0, a = .5, k = 1, t = 0; for (let o = 0; o < oct; o++) { s += a * n(x * k + o * 17.3, y * k - o * 9.1); t += a; a *= .5; k *= 2.03; } return s / t; }; }
function aoTexture(THREE) { const [c, x] = cnv(4, 128), g = x.createLinearGradient(0, 128, 0, 0); // v=0 (أسفل القماش) عند خط التماس
  g.addColorStop(0, '#fff'); g.addColorStop(.25, '#8a8a8a'); g.addColorStop(.6, '#262626'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); }
/**
 * رخام فاتح إجرائي: القماش 4.8×2.4 م (4×4 ألواح 1.2×0.6) بمحاذاة شبكة المداميك العامة (أصل z=0، إزاحة نصف لوح للمداميك الفردية).
 * لكل لوح: سحابة قاعدية منخفضة التردد، عروق رئيسية مموهة بعرض وشفافية متغيرين (تشويه مجال بالضجيج)، وعروق ثانوية متفرعة رقيقة،
 * مع تفاوت درجة اللوح. خرائط: لون + خشونة (العروق أخشن قليلًا) + نتوء خفيف.
 */
function marbleMat(THREE, renderer) { const PX = 640, W = PX * 4.8 | 0, H = PX * 2.4 | 0, [c, x] = cnv(W, H), [rc, rx] = cnv(W, H);
  const N = noise2(5), N2 = noise2(77), img = x.createImageData(W, H), rim = rx.createImageData(W, H), d = img.data, rd = rim.data, rr = rnd(5), panels = [];
  for (let i = 0; i < 16; i++) panels.push({ a: (rr() - .5) * 1.1 + (rr() < .5 ? .5 : -.5), f: 1.1 + rr() * 1.3, ox: rr() * 50, oy: rr() * 50, tone: (rr() - .5) * .035, warm: rr() * .012, amp: .55 + rr() * .5, sec: rr() });
  for (let py = 0; py < H; py++) { const yv = (H - 1 - py) / PX, row = Math.min(3, Math.floor(yv / .6)), off = (row & 1) * .6;
    for (let px = 0; px < W; px++) { const xu = px / PX, col = Math.floor(((xu - off) % 4.8 + 4.8) % 4.8 / 1.2) & 3, p = panels[row * 4 + col];
      const X = xu + p.ox, Y = yv + p.oy;
      const cloud = N(X * .9, Y * .9, 4), cloud2 = N2(X * 3.5, Y * 3.5, 3);
      const wx = N(X * 1.6 + 3, Y * 1.6, 5), wy = N2(X * 1.6, Y * 1.6 + 7, 5);
      const ca = Math.cos(p.a), sa = Math.sin(p.a);
      // عرق رئيسي: مجال خطي مشوّه تشويهًا منخفض التردد (تعرجات هادئة لا حلقات)، عرضه وشفافيته يتغيران على امتداده
      const t1 = (X * ca + Y * sa) * p.f * .55 + 1.1 * wx + .45 * wy, s1 = Math.abs(Math.sin(t1 * Math.PI));
      const w1 = .03 + .07 * N2(X * .6, Y * .6, 2), o1 = Math.max(0, N(X * .7 + 11, Y * .7, 3) * 2.2 - .85) * p.amp;
      const core = Math.exp(-(s1 * s1) / (w1 * w1 * .12)), halo = Math.exp(-(s1 * s1) / (w1 * w1 * 3));
      // عروق ثانوية متفرعة رقيقة باهتة (تردد أعلى، اتجاه قريب، تظهر حيث الضجيج مرتفع فقط)
      const t2 = (X * Math.cos(p.a + .7) + Y * Math.sin(p.a + .7)) * p.f * 1.6 + 1.8 * N2(X * 2.2 + 5, Y * 2.2, 4) + .8 * wx, s2 = Math.abs(Math.sin(t2 * Math.PI));
      const g2 = Math.max(0, N2(X * 1.1 + 2, Y * 1.1, 3) - .52) * 3 * (.3 + p.sec * .7), v2 = Math.exp(-(s2 * s2) / .0012) * g2;
      const mott = Math.max(0, N(X * 5, Y * 5, 3) - .55) * .25; // تبقّع رمادي خفيف
      const vein = Math.min(1, core * o1 * .42 + halo * o1 * .16 + v2 * .2 + mott * .3);
      const base = .93 + (cloud - .5) * .11 + (cloud2 - .5) * .035 + p.tone, i = (py * W + px) * 4, L = base * (1 - vein * .42);
      d[i] = 255 * Math.min(1, L * (1.005 + p.warm)); d[i + 1] = 255 * Math.min(1, L * .997); d[i + 2] = 255 * Math.min(1, L * (.975 - vein * .02)); d[i + 3] = 255;
      const R = 255 * (.18 + vein * .22 + (cloud2 - .5) * .06); rd[i] = rd[i + 1] = rd[i + 2] = R; rd[i + 3] = 255; } }
  x.putImageData(img, 0, 0); rx.putImageData(rim, 0, 0);
  const rep = [1 / 4.8, 1 / 2.4], map = tex(THREE, renderer, c, true, rep), rough = tex(THREE, renderer, rc, false, rep);
  const m = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1, bumpMap: map, bumpScale: .35, metalness: 0, envMapIntensity: .9 }); m.name = 'limestone-marbleJ'; return m; }
function greyStoneMat(THREE, renderer) { const [c, x] = cnv(512, 512), r = rnd(9); x.fillStyle = '#8f8d88'; x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 9000; k++) { const v = 100 + r() * 70; x.fillStyle = `rgba(${v},${v - 2},${v - 6},${.25})`; x.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3); }
  return new THREE.MeshStandardMaterial({ map: tex(THREE, renderer, c, true, [1.5, 1.5]), roughness: .7 }); }
/** خشب: ألياف رأسية متموجة بحلقات نمو (القماش لوجه شريحة واحدة بطولها)، مع خريطة نتوء للألياف. */
function woodMat(THREE, renderer) { const W = 128, H = 2048, [c, x] = cnv(W, H), N = noise2(13), img = x.createImageData(W, H), d = img.data;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const u = px / W, v = py / H;
    const ring = Math.sin((u * 3 + 2.2 * N(u * 2, v * 6, 4) + .35 * N(u * 8, v * 40, 3)) * Math.PI * 2), fine = N(u * 60, v * 3, 3);
    const k = .86 - .16 * (ring * .5 + .5) ** 3 + (fine - .5) * .2, i = (py * W + px) * 4;
    d[i] = 255 * Math.min(1, .68 * k); d[i + 1] = 255 * .45 * k; d[i + 2] = 255 * .26 * k; d[i + 3] = 255; }
  x.putImageData(img, 0, 0); const map = tex(THREE, renderer, c, true);
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .6, roughness: .62, color: '#ffffff' }); }

const shadeHex = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, (n >> 16) * k) | 0},${Math.min(255, ((n >> 8) & 255) * k) | 0},${Math.min(255, (n & 255) * k) | 0})`; };
const specMat = (THREE, renderer, base, seed, o = {}) => { const [c, x] = cnv(512, 512), r = rnd(seed); x.fillStyle = base; x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < (o.n ?? 7000); k++) { const v = r() < .5 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},${(o.a ?? .08) * r()})`; x.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 2); }
  return new THREE.MeshStandardMaterial({ map: tex(THREE, renderer, c, true, [1.5, 1.5]), roughness: o.rough ?? .75, metalness: o.metal ?? 0 }); };
/** لوح 4.8×2.4 م (4×4 ألواح 1.2×0.6 بإزاحة نصف لوح للصفوف الفردية كما في الرخام) بتفاوت لون لكل لوح وتفاصيل حسب النوع. */
function panelTex(THREE, renderer, o) { const PX = 200, W = 960, H = 480, [c, x] = cnv(W, H), r = rnd(o.seed), tones = Array.from({ length: 16 }, () => 1 + (r() - .5) * o.tone);
  for (let row = 0; row < 4; row++) { const off = (row & 1) * .6, py = H - (row + 1) * .6 * PX; for (let col = -1; col <= 4; col++) { x.fillStyle = shadeHex(o.base, tones[row * 4 + ((col % 4) + 4) % 4]); x.fillRect((col * 1.2 + off) * PX, py, 1.2 * PX, .6 * PX); } }
  if (o.kind === 'travertine') { for (let k = 0; k < 2600; k++) { const a = .1 + r() * .22; x.fillStyle = `rgba(${96 + r() * 30 | 0},${72 + r() * 20 | 0},${44 + r() * 20 | 0},${a})`; x.fillRect(r() * W, r() * H, 14 + r() * 110, .8 + r() * 1.8); }
    for (let k = 0; k < 500; k++) { x.fillStyle = `rgba(70,52,32,${.18 + r() * .25})`; x.fillRect(r() * W, r() * H, 3 + r() * 9, 1 + r() * 2); } }
  else if (o.kind === 'basalt') { for (let k = 0; k < 14000; k++) { const v = r() < .5 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},${.05 + .1 * r()})`; x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); } }
  else if (o.kind === 'sand') { for (let k = 0; k < 9000; k++) { const v = r() < .5 ? 0 : 255; x.fillStyle = `rgba(${v},${v - 6},${v - 18},${.03 + .06 * r()})`; x.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2); } }
  else if (o.kind === 'concrete') { for (let k = 0; k < 6000; k++) { const v = r() < .5 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},${.03 + .06 * r()})`; x.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 2); }
    x.fillStyle = 'rgba(40,40,40,.35)'; for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) { x.beginPath(); x.arc(col * 240 + 120, H - row * 120 - 60, 2.2, 0, 7); x.fill(); } }
  else { for (let k = 0; k < 4000; k++) { const v = r() < .5 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},${.02 + .03 * r()})`; x.fillRect(r() * W, r() * H, 1 + r() * 4, 1 + r() * 3); } }
  const map = tex(THREE, renderer, c, true, [1 / 4.8, 1 / 2.4]);
  return new THREE.MeshStandardMaterial({ map, bumpMap: o.bump ? map : null, bumpScale: .2, roughness: o.rough, metalness: 0, envMapIntensity: .8 }); }
/** مجموعة خامات الجدار حسب wallMat: 0 رخام (قديم) 1 ترافرتين 2 بازلت داكن 3 حجر رملي 4 رندر أبيض 5 خرسانة رمادية. */
function wallSet(THREE, renderer, id) {
  if (!id) return { wall: marbleMat(THREE, renderer), joint: '#bdb8af', accent: greyStoneMat(THREE, renderer) };
  const D = [null,
    { kind: 'travertine', base: '#d9c9a6', tone: .05, rough: .8, seed: 31, bump: 1, joint: '#9b8c6e', acc: ['#cdbd9c', 41] },
    { kind: 'basalt', base: '#5d6065', tone: .09, rough: .6, seed: 32, bump: 1, joint: '#161718', acc: ['#2a2b2d', 42] },
    { kind: 'sand', base: '#cdb78f', tone: .05, rough: .85, seed: 33, bump: 1, joint: '#8e7f62', acc: ['#d2c09c', 43] },
    { kind: 'render', base: '#ebe8e1', tone: .015, rough: .92, seed: 34, bump: 0, joint: '#e4e1da', acc: ['#8d8c88', 44] },
    { kind: 'concrete', base: '#a7a6a1', tone: .04, rough: .88, seed: 35, bump: 1, joint: '#7d7c78', acc: ['#6e6e6b', 45] }][id] || null;
  if (!D) return wallSet(THREE, renderer, 0);
  return { wall: panelTex(THREE, renderer, D), joint: D.joint, accent: specMat(THREE, renderer, D.acc[0], D.acc[1]) };
}
let _dark = null; const darkPanel = (THREE, renderer) => _dark || (_dark = specMat(THREE, renderer, '#2d2f31', 51, { rough: .5 }));
