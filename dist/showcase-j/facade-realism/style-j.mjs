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
export async function applyStyleJ(THREE, { scene, renderer, S, q }) {
  const PROJ = Number(q.get('proj') ?? .20), PROF = .07, night = q.get('night') === '1', BH = .30;
  for (const m of S.meshes) if (CLASSIC.has(m.userData?.role)) m.visible = false;
  const marble = marbleMat(THREE, renderer), grey = greyStoneMat(THREE, renderer), wood = woodMat(THREE, renderer);
  const black = new THREE.MeshStandardMaterial({ color: '#141617', metalness: .6, roughness: .34 }); black.name = 'steel-blackJ';
  const led = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe2b0', emissiveIntensity: night ? 6 : 2.4 });
  const jointJ = new THREE.MeshStandardMaterial({ color: '#bdb8af', roughness: .85 });
  const backing = new THREE.MeshStandardMaterial({ color: '#070606', roughness: 1, envMapIntensity: .2 });
  const glassJ = S.meshes.find(m => m.material?.name === 'glass')?.material, interiorJ = S.meshes.find(m => m.material?.name === 'interior')?.material;
  for (const m of S.meshes) if (m.userData?.part === 'plate') m.material = jointJ;
  for (const m of S.meshes) if (m.userData?.part === 'blocks') m.material = marble;
  const AO = aoTexture(THREE), aoMat = a => new THREE.MeshBasicMaterial({ color: '#000', alphaMap: AO, transparent: true, opacity: a * (night ? .5 : 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const box = m => new THREE.Box3().setFromObject(m), levels = bandLevels(), up = new THREE.Vector3(0, 1, 0);
  let south = null;
  for (const [side, [nx, nz]] of Object.entries(SIDES)) {
    const sm = S.meshes.filter(m => m.userData?.side === side && m.visible); if (!sm.length) continue;
    const n = new THREE.Vector3(nx, 0, nz), t = new THREE.Vector3().crossVectors(up, n);
    // إطار محلي للجهة: u على امتداد الجدار، y رأسي، d بعد خارجي
    const loc = b => { const us = [b.min.x * t.x + b.min.z * t.z, b.max.x * t.x + b.max.z * t.z], ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z];
      return { u0: Math.min(...us), u1: Math.max(...us), y0: b.min.y, y1: b.max.y, d0: Math.min(...ds), d1: Math.max(...ds) }; };
    const add = (su, sy, sd, mat, u, y, d, cast = true) => { const g = new THREE.BoxGeometry(Math.abs(t.x) * su + Math.abs(n.x) * sd, sy, Math.abs(t.z) * su + Math.abs(n.z) * sd);
      const o = new THREE.Mesh(g, mat); o.position.copy(t.clone().multiplyScalar(u)).addScaledVector(n, d).setY(y); o.castShadow = cast; o.receiveShadow = true; scene.add(o); return o; };
    const P = (u, y, d) => t.clone().multiplyScalar(u).addScaledVector(n, d).setY(y);
    // شريط إظلام تماس: a,b طرفا خط التماس (u,y,d)، away متجه محلي (du,dy,dd) بعرض الشريط
    const ao = (a, b, away, alpha) => { const A = P(...a), B = P(...b), w = new THREE.Vector3().addScaledVector(t, away[0]).addScaledVector(n, away[2]).setY(away[1]);
      const g = new THREE.BufferGeometry(), v = [A, B, B.clone().add(w), A.clone().add(w)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
      const o = new THREE.Mesh(g, aoMat(alpha)); o.renderOrder = 2; scene.add(o); };
    const walls = sm.filter(m => m.userData.role === 'wall' || m.userData.role === 'cladding').map(m => loc(box(m))); if (!walls.length) continue;
    const wallD = Math.max(...walls.map(w => w.d1)), face = walls.filter(w => w.d1 > wallD - .1);
    const X0 = Math.min(...face.map(w => w.u0)), X1 = Math.max(...face.map(w => w.u1)), top = Math.max(...face.map(w => w.y1));
    const bands = levels.filter(y => y + BH < top - .05), bandAbove = y => bands.find(b => b >= y - .01) ?? top;
    const frameBox = (b, d, prof, mat, wd) => { const x0 = b.u0 - prof, x1 = b.u1 + prof, y0 = b.y0 - prof, y1 = b.y1 + prof, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dc = wd + d / 2;
      add(x1 - x0, prof, d, mat, cx, y1 - prof / 2, dc); add(x1 - x0, prof, d, mat, cx, y0 + prof / 2, dc);
      add(prof, y1 - y0 - 2 * prof, d, mat, x0 + prof / 2, cy, dc); add(prof, y1 - y0 - 2 * prof, d, mat, x1 - prof / 2, cy, dc);
      // إظلام تماس الصندوق مع وجه الجدار (خارج محيطه فقط)
      const e = wd + .003, W = .16, al = .42; ao([x0, y1, e], [x1, y1, e], [0, W * .6, 0], al * .6); ao([x0, y0, e], [x1, y0, e], [0, -W, 0], al);
      ao([x0, y0, e], [x0, y1, e], [-W, 0, 0], al * .8); ao([x1, y0, e], [x1, y1, e], [W, 0, 0], al * .8);
      return { x0, x1, y0, y1 }; };
    const dOf = m => { const f = sm.find(x => x.userData.role === 'frame' && x.userData.opening === m.userData.opening); return loc(box(f || m)).d1; };
    const gl = sm.filter(m => m.userData.role === 'glazing').map(m => ({ m, b: loc(box(m)), d: dOf(m) })), doors = sm.filter(m => m.userData.role === 'door').map(m => ({ m, b: loc(box(m)), d: dOf(m) }));
    for (const { b, d } of gl) { const w = b.u1 - b.u0, h = b.y1 - b.y0;
      if (w >= .85) { const f = frameBox(b, PROJ, PROF, black, d); add(f.x1 - f.x0 - .1, .012, .012, led, (f.x0 + f.x1) / 2, f.y0 - .004, d + PROJ - .03, false);
        // قواطع فولاذية سوداء 5×6 سم داخل الفتحة نفسها: رأسية كل ≤ 1.0 م، وأفقية (ترانسوم) عند الثلث العلوي إن زاد الارتفاع عن 1.3 م
        const gd = b.d1 + .03, nV = Math.ceil(w / 1.0) - 1;
        for (let i = 1; i <= nV; i++) add(.05, h, .06, black, b.u0 + w * i / (nV + 1), (b.y0 + b.y1) / 2, gd);
        if (h > 1.3) add(w, .05, .06, black, (b.u0 + b.u1) / 2, b.y1 - h * .3, gd); }
      else frameBox(b, .02, .12, grey, d); }
    // زجاج جانبي للباب داخل عرض فتحة الباب نفسها فقط (إن اتسعت الفتحة عن ورقة 0.95 م): قائم أسود + زجاج + ستارة، بلا فتحة جديدة
    const sideLite = (b, d, m) => { const w = b.u1 - b.u0, leaf = .95; if (w - leaf < .25) return; const lw = w - leaf, ua = b.u0, ub = b.u0 + lw, fd = b.d1, cy = (b.y0 + b.y1) / 2, h = b.y1 - b.y0;
      // الستارة فوق وجه الباب في شريط الزجاج (تحجب جزء الورقة)، والزجاج أمامها، والقائم الأسود فاصل بين الزجاج والورقة
      if (interiorJ) add(lw, h, .006, interiorJ, (ua + ub) / 2, cy, fd + .004, false);
      if (glassJ) add(lw, h, .01, glassJ, (ua + ub) / 2, cy, fd + .03, false);
      add(.06, h, .07, black, ub, cy, fd + .035); add(lw, .05, .05, black, (ua + ub) / 2, b.y1 - .025, fd + .03); add(lw, .05, .05, black, (ua + ub) / 2, b.y0 + .025, fd + .03);
      // إعادة ملاءمة UV الباب على عرض الورقة فقط حتى تبقى ألواحه كاملة
      const g = m.geometry; g.computeBoundingBox(); const bb = g.boundingBox, alongX = bb.max.x - bb.min.x >= bb.max.z - bb.min.z, low = (alongX ? t.x : t.z) > 0, f = lw / w, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const x = uv.getX(i); uv.setX(i, low ? (x - f) / (1 - f) : x / (1 - f)); } uv.needsUpdate = true; };
    for (const { b, d, m } of doors) { const f = frameBox(b, PROJ + .05, .09, black, d);
      add(.25, .008, .06, led, (f.x0 + f.x1) / 2, f.y1 - .095, d + .14, false);
      const yb = bandAbove(f.y1); if (yb - f.y1 > .05) add(f.x1 - f.x0, yb - f.y1, .02, grey, (f.x0 + f.x1) / 2, (f.y1 + yb) / 2, d + .01);
      sideLite(b, d, m); }
    // شريط حجر رمادي عند كل منسوب سقف، وتغطية الدروة العليا
    for (const yb of bands) { add(X1 - X0 + .02, BH, PROJ, grey, (X0 + X1) / 2, yb + BH / 2, wallD + PROJ / 2);
      add(X1 - X0 - .2, .015, .015, led, (X0 + X1) / 2, yb - .002, wallD + PROJ - .04, false);
      ao([X0, yb, wallD + .003], [X1, yb, wallD + .003], [0, -.32, 0], .38); ao([X0, yb + BH, wallD + .003], [X1, yb + BH, wallD + .003], [0, .14, 0], .25); }
    add(X1 - X0 + .02, .08, .34, grey, (X0 + X1) / 2, top + .04, wallD - .12);
    // تماس الجدار بالأرض: على الأرض (خارجًا) وعلى أسفل الجدار
    ao([X0, .003, wallD], [X1, .003, wallD], [0, 0, .55], .5); ao([X0, 0, wallD + .003], [X1, 0, wallD + .003], [0, .4, 0], .32);
    if (side === 's') south = { X0, X1, top, wallD, doors, bands, add };
  }
  if (!south) return {};
  const { X0, X1, top, wallD, doors, bands, add } = south;
  // شرائح خشب رأسية 4×6 سم بفراغ 3 سم (خطوة 7 سم) على خلفية داكنة، بتفاوت لوني لكل شريحة
  const slats = (xa, xb, ya, yb) => { add(xb - xa, yb - ya, .02, backing, (xa + xb) / 2, (ya + yb) / 2, wallD + .01, false);
    const g = new THREE.BoxGeometry(.04, yb - ya, .06), nS = Math.floor((xb - xa) / .07), inst = new THREE.InstancedMesh(g, wood, nS), M4 = new THREE.Matrix4(), c = new THREE.Color(), r = rnd(21);
    for (let i = 0; i < nS; i++) { M4.makeTranslation(xa + .035 + i * .07, (ya + yb) / 2, wallD + .05); inst.setMatrixAt(i, M4); const k = .62 + r() * .5; c.setRGB(k, k * (.95 + r() * .07), k * (.88 + r() * .12)); inst.setColorAt(i, c); }
    inst.castShadow = inst.receiveShadow = true; scene.add(inst); };
  const yTop = bands.length ? bands[bands.length - 1] + BH : 3.85, xs = X0 + (X1 - X0) * .55; if (top - yTop > .2) slats(xs, X1 - .05, yTop, top - .02);
  const d2 = doors.map(d => d.b).sort((a, b) => b.u0 - a.u0)[0]; if (d2) slats(d2.u1 + .2, d2.u1 + .9, .45, bands[0] ?? 3.55);
  for (const { b } of doors) for (const sx of [b.u0 - .35, b.u1 + .35]) { add(.08, .2, .08, black, sx, 2.1, wallD + .04); add(.06, .01, .06, led, sx, 1.995, wallD + .04, false); }
  if (night) { // مصابيح موضعية حقيقية عند مصادر LED المرسومة فقط
    for (const { b, d } of doors) for (const sx of [b.u0 - .35, b.u1 + .35]) { const L = new THREE.SpotLight('#ffd9a0', 6, 4, 1.1, .6, 2); L.position.set(sx, 1.98, d + .08); L.target.position.set(sx, 0, d + .3); scene.add(L, L.target); }
    for (const yb of bands) for (let x = X0 + .8; x < X1; x += 1.6) { const L = new THREE.SpotLight('#ffe2b0', 4, 4.5, 1.0, .7, 2); L.position.set(x, yb - .03, wallD + PROJ - .05); L.target.position.set(x, yb - 2, wallD + .05); scene.add(L, L.target); }
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
