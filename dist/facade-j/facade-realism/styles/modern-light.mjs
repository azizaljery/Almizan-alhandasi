// نمط M «معاصر خفيف»: جص أبيض/رمادي ناعم، حواف بلاطات رقيقة بارزة (15–25 سم)، زجاج كبير بإطارات رفيعة،
// جدار مميّز بخامة واحدة متباينة (خرسانة داكنة / برونز مؤنوَد / تيرازو)، زعانف رأسية أو بريسولاي أفقي من الألمنيوم،
// مدخل غائر بمظلة عميقة، مزاريب مخفية وشقوق إنارة خطية. يختلف عمدًا عن نمط J (حجر/خشب/صناديق سوداء).
// المراجع (بحث فقط، لا تنزيل): نماذج «contemporary / modern minimalist villa» الخليجية: جص أبيض، كابولي بلاطات 15–25 سم،
//   واجهات مُجزَّأة بخامة تباين واحدة، زعانف ألمنيوم رأسية ومظلات عميقة. ممارسة معمارية عامة؛ لا أرقام منسوخة من موقع محدد.
// sources: [ممارسة عمارة الفلل المعاصرة الخليجية (غير متحقق من مصدر منفرد)، مفردات Passivhaus/brise-soleil العامة (غير متحقق)]
// التنوّع (params.seed / params.rnd(k)): لوحة الألوان (4) · خامة الجدار المميّز (3) وموضعه وارتفاعه · زعانف/بريسولاي ·
//   عمق المظلة وجناحا المدخل · إيقاع حافة البلاطة (3) · معالجة الدروة (3) · نسبة المظلات فوق النوافذ · ارتفاع التغطية.
// القيود: لا تحريك لجدار/فتحة/منسوب؛ كل الإضافات أمام وجه الجدار؛ بروز الأغطية والبلاطات والإطارات 15–25 سم (المظلة والجناحان أعمق بحكم الوظيفة).
const CLASSIC = new Set(['projection', 'surround', 'cornice', 'sill', 'pediment']);
let LAST = { maxProjectionMm: null, openingsUnchanged: null, notImplemented: [] };
const NOT_IMPL = ['تراجع المدخل الفعلي (recess) بحفر الجدار: ممنوع تحريك الجدار؛ يُعبَّر عنه بجناحين ملاصقين ولوح مظلة 25 سم وشق إنارة', 'المزاريب المخفية: بلا أثر بصري ظاهر', 'قياس البروز يستثني لصاقات إظلام التماس (مسطحة) والأضواء'];
export const gates = () => LAST;
const SIDES = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
export const meta = { id: 'M', ar: 'معاصر خفيف', sources: ['ممارسة الفلل المعاصرة الخليجية (غير متحقق من مصدر منفرد)', 'brise-soleil / fins عامة (غير متحقق)'] };

const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const rnd = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash01 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h ^ h >>> 15) >>> 0) / 4294967296; };
const tex = (THREE, renderer, c, srgb, rep = [1, 1]) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ===== خامات إجرائية =====
/** جص ناعم: حبيبات دقيقة + بقع منخفضة التردد (قماش 2 م). */
function renderMat(THREE, renderer, base, name) {
  const S = 512, [c, x] = cnv(S, S), r = rnd(31), [R, G, B] = hex(base);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { const px = r() * S, py = r() * S, rad = 60 + r() * 140, v = (r() - .5) * 4;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, rad); const k = v > 0 ? 255 : 0; g.addColorStop(0, `rgba(${k},${k},${k},${Math.abs(v) / 255 * 2.2})`); g.addColorStop(1, `rgba(${k},${k},${k},0)`); x.fillStyle = g; x.fillRect(px + ox - rad, py + oy - rad, rad * 2, rad * 2); } }
  const im = x.getImageData(0, 0, S, S), d = im.data; for (let i = 0; i < d.length; i += 4) { const k = (r() - .5) * 7; d[i] += k; d[i + 1] += k; d[i + 2] += k; } x.putImageData(im, 0, 0);
  const m = new THREE.MeshStandardMaterial({ map: tex(THREE, renderer, c, true, [1 / 2, 1 / 2]), roughness: .93, metalness: 0, envMapIntensity: .55 }); m.name = name; return m;
}
/** خرسانة داكنة بألواح شدّة أفقية 12.5 سم (قماش 2×2 م). */
function concreteMat(THREE, renderer) {
  const S = 512, [c, x] = cnv(S, S), r = rnd(41), bh = S / 16;
  for (let b = 0; b < 16; b++) { const t = 58 + r() * 14; x.fillStyle = `rgb(${t},${t + 1},${t + 3})`; x.fillRect(0, b * bh, S, bh);
    for (let k = 0; k < 260; k++) { const v = t + (r() - .5) * 34; x.fillStyle = `rgba(${v},${v},${v + 2},.35)`; x.fillRect(r() * S, b * bh + r() * bh, 6 + r() * 70, 1); }
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, b * bh, S, 1.5); const sx = r() * S; x.fillRect(sx, b * bh, 1.5, bh); }
  for (let k = 0; k < 400; k++) { x.fillStyle = `rgba(20,20,22,${r() * .25})`; x.beginPath(); x.arc(r() * S, r() * S, .6 + r() * 1.6, 0, 7); x.fill(); }
  const t = tex(THREE, renderer, c, true, [1 / 2, 1 / 2]);
  const m = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: .5, roughness: .88, metalness: 0 }); m.name = 'dark-concreteM'; return m;
}
/** برونز مؤنوَد بتخديد رأسي (قماش 1.2 م عرضًا). */
function bronzeMat(THREE, renderer) {
  const S = 512, [c, x] = cnv(S, S), r = rnd(51), fl = 16;
  for (let i = 0; i < S / fl; i++) { const g = x.createLinearGradient(i * fl, 0, (i + 1) * fl, 0), j = (r() - .5) * 8;
    g.addColorStop(0, `rgb(${58 + j},${42 + j},${28 + j})`); g.addColorStop(.45, `rgb(${122 + j},${92 + j},${60 + j})`); g.addColorStop(1, `rgb(${50 + j},${37 + j},${25 + j})`); x.fillStyle = g; x.fillRect(i * fl, 0, fl, S); }
  for (let k = 0; k < 500; k++) { x.fillStyle = `rgba(255,230,190,${r() * .06})`; x.fillRect(r() * S, r() * S, 1, 20 + r() * 80); }
  const t = tex(THREE, renderer, c, true, [1 / 1.2, 1 / 1.2]);
  const m = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: .25, roughness: .42, metalness: .75, envMapIntensity: 1.1 }); m.name = 'anodised-bronzeM'; return m;
}
/** تيرازو: رقائق رخام/حجر ملوّنة على أرضية فاتحة (قماش 1.5 م). */
function terrazzoMat(THREE, renderer, warm) {
  const S = 1024, [c, x] = cnv(S, S), r = rnd(61); x.fillStyle = warm ? '#c9bfae' : '#b9bcbd'; x.fillRect(0, 0, S, S);
  const cols = warm ? ['#efe9dd', '#7c6a55', '#a8553c', '#3b3a38', '#d8cdb8'] : ['#f1f1ef', '#5d6368', '#8a9096', '#2f3336', '#d7d9da'];
  for (let k = 0; k < 2600; k++) { const s = 2 + r() ** 2.2 * 16, px = r() * S, py = r() * S; x.fillStyle = cols[(r() * cols.length) | 0]; x.globalAlpha = .85;
    for (const ox of [0, S]) for (const oy of [0, S]) { x.beginPath(); const n = 5 + (r() * 3 | 0), a0 = r() * 6.28; for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.283, rr = s * (.55 + r() * .5); x.lineTo(px - ox + Math.cos(a) * rr, py - oy + Math.sin(a) * rr * .8); } x.closePath(); x.fill(); } }
  x.globalAlpha = 1; const t = tex(THREE, renderer, c, true, [1 / 1.5, 1 / 1.5]);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: .5, metalness: 0, envMapIntensity: .8 }); m.name = 'terrazzoM'; return m;
}
function aoTexture(THREE) { const [c, x] = cnv(4, 128), g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, '#fff'); g.addColorStop(.25, '#8a8a8a'); g.addColorStop(.6, '#262626'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); }
function bandLevels() { const L = globalThis.__FLOORS?.levels; if (!Array.isArray(L) || !L.length) return [3.55];
  return L.map(l => typeof l === 'number' ? l : l.top ?? ((l.elevation ?? 0) + (l.height ?? 3.2) + .35)).filter(Number.isFinite).sort((a, b) => a - b); }

const PALETTES = [
  { n: 'أبيض ثلجي', render: '#f4f3ef', slab: '#faf9f6', trim: '#2a2d30', trimW: 0, warm: 0 },
  { n: 'جريج دافئ', render: '#e0d9cc', slab: '#eeeae1', trim: '#2f3235', trimW: 0, warm: 1 },
  { n: 'رمادي فاتح', render: '#d6d8d7', slab: '#ebecea', trim: '#f2f2f0', trimW: 1, warm: 0 },
  { n: 'عاجي', render: '#eee8da', slab: '#f6f3ec', trim: '#403a34', trimW: 0, warm: 1 },
];

export async function apply(THREE, { scene, renderer, S, q, FI, params }) {
  const R = k => params?.rnd ? params.rnd(k) : .5, seed = params?.seed | 0, night = q.get('night') === '1';
  // مقابض المنطقة المعمارية (variation.mjs): e موضع التركيز · r إيقاع الفتحات · t معالجة العنصر الرئيسي · p عمق البروز · c خط السقف
  const reg = params?.region || {}, bld = params?.building || {};
  const rg = { e: reg.e ?? Math.floor(R(2) * 4) % 4, r: reg.r ?? Math.floor(R(22) * 3) % 3, t: reg.t ?? Math.floor(R(21) * 3) % 3, p: reg.p ?? 1, c: reg.c ?? Math.floor(R(23) * 3) % 3 };
  const palQ = q.get('pal'), ornQ = q.get('orn');
  const PAL = PALETTES[((palQ != null && palQ !== '' && !isNaN(+palQ)) ? +palQ : (params?.palette ?? Math.floor(R(1) * 4))) % 4];
  const ORN = ornQ == null ? 1 : ({ light: 0, balanced: 1, ornate: 2 }[ornQ] ?? Math.max(0, Math.min(2, Math.round(+ornQ || 0)))); // مستوى الزخرفة
  const FEAT = Math.floor(R(2) * 3) % 3, FINS = R(5) < .5; // خامة الجدار المميّز · زعانف رأسية أم بريسولاي أفقي
  const MAXP = .25, PROJ = Math.min(.20, Math.max(.15, Number(q.get('proj') ?? ([.15, .17, .195][rg.p] + (R(3) - .5) * .01)))); // هامش أمان 4 سم لاختلاف وجوه الجدار الموضعية // سقف البروز 250 مم بوابة إلزامية
  const SLABMODE = rg.t === 2 ? 0 : 1 + (R(4) < .5 ? 0 : 1), PARAMODE = [0, 2, 1][rg.c];
  const HOODP = ([.35, .8, .12][rg.t]) * [.45, 1, 1.35][ORN], FEATFULL = rg.t === 2 ? true : R(9) < .5;
  const CD = Math.min(.21, PROJ + .005), JD = Math.min(.2, PROJ - .005); // مظلة رقيقة بلوح ≤25 سم؛ جناحا المدخل ملاصقان بعمق ≤24 سم
  const WING = rg.t === 0 && ORN > 0 ? 2 : rg.e === 1 ? 0 : rg.e === 2 ? 1 : (bld.symmetry > .7 ? 2 : Math.floor(R(11) * 3) % 3); // 0 يسار 1 يمين 2 كلاهما
  const ADDED = [], faceD = {}, snapRoles = new Set(['glazing', 'door', 'frame', 'wall', 'cladding']);
  const snap = () => S.meshes.filter(m => snapRoles.has(m.userData?.role)).map(m => { const b = new THREE.Box3().setFromObject(m); return [m.uuid, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; });
  const before = snap();
  const finish = () => { // تقييم البوابات بعد التطبيق: أقصى بروز بالمليمتر + عدم تغيّر الفتحات/الجدران
    let mp = 0, worst = null; for (const o of ADDED) { const side = o.userData.mz, [nx, nz] = SIDES[side] || [0, 0], b = new THREE.Box3().setFromObject(o);
      const dm = Math.max(b.max.x * nx, b.min.x * nx) + Math.max(b.max.z * nz, b.min.z * nz); let ref = faceD[side] ?? 0; if (side === 's' && SBK && dm - ref < -SBK / 2) ref -= SBK; if (dm - ref > mp) { mp = dm - ref; worst = { side, y0: +b.min.y.toFixed(2), y1: +b.max.y.toFixed(2), u: [b.min.x, b.max.x, b.min.z, b.max.z].map(v => +v.toFixed(2)), ref }; } }
    const after = snap(); let same = after.length === before.length; if (same) for (let i = 0; i < after.length; i++) for (let k = 0; k < 7; k++) if (k === 0 ? after[i][0] !== before[i][0] : Math.abs(after[i][k] - before[i][k]) > 1e-6) same = false;
    LAST = { maxProjectionMm: Math.round(mp * 1000), openingsUnchanged: same, notImplemented: NOT_IMPL, region: rg, orn: ORN, worst }; };
  const SBK = FI?.setback ? 1.75 : 0, FLtop = FI?.setback ? FI.levels[FI.n - 1] : Infinity, TOPY = FI?.top;
  for (const m of S.meshes) if (CLASSIC.has(m.userData?.role)) m.visible = false;

  const render = renderMat(THREE, renderer, PAL.render, 'stucco-M'), slabM = renderMat(THREE, renderer, PAL.slab, 'stucco-slab-M');
  const feat = FEAT === 0 ? concreteMat(THREE, renderer) : FEAT === 1 ? bronzeMat(THREE, renderer) : terrazzoMat(THREE, renderer, PAL.warm);
  const trim = new THREE.MeshStandardMaterial({ color: PAL.trim, metalness: PAL.trimW ? .25 : .55, roughness: PAL.trimW ? .45 : .36 }); trim.name = PAL.trimW ? 'frame-whiteM' : 'steel-blackJ';
  const alu = new THREE.MeshStandardMaterial({ color: PAL.trimW ? '#dcdcda' : '#8b8f93', metalness: .8, roughness: .32, envMapIntensity: 1 }); alu.name = 'aluminium-M';
  const led = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe2b0', emissiveIntensity: night ? 6 : 2.2 });
  const paving = new THREE.MeshStandardMaterial({ color: PAL.warm ? '#9d9488' : '#8e9091', roughness: .8 });
  const skins = []; const glassM = S.meshes.find(m => m.material?.name === 'glass')?.material;
  for (const m of S.meshes) { const u = m.userData || {};
    if (u.part === 'plate' || u.part === 'blocks' || u.part === 'wallcore' || u.role === 'wall' && !u.part) m.material = render;
    if ((u.part === 'plate' || u.part === 'wallcore') && SIDES[u.side]) { // قشرة جص ناعمة بوجه الكتل نفسه (إزاحة 2 سم = BLOCK.recess) بدل فواصل الكتل
      const [sx, sz] = SIDES[u.side], sk = new THREE.Mesh(m.geometry, render); sk.position.set(sx * .02, 0, sz * .02); sk.userData.mz = u.side; ADDED.push(sk); sk.castShadow = sk.receiveShadow = true; scene.add(sk); skins.push(sk); }
    if (u.role === 'frame') m.material = trim; }
  const AO = aoTexture(THREE), aoMat = a => new THREE.MeshBasicMaterial({ color: '#000', alphaMap: AO, transparent: true, opacity: a * (night ? .5 : 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const box = m => new THREE.Box3().setFromObject(m), levels = bandLevels(), up = new THREE.Vector3(0, 1, 0), BH = .30;
  let south = null;
  const mk = (o, cast = true) => { o.castShadow = cast; o.receiveShadow = true; scene.add(o); return o; };

  for (const [side, [nx, nz]] of Object.entries(SIDES)) {
    const sm = S.meshes.filter(m => m.userData?.side === side && m.visible); if (!sm.length) continue;
    const n = new THREE.Vector3(nx, 0, nz), t = new THREE.Vector3().crossVectors(up, n);
    const loc = b => { const us = [b.min.x * t.x + b.min.z * t.z, b.max.x * t.x + b.max.z * t.z], ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z];
      return { u0: Math.min(...us), u1: Math.max(...us), y0: b.min.y, y1: b.max.y, d0: Math.min(...ds), d1: Math.max(...ds) }; };
    const metric = (g, sx, sy, sz) => { const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]]; // px,nx,py,ny,pz,nz
      for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]); } uv.needsUpdate = true; };
    // صندوق بإحداثيات محلية: su على امتداد الجدار، sy رأسي، sd للخارج؛ opt: {tilt, m: إحداثيات UV بالمتر}
    const add = (su, sy, sd, mat, u, y, d, cast = true, opt) => { const sx = Math.abs(t.x) * su + Math.abs(n.x) * sd, sz = Math.abs(t.z) * su + Math.abs(n.z) * sd, g = new THREE.BoxGeometry(sx, sy, sz);
      if (opt?.m) metric(g, sx, sy, sz); const o = new THREE.Mesh(g, mat); o.position.copy(t.clone().multiplyScalar(u)).addScaledVector(n, d).setY(y);
      if (opt?.tilt) o.rotateOnAxis(t, opt.tilt); o.userData.mz = side; ADDED.push(o); return mk(o, cast); };
    const P = (u, y, d) => t.clone().multiplyScalar(u).addScaledVector(n, d).setY(y);
    const ao = (a, b, away, alpha) => { const A = P(...a), B = P(...b), w = new THREE.Vector3().addScaledVector(t, away[0]).addScaledVector(n, away[2]).setY(away[1]);
      const g = new THREE.BufferGeometry(), v = [A, B, B.clone().add(w), A.clone().add(w)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
      const o = new THREE.Mesh(g, aoMat(alpha)); o.renderOrder = 2; scene.add(o); };
    const walls = sm.filter(m => m.userData.role === 'wall' || m.userData.role === 'cladding').map(m => loc(box(m))); if (!walls.length) continue;
    const wallD = Math.max(...walls.map(w => w.d1)), face = walls.filter(w => w.d1 > wallD - .1);
    const X0 = Math.min(...face.map(w => w.u0)), X1 = Math.max(...face.map(w => w.u1)), topAll = Math.max(...face.map(w => w.y1));
    faceD[side] = wallD; const isS = side === 's', sbk = isS ? SBK : 0;
    // القمة الأمامية: مع الارتداد يصير الواجهة الأمامية ممتدة حتى FLtop+0.25 فقط، والحجم العلوي مرتد
    const frontTop = sbk ? FLtop + .25 : topAll, rr = hash01.bind(null);
    const bands = levels.filter(y => y + BH < topAll - .05);
    const dOf = m => { const f = sm.find(x => x.userData.role === 'frame' && x.userData.opening === m.userData.opening); return loc(box(f || m)).d1; };
    const gl = sm.filter(m => m.userData.role === 'glazing').map(m => ({ m, b: loc(box(m)), d: dOf(m) })), doors = sm.filter(m => m.userData.role === 'door').map(m => ({ m, b: loc(box(m)), d: dOf(m) }));
    const dFor = y => (sbk && y > FLtop + .3) ? wallD - sbk : wallD; // وجه الجدار المعني بالارتفاع y
    // --- شاشة: زعانف ألمنيوم رأسية أو بريسولاي أفقي أمام مستطيل ---
    const screen = (u0, u1, y0, y1, d, fins) => { const w = u1 - u0, h = y1 - y0, dd = d + .13;
      add(w, .04, .08, alu, (u0 + u1) / 2, y1, dd, false); add(w, .04, .08, alu, (u0 + u1) / 2, y0, dd, false);
      if (fins) { const step = .15, nF = Math.floor(w / step); for (let i = 0; i <= nF; i++) add(.035, h, .12, alu, u0 + (w - nF * step) / 2 + i * step, (y0 + y1) / 2, dd); }
      else { const step = .1, nL = Math.floor(h / step); for (let i = 0; i <= nL; i++) add(w, .018, .11, alu, (u0 + u1) / 2, y0 + (h - nL * step) / 2 + i * step, dd, true, { tilt: -.55 }); } };
    // --- معالجة كل نافذة ---
    let bigWin = null; for (const g of gl) if (g.b.u1 - g.b.u0 >= .9 && (!bigWin || (g.b.u1 - g.b.u0) * (g.b.y1 - g.b.y0) > (bigWin.b.u1 - bigWin.b.u0) * (bigWin.b.y1 - bigWin.b.y0))) bigWin = g;
    const winZones = gl.map(g => [g.b.u0, g.b.u1]);
    // تجميع النوافذ الكبيرة حسب إيقاع المنطقة r: 0 منتظم (كل نافذة وحدها) · 1 مزدوج (أزواج متجاورة) · 2 مجمّع (عناقيد متقاربة). التجميع تأطير فقط بلا تغيير فتحة.
    const big = gl.filter(g => g.b.u1 - g.b.u0 >= .85).sort((a, b) => a.b.u0 - b.b.u0), groups = [];
    for (const g of big) { const last = groups[groups.length - 1], gap = last ? g.b.u0 - last[last.length - 1].b.u1 : 1e9, same = last && Math.abs(g.b.y0 - last[0].b.y0) < .35;
      if (last && same && ((rg.r === 1 && last.length < 2 && gap < 1.4) || (rg.r === 2 && gap < 1.8))) last.push(g); else groups.push([g]); }
    const BOXP = [0, .28, .4][ORN];
    for (const grp of groups) { const g0 = grp[0], d = g0.d, key = rr(String(g0.m.userData.opening) + side + seed);
      const u0 = Math.min(...grp.map(g => g.b.u0)), u1 = Math.max(...grp.map(g => g.b.u1)), y0 = Math.min(...grp.map(g => g.b.y0)), y1 = Math.max(...grp.map(g => g.b.y1)), cx = (u0 + u1) / 2, w = u1 - u0;
      for (const { b } of grp) { const bw = b.u1 - b.u0, bh = b.y1 - b.y0, nV = Math.ceil(bw / 1.6) - 1; for (let i = 1; i <= nV; i++) add(.035, bh, .05, trim, b.u0 + bw * i / (nV + 1), (b.y0 + b.y1) / 2, b.d1 + .03, false); }
      const doScreen = isS && grp.length === 1 && bigWin === g0 && R(6) < (rg.t === 1 ? .9 : .5) && w <= 3.0 && y0 > .3;
      if (doScreen) screen(u0 - .05, u1 + .05, y0 - .03, y1 + .03, d, FINS);
      else if (key < HOODP) { // مظلة أفقية رقيقة (≤ PROJ) فوق النافذة/المجموعة بعرض أكبر منها
        add(w + .5, .06, PROJ, slabM, cx, y1 + .1, d + PROJ / 2); add(w + .5, .02, .02, led, cx, y1 + .068, d + PROJ - .03, false);
        ao([u0 - .25, y1 + .07, d + .003], [u1 + .25, y1 + .07, d + .003], [0, -.28, 0], .35);
      } else if (key < HOODP + BOXP) { // إطار جصّي بارز حول النافذة أو حول المجموعة كلها (تأطير فقط)
        const th = .09, x0 = u0 - th, x1 = u1 + th, yy0 = y0 - th, yy1 = y1 + th, dp = PROJ * .85;
        add(x1 - x0, th, dp, slabM, (x0 + x1) / 2, yy1 - th / 2, d + dp / 2); add(x1 - x0, th, dp, slabM, (x0 + x1) / 2, yy0 + th / 2, d + dp / 2);
        add(th, yy1 - yy0 - 2 * th, dp, slabM, x0 + th / 2, (yy0 + yy1) / 2, d + dp / 2); add(th, yy1 - yy0 - 2 * th, dp, slabM, x1 - th / 2, (yy0 + yy1) / 2, d + dp / 2);
        ao([x0, yy0, d + .003], [x1, yy0, d + .003], [0, -.12, 0], .3);
      } else if (y0 > .3) add(w + .06, .035, .1, slabM, cx, y0 - .02, d + .05); // عتبة رفيعة فقط
      ao([u0, y1, d + .003], [u1, y1, d + .003], [0, -.1, 0], .22); }
    for (const g of gl) { const { b, d } = g, w = b.u1 - b.u0; if (w >= .85) continue; const cx = (b.u0 + b.u1) / 2, key = rr(String(g.m.userData.opening) + side + seed); // نافذة صغيرة
      add(w + .1, .035, .1, slabM, cx, b.y0 - .02, d + .05); if (key < .5 * [.5, 1, 1.4][ORN]) add(w + .2, .05, PROJ * .8, slabM, cx, b.y1 + .06, d + PROJ * .4); }
    // --- الأبواب: مظلة عميقة وجناحان وأرضية ---
    const doorZones = [];
    for (const { b, d } of doors) { const w = b.u1 - b.u0, cx = (b.u0 + b.u1) / 2, ext = (rg.t === 0 ? .7 : .35) + R(12) * .3, cw = w + ext * 2, cdep = CD, yC = Math.min(b.y1 + .32, (bands[0] ?? 3.55) - .22);
      doorZones.push([cx - cw / 2 - .1, cx + cw / 2 + .1]);
      // مدخل ملاصق بلا بروز عميق: لوح مظلة رقيق 25 سم كحدّ أقصى + شق إنارة + أجنحة ملاصقة ≤ 24 سم + ظل تماس يوحي بالعمق
      add(cw, .14, cdep, slabM, cx, yC, d + cdep / 2); add(cw - .04, .02, cdep - .04, trim, cx, yC - .079, d + cdep / 2, false);
      add(cw - .2, .02, .02, led, cx, yC - .09, d + cdep - .05, false);
      for (let i = 0; i < 3; i++) add(.09, .015, .09, led, cx + (i - 1) * Math.max(.5, cw / 3.6), yC - .092, d + cdep * .5, false);
      ao([cx - cw / 2, yC - .07, d + .003], [cx + cw / 2, yC - .07, d + .003], [0, -.4, 0], .42);
      add(cw + .3, .02, CD, paving, cx, .01, d + CD / 2, false);
      for (const sgn of [-1, 1]) { const use = WING === 2 || (WING === 0 && sgn < 0) || (WING === 1 && sgn > 0); if (!use) continue;
        add(.26, yC + .07, JD, feat, cx + sgn * (cw / 2 + .13), (yC + .07) / 2, d + JD / 2, true, { m: true });
        ao([cx + sgn * (cw / 2), 0, d + .003], [cx + sgn * (cw / 2), yC - .07, d + .003], [-sgn * .35, 0, 0], .4); }
      ao([b.u0 - ext, 0, d + .002], [b.u1 + ext, 0, d + .002], [0, .0, .25], .35); }
    // --- حواف البلاطات (كابولي رقيق) ---
    const segs = []; // [u0,u1,proj]
    const slabAt = (yb, dFace, idx) => { const h = [.26, .22, .15][SLABMODE] + (SLABMODE === 2 ? 0 : 0), yTop = yb + BH, yc = yTop - h / 2;
      if (SLABMODE === 1) { const sp = X0 + (X1 - X0) * (.38 + R(13) * .26), pa = Math.min(.205, PROJ + .01), pb = Math.max(.15, PROJ - .05);
        add(sp - X0 + .01, h, pa, slabM, (X0 + sp) / 2, yc, dFace + pa / 2); add(X1 - sp + .01, h, pb, slabM, (sp + X1) / 2, yc, dFace + pb / 2);
        add(.02, h, .01, trim, sp, yc, dFace + Math.max(pa, pb) + .004, false);
      } else add(X1 - X0 + .02, h, PROJ, slabM, (X0 + X1) / 2, yc, dFace + PROJ / 2);
      if (SLABMODE === 2) add(X1 - X0 - .04, .03, PROJ - .06, trim, (X0 + X1) / 2, yTop - h - .015, dFace + (PROJ - .06) / 2); // فاصل ظل داكن تحت الحافة
      add(X1 - X0 - .3, .014, .014, led, (X0 + X1) / 2, yTop - h - (SLABMODE === 2 ? .04 : .004), dFace + PROJ - .05, false); // شق الإنارة الخطي في الجانب السفلي
      ao([X0, yTop - h, dFace + .003], [X1, yTop - h, dFace + .003], [0, -.3, 0], .36); ao([X0, yTop, dFace + .003], [X1, yTop, dFace + .003], [0, .12, 0], .2); };
    for (const yb of bands) slabAt(yb, dFor(yb + BH), 0);
    // --- الدروة العلوية ---
    const parapet = (yTop, dFace, X0_, X1_, isUpper) => { const W = X1_ - X0_, c = (X0_ + X1_) / 2;
      if (PARAMODE === 0) { add(W + .02, .06, PROJ, trim, c, yTop + .03, dFace + PROJ / 2 - .02); } // غطاء معدني رفيع يبرز
      else if (PARAMODE === 1) { add(W + .02, .30, PROJ, slabM, c, yTop - .12, dFace + PROJ / 2); add(W - .2, .014, .014, led, c, yTop - .272, dFace + PROJ - .04, false); add(W + .02, .05, PROJ - .02, trim, c, yTop + .055, dFace + PROJ / 2 - .01); ao([X0_, yTop - .27, dFace + .003], [X1_, yTop - .27, dFace + .003], [0, -.3, 0], .3); }
      else { add(W + .02, .22, .06, slabM, c, yTop - .07, dFace + .03); add(W + .06, .035, PROJ, slabM, c, yTop + .02, dFace + PROJ / 2);
        if (rg.c === 1) { const sw = W * (.3 + R(24) * .2), left = R(25) < .5; add(sw, .2, PROJ * .8, slabM, left ? X0_ + sw / 2 : X1_ - sw / 2, yTop + .13, dFace + PROJ * .4); } add(W, .012, .012, trim, c, yTop - .19, dFace + .06, false); } };
    const topBand = bands.length ? bands[bands.length - 1] + BH : 3.85;
    if (sbk) { parapet(frontTop, wallD, X0, X1, false); const lo = FLtop + .3; if (TOPY - lo > .2 && X1 - X0 > 2) parapet(TOPY, wallD - sbk, X0 + .1, X1 - .1, true); }
    else parapet(topAll, wallD, X0, X1, false);
    // شاشة حديثة في جزء الدروة بين الشريط الأخير والقمة (بريسولاي/زعانف) في وضع الدروة 2 فقط، فوق المنطقة الحرة
    const pTop = sbk ? TOPY : topAll, pBase = sbk ? FLtop + .3 : topBand, dP = sbk ? wallD - sbk : wallD;
    if (pTop - pBase > .5 && PARAMODE !== 0 && (X1 - X0) > 3) { const uw = (X1 - X0) * (.3 + R(14) * .25), us = R(15) < .5 ? X0 + .3 : X1 - .3 - uw; screen(us, us + uw, pBase + .12, Math.min(pTop - .35, pBase + 1.5), dP, !FINS); }
    // --- التماس مع الأرض ---
    add(X1 - X0, .08, .012, trim, (X0 + X1) / 2, .04, wallD + .006, false);
    ao([X0, .003, wallD], [X1, .003, wallD], [0, 0, .55], .5); ao([X0, 0, wallD + .003], [X1, 0, wallD + .003], [0, .4, 0], .3);
    // أطراف الجدار الرأسية: عمود زاوية بخطوط ظل
    if (isS) south = { X0, X1, top: topAll, wallD, doors, bands, add, winZones, doorZones, frontTop, ao, sm, loc, gl, dP };
  }
  if (!south) { finish(); return {}; }
  const { X0, X1, wallD, add, winZones, doorZones, frontTop } = south;
  // --- الجدار المميّز (خامة واحدة متباينة) في أكبر فراغ حر بلا فتحات ---
  const blocked = [...winZones.map(z => [z[0] - .35, z[1] + .35]), ...doorZones].sort((a, b) => a[0] - b[0]);
  const free = []; let cur = X0 + .15; for (const [a, b] of blocked) { if (a - cur >= 1.0) free.push([cur, a]); cur = Math.max(cur, b); } if (X1 - .15 - cur >= 1.0) free.push([cur, X1 - .15]);
  if (free.length) { // موضع الجدار المميّز حسب e: 0 وسط (أقرب فراغ للمنتصف) · 1 يسار · 2 يمين · 3 زوايا (شريطان طرفيان)
    const mid = (X0 + X1) / 2, byC = free.slice().sort((a, b) => Math.abs((a[0] + a[1]) / 2 - mid) - Math.abs((b[0] + b[1]) / 2 - mid)), byU = free.slice().sort((a, b) => a[0] - b[0]);
    const picks = rg.e === 1 ? [[byU[0], 0]] : rg.e === 2 ? [[byU[byU.length - 1], 1]] : rg.e === 3 ? (byU.length > 1 ? [[byU[0], 0], [byU[byU.length - 1], 1]] : [[byU[0], R(26) < .5 ? 0 : 1]]) : [[byC[0], .5]];
    const baseW = ([1.4, 2.2, 3.4][rg.t] + R(17) * 1.0) * (bld.solidVoid > .88 ? 1.2 : 1) * (rg.e === 3 ? .5 : 1);
    for (const [pick, pos] of picks) { const fw = Math.min(pick[1] - pick[0], baseW), fu0 = pick[0] + (pick[1] - pick[0] - fw) * pos;
      const hTop = FEATFULL ? frontTop : Math.min(frontTop, south.bands[0] ?? frontTop), fp = Math.min(.14, .08 + R(19) * .06);
      add(fw, hTop - .08, fp, feat, fu0 + fw / 2, (hTop - .08) / 2 + .04, wallD + fp / 2, true, { m: true });
      south.ao([fu0, .003, wallD + fp], [fu0 + fw, .003, wallD + fp], [0, 0, .45], .45);
      for (const yb of south.bands) if (yb < hTop) south.ao([fu0, yb, wallD + fp + .003], [fu0 + fw, yb, wallD + fp + .003], [0, -.25, 0], .3); }
  }
  // --- إنارة ليلية موضعية ---
  if (night) {
    for (const { b, d } of south.doors) { const cx = (b.u0 + b.u1) / 2, L = new THREE.SpotLight('#ffd9a0', 7, 5, 1.2, .6, 2); L.position.set(cx, 2.8, d + .3); L.target.position.set(cx, 0, d + .6); scene.add(L, L.target); }
    for (const yb of south.bands) for (let x = X0 + .9; x < X1; x += 2.2) { const L = new THREE.SpotLight('#ffe2b0', 2.2, 4.5, 1.1, .9, 2); L.position.set(x, yb + BH - .3, wallD + PROJ - .05); L.target.position.set(x, yb - 2, wallD + .05); scene.add(L, L.target); }
  }
  for (const m of S.meshes) if (m.userData?.part === 'blocks') m.visible = false; // الكتل مخفية بعد حساب الأبعاد؛ القشرة الملساء تحلّ محلها
  finish();
  return { wallZ: wallD, X0, X1 };
}
