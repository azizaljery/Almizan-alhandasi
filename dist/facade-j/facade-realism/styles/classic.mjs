// نمط C (كلاسيكي): نيوكلاسيكي خليجي/سعودي: ملاط كريمي أو أبيض بحليات بيضاء، أعمدة جدارية (بيلاستر) مخدّدة بتيجان، أطر نوافذ بمفاتيح عقد وأقواس،
// جملون (جبهة) فوق المدخل، كورنيش ثقيل بأسنان/كوابيل ودرابزين (أو دروة مصمتة بحشوات)، حجارة زاوية (quoins)، قاعدة حجرية، ألواح خشب أو حديد مشغول للأبواب، إنارة جدارية دافئة.
// لا يُحرَّك جدار ولا فتحة ولا منسوب: كل الإضافات أمام وجه الجدار فقط وبروزها 15–25 سم (الأعمدة الجدارية 13–19 سم، الكورنيش 25 سم، الجملون 20 سم).
// درج المدخل (ارتفاع 45 سم عند أرض الباب) يبرز 25 سم كحد أقصى (درجتان ضيقتان) التزامًا بالحد 250 مم.
// المراجع (بحث ويب مختصر، 2026-11-05):
//  - نسب الأوامر: ارتفاع العمود/القطر: توسكان 7، دوري 8، أيوني 9، كورنثي 10، مركّب 10، والإفريز المعماري (الأنتابلتشر) ربع ارتفاع العمود تقريبًا (م. روشيل، Traditional Building: https://www.traditionalbuilding.com/opinions/tuscan-column). الكورنثي 10:1 أيضًا: https://www.designingbuildings.co.uk/wiki/Classical Orders
//  - ارتفاع الجملون: فيتروفيوس: ارتفاع التمبانوم = 1/9 من البحر (https://chestofbooks.com/architecture/Cyclopedia-Carpentry-Building-7-10/Roman-Pediments.html)؛ الجملون الروماني الأشدّ ميلًا حتى ~1/5 من البحر: «غير متحقق».
//  - نسبة بروز الكورنيش وتقسيماته (أسنان وكوابيل وكورونا): قاعدة عامة من الممارسة الكلاسيكية، لم تُوثَّق بمصدر ويب محدد: «غير متحقق».
// الخامات كلها إجرائية (Canvas) بلا أصول خارجية.
export const meta = { id: 'C', ar: 'كلاسيكي', sources: [
  'https://www.traditionalbuilding.com/opinions/tuscan-column',
  'https://www.designingbuildings.co.uk/wiki/Classical Orders',
  'https://chestofbooks.com/architecture/Cyclopedia-Carpentry-Building-7-10/Roman-Pediments.html',
] };

import { resolveTemplate } from '../templates.mjs';
import { docTransform as txDoc, validateDoc } from './templates-C/transform.mjs';
import { templates as TPLS } from './templates-C/list.mjs';
export const templates = TPLS;
meta.templateCount = templates.length;
/** تحويل المستند حسب القالب (يُستدعى قبل بناء النموذج فقط عند وجود tpl). إن فشل التحقق الذاتي يُعاد المستند الأصلي. */
const qT = q => ({ get: k => k === 'tpl' ? ((q.get('tpl') || '').trim().replace(/\s+/g, '+') || null) : q.get(k) }); // '+' في الرابط يُفكّ إلى فراغ: نقبل الشكلين
export function docTransform(doc, q) {
  const t = resolveTemplate(templates, qT(q)); if (!t) return doc;
  let nd; try { nd = txDoc(doc, t.p, q); } catch (e) { console.error('C_TX_FAIL', e?.message); return doc; }
  const err = validateDoc(nd, doc); globalThis.__C_TX = { tpl: t.id, errors: err }; if (err.length) { console.error('C_TX_INVALID', t.id, err.join(';')); return doc; }
  return nd;
}
let lastGates = { maxProjectionMm: null, openingsUnchanged: null, notImplemented: [] };
export const gates = () => lastGates;
const CLASSIC_ROLES = new Set(['projection', 'surround', 'cornice', 'sill', 'pediment']);
const SIDES = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
const BH = .30; // ارتفاع شريط البلاطة (3.55–3.85)
const PLINTH = .56; // أعلى القاعدة الحجرية
const ARCH = .34; // ارتفاع الأعتاب المعمارية تحت الكورنيش
function bandLevels() { const L = globalThis.__FLOORS?.levels; if (!Array.isArray(L) || !L.length) return [3.55];
  return L.map(l => typeof l === 'number' ? l : l.top ?? ((l.elevation ?? 0) + (l.height ?? 3.2) + .35)).filter(Number.isFinite).sort((a, b) => a - b); }

/* ---------- أدوات خامات (Canvas) ---------- */
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const mulberry = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const tex = (THREE, renderer, c, srgb, rep) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = a => '#' + a.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
/** ملاط: لون أساس + حبيبات + بقع منخفضة التردد (بقع ملفوفة فلا تظهر خطوط)، خريطة نتوء ناعمة. */
function plasterMat(THREE, renderer, hexc, { rep = .5, blot = .06, grain = 10, rough = .88, seed = 1 } = {}) {
  const S = 512, [c, x] = cnv(S, S), [b, bx] = cnv(S, S), r = mulberry(seed), [R, G, B] = hex2rgb(hexc);
  x.fillStyle = `rgb(${R},${G},${B})`; x.fillRect(0, 0, S, S); bx.fillStyle = '#808080'; bx.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) { const px = r() * S, py = r() * S, rad = 30 + r() * 90, col = r() < .5 ? '90,80,60' : '255,252,244';
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const X = px + ox, Y = py + oy; if (X + rad < 0 || X - rad > S || Y + rad < 0 || Y - rad > S) continue;
      const g = x.createRadialGradient(X, Y, 0, X, Y, rad); g.addColorStop(0, `rgba(${col},${blot})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(X - rad, Y - rad, rad * 2, rad * 2); } }
  const img = x.getImageData(0, 0, S, S), d = img.data, bi = bx.getImageData(0, 0, S, S), bd = bi.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * grain; d[i] += n; d[i + 1] += n; d[i + 2] += n; const v = 128 + (r() - .5) * 90; bd[i] = bd[i + 1] = bd[i + 2] = v; }
  x.putImageData(img, 0, 0); bx.putImageData(bi, 0, 0);
  return new THREE.MeshStandardMaterial({ map: tex(THREE, renderer, c, true, [rep, rep]), bumpMap: tex(THREE, renderer, b, false, [rep * 2, rep * 2]), bumpScale: .25, roughness: rough, metalness: 0, envMapIntensity: .55 });
}
/** حجر القاعدة: مداميك 55 سم بوصلات رأسية بإزاحة، تدرّج لوني لكل حجر. */
function stoneMat(THREE, renderer, hexc, seed = 3) {
  const S = 1024, [c, x] = cnv(S, S), r = mulberry(seed), [R, G, B] = hex2rgb(hexc), rows = 3, bw = S / 2; // البلاطة 1.6×1.65 م: 3 مداميك، حجران لكل مدماك
  x.fillStyle = `rgb(${R * .62 | 0},${G * .62 | 0},${B * .62 | 0})`; x.fillRect(0, 0, S, S);
  for (let ry = 0; ry < rows; ry++) { const off = (ry & 1) * bw / 2, y0 = ry * S / rows;
    for (let k = -1; k < 3; k++) { const t = 1 + (r() - .5) * .14, x0 = k * bw + off;
      const g = x.createLinearGradient(0, y0, 0, y0 + S / rows); g.addColorStop(0, `rgb(${R * t | 0},${G * t | 0},${B * t | 0})`); g.addColorStop(1, `rgb(${R * t * .93 | 0},${G * t * .93 | 0},${B * t * .92 | 0})`);
      x.fillStyle = g; x.fillRect(x0 + 3, y0 + 3, bw - 6, S / rows - 6); } }
  const img = x.getImageData(0, 0, S, S), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n; } x.putImageData(img, 0, 0);
  return new THREE.MeshStandardMaterial({ map: tex(THREE, renderer, c, true, [1 / 1.6, 1 / 1.65]), roughness: .82, metalness: 0, envMapIntensity: .5 });
}
/** خشب جوز مصقول بألياف. */
function walnutMat(THREE, renderer, hexc) {
  const W = 256, H = 512, [c, x] = cnv(W, H), r = mulberry(11), [R, G, B] = hex2rgb(hexc), img = x.createImageData(W, H), d = img.data;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const u = px / W, v = py / H, k = .8 + .09 * Math.sin((u * 46 + 2.2 * Math.sin(v * 3.5 + u * 2) + .6 * Math.sin(v * 17)) * Math.PI) + (r() - .5) * .07, i = (py * W + px) * 4;
    d[i] = R * k; d[i + 1] = G * k; d[i + 2] = B * k; d[i + 3] = 255; }
  x.putImageData(img, 0, 0); return new THREE.MeshStandardMaterial({ map: tex(THREE, renderer, c, true, [1, 1]), roughness: .5, metalness: .05 });
}
function aoTexture(THREE) { const [c, x] = cnv(4, 128), g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, '#fff'); g.addColorStop(.25, '#8a8a8a'); g.addColorStop(.6, '#262626'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); }

/* ---------- نقطة الدخول ---------- */
export async function apply(THREE, { scene, renderer, S, q, doc, FI, params }) {
  const night = q.get('night') === '1';
  const seed = (params?.seed ?? 0) | 0, rk = mulberry(Math.imul(seed + 7919, 2654435761) >>> 0), RR = []; for (let i = 0; i < 40; i++) RR.push(typeof params?.rnd === 'function' ? params.rnd(i + 31) : rk());
  const R = k => RR[k % 40], pick = (k, a) => a[Math.min(a.length - 1, Math.floor(R(k) * a.length))];
  /* --- تركيبة هذا التصميم (تتغيّر مع البذرة) --- */
  const PALS = [
    { n: 'كريمي', wall: '#eadfc6', trim: '#f6f2e8', base: '#b8ab94', groove: '#a39880' },
    { n: 'أبيض', wall: '#f2efe8', trim: '#fcfbf7', base: '#c9c3b8', groove: '#b5afa4' },
    { n: 'بيج', wall: '#d8c6a3', trim: '#efe6d3', base: '#9d8e77', groove: '#8e7f69' },
    { n: 'أصفر مغرة', wall: '#dcb872', trim: '#f4ecd8', base: '#a38e68', groove: '#8a7650' },
    { n: 'وردي طيني', wall: '#d5a48c', trim: '#f6ebdf', base: '#9a7d6b', groove: '#876b5a' },
    { n: 'رمادي حجري', wall: '#cdc9bf', trim: '#f7f6f2', base: '#8f8a80', groove: '#7d786e' },
    { n: 'أخضر مريمية', wall: '#c4cbb0', trim: '#f5f3e8', base: '#8d8f7c', groove: '#7b7d6b' },
    { n: 'أزرق رمادي', wall: '#b9c5c9', trim: '#f6f7f5', base: '#868e91', groove: '#747c80' }];
  const TP = resolveTemplate(templates, qT(q)), TPP = TP?.p || null;
  const PAL = TPP ? PALS[TPP.pal % PALS.length] : pick(1, PALS.slice(0, 3));
  const CFG = {
    pal: PAL.n,
    order: pick(2, ['ionic', 'composite', 'tuscan']),
    fluted: R(3) < .75,
    corners: R(4) < .55 ? 'quoin' : 'pilaster',
    rhythm: pick(5, [2.7, 3.6]),
    head: pick(6, ['flat', 'segmental', 'round', 'mixed']),
    hood: R(7) < .6,
    pediment: pick(8, ['tri', 'seg']),
    parapet: R(9) < .55 ? 'balustrade' : 'panel',
    door: pick(10, ['wood', 'iron', 'carved']),
    rustic: R(11) < .5,
    apron: R(12) < .6,
    frame: R(13) < .5 ? 'white' : 'bronze',
    finials: R(14) < .6,
    dentils: R(15) < .55,
    engaged: R(16) < .35, // أعمدة نصف دائرية عند المدخل بدل البيلاستر
    ent: 0, giant: false, attic: false, bal: 0, shut: false, slim: false, modil: false,
  };
  // مستوى الزخرفة (cl=light|balanced|ornate، الافتراضي balanced): الترتيب والتناسب أولًا ثم الزخرفة؛ لا يتحول كل بيت إلى قصر
  const LEVEL = ['light', 'balanced', 'ornate'].includes(q.get('cl')) ? q.get('cl') : 'balanced'; CFG.level = LEVEL;
  if (LEVEL === 'light') Object.assign(CFG, { corners: 'quoin', head: 'flat', hood: false, parapet: 'panel', rustic: false, apron: false, finials: false, dentils: false, rhythm: 99, quoinsOn: false, pilastersOn: false });
  else if (LEVEL === 'balanced') Object.assign(CFG, { rustic: CFG.rustic && R(20) < .5, finials: false, rhythm: Math.max(CFG.rhythm, 3.2), quoinsOn: true, pilastersOn: true });
  else Object.assign(CFG, { finials: true, dentils: true, apron: true, hood: true, rhythm: Math.min(CFG.rhythm, 2.7), quoinsOn: true, pilastersOn: true });
  if (TPP) { const P = TPP; // قالب: كل المفاتيح اختيارات منفصلة تُحوَّل هنا إلى إعدادات الطراز (وتحل محل السحب العشوائي كله)
    Object.assign(CFG, { pal: PAL.n, level: 'tpl:' + TP.id, order: ['tuscan', 'doric', 'ionic', 'composite'][P.order], fluted: !!P.fluted,
      corners: ['quoin', 'pilaster', 'quoin'][P.corners], quoinsOn: P.corners !== 2, pilastersOn: P.bays > 0 || P.giant === 1, rhythm: [99, 2.7, 3.6, 4.8][P.bays],
      head: ['flat', 'segmental', 'round', 'mixed', 'tri', 'alt'][P.head], hood: !!P.hood, pediment: ['tri', 'seg', 'none'][P.ped], parapet: ['balustrade', 'panel', 'plain'][P.para],
      door: ['wood', 'iron', 'carved'][P.door], rustic: !!P.rust, apron: !!P.apron, frame: ['white', 'bronze'][P.frame], finials: !!P.fin, dentils: P.cor === 1, modil: P.cor === 2, slim: P.cor === 0,
      engaged: P.ent === 1, ent: P.ent, giant: !!P.giant, attic: !!P.attic, bal: P.bal, shut: !!P.shut }); }
  // تجاوز للاختبار فقط: cfg=door:iron,order:ionic,rustic:1,head:round (قيم منطقية 1/0)
  for (const kv of (q.get('cfg') || '').split(',')) { const [k, v] = kv.split(':'); if (k in CFG && v !== undefined) CFG[k] = typeof CFG[k] === 'boolean' ? v === '1' : (typeof CFG[k] === 'number' ? Number(v) : v); }
  globalThis.__CLASSIC_CFG = CFG; // للتشخيص والتقارير
  const wallMat = plasterMat(THREE, renderer, PAL.wall, { rep: .5, blot: .07, grain: 9, seed: 5 + (seed & 255) });
  const trim = plasterMat(THREE, renderer, PAL.trim, { rep: 1, blot: .035, grain: 6, rough: .8, seed: 9 + (seed & 255) });
  const recess = plasterMat(THREE, renderer, rgb2hex(hex2rgb(PAL.wall).map(v => v * .86)), { rep: 1, blot: .03, grain: 6, seed: 13 });
  const stone = stoneMat(THREE, renderer, PAL.base, 3 + (seed & 255));
  const groove = new THREE.MeshStandardMaterial({ color: PAL.groove, roughness: 1 });
  const iron = new THREE.MeshStandardMaterial({ color: '#1b1a19', metalness: .7, roughness: .4 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b8903f', metalness: .9, roughness: .32 });
  const walnut = walnutMat(THREE, renderer, CFG.door === 'carved' ? '#4a2e1c' : '#5d3b25');
  const glassD = new THREE.MeshStandardMaterial({ color: '#10181d', metalness: .3, roughness: .12, envMapIntensity: 1.2 }), glassL = new THREE.MeshStandardMaterial({ color: '#8aa0a6', metalness: .25, roughness: .12, envMapIntensity: 1.3 });
  const frameMat = new THREE.MeshStandardMaterial({ color: CFG.frame === 'white' ? '#f3f1ea' : '#3b2a1f', roughness: .5, metalness: CFG.frame === 'white' ? 0 : .35 });
  const shutMat = new THREE.MeshStandardMaterial({ color: CFG.frame === 'white' ? '#56664d' : '#5a3d2a', roughness: .6 }), shutDark = new THREE.MeshStandardMaterial({ color: CFG.frame === 'white' ? '#3b4934' : '#3e2a1d', roughness: .8 });
  const led = new THREE.MeshStandardMaterial({ color: '#fff1d2', emissive: '#ffd890', emissiveIntensity: night ? 6 : 1.6 });
  const lampGlass = new THREE.MeshStandardMaterial({ color: '#fff2d6', emissive: '#ffd58a', emissiveIntensity: night ? 7 : 1.1, roughness: .3 });
  const AO = aoTexture(THREE), aoMat = a => new THREE.MeshBasicMaterial({ color: '#000', alphaMap: AO, transparent: true, opacity: a * (night ? .5 : 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  const TRUTH = new Set(['wall', 'cladding', 'frame', 'glazing', 'door']), snap = () => S.meshes.filter(m => TRUTH.has(m.userData?.role)).map(m => { const b = new THREE.Box3().setFromObject(m); return m.uuid + ':' + [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => v.toFixed(4)).join(','); }).join('|');
  const before = snap();
  // إخفاء طبقات الكلاسيك الأساسية (نُعيد بناءها هنا بتحكم كامل) وبلاطات الحجر؛ الجدار يصير ملاطًا
  for (const m of S.meshes) { const u = m.userData || {}; if (CLASSIC_ROLES.has(u.role)) m.visible = false;
    if (u.part === 'blocks') m.visible = false; if (u.part === 'plate' || u.part === 'wallcore') m.material = wallMat;
    if (u.role === 'frame') m.material = frameMat; }

  /* --- تجميع الهندسة المدمجة لكل خامة --- */
  const buckets = new Map(), insts = [], V = new THREE.Vector3(), NV = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function put(mat, g, M, loc, grp) {
    if (loc) g.applyMatrix4(loc); const gg = g.index ? g.toNonIndexed() : g, p = gg.attributes.position, nr = gg.attributes.normal;
    const bk = mat.uuid + '|' + (grp ? grp.side + grp.id : ''); let b = buckets.get(bk); if (!b) { b = { mat, pos: [], nor: [], uv: [] }; buckets.set(bk, b); } // دلو لكل (خامة، مجموعة جدار): حتى لا يمتد صندوق الإحاطة عبر أعماق مختلفة
    for (let i = 0; i < p.count; i++) { V.fromBufferAttribute(p, i); NV.fromBufferAttribute(nr, i);
      const ax = Math.abs(NV.x), ay = Math.abs(NV.y), az = Math.abs(NV.z);
      if (az >= ax && az >= ay) b.uv.push(V.x, V.y); else if (ax >= ay) b.uv.push(V.z, V.y); else b.uv.push(V.x, V.z);
      V.applyMatrix4(M); NV.transformDirection(M); b.pos.push(V.x, V.y, V.z); b.nor.push(NV.x, NV.y, NV.z); }
    g.dispose(); if (gg !== g) gg.dispose();
  }
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

  /* --- هندسات محلية: (u,y,d) --- */
  const boxG = (u0, u1, y0, y1, d0, d1) => { const g = new THREE.BoxGeometry(u1 - u0, y1 - y0, d1 - d0); g.translate((u0 + u1) / 2, (y0 + y1) / 2, (d0 + d1) / 2); return g; };
  /** مجسّم مدبّب: قاعدة سفلى بعرض wb وبروز db، وعليا بعرض wt وبروز dt، من الظهر d0. */
  const taper = (uc, y0, y1, wb, wt, d0, db, dt) => { const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), top = vy > 0, w = top ? wt : wb, df = top ? dt : db;
      p.setXYZ(i, uc + vx * w, y0 + (vy + .5) * (y1 - y0), d0 + (vz + .5) * (df - d0)); }
    g.computeVertexNormals(); return g; };
  const cylD = (uc, yc, dc, rad, len, segs = 14) => { const g = new THREE.CylinderGeometry(rad, rad, len, segs); g.rotateX(Math.PI / 2); g.translate(uc, yc, dc); return g; };
  const sphereG = (u, y, d, r) => { const g = new THREE.SphereGeometry(r, 14, 10); g.translate(u, y, d); return g; };
  const extrude2 = (pts, d0, d1) => { const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))); const g = new THREE.ExtrudeGeometry(sh, { depth: d1 - d0, bevelEnabled: false, curveSegments: 8 }); g.translate(0, 0, d0); return g; };
  const arcPts = (cu, ySp, span, rise) => { const Rc = (span * span / 4 + rise * rise) / (2 * rise); return { Rc, cy: ySp + rise - Rc, beta: Math.asin(Math.min(1, span / 2 / Rc)) }; };
  const arcLine = (cu, ySp, span, rise, rad, N = 28) => { const { Rc, cy, beta } = arcPts(cu, ySp, span, rise), pts = []; const r0 = rad == null ? Rc : rad;
    for (let i = 0; i <= N; i++) { const a = Math.PI / 2 - beta + 2 * beta * i / N; pts.push([cu + r0 * Math.cos(a), cy + r0 * Math.sin(a)]); } return pts; };
  /** حلقة قوس قطعي أو نصف دائري: span البحر، rise السهم، t السماكة، ySp خط الارتكاز. */
  const ringG = (cu, ySp, span, rise, t, d0, d1) => { const { Rc } = arcPts(cu, ySp, span, rise); return extrude2([...arcLine(cu, ySp, span, rise, Rc + t), ...arcLine(cu, ySp, span, rise, Rc).reverse()], d0, d1); };
  const tympG = (cu, ySp, span, rise, d0, d1) => extrude2(arcLine(cu, ySp, span, rise), d0, d1);
  /** ساق عمود جدارية: مقطع (a عرض، -b بروز) مع تخديد على الوجه الأمامي؛ يُبثق على المحور y. */
  const shaftG = (uc, y0, y1, Wd, P, dF, flutes, round) => { const pts = [], hw = Wd / 2;
    if (round) { const Rr = hw, N = 64; for (let i = 0; i <= N; i++) { const th = Math.PI * i / N; let r = Rr;
        if (flutes) { const k = th / Math.PI * flutes, f = k - Math.floor(k), ss = (f - .12) / .76; r = Rr - .014 * (ss > 0 && ss < 1 ? Math.sqrt(1 - (2 * ss - 1) ** 2) : 0); }
        pts.push([r * Math.cos(th), -r * Math.sin(th)]); } pts.push([-hw, .02], [hw, .02]); }
    else { pts.push([-hw, .02], [hw, .02], [hw, -P]);
      if (flutes) { const edge = Wd * .08, fw = (Wd - 2 * edge) / flutes, ind = Math.min(.02, fw * .22);
        for (let f = flutes - 1; f >= 0; f--) { const a1 = -hw + edge + f * fw, a2 = a1 + fw; pts.push([a2, -P]); for (let j = 1; j < 6; j++) { const s = j / 6; pts.push([a2 - fw * s, -(P - ind * Math.sqrt(1 - (2 * s - 1) ** 2))]); } pts.push([a1, -P]); } }
      pts.push([-hw, -P]); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: y1 - y0, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(-Math.PI / 2); g.translate(uc, y0, dF); return g; };

  const lamps = [];

  /* --- تجميع الجدران في مجموعات: لكل جهة وبادئة طبقة (P0, P1, P1T, n0…) --- */
  const groups = [];
  for (const [side, [nx, nz]] of Object.entries(SIDES)) {
    const n = new THREE.Vector3(nx, 0, nz), t = new THREE.Vector3().crossVectors(up, n), M = new THREE.Matrix4().makeBasis(t, up, n);
    const loc = m => { const b = new THREE.Box3().setFromObject(m), us = [b.min.x * t.x + b.min.z * t.z, b.max.x * t.x + b.max.z * t.z], ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z];
      return { u0: Math.min(...us), u1: Math.max(...us), y0: b.min.y, y1: b.max.y, d0: Math.min(...ds), d1: Math.max(...ds) }; };
    const sm = S.meshes.filter(m => m.userData?.side === side && m.name !== 'ground'); if (!sm.length) continue;
    const pre = m => (m.name.split(':')[1] || '').split('/')[0], byPre = new Map();
    for (const m of sm) { if (!['wall', 'cladding', 'frame', 'glazing', 'door'].includes(m.userData.role) || m.userData.part === 'blocks') continue; const k = pre(m); if (!byPre.has(k)) byPre.set(k, []); byPre.get(k).push(m); }
    for (const [id, ms] of byPre) {
      const wm = ms.filter(m => m.userData.role === 'wall' || m.userData.role === 'cladding'); if (!wm.length) continue;
      const bs = wm.map(loc), g = { side, id, n, t, M, u0: Math.min(...bs.map(b => b.u0)), u1: Math.max(...bs.map(b => b.u1)), y0: Math.min(...bs.map(b => b.y0)), y1: Math.max(...bs.map(b => b.y1)), d: Math.max(...bs.map(b => b.d1)), ops: new Map(), pils: [] };
      // مثلثات الواجهة الأمامية (u,y) لقياس امتداد الجدار عند أي منسوب (يلتقط القصّ عند الارتداد)
      g.tris = []; wm.forEach((m, mi) => { const p = m.geometry.attributes.position; if (m.geometry.index) return; const dm = bs[mi].d1;
        for (let i = 0; i + 2 < p.count; i += 3) { const tr = []; let ok = true; for (let k = 0; k < 3; k++) { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k); if (Math.abs(x * n.x + z * n.z - dm) > .004) ok = false; tr.push([x * t.x + z * t.z, y]); } if (ok) g.tris.push(tr); } });
      g.span = y => { let a = Infinity, b = -Infinity; for (const tr of g.tris) for (let k = 0; k < 3; k++) { const [u1, y1] = tr[k], [u2, y2] = tr[(k + 1) % 3]; if ((y1 - y) * (y2 - y) <= 0 && y1 !== y2) { const u = u1 + (u2 - u1) * (y - y1) / (y2 - y1); a = Math.min(a, u); b = Math.max(b, u); } } return a < b ? [a, b] : [g.u0, g.u1]; };
      for (const m of ms) { const o = m.userData.opening; if (!o || !['frame', 'glazing', 'door'].includes(m.userData.role)) continue; if (!g.ops.has(o)) g.ops.set(o, { id: o }); const op = g.ops.get(o), b = loc(m);
        if (m.userData.role === 'frame') { op.f = b; op.fm = m; } if (m.userData.role === 'glazing') op.gl = b; if (m.userData.role === 'door') { op.door = b; op.dm = m; } }
      g.ops = [...g.ops.values()].filter(o => o.f).sort((a, b) => a.f.u0 - b.f.u0); groups.push(g);
    }
  }
  if (!groups.length) return {};
  // الباب الرئيسي: أعرض باب في الجهة الجنوبية (والثاني بالبذرة إن قارب عرضه)
  const sDoors = groups.filter(g => g.side === 's').flatMap(g => g.ops.filter(o => o.door).map(o => ({ g, o, w: o.f.u1 - o.f.u0 }))).sort((a, b) => b.w - a.w);
  const cEnt = sDoors.find(d => d.o.id === 'cEnt'), mainDoor = cEnt || (sDoors.length ? (sDoors[1] && sDoors[1].w > sDoors[0].w * .85 && R(17) < .5 ? sDoors[1] : sDoors[0]) : null);
  // الزوايا: نهايات مجموعات قريبة من نهاية مجموعة أخرى (لتمديد الكورنيش فوق الزاوية)
  const ends = groups.flatMap(g => [0, 1].map(k => ({ g, k, p: g.t.clone().multiplyScalar(k ? g.u1 : g.u0).addScaledVector(g.n, g.d) })));
  const cornerEnd = (g, k) => { const e = ends.find(x => x.g === g && x.k === k); return ends.some(o => o.g.side !== g.side && o.p.distanceTo(e.p) < .65); };
  const levels = bandLevels();

  /* ====== دوال بناء العناصر (كلها بإحداثيات الجهة المحلية) ====== */
  let maxProj = 0; const track = (g, geo) => { geo.computeBoundingBox(); maxProj = Math.max(maxProj, geo.boundingBox.max.z - g.d); return geo; };
  const mk = g => ({ B: (mat, u0, u1, y0, y1, d0, d1) => put(mat, track(g, boxG(u0, u1, y0, y1, d0, d1)), g.M, null, g), G: (mat, geo, loc) => put(mat, track(g, geo), g.M, loc, g) });
  const dec = o => { const w = o.f.u1 - o.f.u0; return w < .75 ? .09 : w < 1.6 ? .13 : .17; }; // عرض إطار النافذة

  function capital(g, order, uc, yb, D) { const { B, G } = mk(g), dF = g.d, w = D * 1.2, pc = .19;
    if (order === 'tuscan') { const h = D * .5; G(trim, taper(uc, yb, yb + h * .6, D * .86, w * .96, dF - .01, dF + .14, dF + .18)); B(trim, uc - w * .5, uc + w * .5, yb + h * .6, yb + h, dF - .02, dF + pc); return; }
    if (order === 'doric') { const h = D * .5; B(trim, uc - D * .44, uc + D * .44, yb, yb + h * .14, dF - .01, dF + .12); G(trim, taper(uc, yb + h * .14, yb + h * .62, D * .86, w * .92, dF - .01, dF + .13, dF + .17)); for (const k of [0, 1]) B(trim, uc - D * .43, uc + D * .43, yb + h * (.14 + k * .05), yb + h * (.17 + k * .05), dF - .01, dF + .125);
      B(trim, uc - w * .55, uc + w * .55, yb + h * .62, yb + h, dF - .02, dF + pc); return; }
    if (order === 'ionic') { const h = D * .62; B(trim, uc - D * .46, uc + D * .46, yb, yb + h * .12, dF - .01, dF + .15);
      G(trim, taper(uc, yb + h * .12, yb + h * .6, D * .9, D * 1.05, dF - .01, dF + .14, dF + .17));
      for (const s of [-1, 1]) { const uu = uc + s * D * .5; G(trim, cylD(uu, yb + h * .5, dF + .13, D * .15, .07)); G(recess, cylD(uu, yb + h * .5, dF + .155, D * .08, .03)); }
      B(trim, uc - w * .55, uc + w * .55, yb + h * .6, yb + h, dF - .02, dF + pc); return; }
    const h = D * .95; G(trim, taper(uc, yb, yb + h * .72, D * .86, D * 1.12, dF - .01, dF + .14, dF + .17));
    for (let i = -2; i <= 2; i++) G(trim, taper(uc + i * D * .21, yb + h * .04, yb + h * .46, D * .17, D * .22, dF + .02, dF + .16, dF + .19));
    for (let i = -1; i <= 1; i++) G(trim, taper(uc + i * D * .3, yb + h * .34, yb + h * .72, D * .13, D * .2, dF + .02, dF + .17, dF + .20));
    for (const s of [-1, 1]) G(trim, cylD(uc + s * D * .56, yb + h * .62, dF + .12, D * .1, .06, 10));
    B(trim, uc - w * .58, uc + w * .58, yb + h * .72, yb + h * .92, dF - .02, dF + pc + .01); B(trim, uc - w * .6, uc + w * .6, yb + h * .92, yb + h, dF - .02, dF + pc + .02);
    G(brass, cylD(uc, yb + h * .84, dF + pc + .02, D * .06, .015, 10)); }
  const capH = (order, D) => ({ tuscan: .5, doric: .5, ionic: .62, composite: .95 }[order]) * D;
  const RATIO = { tuscan: 7, doric: 8, ionic: 9, composite: 10 };
  function pilaster(g, uc, ya, yt, D, round, Pp) { const { B, G } = mk(g), dF = g.d, P = round ? D * .43 : (Pp || .13), Ws = D * .86, baseH = D * .5, cH = capH(CFG.order, D), sy0 = ya + baseH, sy1 = yt - cH;
    B(trim, uc - D * .62, uc + D * .62, ya, ya + baseH * .55, dF - .02, dF + .17); B(trim, uc - D * .56, uc + D * .56, ya + baseH * .55, ya + baseH, dF - .02, dF + .15);
    G(trim, shaftG(uc, sy0, sy1, Ws, P, dF, CFG.fluted ? 5 : 0, round));
    B(trim, uc - Ws * .5 - .01, uc + Ws * .5 + .01, sy1 - .035, sy1, dF - .02, dF + (round ? P : P) + .02);
    capital(g, CFG.order, uc, sy1, D); }
  function pediment(g, u0, u1, y0, kind, rise, dep = .20, solid = .06) { const { B, G } = mk(g), dF = g.d, span = u1 - u0, uc = (u0 + u1) / 2, dd = dF + dep; if (kind === 'none') return;
    if (kind === 'tri') { const m = rise / (span / 2), tv = .085;
      G(recess, extrude2([[u0, y0], [u1, y0], [uc, y0 + rise]], dF - .02, dF + solid));
      for (const s of [-1, 1]) { const ueo = uc + s * (span / 2 + .06), yb = y0 - .06 * m;
        G(trim, extrude2(s < 0 ? [[ueo, yb], [ueo, yb + tv], [uc, y0 + rise + tv], [uc, y0 + rise]] : [[uc, y0 + rise], [uc, y0 + rise + tv], [ueo, yb + tv], [ueo, yb]], dF - .02, dd)); }
    } else { G(recess, tympG(uc, y0, span, rise, dF - .02, dF + solid)); G(trim, ringG(uc, y0, span + .12, rise, .09, dF - .02, dd)); } }
  function steps(g, u0, u1) { const { B } = mk(g), dF = g.d; B(stone, u0, u1, 0, .225, dF - .02, dF + .25); B(stone, u0 + .1, u1 - .1, 0, .45, dF - .02, dF + .15); B(trim, u0 + .08, u1 - .08, .435, .45, dF, dF + .17); }
  function dressEntranceClassic(g, o, yLim, bnd) { const { B, G } = mk(g), f = o.f, dF = g.d, uc = (f.u0 + f.u1) / 2, aw = .12, ratio = RATIO[CFG.order], round = CFG.engaged;
    const yCapTop = Math.min(f.y1 + aw + .30, yLim - .45), D = Math.min(.36, Math.max(.26, yCapTop / ratio));
    B(trim, f.u0 - aw, f.u0, f.y0, f.y1 + aw, dF - .02, dF + .055); B(trim, f.u1, f.u1 + aw, f.y0, f.y1 + aw, dF - .02, dF + .055); B(trim, f.u0 - aw, f.u1 + aw, f.y1, f.y1 + aw, dF - .02, dF + .075);
    const gap = .06, cL = f.u0 - aw - gap - D * .5, cR = f.u1 + aw + gap + D * .5;
    for (const c of [cL, cR]) pilaster(g, c, 0, yCapTop, D, round);
    const e0 = cL - D * .62 - .05, e1 = cR + D * .62 + .05, avail = (bnd != null ? bnd - ARCH - .02 : g.y1 - .1) - yCapTop, eh = Math.max(.14, Math.min(.30, avail * .45));
    B(trim, e0, e1, yCapTop, yCapTop + eh * .4, dF - .02, dF + .17); B(trim, e0 - .02, e1 + .02, yCapTop + eh * .4, yCapTop + eh * .75, dF - .02, dF + .185); B(trim, e0 - .04, e1 + .04, yCapTop + eh * .75, yCapTop + eh, dF - .02, dF + .21);
    const yp = yCapTop + eh, span = e1 - e0 + .08, room = (bnd != null ? bnd - .03 : g.y1 - .1) - yp, rise = Math.min(CFG.pediment === 'tri' ? span / 5.5 : span / 7.5, room);
    if (rise >= .13) pediment(g, e0 - .04, e1 + .04, yp, CFG.pediment, rise);
    G(brass, cylD(uc, f.y1 + aw * .5, dF + .09, .03, .012, 10));
    const su0 = cL - D * .62 - .12, su1 = cR + D * .62 + .12; steps(g, su0, su1);
    lamps.push({ g, u: su0 - .24, y: 1.95 }, { g, u: su1 + .24, y: 1.95 });
    return { u0: su0 - .45, u1: su1 + .45 }; }

  /* ---- أعمدة حرة مفصولة عن الجدار (رواق): مقطع دائري كامل مضلّع اختياريًا + تيجان متمركزة ---- */
  const taperS = (uc, y0, y1, wb, wt, dc) => { const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const w = p.getY(i) > 0 ? wt : wb; p.setXYZ(i, uc + p.getX(i) * w, y0 + (p.getY(i) + .5) * (y1 - y0), dc + p.getZ(i) * w); } g.computeVertexNormals(); return g; };
  const colShaft = (uc, y0, y1, dc, Rr, flutes) => { const pts = [], N = flutes ? flutes * 10 : 28;
    for (let i = 0; i < N; i++) { const th = 2 * Math.PI * i / N; let r = Rr; if (flutes) { const k = th / (2 * Math.PI) * flutes, f = k - Math.floor(k), ss = (f - .1) / .8; r = Rr - .016 * (ss > 0 && ss < 1 ? Math.sqrt(1 - (2 * ss - 1) ** 2) : 0); } pts.push([r * Math.cos(th), -r * Math.sin(th)]); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2); g.translate(uc, y0, dc); return g; };
  function colCapital(g, order, uc, yb, D, dc) { const { B, G } = mk(g), w = D * 1.2;
    if (order === 'tuscan' || order === 'doric') { const h = D * .5; G(trim, taperS(uc, yb, yb + h * .6, D * .86, w * .96, dc)); if (order === 'doric') for (const k of [0, 1]) B(trim, uc - D * .45, uc + D * .45, yb + h * (.04 + k * .06), yb + h * (.08 + k * .06), dc - D * .45, dc + D * .45); B(trim, uc - w / 2, uc + w / 2, yb + h * .6, yb + h, dc - w / 2, dc + w / 2); return; }
    if (order === 'ionic') { const h = D * .62; G(trim, taperS(uc, yb, yb + h * .55, D * .9, D * 1.05, dc));
      for (const sd of [-1, 1]) for (const f of [-1, 1]) { G(trim, cylD(uc + sd * D * .5, yb + h * .5, dc + f * (D * .52), D * .15, .06)); G(recess, cylD(uc + sd * D * .5, yb + h * .5, dc + f * (D * .52 + .028), D * .08, .03)); }
      B(trim, uc - w * .55, uc + w * .55, yb + h * .6, yb + h, dc - w * .55, dc + w * .55); return; }
    const h = D * .95; G(trim, taperS(uc, yb, yb + h * .72, D * .86, D * 1.12, dc));
    for (let i = -1; i <= 1; i++) { G(trim, taper(uc + i * D * .28, yb + h * .04, yb + h * .46, D * .2, D * .25, dc + D * .3, dc + D * .47, dc + D * .53)); }
    B(trim, uc - w * .58, uc + w * .58, yb + h * .72, yb + h, dc - w * .58, dc + w * .58); }
  /** رواق من عمودين حرّين قائمين على درجين، ويحملان أنتابلتشر مصمتًا يرتد إلى الجدار (كتلة سقف الرواق) وفوقه جملون. أقصى بروز 0.72 م. */
  function portico(g, o, yLim, bnd) { const { B, G } = mk(g), f = o.f, dF = g.d, aw = .12, ratio = RATIO[CFG.order], uc = (f.u0 + f.u1) / 2;
    B(trim, f.u0 - aw, f.u0, f.y0, f.y1 + aw, dF - .02, dF + .055); B(trim, f.u1, f.u1 + aw, f.y0, f.y1 + aw, dF - .02, dF + .055); B(trim, f.u0 - aw, f.u1 + aw, f.y1, f.y1 + aw, dF - .02, dF + .075);
    const top = Math.min(bnd != null ? bnd - ARCH : g.y1 - .15, f.y1 + aw + .75), EH = Math.min(.40, Math.max(.28, (top - .45) * .14)), yCap = top - EH - .02, D = Math.max(.22, Math.min(.42, (yCap - .45) / ratio));
    const baseH = D * .5, cH = capH(CFG.order, D), dc = dF + .36, cL = f.u0 - aw - .42 - D / 2, cR = f.u1 + aw + .42 + D / 2, y0 = .45;
    for (const c of [cL, cR]) { B(trim, c - D * .62, c + D * .62, y0, y0 + baseH * .55, dc - D * .62, dc + D * .62); B(trim, c - D * .56, c + D * .56, y0 + baseH * .55, y0 + baseH, dc - D * .56, dc + D * .56);
      G(trim, colShaft(c, y0 + baseH, yCap - cH, dc, D * .43, CFG.fluted ? 8 : 0)); B(trim, c - D * .47, c + D * .47, yCap - cH - .03, yCap - cH, dc - D * .47, dc + D * .47); colCapital(g, CFG.order, c, yCap - cH, D, dc); }
    const e0 = cL - D * .75, e1 = cR + D * .75, ar = EH * .36, fr = EH * .38;
    B(trim, e0, e1, yCap, yCap + ar, dF - .02, dF + .64); B(recess, e0, e1, yCap + ar, yCap + ar + fr, dF - .02, dF + .64); B(trim, e0 - .03, e1 + .03, yCap + ar + fr, yCap + EH * .88, dF - .02, dF + .70); B(trim, e0 - .06, e1 + .06, yCap + EH * .88, yCap + EH, dF - .02, dF + .72);
    const yp = yCap + EH, span = e1 - e0 + .12, rise = Math.min(.8, CFG.pediment === 'seg' ? span / 7 : span / 5.5); if (CFG.pediment !== 'none' && rise >= .13) pediment(g, e0 - .06, e1 + .06, yp, CFG.pediment, rise, .70, .60);
    B(stone, cL - D * .95, cR + D * .95, 0, .225, dF - .02, dF + .72); B(stone, cL - D * .78, cR + D * .78, .225, .45, dF - .02, dF + .64);
    lamps.push({ g, u: e0 - .4, y: 1.95 }, { g, u: e1 + .4, y: 1.95 }); return { u0: e0 - .6, u1: e1 + .6 }; }
  /** هود فوق الباب: بلاطة مدعومة بكوابيل جانبية متدرجة (بروز 0.60 م). */
  function consoleHood(g, o, yLim, bnd) { const { B, G } = mk(g), f = o.f, dF = g.d, aw = .15;
    B(trim, f.u0 - aw, f.u0, f.y0, f.y1 + aw, dF - .02, dF + .06); B(trim, f.u1, f.u1 + aw, f.y0, f.y1 + aw, dF - .02, dF + .06); B(trim, f.u0 - aw, f.u1 + aw, f.y1, f.y1 + aw, dF - .02, dF + .08);
    const top = bnd != null ? bnd - ARCH : g.y1 - .15, room = top - (f.y1 + aw) - .02, ch = Math.max(.12, Math.min(.5, room - .1)), yS = f.y1 + aw + ch, e0 = f.u0 - aw - .16, e1 = f.u1 + aw + .16;
    for (const x of [e0 + .04, e1 - .04]) { G(trim, taper(x, f.y1 + aw - .2, yS, .06, .15, dF - .02, dF + .08, dF + .52)); B(trim, x - .075, x + .075, yS - .04, yS, dF - .02, dF + .52); }
    B(trim, e0 - .08, e1 + .08, yS, yS + .08, dF - .02, dF + .60); B(recess, e0 + .1, e1 - .1, f.y1 + aw, yS - .01, dF - .02, dF + .04);
    G(brass, cylD((f.u0 + f.u1) / 2, f.y1 + aw * .5, dF + .09, .03, .012, 10)); steps(g, e0 - .1, e1 + .1); lamps.push({ g, u: e0 - .3, y: 1.95 }, { g, u: e1 + .3, y: 1.95 }); return { u0: e0 - .5, u1: e1 + .5 }; }
  /** مدخل مقوّس: دعامات مخرّشة (روستيك) وحلقة قوس بمفتاح عقد ومروحة. */
  function archEntrance(g, o, yLim, bnd) { const { B, G } = mk(g), f = o.f, dF = g.d, uc = (f.u0 + f.u1) / 2, t = .26, top = bnd != null ? bnd - ARCH : g.y1 - .15, span = f.u1 - f.u0, ySp = f.y1;
    for (let y = f.y0, r = 0; y < ySp - .05; y += .3, r++) { const h = Math.min(.28, ySp - y - .02), wB = r % 2 ? t * 1.35 : t; B(trim, f.u0 - wB, f.u0, y, y + h, dF - .02, dF + .075 + (r % 2 ? .03 : 0)); B(trim, f.u1, f.u1 + wB, y, y + h, dF - .02, dF + .075 + (r % 2 ? .03 : 0)); }
    const rr = Math.min(span / 2, top - ySp - t - .06);
    if (rr >= .14) { G(glassD, tympG(uc, ySp, span, rr, dF - .02, dF + .03)); const { Rc, cy } = arcPts(uc, ySp, span, rr); for (let u = f.u0 + .08; u < f.u1 - .04; u += .1) { const yy = cy + Math.sqrt(Math.max(0, Rc * Rc - (u - uc) ** 2)); if (yy - ySp > .03) G(iron, boxG(u - .007, u + .007, ySp, yy, dF + .03, dF + .042)); }
      G(trim, ringG(uc, ySp, span, rr, t, dF - .02, dF + .09)); G(trim, taper(uc, ySp + rr - .02, ySp + rr + t + .1, .16, .3, dF - .02, dF + .1, dF + .17)); }
    else { B(trim, f.u0 - t, f.u1 + t, ySp, ySp + .2, dF - .02, dF + .09); G(trim, taper(uc, ySp, ySp + .2 + .08, .14, .26, dF - .02, dF + .1, dF + .16)); }
    steps(g, f.u0 - t - .3, f.u1 + t + .3); lamps.push({ g, u: f.u0 - t - .5, y: 1.95 }, { g, u: f.u1 + t + .5, y: 1.95 }); return { u0: f.u0 - t - .8, u1: f.u1 + t + .8 }; }
  const dressEntrance = (g, o, yLim, bnd) => CFG.ent === 2 ? portico(g, o, yLim, bnd) : CFG.ent === 3 ? consoleHood(g, o, yLim, bnd) : CFG.ent === 4 ? archEntrance(g, o, yLim, bnd) : dressEntranceClassic(g, o, yLim, bnd);
  function dressOpening(g, o, { sw, head, yLim, isDoor }) { const { B, G } = mk(g), f = o.f, dF = g.d, w = f.u1 - f.u0, uc = (f.u0 + f.u1) / 2, x0 = f.u0 - sw, x1 = f.u1 + sw, topY = f.y1, lintH = sw * .95;
    B(trim, x0, f.u0, f.y0, topY, dF - .02, dF + .07); B(trim, f.u1, x1, f.y0, topY, dF - .02, dF + .07);
    if (!isDoor) { B(trim, x0 - .04, x1 + .04, f.y0 - .07, f.y0, dF - .02, dF + .105); B(trim, x0 - .02, x1 + .02, f.y0 - .09, f.y0 - .07, dF - .02, dF + .08);
      for (const u of [x0 + .01, x1 - .09]) B(trim, u, u + .08, f.y0 - .22, f.y0 - .09, dF - .02, dF + .085); // كوابيل الجلسة
      if (CFG.apron && f.y0 > .95 && w > .8) { const ay1 = f.y0 - .22, ay0 = Math.max(.65, ay1 - .38); if (ay1 - ay0 > .2) { B(trim, f.u0, f.u1, ay0, ay1, dF - .02, dF + .035); B(recess, f.u0 + .06, f.u1 - .06, ay0 + .05, ay1 - .05, dF + .03, dF + .045); } } }
    else steps(g, x0 - .1, x1 + .1);
    const flat = tri => { B(trim, x0, x1, topY, topY + lintH, dF - .02, dF + .085); const room = yLim - topY - .05;
      if (tri) { const rise = Math.min((x1 - x0 + .12) / 6, room - lintH - .04); if (rise >= .1) { pediment(g, x0 - .06, x1 + .06, topY + lintH, 'tri', rise, .14, .05); return; } }
      if (CFG.hood && room > lintH + .1) { B(trim, x0 - .06, x1 + .06, topY + lintH, topY + lintH + .06, dF - .02, dF + .14); for (const u of [x0 + .01, x1 - .07]) B(trim, u, u + .06, topY - .12, topY + lintH, dF - .02, dF + .115); }
      G(trim, taper(uc, topY, topY + Math.min(lintH + .1, Math.max(.12, room)), .08, .15, dF - .02, dF + .08, dF + .115)); };
    if (head === 'flat') return flat();
    if (head === 'tri') return flat(true);
    const span = w + 2 * sw, ySp = topY + lintH * .55, t = sw * .85, maxRise = yLim - ySp - t - .03;
    let r = head === 'round' ? Math.min(span / 2, maxRise) : Math.min(Math.max(.15, span * .2), maxRise); if (r < .11) return flat();
    B(trim, x0, x1, topY, ySp, dF - .02, dF + .075); B(trim, x0 - .03, x0 + sw + .02, ySp - .05, ySp + .03, dF - .02, dF + .1); B(trim, x1 - sw - .02, x1 + .03, ySp - .05, ySp + .03, dF - .02, dF + .1);
    if (isDoor) { G(glassD, tympG(uc, ySp, span, r, dF - .02, dF + .03)); const { Rc, cy } = arcPts(uc, ySp, span, r); // مروحة بقضبان حديد رأسية
      for (let u = x0 + .09; u < x1 - .05; u += .1) { const yy = cy + Math.sqrt(Math.max(0, Rc * Rc - (u - uc) ** 2)); if (yy - ySp > .03) G(iron, boxG(u - .007, u + .007, ySp, yy, dF + .03, dF + .042)); } }
    else G(recess, tympG(uc, ySp, span, r, dF - .02, dF + .03));
    G(trim, ringG(uc, ySp, span, r, t, dF - .02, dF + .09)); G(trim, taper(uc, ySp + r - .02, ySp + r + t + .07, .12, .2, dF - .02, dF + .1, dF + .13)); }
  function addMuntins(g, o) { const { B } = mk(g), gb = o.gl; if (!gb) return; const w = gb.u1 - gb.u0, h = gb.y1 - gb.y0, d1 = o.f.d1 - .012, th = .028; if (w < .25 || h < .3) return;
    const nv = Math.round(w / .55) - 1, nh = Math.round(h / .62) - 1;
    for (let i = 1; i <= nv; i++) B(frameMat, gb.u0 + w * i / (nv + 1) - th / 2, gb.u0 + w * i / (nv + 1) + th / 2, gb.y0, gb.y1, d1 - .02, d1);
    for (let i = 1; i <= nh; i++) B(frameMat, gb.u0, gb.u1, gb.y0 + h * i / (nh + 1) - th / 2, gb.y0 + h * i / (nh + 1) + th / 2, d1 - .02, d1); }
  function dressDoorLeaf(g, o) { const { B, G } = mk(g), dd = o.door, w = dd.u1 - dd.u0, h = dd.y1 - dd.y0, uc = (dd.u0 + dd.u1) / 2, dz = o.f.d1 + .012;
    if (o.dm) o.dm.material = CFG.door === 'iron' ? glassL : walnut;
    const leaves = w > 1.2 ? 2 : 1, lw = w / leaves;
    for (let L = 0; L < leaves; L++) { const a0 = dd.u0 + L * lw, a1 = a0 + lw;
      if (CFG.door === 'iron') {
        B(iron, a0 + .03, a1 - .03, dd.y0 + .05, dd.y0 + .12, dz, dz + .03); B(iron, a0 + .03, a1 - .03, dd.y1 - .12, dd.y1 - .05, dz, dz + .03); B(iron, a0 + .03, a1 - .03, dd.y0 + h * .55, dd.y0 + h * .55 + .05, dz, dz + .03);
        const nb = Math.max(4, Math.round(lw / .1)); for (let i = 0; i <= nb; i++) { const u = a0 + .06 + (lw - .12) * i / nb; B(iron, u - .009, u + .009, dd.y0 + .08, dd.y1 - .08, dz, dz + .028); G(brass, taper(u, dd.y1 - .08, dd.y1 - .02, .004, .028, dz, dz + .02, dz + .028)); }
        for (const yy of [dd.y0 + h * .32, dd.y0 + h * .8]) { const tg = new THREE.TorusGeometry(Math.min(lw * .28, .16), .007, 6, 24); tg.translate((a0 + a1) / 2, yy, dz + .03); G(iron, tg); }
        B(brass, a0 + .03, a1 - .03, dd.y0 + .12, dd.y0 + .27, dz + .026, dz + .034); }
      else if (CFG.door === 'carved') { const cols = Math.max(2, Math.round(lw / .38)), rows = 4, iw = (lw - .08 - (cols - 1) * .04) / cols, ih = (h - .12 - (rows - 1) * .04) / rows;
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const x0 = a0 + .04 + c * (iw + .04), y0 = dd.y0 + .06 + r * (ih + .04); B(walnut, x0, x0 + iw, y0, y0 + ih, dz, dz + .024); B(iron, x0 + iw * .5 - .008, x0 + iw * .5 + .008, y0 + ih * .15, y0 + ih * .85, dz + .024, dz + .03);
          for (const [sx, sy] of [[.15, .12], [.85, .12], [.15, .88], [.85, .88]]) G(brass, sphereG(x0 + iw * sx, y0 + ih * sy, dz + .03, .013)); } }
      else { const cols = lw > .7 ? 2 : 1, rows = 3, m = .1, gp = .06, iw = (lw - 2 * m - (cols - 1) * gp) / cols, hs = [.2, .22, .28], tot = .7, rh = h - 2 * m - (rows - 1) * gp;
        let y = dd.y0 + m; for (let r = 0; r < rows; r++) { const ph = rh * hs[r] / tot; for (let c = 0; c < cols; c++) { const x0 = a0 + m + c * (iw + gp); B(walnut, x0, x0 + iw, y, y + ph, dz, dz + .018); B(iron, x0, x0 + iw, y, y + .012, dz + .018, dz + .026); B(iron, x0, x0 + iw, y + ph - .012, y + ph, dz + .018, dz + .026); } y += ph + gp; } } }
    B(brass, dd.u0 + .05, dd.u1 - .05, dd.y0 + .02, dd.y0 + .16, dz + .012, dz + .02);
    if (leaves === 2) B(iron, uc - .01, uc + .01, dd.y0, dd.y1, dz, dz + .035); }
  const lampBody = (g, l) => { const { B } = mk(g), dF = g.d;
    B(iron, l.u - .035, l.u + .035, l.y - .1, l.y + .1, dF - .01, dF + .015); B(iron, l.u - .02, l.u + .02, l.y + .04, l.y + .06, dF + .015, dF + .11); B(lampGlass, l.u - .04, l.u + .04, l.y - .08, l.y + .09, dF + .05, dF + .11);
    for (const s of [-1, 1]) B(iron, l.u + s * .043 - .004, l.u + s * .043 + .004, l.y - .09, l.y + .1, dF + .045, dF + .115); B(iron, l.u - .055, l.u + .055, l.y + .09, l.y + .12, dF + .04, dF + .12); B(brass, l.u - .015, l.u + .015, l.y + .12, l.y + .15, dF + .07, dF + .1); B(iron, l.u - .03, l.u + .03, l.y - .11, l.y - .08, dF + .055, dF + .105); };

  /* ====== بناء كل مجموعة ====== */
  for (const g of groups) {
    const { n, t, side } = g, dF = g.d, isS = side === 's', { B, G } = mk(g);
    const bands = levels.filter(b => b >= g.y0 - .05 && b + BH <= g.y1 + .02), topBand = bands.length ? bands[bands.length - 1] : null;
    const storeys = []; { let ya = g.y0 <= .01 ? PLINTH : g.y0 + .02; for (const b of bands) { storeys.push({ ya, yt: b - ARCH, ground: ya === PLINTH }); ya = b + BH; } if (!bands.length) storeys.push({ ya, yt: g.y1 - .15, ground: ya === PLINTH }); }
    const bandOf = y => bands.find(b => b >= y - .01) ?? null, isMain = o => mainDoor && mainDoor.g === g && mainDoor.o === o;
    const spec = []; g.spec = spec;
    // ---- النوافذ والأبواب ----
    g.ops.forEach((o, idx) => { const f = o.f, sw = dec(o), isDoor = !!o.door, bnd = bandOf(f.y1 - .01), yLim = bnd != null ? bnd - ARCH : g.y1 - .15;
      if (isDoor && isMain(o)) { const r = dressEntrance(g, o, yLim, bnd); spec.push({ u0: r.u0, u1: r.u1, y0: 0, y1: f.y1 + 1, door: true }); }
      else { dressOpening(g, o, { sw, head: CFG.head === 'mixed' ? (idx % 2 ? 'flat' : 'segmental') : CFG.head === 'alt' ? (idx % 2 ? 'segmental' : 'tri') : CFG.head, yLim, isDoor }); spec.push({ u0: f.u0 - sw - .2, u1: f.u1 + sw + .2, y0: f.y0 - .1, y1: f.y1 + .3, door: isDoor });
        if (isDoor) lamps.push({ g, u: f.u1 + sw + .5, y: 1.95 }); }
      addMuntins(g, o); if (isDoor) dressDoorLeaf(g, o); });
    // ---- القاعدة الحجرية (تنكسر عند الأبواب) ----
    if (g.y0 <= .01) { const cuts = spec.filter(r => r.door).map(r => [r.u0 + .0, r.u1 - .0]).sort((a, b) => a[0] - b[0]); const [a0, a1] = g.span(.3); let cur = a0 - .02; const segs = [];
      for (const [c0, c1] of cuts) { if (c0 > cur + .05) segs.push([cur, c0]); cur = Math.max(cur, c1); } if (a1 + .02 > cur + .05) segs.push([cur, a1 + .02]);
      for (const [x0, x1] of segs) { B(stone, x0, x1, 0, PLINTH - .06, dF - .02, dF + .06); B(trim, x0 - .01, x1 + .01, PLINTH - .06, PLINTH, dF - .02, dF + .09); } }
    // ---- الكورنيش عند كل شريط ----
    const cornice = (yb, heavy) => { if (CFG.slim) heavy = false; let [a, b] = g.span(yb + .15); const ext = .24; a -= cornerEnd(g, 0) && Math.abs(a - g.u0) < .05 ? ext : .01; b += cornerEnd(g, 1) && Math.abs(b - g.u1) < .05 ? ext : .01;
      const k = heavy ? 1 : .62, pr = v => v * k;
      B(trim, a, b, yb - ARCH, yb - ARCH + .13, dF - .02, dF + .035); B(trim, a, b, yb - .21, yb - .165, dF - .02, dF + pr(.055)); B(trim, a, b, yb - .165, yb, dF - .02, dF + .02);
      if (heavy) { const nF = Math.floor((b - a) / .34); for (let i = 0; i <= nF; i++) if (i % 2 === 0) { const u = a + .08 + i * (b - a - .16) / nF; B(trim, u - .05, u + .05, yb - .15, yb - .03, dF + .015, dF + .045); } }
      B(trim, a, b, yb, yb + .035, dF - .02, dF + pr(.10));
      if (CFG.dentils || (!heavy && !CFG.slim)) { B(trim, a, b, yb + .035, yb + .10, dF - .02, dF + pr(.075)); const nd = Math.floor((b - a) / .13); for (let i = 0; i < nd; i++) { const u = a + .03 + i * (b - a - .06) / nd; B(trim, u, u + .06, yb + .035, yb + .10, dF + pr(.075) - .01, dF + pr(.12)); } }
      else if (heavy) { const nm = Math.floor((b - a) / .36); for (let i = 0; i <= nm; i++) { const u = a + .1 + i * (b - a - .2) / nm; G(trim, taper(u, yb - .01, yb + .10, .075, .09, dF, dF + pr(.17), dF + pr(.205))); } }
      B(trim, a, b, yb + .10, yb + .20, dF - .02, dF + pr(.215)); B(trim, a, b, yb + .20, yb + .27, dF - .02, dF + pr(.235)); B(trim, a, b, yb + .27, yb + BH, dF - .02, dF + pr(.25));
      if (heavy) B(led, a + .15, b - .15, yb - .004, yb + .008, dF + .075, dF + .088); };
    for (const yb of bands) cornice(yb, yb === topBand);
    // ---- الدروة العليا ----
    if (topBand != null) { const yp0 = topBand + BH, H = g.y1 - yp0, [a, b] = g.span(yp0 + .1);
      if (H > .55 && CFG.parapet !== 'plain') { const capT = .1, railH = .13, plH = .22, hb = H - capT - railH - plH;
        B(trim, a - .02, b + .02, g.y1 - capT + .02, g.y1 + .04, dF - .08, dF + .1);
        const nPier = Math.max(1, Math.round((b - a) / 2.6)), piers = []; for (let i = 0; i <= nPier; i++) piers.push(a + .2 + i * (b - a - .4) / nPier);
        if (CFG.parapet === 'balustrade' && hb > .3) {
          B(trim, a, b, yp0, yp0 + plH, dF - .02, dF + .075); B(trim, a, b, yp0 + plH, yp0 + plH + .025, dF - .02, dF + .09);
          B(trim, a, b, g.y1 - capT - railH, g.y1 - capT, dF - .02, dF + .085); B(recess, a, b, yp0 + plH, g.y1 - capT - railH, dF - .02, dF + .012);
          const prof = [[.55, 0], [.62, .04], [.62, .08], [.42, .14], [.4, .22], [.78, .42], [.42, .64], [.38, .8], [.6, .92], [.62, .96], [.55, 1]], lg = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * hb * .075, y * hb)), 12), mats = [];
          for (let i = 0; i < piers.length - 1; i++) { const x0 = piers[i] + .26, x1 = piers[i + 1] - .26, cnt = Math.max(2, Math.floor((x1 - x0) / .18)); for (let j = 0; j <= cnt; j++) mats.push(g.M.clone().multiply(T(x0 + (x1 - x0) * j / cnt, yp0 + plH + .025, dF + .045))); }
          insts.push({ geo: lg, mat: trim, mats });
        } else {
          for (let i = 0; i < piers.length - 1; i++) { const x0 = piers[i] + .26, x1 = piers[i + 1] - .26, y0 = yp0 + .16, y1 = g.y1 - capT - .1; if (x1 - x0 < .5 || y1 - y0 < .3) continue; const w = .06;
            B(trim, x0, x1, y0, y0 + w, dF - .02, dF + .04); B(trim, x0, x1, y1 - w, y1, dF - .02, dF + .04); B(trim, x0, x0 + w, y0, y1, dF - .02, dF + .04); B(trim, x1 - w, x1, y0, y1, dF - .02, dF + .04);
            B(recess, x0 + w, x1 - w, y0 + w, y1 - w, dF - .02, dF + .012); }
          B(trim, a, b, yp0, yp0 + .08, dF - .02, dF + .06); }
        for (const u of piers) { B(trim, u - .21, u + .21, yp0, g.y1 - capT, dF - .02, dF + .09); B(trim, u - .26, u + .26, g.y1 - capT, g.y1 - capT + .06, dF - .02, dF + .13);
          if (CFG.finials) { G(trim, sphereG(u, g.y1 + .17, dF + .02, .1)); B(trim, u - .08, u + .08, g.y1 + .04, g.y1 + .12, dF - .06, dF + .1); } }
      } else if (H > .05) { B(trim, a - .02, b + .02, g.y1 - .02, g.y1 + .035, dF - .08, dF + .09); if (CFG.parapet === 'plain') { B(trim, a, b, g.y1 - .2, g.y1 - .02, dF - .02, dF + .06); B(trim, a, b, yp0, yp0 + .08, dF - .02, dF + .05); } } }
    else B(trim, g.u0 - .02, g.u1 + .02, g.y1 - .02, g.y1 + .035, dF - .08, dF + .09);
    // ---- عناصر رأسية لكل طابق ----
    storeys.forEach(st => { const H = st.yt - st.ya; if (H < 1.2) return; const [sa, sb] = g.span((st.ya + st.yt) / 2);
      if (CFG.rustic && st.ground) { const nC = Math.max(2, Math.round(H / .55)), ch = H / nC;
        for (let c = 0; c < nC; c++) { const y0 = st.ya + c * ch, y1 = y0 + ch;
          const cutsC = g.ops.filter(o => o.f.y1 > y0 && o.f.y0 < y1).map(o => { const sp = spec.find(r => o.f.u0 >= r.u0 && o.f.u1 <= r.u1 && r.door && isMain(o)); const sw = dec(o); return sp ? [sp.u0, sp.u1] : [o.f.u0 - sw - .04, o.f.u1 + sw + .04]; }).sort((a, b) => a[0] - b[0]);
          let cur = sa; const pcs = []; for (const [c0, c1] of cutsC) { if (c0 > cur + .1) pcs.push([cur, c0]); cur = Math.max(cur, c1); } if (sb > cur + .1) pcs.push([cur, sb]);
          for (const [p0, p1] of pcs) { const nB = Math.max(1, Math.round((p1 - p0) / 1.15)), bw = (p1 - p0) / nB; for (let k = 0; k < nB; k++) B(trim, p0 + k * bw + .012, p0 + (k + 1) * bw - .012, y0 + .016, y1 - .016, dF - .02, dF + .035); }
          for (const [p0, p1] of pcs) B(groove, p0, p1, y0 - .006, y0 + .006, dF - .02, dF + .005); } }
      if (CFG.quoinsOn !== false && (CFG.corners === 'quoin' || !isS)) { const nq = Math.max(2, Math.round(H / .33)), qq = H / nq, par = (side === 's' || side === 'n') ? 0 : 1;
        for (let r = 0; r < nq; r++) { const y0 = st.ya + r * qq, y1 = y0 + qq, lng0 = ((r + par) & 1) ? .62 : .36, rs = spec.filter(q2 => q2.y1 > y0 && q2.y0 < y1);
          const l0 = Math.min(lng0, Math.min(...rs.map(q2 => q2.u0 - sa), 9) - .04), l1 = Math.min(lng0, Math.min(...rs.map(q2 => sb - q2.u1), 9) - .04);
          if (l0 > .2) B(trim, sa, sa + l0, y0 + .01, y1 - .01, dF - .02, dF + .045); if (l1 > .2) B(trim, sb - l1, sb, y0 + .01, y1 - .01, dF - .02, dF + .045); } }
      if (isS && CFG.pilastersOn !== false && !CFG.giant) { const ratio = RATIO[CFG.order], Dm = Math.min(.4, Math.max(.27, H / ratio)), occR = [], cand = [], e = CFG.corners === 'pilaster' ? Dm + .2 : .55;
        for (const r of spec) if (r.y1 > st.ya && r.y0 < st.yt) occR.push([r.u0 - Dm / 2 - .08, r.u1 + Dm / 2 + .08]); occR.sort((a, b) => a[0] - b[0]);
        if (CFG.corners === 'pilaster') cand.push(sa + Dm / 2 + .02, sb - Dm / 2 - .02);
        let cur = sa + e; const free = []; for (const [c0, c1] of occR) { if (c0 > cur) free.push([cur, c0]); cur = Math.max(cur, c1); } if (sb - e > cur) free.push([cur, sb - e]);
        for (const [f0, f1] of free) { const Gp = f1 - f0; if (Gp < Dm + .3) continue; const k = Math.max(1, Math.floor(Gp / CFG.rhythm)); for (let i = 1; i <= k; i++) cand.push(f0 + Gp * i / (k + 1)); }
        for (const c of cand) pilaster(g, c, st.ya, st.yt, Dm, false); if (st.ground) g.pils.push(...cand); } });

    // ---- نظام كبير: بيلاسترات تمتد على كل الأدوار (من القاعدة حتى تحت الكورنيش العلوي)، والأشرطة الوسطى تبقى خفيفة وراءها ----
    if (isS && CFG.giant && storeys.length) { const ya = storeys[0].ya, yt = storeys[storeys.length - 1].yt, H = yt - ya, Dm = Math.min(.62, Math.max(.4, H / (RATIO[CFG.order] + 2))), [sa, sb] = g.span((ya + yt) / 2), occR = [], cand = [];
      for (const r of spec) occR.push([r.u0 - .08, r.u1 + .08]); occR.sort((a, b) => a[0] - b[0]);
      const e = CFG.corners === 'pilaster' ? Dm + .2 : .6; if (CFG.corners === 'pilaster') cand.push(sa + Dm / 2 + .03, sb - Dm / 2 - .03);
      let cur = sa + e; const free = []; for (const [c0, c1] of occR) { if (c0 > cur) free.push([cur, c0]); cur = Math.max(cur, c1); } if (sb - e > cur) free.push([cur, sb - e]);
      const gaps = free.map(([f0, f1]) => f1 - f0).filter(v => v >= .75), Dg = Math.max(.36, Math.min(Dm, (gaps.length ? Math.min(...gaps) : 0) - .25));
      for (const [f0, f1] of free) if (f1 - f0 >= Dg + .2) cand.push((f0 + f1) / 2);
      cand.sort((a, b) => a - b); const keep = []; for (const c of cand) if (!keep.some(k => Math.abs(k - c) < Dg + 1.0)) keep.push(c);
      for (const c of keep) pilaster(g, c, ya, yt, Dg, false, .17); g.pils.push(...keep); }
    // ---- شرفات على كوابيل (بروز 0.30–0.66 م): بلاطة فوق كورنيش الشريط، درابزين حديد، كوابيل متدرجة تلتصق بالجدار ----
    if (isS && CFG.bal && bands.length) { const stBase = y => { let b = null; for (const x of bands) if (x + BH <= y + .02) b = x + BH; return b; };
      const balc = (u0, u1, yb, pr) => { const nC = Math.max(2, Math.round((u1 - u0) / 1.7) + 1), top = yb + .1, rh = .9, y1 = top + rh, fd = dF + pr - .05;
        B(trim, u0, u1, yb, top, dF - .02, dF + pr);
        for (let i = 0; i < nC; i++) { const x = u0 + .13 + i * (u1 - u0 - .26) / (nC - 1); G(trim, taper(x, yb - .5, yb, .05, .16, dF - .02, dF + .06, dF + pr - .04)); }
        B(iron, u0 + .02, u1 - .02, y1 - .04, y1, fd - .02, fd + .01); B(iron, u0 + .02, u1 - .02, top + .05, top + .08, fd - .015, fd + .008);
        const nb = Math.floor((u1 - u0 - .1) / .12); for (let i = 0; i <= nb; i++) { const x = u0 + .05 + i * (u1 - u0 - .1) / nb; B(iron, x - .008, x + .008, top + .08, y1 - .04, fd - .008, fd + .004); }
        for (const sx of [u0 + .03, u1 - .03]) { B(iron, sx - .02, sx + .02, top, y1, fd - .02, fd + .02); B(iron, sx - .012, sx + .012, y1 - .04, y1, dF + .02, fd); B(iron, sx - .012, sx + .012, top + .05, top + .08, dF + .02, fd);
          const ns = Math.max(1, Math.floor((pr - .1) / .15)); for (let k = 1; k < ns; k++) { const d = dF + .02 + k * (fd - dF - .02) / ns; B(iron, sx - .007, sx + .007, top + .08, y1 - .04, d - .007, d + .007); } } };
      const ups = g.ops.filter(o => !o.door && stBase(o.f.y0) != null && o.f.y0 > bands[0]);
      if (CFG.bal === 3) { const yb = bands[0] + BH, [sa, sb] = g.span(yb + .6); if (ups.some(o => stBase(o.f.y0) === yb)) balc(sa + .35, sb - .35, yb, .66); }
      else if (CFG.bal === 1) { if (mainDoor && mainDoor.g === g) { const ue = (mainDoor.o.f.u0 + mainDoor.o.f.u1) / 2, byS = new Map(); for (const o of ups) { const yb = stBase(o.f.y0), d = Math.abs((o.f.u0 + o.f.u1) / 2 - ue); if (!byS.has(yb) || d < byS.get(yb).d) byS.set(yb, { o, d }); }
          for (const [yb, { o }] of byS) if (Math.abs((o.f.u0 + o.f.u1) / 2 - ue) < 1.2) balc(o.f.u0 - .25, o.f.u1 + .25, yb, .62); } }
      else for (const o of ups) balc(o.f.u0 - .12, o.f.u1 + .12, stBase(o.f.y0), .30); }
    // ---- مصاريع خشبية بشرائح (تلتصق بالجدار، بروز 6 سم) ----
    if (isS && CFG.shut) for (const o of g.ops) { if (o.door) continue; const f = o.f, w = f.u1 - f.u0, ws = Math.min(.5, Math.max(.28, w * .5)), [sa, sb] = g.span((f.y0 + f.y1) / 2);
      for (const sd of [-1, 1]) { const e = sd < 0 ? f.u0 - dec(o) : f.u1 + dec(o), x0 = sd < 0 ? e - ws - .02 : e + .02, x1 = x0 + ws;
        if (x0 < sa + .3 || x1 > sb - .3 || g.pils.some(c => c > x0 - .3 && c < x1 + .3) || spec.some(r => r.door && r.u0 < x1 + .05 && r.u1 > x0 - .05) || g.ops.some(p => p !== o && p.f.u0 - dec(p) - .03 < x1 + .06 && p.f.u1 + dec(p) + .03 > x0 - .06 && p.f.y1 > f.y0 - .3 && p.f.y0 < f.y1 + .3)) continue;
        B(shutMat, x0, x1, f.y0 - .02, f.y1 + .02, dF - .02, dF + .045); for (let y = f.y0 + .02; y < f.y1 - .03; y += .11) B(shutDark, x0 + .035, x1 - .035, y, y + .012, dF + .045, dF + .056); B(shutMat, x0, x0 + .035, f.y0 - .02, f.y1 + .02, dF + .045, dF + .056); B(shutMat, x1 - .035, x1, f.y0 - .02, f.y1 + .02, dF + .045, dF + .056); } }
    // ---- جملون تاجي مركزي فوق الدروة على محور المدخل ----
    if (isS && CFG.attic && topBand != null && (!mainDoor || mainDoor.g === g)) { const ue = mainDoor ? (mainDoor.o.f.u0 + mainDoor.o.f.u1) / 2 : (g.u0 + g.u1) / 2, sw2 = Math.min(4.6, g.u1 - g.u0 - 1.4);
      if (sw2 > 2) { const pu0 = Math.max(g.u0 + .6, Math.min(g.u1 - .6 - sw2, ue - sw2 / 2)), pu1 = pu0 + sw2, kind = CFG.pediment === 'seg' ? 'seg' : 'tri', rise = sw2 / (kind === 'seg' ? 7 : 5.5);
        B(trim, pu0 - .06, pu1 + .06, g.y1 + .035, g.y1 + .135, dF - .02, dF + .12); pediment(g, pu0, pu1, g.y1 + .135, kind, rise, .16, .09); } }
    // ---- إظلام تماس الجدار بالأرض ----
    if (g.y0 <= .01) { const P = (u, y, d) => t.clone().multiplyScalar(u).addScaledVector(n, d).setY(y), A = P(g.u0, .003, dF), Bp = P(g.u1, .003, dF), w = n.clone().multiplyScalar(.5), geo = new THREE.BufferGeometry(), v = [A, Bp, Bp.clone().add(w), A.clone().add(w)];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 1], 2)); geo.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
      const o = new THREE.Mesh(geo, aoMat(.4)); o.renderOrder = 2; scene.add(o); }
  }
  // مصابيح جدارية بين النوافذ (الجهة الأمامية) في الفراغات الواسعة
  for (const g of groups) if (g.side === 's') { const iv = [...g.spec].sort((a, b) => a.u0 - b.u0); let cur = g.u0 + .5; const cs = [];
    for (const r of iv) { if (r.u0 - cur > 2.2) cs.push((cur + r.u0) / 2); cur = Math.max(cur, r.u1); } if (g.u1 - .5 - cur > 2.2) cs.push((cur + g.u1 - .5) / 2);
    for (const c of cs.slice(0, 3)) if (!g.pils.some(p => Math.abs(p - c) < .6)) lamps.push({ g, u: c, y: 2.0 }); }
  const lampsOk = []; for (const l of lamps) { const g = l.g; const hit = u => (g.spec || []).some(r => !r.door && u > r.u0 - .08 && u < r.u1 + .08 && r.y1 > l.y - .25 && r.y0 < l.y + .3) || (g.spec || []).some(r => r.door && r.u0 > 0 && false) || g.pils.some(p => Math.abs(p - u) < .32) || u < g.u0 + .3 || u > g.u1 - .3;
    let u = l.u; if (hit(u)) { u = [l.u - .35, l.u + .35].find(x => !hit(x)); if (u === undefined) continue; } if (lampsOk.some(o => o.g === g && Math.abs(o.u - u) < .3)) continue; lampsOk.push({ g, u, y: l.y }); }
  lamps.length = 0; lamps.push(...lampsOk);
  for (const l of lamps) lampBody(l.g, l);

  /* ====== إنشاء الشبكات ====== */
  for (const b of buckets.values()) { const mat = b.mat, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== led && mat !== lampGlass; m.receiveShadow = true; m.name = 'classic-' + (mat.name || 'mat'); scene.add(m); }
  for (const it of insts) { const im = new THREE.InstancedMesh(it.geo, it.mat, it.mats.length); it.mats.forEach((mm, i) => im.setMatrixAt(i, mm)); im.castShadow = im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; scene.add(im); }
  if (night) lamps.slice(0, 10).forEach(l => { const { g } = l, p = g.t.clone().multiplyScalar(l.u).addScaledVector(g.n, g.d + .12).setY(l.y - .1), L = new THREE.SpotLight('#ffd9a0', 7, 5, 1.2, .6, 2);
    L.position.copy(p); L.target.position.copy(p).addScaledVector(g.n, .35).setY(0); scene.add(L, L.target); });

  // بوابة الجودة: أقصى بروز، وعدم تحريك أي جدار/فتحة (مقارنة صناديق الإحاطة قبل/بعد)
  lastGates = { maxProjectionMm: Math.round(maxProj * 1000), openingsUnchanged: snap() === before, tpl: TP?.id || null, level: CFG.level, order: CFG.order, notImplemented: [
    'عمود حر مفصول عن الجدار (يتطلب بروزًا أكبر من 250 مم): استُعيض عنه ببيلاستر/عمود نصف دائري ملاصق',
    'شرفة/بلكونة حديد مشغول أمام نوافذ الأدوار العليا (بروز أكبر من 250 مم)',
    'فتحات مقوّسة حقيقية (قطع الجدار ممنوع): الأقواس زخرفية فوق الفتحة المستطيلة',
    'درج مدخل أعرض من 250 مم، وخزانات الإضاءة الدائرية (لا تُحرَّك الأرض)'] };
  globalThis.__CLASSIC_GATES = lastGates;
  const sg = groups.filter(g => g.side === 's'); if (!sg.length) return {};
  const wallD = Math.max(...sg.map(g => g.d)), face = sg.filter(g => g.d > wallD - .1);
  return { wallZ: wallD, X0: Math.min(...face.map(g => g.u0)), X1: Math.max(...face.map(g => g.u1)) };
}
