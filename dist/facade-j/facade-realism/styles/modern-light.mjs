// نمط M «معاصر خفيف»: جص أبيض/رمادي ناعم، حواف بلاطات رقيقة بارزة (15–25 سم)، زجاج كبير بإطارات رفيعة،
// جدار مميّز بخامة واحدة متباينة (خرسانة داكنة / برونز مؤنوَد / تيرازو)، زعانف رأسية أو بريسولاي أفقي من الألمنيوم،
// مدخل غائر بمظلة عميقة، مزاريب مخفية وشقوق إنارة خطية. يختلف عمدًا عن نمط J (حجر/خشب/صناديق سوداء).
// المراجع (بحث فقط، لا تنزيل): نماذج «contemporary / modern minimalist villa» الخليجية: جص أبيض، كابولي بلاطات 15–25 سم،
//   واجهات مُجزَّأة بخامة تباين واحدة، زعانف ألمنيوم رأسية ومظلات عميقة. ممارسة معمارية عامة؛ لا أرقام منسوخة من موقع محدد.
// sources: [ممارسة عمارة الفلل المعاصرة الخليجية (غير متحقق من مصدر منفرد)، مفردات Passivhaus/brise-soleil العامة (غير متحقق)]
// التنوّع (params.seed / params.rnd(k)): لوحة الألوان (4) · خامة الجدار المميّز (3) وموضعه وارتفاعه · زعانف/بريسولاي ·
//   عمق المظلة وجناحا المدخل · إيقاع حافة البلاطة (3) · معالجة الدروة (3) · نسبة المظلات فوق النوافذ · ارتفاع التغطية.
// القيود: لا تحريك لجدار/فتحة/منسوب؛ كل الإضافات أمام وجه الجدار؛ بروز الأغطية والبلاطات والإطارات 15–25 سم (المظلة والجناحان أعمق بحكم الوظيفة).
import { resolveTemplate } from '../templates.mjs';
const CLASSIC = new Set(['projection', 'surround', 'cornice', 'sill', 'pediment']);
let LAST = { maxProjectionMm: null, openingsUnchanged: null, notImplemented: [] };
const NOT_IMPL = ['تراجع المدخل الفعلي (recess) بحفر الجدار: ممنوع تحريك الجدار؛ يُعبَّر عنه بجناحين ملاصقين ولوح مظلة 25 سم وشق إنارة', 'المزاريب المخفية: بلا أثر بصري ظاهر', 'قياس البروز يستثني لصاقات إظلام التماس (مسطحة) والأضواء'];
export const gates = () => LAST;
const SIDES = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
export const meta = { id: 'M', ar: 'معاصر خفيف', get templateCount() { return templates.length; }, sources: ['ممارسة الفلل المعاصرة الخليجية (غير متحقق من مصدر منفرد)', 'brise-soleil / fins عامة (غير متحقق)'] };

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
/** خشب دافئ بعروق (rot=false: العروق رأسية للزعانف واللوحات، true: أفقية للشرائح). */
function timberMat(THREE, renderer, horizontal) {
  const S = 512, [c, x] = cnv(S, S), r = rnd(71); x.fillStyle = '#8a5a34'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) { const v = (r() - .5) * 46; x.fillStyle = `rgba(${v > 0 ? 255 : 30},${v > 0 ? 220 : 12},${v > 0 ? 170 : 4},${Math.abs(v) / 255})`; x.fillRect(i, 0, 2 + r() * 3, S); }
  for (let k = 0; k < 160; k++) { x.fillStyle = `rgba(40,20,8,${r() * .22})`; x.fillRect(r() * S, r() * S, .8 + r() * 1.2, 30 + r() * 160); }
  const t = tex(THREE, renderer, c, true, [1, 1]); if (horizontal) { t.center.set(.5, .5); t.rotation = Math.PI / 2; }
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: .62, metalness: 0, envMapIntensity: .6 }); m.name = 'timberM'; return m;
}
/** ترافرتين فاتح بأحجار كبيرة 60×30 سم وعروق أفقية (قماش 1.2×0.6). */
function travertineMat(THREE, renderer) {
  const S = 512, [c, x] = cnv(S, S), r = rnd(81), rows = 8, bh = S / rows; x.fillStyle = '#d8ccb4'; x.fillRect(0, 0, S, S);
  for (let b = 0; b < rows; b++) { const t = 205 + r() * 20; x.fillStyle = `rgb(${t},${t - 10},${t - 32})`; const off = (b % 2) * S / 4; for (let k = -1; k < 3; k++) x.fillRect(off + k * S / 2 + 1, b * bh + 1, S / 2 - 2, bh - 2);
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(150,128,96,${r() * .22})`; x.fillRect(r() * S, b * bh + r() * bh, 20 + r() * 120, 1); } }
  x.fillStyle = 'rgba(90,76,58,.5)'; for (let b = 0; b < rows; b++) x.fillRect(0, b * bh, S, 1.5); for (let b = 0; b < rows; b++) { const off = (b % 2) * S / 4; for (let k = -1; k < 3; k++) x.fillRect(off + k * S / 2, b * bh, 1.5, bh); }
  const t = tex(THREE, renderer, c, true, [1 / 1.2, 1 / 0.6]);
  const m = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: .3, roughness: .82, metalness: 0 }); m.name = 'travertineM'; return m;
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
  { n: 'رملي دافئ', render: '#dccfb6', slab: '#ece3d0', trim: '#3a342c', trimW: 0, warm: 1 }, // 4: للقوالب فقط
  { n: 'رمادي حجري', render: '#c2c5c0', slab: '#dcded9', trim: '#202427', trimW: 0, warm: 0 }, // 5: للقوالب فقط
];

export async function apply(THREE, { scene, renderer, S, q, FI, params }) {
  const R = k => params?.rnd ? params.rnd(k) : .5, seed = params?.seed | 0, night = q.get('night') === '1';
  const TPL = resolveTemplate(templates, q), TP = TPL ? { ...DEFAULT_P, ...TPL.p } : null; // بلا tpl: السلوك القديم حرفيًا
  // مقابض المنطقة المعمارية (variation.mjs): e موضع التركيز · r إيقاع الفتحات · t معالجة العنصر الرئيسي · p عمق البروز · c خط السقف
  const reg = params?.region || {}, bld = params?.building || {};
  const rg = { e: reg.e ?? Math.floor(R(2) * 4) % 4, r: reg.r ?? Math.floor(R(22) * 3) % 3, t: reg.t ?? Math.floor(R(21) * 3) % 3, p: reg.p ?? 1, c: reg.c ?? Math.floor(R(23) * 3) % 3 };
  const palQ = q.get('pal'), ornQ = q.get('orn');
  const PAL = PALETTES[((palQ != null && palQ !== '' && !isNaN(+palQ)) ? +palQ % 4 : TP ? TP.pal : (params?.palette ?? Math.floor(R(1) * 4)) % 4)];
  const ORN = TP && ornQ == null ? TP.orn : ornQ == null ? 1 : ({ light: 0, balanced: 1, ornate: 2 }[ornQ] ?? Math.max(0, Math.min(2, Math.round(+ornQ || 0)))); // مستوى الزخرفة
  const FEAT = TP ? TP.feat : Math.floor(R(2) * 3) % 3, FINS = TP ? TP.scr === 1 : R(5) < .5; // خامة الجدار المميّز · زعانف رأسية أم بريسولاي أفقي
  const MAXP = .25, PROJ = Math.min(.20, Math.max(.15, Number(q.get('proj') ?? ([.15, .17, .195][rg.p] + (R(3) - .5) * .01)))); // هامش أمان 4 سم لاختلاف وجوه الجدار الموضعية // سقف البروز 250 مم بوابة إلزامية
  if (TP) { rg.e = TP.e; rg.r = TP.grp; }
  const SLABMODE = TP ? TP.slab : rg.t === 2 ? 0 : 1 + (R(4) < .5 ? 0 : 1), PARAMODE = TP ? TP.para : [0, 2, 1][rg.c], LED = !TP || TP.led === 1;
  const WINM = TP ? ((TP.wrap > 0 && [3, 4, 5, 6].includes(TP.win)) ? 1 : TP.win) : -1, DEEPD = TP ? [.46, .58, .70][TP.slabD] : 0;
  const HOODP = ([.35, .8, .12][rg.t]) * [.45, 1, 1.35][ORN], FEATFULL = TP ? TP.featH === 0 : rg.t === 2 ? true : R(9) < .5;
  const CD = Math.min(.21, PROJ + .005), JD = Math.min(.2, PROJ - .005); // مظلة رقيقة بلوح ≤25 سم؛ جناحا المدخل ملاصقان بعمق ≤24 سم
  const WING = TP ? TP.wing : rg.t === 0 && ORN > 0 ? 2 : rg.e === 1 ? 0 : rg.e === 2 ? 1 : (bld.symmetry > .7 ? 2 : Math.floor(R(11) * 3) % 3); // 0 يسار 1 يمين 2 كلاهما
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
  const feat = FEAT === 0 ? concreteMat(THREE, renderer) : FEAT === 1 ? bronzeMat(THREE, renderer) : FEAT === 2 ? terrazzoMat(THREE, renderer, PAL.warm) : FEAT === 3 ? timberMat(THREE, renderer, false) : FEAT === 4 ? travertineMat(THREE, renderer) : null; // 5: بلا جدار مميّز
  const ACC = TP ? TP.acc : 0, steel = new THREE.MeshStandardMaterial({ color: '#25282b', metalness: .6, roughness: .38 }); steel.name = 'steel-blackM';
  const accV = ACC === 1 ? steel : ACC === 2 ? timberMat(THREE, renderer, false) : ACC === 3 ? bronzeMat(THREE, renderer) : null; // الشرائح الأفقية تستعمل accH
  const accH = ACC === 2 ? timberMat(THREE, renderer, true) : accV;
  const trim = new THREE.MeshStandardMaterial({ color: PAL.trim, metalness: PAL.trimW ? .25 : .55, roughness: PAL.trimW ? .45 : .36 }); trim.name = PAL.trimW ? 'frame-whiteM' : 'steel-blackJ';
  const alu = new THREE.MeshStandardMaterial({ color: PAL.trimW ? '#dcdcda' : '#8b8f93', metalness: .8, roughness: .32, envMapIntensity: 1 }); alu.name = 'aluminium-M';
  const greenM = new THREE.MeshStandardMaterial({ color: '#4f7a3a', roughness: .95 }); greenM.name = 'foliageM';
  const AV = accV || alu, AH = accH || alu;
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
      if (mat === led && !LED) return null; if (opt?.m) metric(g, sx, sy, sz); const o = new THREE.Mesh(g, mat); o.position.copy(t.clone().multiplyScalar(u)).addScaledVector(n, d).setY(y);
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
    const planeAt = (u, d) => { let best = d, bd = 9; for (const w of walls) if (u >= w.u0 - .05 && u <= w.u1 + .05) { const dd = Math.abs(w.d1 - d); if (dd < bd) { bd = dd; best = w.d1; } } return bd < .4 ? best : d; }; // وجه الجدار الذي تقع عليه الفتحة (لا الوجه الأمامي للجهة)
    const dFor = y => (sbk && y > FLtop + .3) ? wallD - sbk : wallD; // وجه الجدار المعني بالارتفاع y
    // --- شاشة: زعانف ألمنيوم رأسية أو بريسولاي أفقي أمام مستطيل ---
    const screen = (u0, u1, y0, y1, d, fins) => { const w = u1 - u0, h = y1 - y0, dd = d + .13;
      add(w, .04, .08, AH, (u0 + u1) / 2, y1, dd, false); add(w, .04, .08, AH, (u0 + u1) / 2, y0, dd, false);
      if (fins) { const step = .15, nF = Math.floor(w / step); for (let i = 0; i <= nF; i++) add(.035, h, .12, AV, u0 + (w - nF * step) / 2 + i * step, (y0 + y1) / 2, dd); }
      else { const step = .1, nL = Math.floor(h / step); for (let i = 0; i <= nL; i++) add(w, .018, .11, AH, (u0 + u1) / 2, y0 + (h - nL * step) / 2 + i * step, dd, true, { tilt: -.55 }); } };
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
      const dTop = planeAt(cx, d), Lr = t => Math.max(.03, dTop + t - d), ymid = (y0 + y1) / 2, hh = y1 - y0; // Lr: عمق يبلغ بروزًا t من وجه الجدار
      const doScreen = !TP && isS && grp.length === 1 && bigWin === g0 && R(6) < (rg.t === 1 ? .9 : .5) && w <= 3.0 && y0 > .3;
      const doScreenT = TP && isS && grp.length === 1 && bigWin === g0 && TP.scr > 0 && TP.wrap === 0 && w <= 3.0 && y0 > .3 && WINM !== 4 && WINM !== 5;
      if (doScreen || doScreenT) screen(u0 - .05, u1 + .05, y0 - .03, y1 + .03, d, FINS);
      else if (TP && WINM === 3) { // صندوق إطار عميق (قشرة جص فوق وجه الجدار، يتصل به من الخلف)
        const th = .14, x0 = u0 - th, x1 = u1 + th, yy0 = y0 - th, yy1 = y1 + th, dp = Lr(.44);
        add(x1 - x0, th, dp, slabM, (x0 + x1) / 2, yy1 - th / 2, d + dp / 2); add(x1 - x0, th, dp, slabM, (x0 + x1) / 2, yy0 + th / 2, d + dp / 2);
        add(th, yy1 - yy0 - 2 * th, dp, slabM, x0 + th / 2, (yy0 + yy1) / 2, d + dp / 2); add(th, yy1 - yy0 - 2 * th, dp, slabM, x1 - th / 2, (yy0 + yy1) / 2, d + dp / 2);
        add(w, .012, .012, led, cx, y1 - .01, d + dp - .06, false); ao([u0, y1, d + .003], [u1, y1, d + .003], [0, -.3, 0], .4);
      } else if (TP && WINM === 4) { // زعانف رأسية عمودية على الجدار + غطاء علوي رقيق
        const Lf = Lr(.30), n = Math.max(2, Math.floor(w / .30));
        for (let i = 0; i <= n; i++) add(.04, hh + .1, Lf, AV, u0 + w * i / n, ymid, d + Lf / 2);
        add(w + .1, .04, Lf, AH, cx, y1 + .07, d + Lf / 2);
      } else if (TP && WINM === 5) { // كاسر أفقي مائل بين خدّين جانبيين
        const Lc = Lr(.46); add(.04, hh + .34, Lc, AV, u0 - .04, ymid, d + Lc / 2); add(.04, hh + .34, Lc, AV, u1 + .04, ymid, d + Lc / 2);
        const nL = Math.floor((hh + .2) / .14); for (let i = 0; i <= nL; i++) add(w + .08, .02, .30, AH, cx, y0 - .02 + i * .14, d + .18, true, { tilt: -.5 });
      } else if (TP && WINM === 6) { // حاجب عميق بخدّين
        const Le = Lr(.70); add(w + .5, .06, Le, slabM, cx, y1 + .12, d + Le / 2); add(.05, .46, Le, slabM, u0 - .22, y1 - .1, d + Le / 2); add(.05, .46, Le, slabM, u1 + .22, y1 - .1, d + Le / 2);
        add(w + .3, .02, .02, led, cx, y1 + .08, d + Le - .04, false); ao([u0 - .2, y1 + .09, d + .003], [u1 + .2, y1 + .09, d + .003], [0, -.3, 0], .35);
      } else if (TP ? WINM === 1 : key < HOODP) { // مظلة أفقية رقيقة (≤ PROJ) فوق النافذة/المجموعة بعرض أكبر منها
        add(w + .5, .06, PROJ, slabM, cx, y1 + .1, d + PROJ / 2); add(w + .5, .02, .02, led, cx, y1 + .068, d + PROJ - .03, false);
        ao([u0 - .25, y1 + .07, d + .003], [u1 + .25, y1 + .07, d + .003], [0, -.28, 0], .35);
      } else if (TP ? WINM === 2 : key < HOODP + BOXP) { // إطار جصّي بارز حول النافذة أو حول المجموعة كلها (تأطير فقط)
        const th = .09, x0 = u0 - th, x1 = u1 + th, yy0 = y0 - th, yy1 = y1 + th, dp = PROJ * .85;
        add(x1 - x0, th, dp, slabM, (x0 + x1) / 2, yy1 - th / 2, d + dp / 2); add(x1 - x0, th, dp, slabM, (x0 + x1) / 2, yy0 + th / 2, d + dp / 2);
        add(th, yy1 - yy0 - 2 * th, dp, slabM, x0 + th / 2, (yy0 + yy1) / 2, d + dp / 2); add(th, yy1 - yy0 - 2 * th, dp, slabM, x1 - th / 2, (yy0 + yy1) / 2, d + dp / 2);
        ao([x0, yy0, d + .003], [x1, yy0, d + .003], [0, -.12, 0], .3);
      } else if (y0 > .3) add(w + .06, .035, .1, slabM, cx, y0 - .02, d + .05); // عتبة رفيعة فقط
      ao([u0, y1, d + .003], [u1, y1, d + .003], [0, -.1, 0], .22); }
    for (const g of gl) { const { b, d } = g, w = b.u1 - b.u0; if (w >= .85) continue; const cx = (b.u0 + b.u1) / 2, key = rr(String(g.m.userData.opening) + side + seed); // نافذة صغيرة
      add(w + .1, .035, .1, slabM, cx, b.y0 - .02, d + .05); if (TP ? (WINM === 1 || WINM === 6) : key < .5 * [.5, 1, 1.4][ORN]) add(w + .2, .05, PROJ * .8, slabM, cx, b.y1 + .06, d + PROJ * .4); }
    // --- الأبواب: مظلة عميقة وجناحان وأرضية ---
    const doorZones = [], wrapZ = []; let plStone = null, plDark = null, woodV = null;
    for (const { b, d } of (TP ? [] : doors)) { const w = b.u1 - b.u0, cx = (b.u0 + b.u1) / 2, ext = (rg.t === 0 ? .7 : .35) + R(12) * .3, cw = w + ext * 2, cdep = CD, yC = Math.min(b.y1 + .32, (bands[0] ?? 3.55) - .22);
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
    if (TP) for (const { b, d } of doors) { const w = b.u1 - b.u0, cx = (b.u0 + b.u1) / 2, ER = TP.entr, ext = [.4, .5, .45, .5, .4][ER] + R(12) * .1 + (TP.sl ? .6 : 0), cw = w + ext * 2, base = planeAt(cx, d), Rr = t => Math.max(.03, base + t - d);
      const yC = Math.min(b.y1 + .32, (bands[0] ?? 3.55) - .22), dep = ER === 1 ? Rr(.70) : ER === 2 ? Rr(.50) : ER === 3 ? Rr(.50) : ER === 4 ? Rr(.66) : CD;
      doorZones.push([cx - cw / 2 - .1, cx + cw / 2 + .1]);
      if (ER === 0 || ER === 1) { const th = ER === 1 ? .16 : .14;
        add(cw, th, dep, slabM, cx, yC, d + dep / 2); add(cw - .04, .02, dep - .04, ER === 1 && ACC === 2 ? AH : trim, cx, yC - th / 2 - .009, d + dep / 2, false);
        add(cw - .2, .02, .02, led, cx, yC - th / 2 - .02, d + dep - .05, false);
        for (let i = 0; i < 3; i++) add(.09, .015, .09, led, cx + (i - 1) * Math.max(.5, cw / 3.6), yC - th / 2 - .022, d + dep * .5, false);
        ao([cx - cw / 2, yC - th / 2, d + .003], [cx + cw / 2, yC - th / 2, d + .003], [0, -.4, 0], .42); }
      else if (ER === 2) { const inn = w / 2 + .12 + (TP.sl ? .6 : 0), jw = cw / 2 - inn, yBot = b.y1 + .04, yTp = Math.max(yC + .1, yBot + .22);
        add(cw, yTp - yBot, dep, slabM, cx, (yBot + yTp) / 2, d + dep / 2); for (const sg of [-1, 1]) add(jw, yBot, dep, slabM, cx + sg * (inn + jw / 2), yBot / 2, d + dep / 2);
        add(w + .24, .012, .012, led, cx, yBot - .008, d + dep - .06, false); ao([cx - cw / 2, yBot, d + .003], [cx + cw / 2, yBot, d + .003], [0, -.3, 0], .4); }
      else if (ER === 3) { add(cw, .10, dep, slabM, cx, yC, d + dep / 2); add(cw - .2, .02, .02, led, cx, yC - .06, d + dep - .05, false);
        for (const sg of [-1, 1]) { const a0 = w / 2 + .14 + (TP.sl ? .6 : 0), a1 = cw / 2 - .03, n = Math.floor((a1 - a0) / .13), Lf = Rr(.30); for (let i = 0; i <= n; i++) add(.035, yC - .11, Lf, AV, cx + sg * (a0 + (a1 - a0) * i / Math.max(1, n)), (.06 + yC - .05) / 2, d + Lf / 2); } }
      else { const yP = yC + .05, px = [cx - (cw / 2 - .05), cx + (cw / 2 - .05)], bl = base + .645 - d; // برجولا: عمودان أماميان وجسر خلفي على الجدار
        for (const x of px) { add(.09, yP, .09, AV, x, yP / 2, base + .60); add(.07, .14, bl, AV, x, yP, d + bl / 2); }
        add(cw, .14, .09, AV, cx, yP, base + .60); add(cw + .04, .16, .05, AV, cx, yP, d + .025);
        for (let u = -cw / 2 + .1; u <= cw / 2 - .09; u += .14) add(.05, .05, bl, AH, cx + u, yP + .095, d + bl / 2); }
      add(cw + .3, .02, Math.min(dep, .7), paving, cx, .01, d + Math.min(dep, .7) / 2, false);
      for (const sgn of [-1, 1]) { const use = WING === 2 || (WING === 0 && sgn < 0) || (WING === 1 && sgn > 0); if (!use) continue;
        add(.26, yC + .07, JD, feat || slabM, cx + sgn * (cw / 2 + .13), (yC + .07) / 2, d + JD / 2, true, { m: true });
        ao([cx + sgn * (cw / 2), 0, d + .003], [cx + sgn * (cw / 2), yC - .07, d + .003], [-sgn * .35, 0, 0], .4); }
      ao([b.u0 - ext, 0, d + .002], [b.u1 + ext, 0, d + .002], [0, .0, .25], .35); }
    // --- أعمدة رأسية (piers) ---
    const pierZ = [];
    if (TP && TP.piers) { const yTp = sbk ? frontTop : topAll, PD = .40, pw = .30;
      const pier = (u, wd) => { add(wd, yTp - .06, PD, slabM, u, (yTp + .06) / 2, wallD + PD / 2); pierZ.push([u - wd / 2 - .1, u + wd / 2 + .1]); ao([u - wd / 2, 0, wallD + PD + .003], [u + wd / 2, 0, wallD + PD + .003], [0, 0, .3], .3); };
      pier(X0 + pw / 2, pw); pier(X1 - pw / 2, pw);
      if (TP.piers === 2) { const bz = [...winZones.map(z => [z[0] - .3, z[1] + .3]), ...doorZones].sort((a, b) => a[0] - b[0]); let cur = X0 + pw + .1;
        for (const [a, b2] of [...bz, [X1 - pw - .1, X1]]) { if (a - cur >= .5) { const wd = Math.min(.26, a - cur - .2); pier((a + cur) / 2, wd); } cur = Math.max(cur, b2); } } }
    // --- قاعدة (plinth) ---
    if (TP && TP.plinth) { const ph = TP.plinth === 1 ? .6 : .32, pm = TP.plinth === 1 ? (FEAT === 4 ? feat : (plStone ||= travertineMat(THREE, renderer))) : (FEAT === 0 ? feat : (plDark ||= concreteMat(THREE, renderer)));
      const ex = [...doorZones, ...gl.filter(g => g.b.y0 < ph + .05).map(g => [g.b.u0 - .1, g.b.u1 + .1]), ...pierZ].sort((a, b) => a[0] - b[0]); let cur = X0;
      for (const [a, b2] of [...ex, [X1 + 1, X1 + 2]]) { const e0 = cur, e1 = Math.min(a, X1); if (e1 - e0 > .3) { add(e1 - e0, ph, .05, pm, (e0 + e1) / 2, ph / 2, wallD + .025, true, { m: true }); add(e1 - e0 + .02, .03, .09, slabM, (e0 + e1) / 2, ph + .015, wallD + .045); } cur = Math.max(cur, b2); } }
    // --- لفافة شاشة (wrap) على آخر دور ---
    if (TP && TP.wrap && TP.wrap < 4 && isS) { const yB = bands.length ? bands[bands.length - 1] + BH + .04 : .45, yT = (sbk ? frontTop : topAll) - .38;
      if (yT - yB > 1.1) { const ex = (yB < 2.9 ? [...doorZones] : []).concat(pierZ).sort((a, b) => a[0] - b[0]), iv = []; let cur = X0 + .3;
        for (const [a, b2] of ex) { if (a - cur >= 1.2) iv.push([cur, a - .1]); cur = Math.max(cur, b2 + .1); } if (X1 - .3 - cur >= 1.2) iv.push([cur, X1 - .3]);
        if (iv.length) { iv.sort((p1, p2) => (p2[1] - p2[0]) - (p1[1] - p1[0])); const big2 = iv[0], Lw = big2[1] - big2[0]; let a0 = big2[0], a1 = big2[1];
          if (TP.wrapAt < 3) { const ww = Math.min(Lw, Math.max(1.6, Lw * .58)); a0 = TP.wrapAt === 0 ? big2[0] : TP.wrapAt === 1 ? big2[1] - ww : big2[0] + (Lw - ww) / 2; a1 = a0 + ww; }
          wrapZ.push([a0 - .1, a1 + .1]); const len = a1 - a0, cu = (a0 + a1) / 2, ymd = (yB + yT) / 2, nT = Math.max(1, Math.round(len / 1.5));
          if (TP.wrap === 1) { add(len, .05, .10, AH, cu, yT, wallD + .30); add(len, .05, .10, AH, cu, yB, wallD + .30); const nF = Math.floor(len / .14);
            for (let i = 0; i <= nF; i++) add(.03, yT - yB, .14, AV, a0 + (len - nF * .14) / 2 + i * .14, ymd, wallD + .30);
            for (let i = 0; i <= nT; i++) for (const yy of [yT, yB]) add(.05, .05, .30, AV, a0 + len * i / nT, yy, wallD + .15); }
          else if (TP.wrap === 2) { for (let i = 0; i <= nT; i++) add(.06, yT - yB + .1, .34, AV, a0 + len * i / nT, ymd, wallD + .17); const nL = Math.floor((yT - yB) / .12);
            for (let i = 0; i <= nL; i++) add(len, .02, .13, AH, cu, yB + .06 + i * .12, wallD + .30, true, { tilt: -.55 }); }
          else { for (let i = 0; i <= nT; i++) add(.05, yT - yB + .08, .14, AV, a0 + len * i / nT, ymd, wallD + .07); const nL = Math.floor((yT - yB) / .11);
            for (let i = 0; i <= nL; i++) add(len, .07, .05, AH, cu, yB + .04 + i * .11, wallD + .14); } } } }

    // --- ستائر/لوفرات/ساتر تموجي (wrap 4..6): إطار حامل متصل بالجدار بدعامات كل 1.5 م ---
    if (TP && TP.wrap >= 4 && isS) { const full = TP.wrap === 4, nb = bands.length, yB = full ? .32 : (nb >= 2 ? bands[nb - 2] + BH + .1 : .45), yT = full ? (sbk ? frontTop : topAll) - .38 : (nb >= 2 ? bands[nb - 1] : (sbk ? frontTop : topAll) - .38); // ساتر الدور الأخير أمام نوافذه لا في منطقة الدروة
      if (yT - yB > 1.1) { const ex = (yB < 2.9 ? [...doorZones] : []).concat(pierZ).sort((a, b) => a[0] - b[0]), iv = []; let cur = X0 + .3;
        for (const [a, b2] of ex) { if (a - cur >= 1.2) iv.push([cur, a - .1]); cur = Math.max(cur, b2 + .1); } if (X1 - .3 - cur >= 1.2) iv.push([cur, X1 - .3]);
        const wV = TP.wrap === 6 ? AV : (woodV ||= timberMat(THREE, renderer, false)), SO = .30, ymd = (yB + yT) / 2;
        for (const [a0, a1] of iv) { const len = a1 - a0, cu = (a0 + a1) / 2; wrapZ.push([a0 - .1, a1 + .1]);
          add(len, .05, .08, TP.wrap === 6 ? AH : wV, cu, yT, wallD + SO); add(len, .05, .08, TP.wrap === 6 ? AH : wV, cu, yB, wallD + SO);
          const nP = Math.max(1, Math.round(len / 1.5)); for (let i = 0; i <= nP; i++) for (const yy of [yT, yB]) add(.05, .05, SO, AV, a0 + len * i / nP, yy, wallD + SO / 2);
          if (full) for (const yb of bands) if (yb + BH > yB + .5 && yb + BH < yT - .5) add(len, .04, .06, wV, cu, yb + BH + .02, wallD + SO);
          if (TP.wrap === 4) { const st = .14, nF = Math.floor(len / st); for (let i = 0; i <= nF; i++) add(.045, yT - yB, .10, wV, a0 + (len - nF * st) / 2 + i * st, ymd, wallD + SO); }
          else if (TP.wrap === 5) { const wd = .62, nF = Math.max(1, Math.floor(len / wd)), step = len / nF, hz = (yT - yB) / 2; // لوح معلّق بحبلين ويدور حول محور رأسي: زاوية تتغير بين اللوحات وبين نصفي الارتفاع
            for (let i = 0; i < nF; i++) for (let k = 0; k < 2; k++) { const ang = [.0, .5, 1.05, .25, .85, 1.2, .6][(i * 3 + k * 2 + Math.round(a0 * 3)) % 7] * (k ? -1 : 1) * (i % 2 ? 1 : -1), o = add(wd - .04, hz - .04, .03, wV, a0 + step * (i + .5), yB + hz * (k + .5), wallD + SO, true);
              o.rotateOnAxis(up, ang); }
            for (let i = 0; i <= nF; i++) add(.03, yT - yB, .03, AV, a0 + step * i, ymd, wallD + SO - .06); }
          else { const wmax = 2.4, nPan = Math.max(1, Math.ceil(len / wmax)), pw = len / nPan, ph = yT - yB - .1; // ألواح ألومنيوم قص ليزر فاتحة بسماكة 5 سم
            for (let i = 0; i < nPan; i++) { const T6 = solarTessellation(pw - .04, ph, { u0: a0 + i * pw, v0: 0 }), cs = 14, [cv, cx2] = cnv(T6.nx * cs, T6.ny * cs); cx2.fillStyle = '#e9e7e1'; cx2.fillRect(0, 0, cv.width, cv.height); cx2.globalCompositeOperation = 'destination-out';
              for (let jj = 0; jj < T6.ny; jj++) for (let ii = 0; ii < T6.nx; ii++) { cx2.beginPath(); cx2.arc((ii + .5) * cs, cv.height - (jj + .5) * cs, T6.hole(ii, jj) * cs, 0, 7); cx2.fill(); }
              const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; const pm = new THREE.MeshStandardMaterial({ map: tx, alphaTest: .5, metalness: .55, roughness: .4, side: THREE.DoubleSide }); pm.name = 'laser-aluM';
              add(pw - .04, ph, .05, pm, a0 + (i + .5) * pw, ymd, wallD + SO); } } } } }
    // --- حواف البلاطات (كابولي رقيق) ---
    const segs = []; // [u0,u1,proj]
    const slabAt = (yb, dFace, idx) => { const h = [.26, .22, .15, .08, .18][SLABMODE], dep0 = SLABMODE === 3 ? .04 : SLABMODE === 4 ? DEEPD : PROJ, yTop = yb + BH, yc = yTop - h / 2;
      if (SLABMODE === 1) { const sp = X0 + (X1 - X0) * (.38 + R(13) * .26), pa = Math.min(.205, PROJ + .01), pb = Math.max(.15, PROJ - .05);
        add(sp - X0 + .01, h, pa, slabM, (X0 + sp) / 2, yc, dFace + pa / 2); add(X1 - sp + .01, h, pb, slabM, (sp + X1) / 2, yc, dFace + pb / 2);
        add(.02, h, .01, trim, sp, yc, dFace + Math.max(pa, pb) + .004, false);
      } else add(X1 - X0 + .02, h, dep0, slabM, (X0 + X1) / 2, yc, dFace + dep0 / 2);
      if (SLABMODE === 4) add(X1 - X0 - .04, .02, dep0 - .06, ACC === 2 ? AH : trim, (X0 + X1) / 2, yTop - h - .011, dFace + dep0 / 2, false); // سقف سفلي
      if (SLABMODE === 2) add(X1 - X0 - .04, .03, PROJ - .06, trim, (X0 + X1) / 2, yTop - h - .015, dFace + (PROJ - .06) / 2); // فاصل ظل داكن تحت الحافة
      add(X1 - X0 - .3, .014, .014, led, (X0 + X1) / 2, yTop - h - (SLABMODE === 2 ? .04 : SLABMODE === 4 ? .026 : .004), dFace + dep0 - .05, false); // شق الإنارة الخطي في الجانب السفلي
      ao([X0, yTop - h, dFace + .003], [X1, yTop - h, dFace + .003], [0, -.3, 0], .36); ao([X0, yTop, dFace + .003], [X1, yTop, dFace + .003], [0, .12, 0], .2); };
    for (const yb of bands) { slabAt(yb, dFor(yb + BH), 0);
      if (TP && TP.plant && isS) { const dF = dFor(yb + BH), yTop = yb + BH, dp = SLABMODE === 4 ? Math.max(.46, DEEPD) : PROJ, pd = Math.min(.6, dp - .08), L2 = X1 - X0 - .6, zs = [...doorZones.map(z => [z[0] - .1, z[1] + .1]), ...pierZ];
        let cur = X0 + .3; const segs2 = []; for (const [a, b2] of mergeZ(zs.filter(z => yb < 4))) { if (a - cur > .8) segs2.push([cur, a - .1]); cur = Math.max(cur, b2 + .1); } if (X1 - .3 - cur > .8) segs2.push([cur, X1 - .3]); void L2;
        for (const [a, b2] of (yb < 4 ? segs2 : [[X0 + .3, X1 - .3]])) { const len = b2 - a, cu = (a + b2) / 2; add(len, .36, pd, slabM, cu, yTop + .18, dF + dp - pd / 2 - .02); add(len - .06, .02, pd - .06, paving, cu, yTop + .37, dF + dp - pd / 2 - .02, false);
          const nB = Math.floor(len / .42); for (let i = 0; i < nB; i++) { const rr2 = .17 + hash01('g' + i + yb + seed) * .1; add(.34, rr2 * 2 * .8, rr2 * 2, greenM, a + (len - nB * .42) / 2 + (i + .5) * .42, yTop + .38 + rr2 * .8, dF + dp - pd / 2 - .02, false); } } } }
    // --- الدروة العلوية ---
    const parapet = (yTop, dFace, X0_, X1_, isUpper) => { const W = X1_ - X0_, c = (X0_ + X1_) / 2;
      if (PARAMODE === 0) { add(W + .02, .06, PROJ, trim, c, yTop + .03, dFace + PROJ / 2 - .02); } // غطاء معدني رفيع يبرز
      else if (PARAMODE === 1) { add(W + .02, .30, PROJ, slabM, c, yTop - .12, dFace + PROJ / 2); add(W - .2, .014, .014, led, c, yTop - .272, dFace + PROJ - .04, false); add(W + .02, .05, PROJ - .02, trim, c, yTop + .055, dFace + PROJ / 2 - .01); ao([X0_, yTop - .27, dFace + .003], [X1_, yTop - .27, dFace + .003], [0, -.3, 0], .3); }
      else if (PARAMODE === 3) { // سقف سكين: لوح رقيق بتجاوز عميق فوق رأس الجدار
        add(W + .04, .11, .70, slabM, c, yTop + .045, dFace + .35); add(W - .2, .014, .014, led, c, yTop - .016, dFace + .64, false); ao([X0_, yTop, dFace + .003], [X1_, yTop, dFace + .003], [0, -.4, 0], .32); }
      else if (PARAMODE === 4) { // غطاء رفيع + زعانف علوية
        add(W + .02, .06, PROJ, trim, c, yTop + .03, dFace + PROJ / 2 - .02); const n = Math.floor(W / .20);
        for (let i = 0; i <= n; i++) add(.035, .55, .12, AV, X0_ + (W - n * .20) / 2 + i * .20, yTop + .335, dFace + .07); add(W, .04, .14, AH, c, yTop + .63, dFace + .07); }
      else if (PARAMODE === 5) { // طبقات متدرجة تزداد بروزًا كلما صعدت
        add(W + .02, .12, .22, slabM, c, yTop - .06, dFace + .11); add(W + .02, .10, .45, slabM, c, yTop + .05, dFace + .225); add(W + .02, .06, .68, slabM, c, yTop + .13, dFace + .34);
        add(W - .2, .014, .014, led, c, yTop - .006, dFace + .42, false); ao([X0_, yTop - .12, dFace + .003], [X1_, yTop - .12, dFace + .003], [0, -.3, 0], .3); }
      else { add(W + .02, .22, .06, slabM, c, yTop - .07, dFace + .03); add(W + .06, .035, PROJ, slabM, c, yTop + .02, dFace + PROJ / 2);
        if (TP ? PARAMODE === 6 : rg.c === 1) { const sw = W * (.3 + R(24) * .2), left = R(25) < .5; add(sw, .2, PROJ * .8, slabM, left ? X0_ + sw / 2 : X1_ - sw / 2, yTop + .13, dFace + PROJ * .4); } add(W, .012, .012, trim, c, yTop - .19, dFace + .06, false); } };
    if (TP && TP.acscreen && isS) { const yTp = sbk ? FLtop + .25 : topAll, dA = wallD, Wd = X1 - X0 - .4, segsA = [[.0, .55, 1.8], [.55, 1.0, 1.2]]; // قسمان: 1.8 م ثم 1.2 م، ساتر متصل بالجدار فوق الدروة
      for (const [f0, f1, hh2] of segsA) { const a = X0 + .2 + Wd * f0, b = X0 + .2 + Wd * f1, len = b - a, cu = (a + b) / 2; add(len, .06, .14, trim, cu, yTp + hh2 + .03, dA + .07); add(len, .08, .12, slabM, cu, yTp + .04, dA + .06);
        const nS = Math.floor(hh2 / .13); for (let i = 0; i < nS; i++) add(len - .1, .07, .06, slabM, cu, yTp + .14 + i * .13, dA + .07, true, { tilt: .0 }); for (let i = 0; i <= Math.round(len / 1.4); i++) add(.08, hh2, .12, slabM, a + len * i / Math.max(1, Math.round(len / 1.4)), yTp + hh2 / 2, dA + .06); }
      ao([X0, yTp, dA + .003], [X1, yTp, dA + .003], [0, .4, 0], .15); }
    const topBand = bands.length ? bands[bands.length - 1] + BH : 3.85;
    if (sbk) { parapet(frontTop, wallD, X0, X1, false); const lo = FLtop + .3; if (TOPY - lo > .2 && X1 - X0 > 2) parapet(TOPY, wallD - sbk, X0 + .1, X1 - .1, true); }
    else parapet(topAll, wallD, X0, X1, false);
    // شاشة حديثة في جزء الدروة بين الشريط الأخير والقمة (بريسولاي/زعانف) في وضع الدروة 2 فقط، فوق المنطقة الحرة
    const pTop = sbk ? TOPY : topAll, pBase = sbk ? FLtop + .3 : topBand, dP = sbk ? wallD - sbk : wallD;
    if (!TP && pTop - pBase > .5 && PARAMODE !== 0 && (X1 - X0) > 3) { const uw = (X1 - X0) * (.3 + R(14) * .25), us = R(15) < .5 ? X0 + .3 : X1 - .3 - uw; screen(us, us + uw, pBase + .12, Math.min(pTop - .35, pBase + 1.5), dP, !FINS); }
    // --- التماس مع الأرض ---
    add(X1 - X0, .08, .012, trim, (X0 + X1) / 2, .04, wallD + .006, false);
    ao([X0, .003, wallD], [X1, .003, wallD], [0, 0, .55], .5); ao([X0, 0, wallD + .003], [X1, 0, wallD + .003], [0, .4, 0], .3);
    // أطراف الجدار الرأسية: عمود زاوية بخطوط ظل
    if (isS) south = { X0, X1, top: topAll, wallD, doors, bands, add, winZones, doorZones, pierZ, wrapZ, frontTop, ao, sm, loc, gl, dP };
  }
  if (!south) { finish(); return {}; }
  const { X0, X1, wallD, add, winZones, doorZones, frontTop, pierZ, wrapZ } = south;
  // --- الجدار المميّز (خامة واحدة متباينة) في أكبر فراغ حر بلا فتحات ---
  const blocked = [...winZones.map(z => [z[0] - .35, z[1] + .35]), ...doorZones, ...pierZ, ...wrapZ].sort((a, b) => a[0] - b[0]);
  const free = []; let cur = X0 + .15; for (const [a, b] of blocked) { if (a - cur >= 1.0) free.push([cur, a]); cur = Math.max(cur, b); } if (X1 - .15 - cur >= 1.0) free.push([cur, X1 - .15]);
  if (free.length && feat) { // موضع الجدار المميّز حسب e: 0 وسط (أقرب فراغ للمنتصف) · 1 يسار · 2 يمين · 3 زوايا (شريطان طرفيان)
    const mid = (X0 + X1) / 2, byC = free.slice().sort((a, b) => Math.abs((a[0] + a[1]) / 2 - mid) - Math.abs((b[0] + b[1]) / 2 - mid)), byU = free.slice().sort((a, b) => a[0] - b[0]);
    const picks = rg.e === 1 ? [[byU[0], 0]] : rg.e === 2 ? [[byU[byU.length - 1], 1]] : rg.e === 3 ? (byU.length > 1 ? [[byU[0], 0], [byU[byU.length - 1], 1]] : [[byU[0], R(26) < .5 ? 0 : 1]]) : [[byC[0], .5]];
    const baseW = ([1.4, 2.2, 3.4][TP ? TP.featW : rg.t] + R(17) * 1.0) * (bld.solidVoid > .88 ? 1.2 : 1) * (rg.e === 3 ? .5 : 1);
    for (const [pick, pos] of picks) { const fw = Math.min(pick[1] - pick[0], baseW), fu0 = pick[0] + (pick[1] - pick[0] - fw) * pos;
      const hTop = FEATFULL ? frontTop : Math.min(frontTop, south.bands[0] ?? frontTop), fp = TP ? [.08 + R(19) * .06, .36 + R(19) * .04, .64 + R(19) * .05][TP.featD] : Math.min(.14, .08 + R(19) * .06);
      add(fw, hTop - .08, fp, feat, fu0 + fw / 2, (hTop - .08) / 2 + .04, wallD + fp / 2, true, { m: true });
      if (TP?.hug) { const th = .24, dh = Math.min(.7, fp + .2), x0 = fu0 - th, x1 = fu0 + fw + th, y1h = hTop - .08, ymx = y1h + .02; // إطار جص أبيض بارز يحضن الكتلة: عمودان وعتب علوي وعتبة سفلية
        add(th, ymx, dh, slabM, x0 + th / 2, ymx / 2 + .04, wallD + dh / 2); add(th, ymx, dh, slabM, x1 - th / 2, ymx / 2 + .04, wallD + dh / 2); add(x1 - x0, th, dh, slabM, (x0 + x1) / 2, ymx - th / 2 + .04, wallD + dh / 2); add(x1 - x0, .18, dh, slabM, (x0 + x1) / 2, .13, wallD + dh / 2); }
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

// =====================================================================================================
// مكتبة القوالب (طلب المالك 2026-11-05): كل مفتاح اختيار منفصل من قائمة معرّفة هنا؛ أي دمج مفتاحًا بمفتاح صالح.
//  تزيينية (apply):  pal 0..5 لوحة · feat 0 خرسانة 1 برونز 2 تيرازو 3 خشب 4 ترافرتين 5 بلا · e موضع الجدار المميّز 0 وسط 1 يسار 2 يمين 3 طرفان
//    featD عمقه (0 رقيق 1 ≈38 سم 2 ≈68 سم) · featH 0 كامل الارتفاع 1 منخفض · featW 0..2 عرض · wing أجنحة المدخل 0 يسار 1 يمين 2 كلاهما 3 بلا
//    slab حافة البلاطة 0 مستمرة 1 مجزأة 2 رقيقة بفاصل ظل 3 خيط 4 كابولي عميق · slabD عمق 4: 46/58/70 سم
//    para الدروة 0 غطاء 1 فاسيا 2 دروة جص 3 سقف سكين 70 سم 4 زعانف علوية 5 طبقات متدرجة 6 دروة بكتلة مرتفعة
//    win معالجة النوافذ 0 عارية 1 حاجب رقيق 2 إطار جص 3 صندوق عميق 4 زعانف رأسية 5 بريسولاي مائل 6 حاجب عميق بخدّين
//    grp تجميع النوافذ 0..2 · entr المدخل 0 مظلة 1 كابولي عميق 2 صندوق إطار 3 زعانف جانبية 4 برجولا بعمودين · scr شاشة النافذة الرئيسية 0/1 زعانف/2 بريسولاي
//    wrap لفافة آخر دور 0 بلا 1 زعانف 2 بريسولاي 3 شرائح خشب 4 ستار خشبي رأسي كامل الارتفاع 5 لوفرات خشب مفتوحة بزوايا متفاوتة 6 ساتر تموجي مثقب (solarTessellation) · hug 1 إطار جص أبيض يحضن الجدار المميّز · acscreen 1 دروة سطح متدرجة 1.8/1.2 م · plant 1 أحواض زراعة على بلاطات الأدوار · wrapAt 0 يسار 1 يمين 2 وسط 3 كامل · acc مادة الملحقات 0 ألمنيوم 1 فولاذ أسود 2 خشب 3 برونز
//    piers 0 بلا 1 عمودان طرفيان 2 إيقاعي · plinth 0 بلا 1 قاعدة ترافرتين 2 قاعدة خرسانة داكنة · led 0/1 · orn 0..2
//  مخطط (docTransform):  fl الأدوار 1..3 (حين لا يحددها الرابط) · wt سماكة الجدار الخارجي 0 كما هو 1 30 سم 2 40 سم · fs تقدّم الواجهة الأمامية 0 / 1 (60 سم)
//    sch فتحات الواجهة الأمامية 0 كما هي 1 شريط 2 ألواح بارتفاع كامل 3 شقوق رأسية 4 مربعات 5 جدار ستائري 6 علوية 7 أزواج طويلة 8 طويلة منفردة 9 مربعة كبيرة
//    ssch فتحات الجهات الأخرى (0 كما هي 1..9 مثل sch · 10 صمّاء) · ent موضع الباب الرئيسي 0 كما هو 1 وسط 2 يسار 3 يمين
//    ek نوع الباب 0 كما هو 1 مزدوج 1.6×2.4 2 كبير 2.0×2.7 3 مفرد 1.1×2.4 · sl نوافذ جانبية للباب 0/1
export const DEFAULT_P = { pal: 0, feat: 0, e: 0, featD: 0, featH: 0, featW: 1, wing: 2, slab: 0, slabD: 1, para: 0, win: 1, grp: 0, entr: 0, scr: 0, wrap: 0, wrapAt: 3, acc: 0, piers: 0, plinth: 0, led: 1, orn: 1,
  hug: 0, acscreen: 0, plant: 0, fl: 2, wt: 0, fs: 0, sch: 0, ssch: 0, ent: 0, ek: 0, sl: 0 };
const T = (id, ar, note, p, extra = {}) => ({ id, ar, note, p: { ...DEFAULT_P, ...p }, ...extra });
export const templates = [
  T('M01', 'أبيض صافٍ بشريط خيطي', 'جص أبيض بلا جدار مميّز، خيط بلاطة رقيق، نوافذ مربعة مثقوبة، بلا إنارة خطية.', { pal: 0, feat: 5, wing: 3, slab: 3, para: 0, win: 0, entr: 0, led: 0, sch: 4, ssch: 4, ek: 0 }),
  T('M02', 'بلاطات عميقة وزجاج ستائري', 'كابولي 70 سم وسقف سكين، جدار زجاجي كامل، باب كبير بمظلة عميقة.', { pal: 0, feat: 0, e: 1, wing: 3, slab: 4, slabD: 2, para: 3, win: 0, entr: 1, acc: 1, sch: 5, ssch: 2, ek: 2, ent: 1 }),
  T('M03', 'زعانف رأسية', 'زعانف ألمنيوم رأسية على كل النوافذ الطويلة، مدخل بزعانف جانبية ونوافذ جانبية.', { pal: 2, feat: 5, wing: 3, slab: 2, para: 1, win: 4, entr: 3, sch: 8, ssch: 3, ek: 1, ent: 3, sl: 1 }),
  T('M04', 'صناديق إطار عميقة', 'كل نافذة داخل صندوق جص بعمق 44 سم، مدخل بإطار صندوقي، قاعدة ترافرتين وجدران سميكة.', { pal: 3, feat: 4, featD: 1, e: 0, wing: 3, slab: 0, para: 2, win: 3, entr: 2, plinth: 1, sch: 9, ssch: 9, ek: 1, ent: 2, wt: 2 }),
  T('M05', 'لفافة شرائح خشب', 'شاشة شرائح خشب تغلّف جزءًا من الدور الأخير، دروة متدرجة، جدار خشبي ونوافذ جانبية للباب.', { pal: 1, feat: 3, e: 2, wing: 1, slab: 1, para: 5, win: 1, entr: 0, wrap: 3, wrapAt: 0, acc: 2, sch: 2, ssch: 4, ek: 3, ent: 3, sl: 1 }),
  T('M06', 'مدخل ببرجولا', 'برجولا فولاذية بعمودين أمام الباب، حواجب عميقة بخدّين، دور واحد، جدار برونزي.', { pal: 0, feat: 1, e: 1, featD: 1, wing: 3, slab: 3, para: 0, win: 6, entr: 4, acc: 1, sch: 7, ssch: 6, ek: 2, ent: 1, fl: 1 }),
  T('M07', 'أعمدة إيقاعية', 'أعمدة جص رأسية بين النوافذ، سقف سكين، نوافذ طويلة مزدوجة، مظلة كابولي.', { pal: 4, feat: 5, wing: 3, slab: 2, para: 3, win: 1, entr: 1, piers: 2, sch: 7, ssch: 7, ek: 1 }),
  T('M08', 'إطار بوابة كبير', 'عمودان طرفيان وبلاطات كابولي وسقف سكين يكوّنون إطارًا واحدًا حول جدار ستائري.', { pal: 2, feat: 1, featH: 1, e: 1, wing: 3, slab: 4, slabD: 1, para: 3, win: 0, entr: 2, piers: 1, sch: 5, ssch: 1, ek: 2, ent: 1, wt: 1 }),
  T('M09', 'كتلة خامة عميقة', 'كتلة خرسانة داكنة بارزة 68 سم في الوسط، قاعدة داكنة، شقوق رأسية.', { pal: 2, feat: 0, featD: 2, featW: 2, e: 0, wing: 2, slab: 1, para: 1, win: 1, entr: 0, plinth: 2, sch: 3, ssch: 3 }),
  T('M10', 'برونز وبريسولاي', 'جداران برونزيان عند الطرفين، بريسولاي مائل على كل نافذة، دروة متدرجة.', { pal: 1, feat: 1, featD: 1, featW: 0, e: 3, wing: 2, slab: 0, para: 5, win: 5, entr: 3, acc: 3, sch: 2, ssch: 6, ek: 1, ent: 2, fl: 3 }),
  T('M11', 'بريسولاي أفقي مغلِّف', 'شرائح برونزية مائلة تغلّف عرض الدور الأخير كله فوق ألواح زجاج بارتفاع كامل.', { pal: 3, feat: 5, wing: 3, slab: 2, para: 0, win: 0, entr: 1, wrap: 2, wrapAt: 3, acc: 3, sch: 2, ssch: 4, ek: 2, ent: 1 }),
  T('M12', 'قاعدة حجرية وجص', 'قاعدة ترافرتين 60 سم، كتلة ترافرتين على اليسار، إطارات جص وفتحات مربعة كبيرة، والواجهة تتقدم 60 سم وجدرانها 30 سم.', { pal: 5, feat: 4, featD: 1, e: 1, wing: 2, slab: 0, para: 2, win: 2, entr: 0, plinth: 1, grp: 1, sch: 9, ssch: 9, fs: 1, wt: 1 }),
  T('M13', 'تيرازو وحواجب', 'جدار تيرازو يمينًا، حواجب عميقة بخدّين على شرائط الزجاج، فولاذ أسود.', { pal: 2, feat: 2, e: 2, wing: 1, slab: 4, slabD: 0, para: 1, win: 6, entr: 1, scr: 2, acc: 1, grp: 2, sch: 1, ssch: 1, ek: 1 }),
  T('M14', 'خشب دافئ وزعانف', 'جدار خشبي عميق، زعانف خشبية على النوافذ، تاج زعانف علوي ومدخل بزعانف جانبية.', { pal: 1, feat: 3, featD: 1, e: 2, wing: 2, slab: 1, para: 4, win: 4, entr: 3, acc: 2, sch: 8, ssch: 3, ek: 1, sl: 1, ent: 2, fl: 3 }),
  T('M15', 'تاج الزعانف', 'زعانف علوية فوق الدروة، عمودان طرفيان، قاعدة خرسانة داكنة وألواح زجاج بارتفاع كامل.', { pal: 0, feat: 0, e: 0, wing: 3, slab: 2, para: 4, win: 1, entr: 0, scr: 1, piers: 1, plinth: 2, sch: 2, ssch: 2, ek: 2, ent: 1 }),
  T('M16', 'طبقات متدرجة', 'دروة من ثلاث طبقات تزداد بروزًا، كابولي 58 سم، كتلة تيرازو عميقة وجدران سميكة.', { pal: 4, feat: 2, featD: 1, e: 0, wing: 3, slab: 4, slabD: 1, para: 5, win: 2, entr: 1, acc: 3, sch: 6, ssch: 6, ek: 3, ent: 3, wt: 2 }),
  T('M17', 'شاشة زعانف كاملة', 'شاشة زعانف رأسية بعرض الواجهة فوق المدخل، سقف سكين، برجولا فولاذية.', { pal: 2, feat: 5, wing: 3, slab: 0, para: 3, win: 0, entr: 4, wrap: 1, wrapAt: 3, acc: 1, sch: 5, ssch: 2, ek: 0, ent: 1 }),
  T('M18', 'ستار خشبي كامل', 'شرائح خشب رأسية تلتف على كامل الواجهة من الأرض حتى الدروة بحامل متصل بالجدار، وتبقى الفتحات مقروءة خلفها.', { pal: 0, feat: 5, wing: 3, slab: 3, para: 0, win: 0, entr: 1, wrap: 4, acc: 2, sch: 9, ssch: 4, ek: 2, ent: 1, led: 1 }),
  T('M19', 'لوفرات خشبية قابلة للطي', 'ألواح خشب معلّقة تدور حول محور رأسي فتُفتح بزوايا متفاوتة بين الأعلى والأسفل فتعطي إيقاعًا متغيرًا فوق نوافذ الدور الأخير.', { pal: 4, feat: 5, wing: 3, slab: 2, para: 2, win: 0, entr: 0, wrap: 5, acc: 2, sch: 7, ssch: 7, ek: 1, ent: 1, fl: 3 }),
  T('M20', 'إطار أبيض يحضن كتلة خشبية', 'إطار جص أبيض بارز يحضن كتلة خشبية دافئة، ومدخل فندقي مهيب بمظلة كابولي عميقة وجناحين.', { pal: 0, feat: 3, featD: 1, featW: 2, e: 0, hug: 1, wing: 2, slab: 4, slabD: 1, para: 1, win: 2, entr: 1, acc: 2, sch: 9, ssch: 9, ek: 2, ent: 1, wt: 1 }),
  T('M21', 'واجهة مزدوجة شمسية', 'ساتر ألومنيوم مثقب فاتح بفتحات موجية (أضيق في الثلث الأعلى وأوسع عند مستوى العين) أمام نوافذ الأدوار العليا مع دروة متدرجة للمكيّفات.', { pal: 2, feat: 5, wing: 3, slab: 3, para: 3, win: 0, entr: 1, wrap: 6, acscreen: 1, acc: 0, sch: 9, ssch: 9, ek: 2, ent: 1, fl: 3 }, { acHeights: [1.8, 1.2] }),
  T('M22', 'دروة متدرجة للمكيّفات', 'دروة السطح بقسمين فعليين متصلين بالجدار (1.8 م و1.2 م) تحجب وحدات التكييف، فوق نوافذ أفقية وحواجب.', { pal: 1, feat: 4, featD: 1, e: 2, wing: 1, slab: 2, para: 0, win: 6, entr: 0, acscreen: 1, sch: 1, ssch: 1, ek: 1 }, { acHeights: [1.8, 1.2] }),
  T('M23', 'المودرن الحيوي', 'بلاطات شرفات عميقة 70 سم بأحواض زراعة مدمجة وكتل خضراء إجرائية، وترافرتين رمادي فضي ودروة متدرجة. الارتداد الفعلي للدور العلوي غير منفَّذ.', { pal: 5, feat: 4, featD: 1, e: 1, wing: 2, slab: 4, slabD: 2, para: 2, win: 0, entr: 1, plant: 1, acscreen: 1, acc: 1, sch: 9, ssch: 4, ek: 2, ent: 1, fl: 3 }, { acHeights: [1.8, 1.2] }),
];

// ── بدائل محور القوالب (2026-11-08): قالبان إضافيان مشتقان من قالبين قائمين؛ لكل منهما «ما الذي يختلف» في المدخل وإيقاع النوافذ وتوزيع الخامات.
//    القيم كلها من تعدادات الطراز نفسه (فيصح الدمج والتطفير)؛ لا يُدّعى لها مرجع معماري خارجي.
const variantM = (id, ar, base, differs, o) => { const b = templates.find(t => t.id === base); return { id, ar, note: differs.entrance + '؛ ' + differs.windows + '؛ ' + differs.materials, variantOf: base, differs, p: { ...b.p, ...o } }; };
templates.push(
  variantM('M24', 'الصناديق العميقة والبرجولا', 'M04', {
    entrance: 'الباب في الوسط تحت برجولا فولاذية بعمودين، بدل المدخل اليساري بإطار صندوقي في M04',
    windows: 'أزواج نوافذ طويلة بدل الفتحات المربعة الكبيرة، وتبقى صناديق الجص العميقة حول كل نافذة',
    materials: 'جدار مميّز خشبي على اليمين وقاعدة خرسانة داكنة بدل قاعدة الترافرتين' },
    { ent: 1, entr: 4, sch: 7, feat: 3, e: 2, plinth: 2 }),
  variantM('M25', 'التيرازو بالشقوق والبرونز', 'M13', {
    entrance: 'باب كبير 2.0×2.7 م في الجهة اليسرى داخل صندوق إطار مع نافذتين جانبيتين، بدل المدخل المظلل في M13',
    windows: 'شقوق رأسية بزعانف رأسية على الواجهة والجوانب بدل شرائط الزجاج بالحواجب',
    materials: 'جداران برونزيان عند الطرفين بدل جدار التيرازو الأيمن' },
    { ent: 2, ek: 2, sl: 1, entr: 2, sch: 3, ssch: 3, feat: 1, e: 3, win: 4 }),
);

// ===================================== تحويل المستند (الفتحات / المداخل / الجدران / الأدوار) =====================================
/** التغطية التموجية الشمسية: دالة صافية. f=sin(ω1·u)·cos(ω2·v)؛ الثقوب أضيق في الثلث الأعلى وأوسع عند مستوى العين (30–60%).
 *  تُرجع {nx,ny,ratio,bands:{top,mid,low},signature,hole(i,j)->نصف قطر الثقب كجزء من الخلية (0..0.5)}. */
export function solarTessellation(widthM, heightM, opts = {}) {
  const pitch = opts.pitch ?? .12, w1 = opts.w1 ?? 2 * Math.PI / 2.2, w2 = opts.w2 ?? 2 * Math.PI / 1.4, u0 = opts.u0 ?? 0, v0 = opts.v0 ?? 0;
  const nx = Math.max(1, Math.round(widthM / pitch)), ny = Math.max(1, Math.round(heightM / pitch));
  const env = vn => vn > 2 / 3 ? .42 : vn > .6 ? .42 + (2 / 3 - vn) / (2 / 3 - .6) * .58 : vn >= .3 ? 1 : .7 + vn / .3 * .3;
  const hole = (i, j) => { const u = u0 + (i + .5) * pitch, v = v0 + (j + .5) * pitch, vn = (j + .5) / ny, f = Math.sin(w1 * u) * Math.cos(w2 * v); return .46 * env(vn) * (.45 + .55 * (f + 1) / 2); };
  let tot = 0, top = 0, mid = 0, low = 0, nt = 0, nm = 0, nl = 0, h = 2166136261;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const r = hole(i, j), a = Math.PI * r * r; tot += a; const vn = (j + .5) / ny; if (vn > 2 / 3) { top += a; nt++; } else if (vn >= .3) { mid += a; nm++; } else { low += a; nl++; }
    h = Math.imul(h ^ Math.round(r * 1000), 16777619) >>> 0; }
  const ratio = tot / (nx * ny);
  return { nx, ny, ratio: +ratio.toFixed(4), bands: { top: +(top / Math.max(1, nt)).toFixed(4), mid: +(mid / Math.max(1, nm)).toFixed(4), low: +(low / Math.max(1, nl)).toFixed(4) }, signature: nx + 'x' + ny + ':' + (h >>> 0).toString(16), hole };
}
const clone = o => JSON.parse(JSON.stringify(o)), EPS_ = .03;
const wlen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
const wdir = w => { const L = wlen(w) || 1; return [(w.b.x - w.a.x) / L, (w.b.y - w.a.y) / L]; };
const uOf = (w, p) => { const [dx, dy] = wdir(w); return (p.x - w.a.x) * dx + (p.y - w.a.y) * dy; };
const onLine = (w, p, tol = .06) => { const [dx, dy] = wdir(w), px = p.x - w.a.x, py = p.y - w.a.y; return Math.abs(px * -dy + py * dx) < tol; };
const isWin_ = o => /^window/.test(o.kind), isEntryDoor = o => o.entry && !isWin_(o);
const OPMAX = 2.7, DOORMAX = 2.7; // أعلى رأس للفتحة (قبل منسوب القاعدة ≈0.45 م): شريط النموذج الحجري عند z=3.20 يرفض أي فتحة تلامسه
/** ثقوب مرفوضة حول الوصلات والفتحات الثابتة: يرجع [[a,b],...] مرتبة ومدموجة. */
const mergeZ = z => { z = z.filter(r => r[1] > r[0]).sort((a, b) => a[0] - b[0]); const o = []; for (const r of z) { const l = o[o.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else o.push(r.slice()); } return o; };
const freeOf = (L, margin, zones) => { const out = []; let cur = margin; for (const [a, b] of mergeZ(zones)) { if (a - cur > 0) out.push([cur, Math.min(a, L - margin)]); cur = Math.max(cur, b); } if (L - margin - cur > 0) out.push([cur, L - margin]); return out.filter(r => r[1] - r[0] > .2); };
/** يولّد فتحات نمط sch داخل مجال حر [u0,u1] (متر على امتداد الجدار). */
function schemeOpenings(sch, u0, u1) {
  const L = u1 - u0, out = [], mk = (kind, at, w, h, sill) => out.push({ kind, at: +at.toFixed(3), w: +w.toFixed(3), h, sill });
  const row = (step, w, fn) => { const n = Math.floor((L + (step - w)) / step); if (n < 1) return; const tot = (n - 1) * step + w, s0 = u0 + (L - tot) / 2; for (let i = 0; i < n; i++) fn(s0 + i * step + w / 2, i); };
  switch (sch) {
    case 1: { if (L < 1.4) break; const n = Math.ceil(L / 6.0), gap = .3, w = (L - .3 - (n - 1) * gap) / n; for (let i = 0; i < n; i++) mk(w > 1.6 ? 'window2' : 'window', u0 + .15 + w / 2 + i * (w + gap), w, 1.0, 1.05); break; }
    case 2: { if (L < 1.0) break; const n = Math.max(1, Math.round(L / 2.1)), gap = .45, w = Math.min(2.4, (L - (n - 1) * gap) / n), tot = n * w + (n - 1) * gap, s0 = u0 + (L - tot) / 2; for (let i = 0; i < n; i++) mk('window2', s0 + w / 2 + i * (w + gap), w, 2.5, .08); break; }
    case 3: row(1.0, .45, (c) => mk('window', c, .45, 2.2, .45)); break;
    case 4: row(2.3, 1.3, (c) => mk('window', c, 1.3, 1.3, .9)); break;
    case 5: { if (L < 1.6) break; const n = Math.ceil(L / 4.2), gap = .12, w = (L - .2 - (n - 1) * gap) / n; for (let i = 0; i < n; i++) mk('window2', u0 + .1 + w / 2 + i * (w + gap), w, 2.6, .08); break; }
    case 6: row(2.3, 1.8, (c) => mk('window2', c, 1.8, .55, 2.1)); break;
    case 7: row(3.0, 2.1, (c) => { mk('window', c - .6, .9, 1.9, .55); mk('window', c + .6, .9, 1.9, .55); }); break;
    case 8: row(2.3, 1.0, (c) => mk('window', c, 1.0, 2.3, .35)); break;
    case 9: row(3.2, 2.2, (c) => mk('window2', c, 2.2, 1.5, .8)); break;
  }
  return out;
}
function extWalls(d) {
  const W = d.walls.filter(w => w.level === d.levels[0].id || !w.level); if (!W.length) return null;
  const xs = W.flatMap(w => [w.a.x, w.b.x]), ys = W.flatMap(w => [w.a.y, w.b.y]), bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const side = w => { const h = Math.abs(w.a.y - w.b.y) < .01, v = Math.abs(w.a.x - w.b.x) < .01; if (h && Math.abs(w.a.y - bb.y0) < .02) return 'front'; if (h && Math.abs(w.a.y - bb.y1) < .02) return 'back'; if (v && Math.abs(w.a.x - bb.x0) < .02) return 'left'; if (v && Math.abs(w.a.x - bb.x1) < .02) return 'right'; return null; };
  return { W, bb, side };
}
/** يحوّل مستند المرسم حسب قالب M. لا يعدّل الأصل. يرجع الأصل كما هو إن فشل التحقق الذاتي. */
export function docTransform(doc, q) {
  const TPL = resolveTemplate(templates, q); if (!TPL) return doc;
  const P = { ...DEFAULT_P, ...TPL.p }, d = clone(doc), ex = extWalls(d); if (!ex) return doc;
  if (!q.get('floors') && q.set) q.set('floors', String(Math.max(1, Math.min(3, P.fl))));
  const H = d.levels[0].height || 3.2; let seq = 0; const nid = () => 'mt' + (++seq);
  const sideOf = w => ex.side(w);
  // 1) سماكة الجدران الخارجية
  const tMin = [0, .30, .40][P.wt]; if (tMin) for (const w of ex.W) if (sideOf(w) && w.t < tMin) w.t = tMin;
  // 2) تقدّم الواجهة الأمامية (الواجهة بأكملها تتحرك والتوصيلات تتبعها)
  if (P.fs) { const sh = .6, y0 = ex.bb.y0; for (const w of d.walls) for (const k of ['a', 'b']) if (Math.abs(w[k].y - y0) < .02) w[k].y = +(y0 - sh).toFixed(3); ex.bb.y0 = y0 - sh; }
  const byWall = id => d.openings.filter(o => o.wall === id);
  const wallsOf = (s) => ex.W.filter(w => sideOf(w) === s);
  // الواجهة الأمامية = جهة الباب الرئيسي
  const entryOps = d.openings.filter(isEntryDoor), entryWall = entryOps.length ? d.walls.find(w => w.id === entryOps[0].wall) : null;
  const frontSide = (entryWall && sideOf(entryWall)) || 'front';
  const junctions = w => { // مواضع وصلات الجدران الأخرى مع هذا الجدار + نصف سماكتها
    const L = wlen(w), z = []; for (const o of d.walls) { if (o === w) continue;
      for (const k of ['a', 'b']) { const p = o[k]; if (onLine(w, p, .08)) { const u = uOf(w, p); if (u > -.05 && u < L + .05) { const [dx, dy] = wdir(w), [ox, oy] = wdir(o), par = Math.abs(dx * ox + dy * oy) > .98; if (!par) z.push([u - o.t / 2 - .12, u + o.t / 2 + .12]); } } } }
    return z; };
  const sideAll = ['front', 'back', 'left', 'right'];
  for (const s of sideAll) for (const w of wallsOf(s)) {
    const L = wlen(w), isFront = s === frontSide, sch = isFront ? P.sch : P.ssch;
    const own = byWall(w.id); let fixed = own.filter(o => !isWin_(o)), wins = own.filter(isWin_);
    let prim = null;
    if (isFront) { const ents = fixed.filter(isEntryDoor).sort((a, b) => b.w - a.w); prim = ents[0] || null; }
    const needed = .55 + (P.wing !== 3 ? .3 : 0) + (P.sl ? .6 : 0);
    if (prim && (P.ent || P.ek)) { // الباب الرئيسي: النوع والحجم والموضع
      const spec = [null, [1.6, 2.4, 'door2'], [2.0, 2.7, 'door2'], [1.1, 2.4, 'door']][P.ek];
      if (spec) { prim.w = spec[0]; prim.h = Math.min(DOORMAX, spec[1]); prim.kind = spec[2]; }
      if (P.ent) { const others = fixed.filter(o => o !== prim), zones = [...junctions(w), ...others.map(o => [o.at - o.w / 2 - .3, o.at + o.w / 2 + .3])];
        const target = [0, L / 2, L * .27, L * .73][P.ent], need = prim.w + 2 * needed;
        let best = null; for (const [a, b] of freeOf(L, .25, zones)) { if (b - a < need) continue; const c = Math.min(Math.max(target, a + need / 2), b - need / 2); if (!best || Math.abs(c - target) < Math.abs(best - target)) best = c; }
        if (best != null) prim.at = +best.toFixed(3); } }
    if (isFront && prim && P.sl) { // نوافذ جانبية طويلة للباب
      const sw = .45, g = .14; for (const sg of [-1, 1]) { const c = prim.at + sg * (prim.w / 2 + g + sw / 2);
        const zones = [...junctions(w), ...fixed.filter(o => o !== prim && !o._sl).map(o => [o.at - o.w / 2 - .1, o.at + o.w / 2 + .1])];
        if (c - sw / 2 < .25 || c + sw / 2 > L - .25 || zones.some(([a, b]) => c + sw / 2 > a && c - sw / 2 < b)) continue;
        fixed.push({ id: nid(), level: prim.level, wall: w.id, kind: 'window', at: +c.toFixed(3), w: sw, h: Math.min(prim.h, OPMAX), sill: 0, swing: null, hinge: 'left', entry: false, _sl: true }); } }
    // النوافذ: إعادة توليد إن طُلب نمط جديد
    let newWins = wins;
    if (sch && sch !== 0) {
      const zones = [...junctions(w), ...fixed.map(o => [o.at - o.w / 2 - (o === prim ? needed : .3), o.at + o.w / 2 + (o === prim ? needed : .3)])];
      newWins = []; for (const [a, b] of freeOf(L, .3, zones)) if (sch === 10) {} else for (const o of schemeOpenings(sch, a, b)) {
        const top = Math.min(OPMAX, o.sill + o.h); if (top - o.sill < .4) continue; newWins.push({ id: nid(), level: (own[0] || prim || { level: d.levels[0].id }).level, wall: w.id, kind: o.kind, at: o.at, w: o.w, h: +(top - o.sill).toFixed(3), sill: o.sill, swing: null, hinge: 'left', entry: false }); }
    } else if (!sch && P.ent && isFront) { // نمط 0 مع نقل الباب: احذف النوافذ التي تتقاطع مع الباب الجديد
      newWins = wins.filter(o => !fixed.some(f => Math.abs(f.at - o.at) < (f.w + o.w) / 2 + .3)); }
    d.openings = d.openings.filter(o => o.wall !== w.id).concat(fixed.map(o => { const c = { ...o }; delete c._sl; return c; }), newWins);
  }
  const err = validateDoc(d, { frontSide, orig: doc });
  if (err.length) { console.error('M_DOC_INVALID', TPL.id, err.slice(0, 3).join(' | ')); globalThis.__M_DOC_ERR = err; return doc; }
  globalThis.__M_DOC_ERR = null;
  return d;
}
/** تحقق ذاتي: فتحات داخل جدارها وبهامش ≥ 20 سم عن النهايات، بلا تقاطع، الباب يصل الأرض، باب رئيسي على الواجهة، جدران متصلة. يعيد قائمة أخطاء. */
export function validateDoc(d, opt = {}) {
  const E = [], H = d.levels?.[0]?.height || 3.2; if (!d.levels || d.levels.length < 1) E.push('no levels');
  const byId = new Map(d.walls.map(w => [w.id, w]));
  for (const w of d.walls) if (wlen(w) < .2) E.push('wall ' + w.id + ' too short');
  const ex = extWalls(d); const origIds = new Set((opt.orig?.openings || []).map(o => o.id));
  if (ex) { const ext = ex.W.filter(w => ex.side(w)), ends = ext.flatMap(w => [w.a, w.b]);
    const gaps = dd => { const e0 = extWalls(dd), r = []; if (!e0) return r; const ex2 = e0.W.filter(w => e0.side(w)); for (const w of ex2) for (const p of [w.a, w.b]) if (!ex2.some(o => o !== w && (Math.hypot(o.a.x - p.x, o.a.y - p.y) < EPS_ || Math.hypot(o.b.x - p.x, o.b.y - p.y) < EPS_))) r.push(w.id); return r; }, g0 = new Set(opt.orig ? gaps(opt.orig) : []); // فجوات التصميم الأصلي (مثل فسحة C1) لا تُحسب علينا
    for (const id of gaps(d)) if (!g0.has(id)) E.push('gap at ' + id);
    const sides = new Set(ext.map(w => ex.side(w))); if (sides.size < 4) E.push('missing exterior side'); void ends; }
  const per = {}; for (const o of d.openings) { const w = byId.get(o.wall); if (!w) { E.push('opening ' + o.id + ' no wall'); continue; } (per[o.wall] ||= []).push(o);
    const L = wlen(w), fresh = !origIds.has(o.id), mg = fresh ? .2 : .0;
    if (o.at - o.w / 2 < mg - 1e-6 || o.at + o.w / 2 > L - mg + 1e-6) E.push('opening ' + o.id + ' out of wall');
    if (!(o.w > .2 && o.h > .2)) E.push('opening ' + o.id + ' tiny');
    if (o.sill < -1e-6 || o.sill + o.h > OPMAX + 1e-6 && fresh) E.push('opening ' + o.id + ' vertical range');
    if (!isWin_(o) && o.kind !== 'arch' && o.sill > 0) E.push('door ' + o.id + ' not on ground');
    if (fresh && ex && ex.side(w)) { for (const j of (function () { const z = []; for (const q2 of d.walls) { if (q2 === w) continue; for (const k of ['a', 'b']) if (onLine(w, q2[k], .08)) { const u = uOf(w, q2[k]); if (u > -.05 && u < L + .05) { const [dx, dy] = wdir(w), [ox, oy] = wdir(q2); if (Math.abs(dx * ox + dy * oy) < .98) z.push([u - q2.t / 2, u + q2.t / 2]); } } } return z; })()) if (o.at + o.w / 2 > j[0] + .02 && o.at - o.w / 2 < j[1] - .02) E.push('opening ' + o.id + ' hits partition'); } }
  const om = new Map((opt.orig?.openings || []).map(o => [o.id, o])), inherited = o => { const p = om.get(o.id); return !!p && p.wall === o.wall && Math.abs(p.at - o.at) < 1e-6 && Math.abs(p.w - o.w) < 1e-6 && Math.abs((p.sill || 0) - (o.sill || 0)) < 1e-6 && Math.abs(p.h - o.h) < 1e-6; };
  // تقارب فتحتين موروثتين كما هما من التصميم (مثل باب الفناء ونافذة بجانبه على الجدار الداخلي لشكل U) ليس خطأ القالب: لا يُسقط القالب كله
  for (const [wid, arr] of Object.entries(per)) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { const a = arr[i], b = arr[j]; if (inherited(a) && inherited(b)) continue; if (a.at + a.w / 2 > b.at - b.w / 2 - .04 && b.at + b.w / 2 > a.at - a.w / 2 - .04) E.push('overlap ' + a.id + '/' + b.id + ' on ' + wid); }
  if (opt.frontSide && ex) { const fw = ex.W.filter(w => ex.side(w) === opt.frontSide).map(w => w.id); if (!d.openings.some(o => fw.includes(o.wall) && isEntryDoor(o))) E.push('no entry door on front'); }
  return E;
}
