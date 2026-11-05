// نمط N «نجدي» (Najdi) لمنصة الميزان الهندسي. وحدة مستقلة: export meta + apply(THREE, ctx) كما في styles/index.mjs.
// ───────────────────────── المصادر (بحث 2026-11-05) وما أُخذ من كل مصدر ─────────────────────────
// [1] Wikipedia «Najdi architecture» https://en.wikipedia.org/wiki/Najdi_architecture
//     - لبن (طوب طيني) مع لياسة طينية وجدران سميكة؛ واجهات قليلة الزخرفة (الزخرفة في الداخل).
//     - الشرفات (shurfat): ملاقف جصّية في أعلى الجدار مدببة الشكل (مثلثية أو سهمية) تتناوب أحيانًا بين مصمت ومفتوح؛
//       وتحتها شريط أفقي محفور بمثلثات مقلوبة.  → المحاكاة: صف شرفات بأربعة أشكال (مثلث/مدرّج/متناوب/سهم) + شريط المثلثات المقلوبة.
//     - فتحات صغيرة (مستطيلة/مثلثة/مربعة/سهمية) بكثافات متفاوتة وفي رصّات رأسية وأفقية.  → المحاكاة: كوّات مثلثية (فرجات) في رصّات.
//     - أبواب مفردة غالبًا من الخشب أو سعف النخل، منها المنقوش والمزخرف بزخارف هندسية.  → المحاكاة: ثلاثة أنواع باب.
// [2] vectree.io «Najdi vernacular earth construction» https://vectree.io/c/najdi-vernacular-earth-construction
//     - لبن بسُمك 60–100 سم، قاعدة حجر جيري (رَبَد) فوق الأرض، فتحات مثلثية صغيرة عالية للتهوية والخصوصية.
//     → المحاكاة: اختيار قاعدة حجرية (plinth) ورصّات مثلثية عالية؛ فتحات الواجهة الفعلية غائرة أصلاً في التصميم المعتمد (لا تُحرَّك).
// [3] businesstoday.me «Najdi heritage shaping modern Arabic fusion architecture» https://businesstoday.me/design/how-is-najdi-heritage-shaping-modern-arabic-fusion-architecture-in-saudi-arabia/
//     - إعادة تفسير معاصرة: لياسات بلون الأرض، تكرار الزخرفة المثلثية، زجاج غائر خلف حواجز مشربية.  → شبكة خشبية أمام الزجاج داخل التجويف.
// [4] saudipedia «Traditional Door Decorations in Saudi Arabia» https://saudipedia.com/en/traditional-door-decorations-in-saudi-arabia
//     - خشب الأثل، زخارف هندسية (مثلثات ودوائر ومربعات وخطوط متقاطعة)، لوحات من جذوع النخل تُحدَّد بخشب الأثل؛ لا ذِكر لمسامير أو طرّاقات.
// [5] صفحات ظهرت في البحث ولم تُقرأ كاملة (عناوين فقط): wrth.edu.sa «Najdi doors»، arabnews «Najd doors» (رُفض فتحها) — لم يُعتمد عليها.
// ───────────────────────── غير متحقق (اجتهاد تصميمي لا مصدر مباشر له) ─────────────────────────
//  - ألوان اللياسة (رمل/أوكر/طين/كريمي/لبن/وردي ترابي) تقريب لألوان الطين المحلي؛ الدرّاة الجصية البيضاء حول الفتحات اجتهاد معاصر.
//  - مسامير الباب النحاسية وحلقة الطرق وتاج المثلثات فوق الباب والنوافذ الصغيرة: شائعة في الأبواب الخليجية، لم يثبتها مصدر نجدي هنا.
//  - عوارض الخشب الظاهرة فوق الفتحات ومشربية الألماس: تفسير معاصر.
// ───────────────────────── قيود المنصة ─────────────────────────
// لا تحريك جدار/فتحة/منسوب. كل الإضافات أمام وجه الجدار بنتوء ≤ 25 سم (الغالب 3–15 سم). الخامات إجرائية (Canvas) بلا أصول خارجية.
// الأدوار: يقرأ globalThis.__FLOORS (كنمط J) لأسطح البلاطات، ويكشف ارتفاع الجدار بالأشعة فلا يضع شرفات/أشرطة حيث لا جدار (الارتداد).
import { resolveTemplate } from '../templates.mjs';
import { facadeGeometry } from '../../facade-styles.mjs';
import { templates } from './templates-najdi/list.mjs';
export { templates };
export { docTransform, validateDoc } from './templates-najdi/doc.mjs';
export const meta = {
  templateCount: templates.length,
  id: 'N', ar: 'نجدي',
  sources: [
    'https://en.wikipedia.org/wiki/Najdi_architecture',
    'https://vectree.io/c/najdi-vernacular-earth-construction',
    'https://businesstoday.me/design/how-is-najdi-heritage-shaping-modern-arabic-fusion-architecture-in-saudi-arabia/',
    'https://saudipedia.com/en/traditional-door-decorations-in-saudi-arabia',
  ],
};

const CLASSIC = new Set(['projection', 'surround', 'cornice', 'sill', 'pediment']);
const SIDES = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };
function bandLevels() { const L = globalThis.__FLOORS?.levels; if (!Array.isArray(L) || !L.length) return [3.55];
  return L.map(l => typeof l === 'number' ? l : l.top ?? ((l.elevation ?? 0) + (l.height ?? 3.2) + .35)).filter(Number.isFinite).sort((a, b) => a - b); }

// بوابات الجودة: تُقيَّم بعد apply().
const G = { maxProjectionMm: 0, openingsUnchanged: null, moved: [], hiddenBlocks: 0, orn: true };
const NOT_IMPL = [
  'فتحات مثلثية/سهمية حقيقية وفتحات صغيرة عالية بدل فتحات التصميم: الفتحات مقفلة، فالكوّات المثلثية سطحية (إطار بارز + فراغ داكن) لا فتحات نافذة',
  'سماكة جدار اللبن 60–100 سم وتعميق التجويف: سماكة الجدار مقفلة (التجويف المرئي هو غَوْر الفتحات الأصلي في التصميم)',
  'شرفات أعلى/أعمق وبروز تارمة (فتحات نظر بارزة) وبروزات أكبر من 25 سم',
  'أبواب من جذوع النخل/أثل بمقاسات مختلفة أو ورقة بعرض مختلف: الباب مقفل (التزيين طبقة أمام ورقته فقط)',
  'إخفاء مداميك الحجر (blocks) بدل تحريكها: أُخفيت شبكيًّا 1–4 سم لتظهر اللياسة؛ لم يُغيَّر جدار/فتحة/منسوب',
];
export const gates = () => ({ maxProjectionMm: Math.round(G.maxProjectionMm), openingsUnchanged: G.openingsUnchanged, movedMeshes: G.moved, hiddenBlockMeshes: G.hiddenBlocks, orn: G.orn, notImplemented: NOT_IMPL });
let curN = null, curF = 0;

export async function apply(THREE, { scene, renderer, S, q, doc, FI, params }) {
  // إعادة خلط ناتج params.rnd(k) حتى لا تتشابه القيم بين بذور متجاورة (ما زال حتميًا تمامًا)
  const R = k => rnd(Math.floor(params.rnd(k) * 4294967296) ^ Math.imul(k + 11, 2246822519))(), pick = (k, a) => a[Math.min(a.length - 1, Math.floor(R(k) * a.length))], rng = (k, a, b) => a + (b - a) * R(k);
  // orn=0: يعطّل الزخرفة (شرفات/مثلثات/نقش الباب/تيجان) لاختبار أن الكتلة والفتحات والنِّسَب وحدها تُقرأ نجدية
  const orn = q.get('orn') !== '0', night = q.get('night') === '1', BH = .30, up = new THREE.Vector3(0, 1, 0), seed = params.seed | 0;
  S.group.updateMatrixWorld(true);
  G.maxProjectionMm = 0; G.moved = []; G.orn = q.get('orn') !== '0';
  const bbk = m => { const b = new THREE.Box3().setFromObject(m); return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]; };
  const guarded = S.meshes.filter(m => ['glazing', 'door', 'frame', 'wall', 'cladding'].includes(m.userData?.role) && m.userData?.part !== 'blocks'), before = guarded.map(bbk);
  for (const m of S.meshes) if (CLASSIC.has(m.userData?.role)) m.visible = false;

  // ───── المعاملات: من القالب (tpl=) إن وُجد، وإلا من البذرة كما كان ─────
  const tpl = resolveTemplate(templates, q), T = tpl ? tpl.p : {}, V = (k, d) => (k in T ? T[k] : d), cls = (k, arr, d) => (k in T ? arr[T[k]] : d);
  const PAL = [['sand', '#dbc59f'], ['ochre', '#d2b07c'], ['clay', '#c39d7e'], ['cream', '#e6d7b8'], ['mud', '#bb9a72'], ['rose', '#cfa58b']];
  const WOODS = ['#4a3220', '#5c3d24', '#6f4a2a'], PAINTS = [null, '#3f5f4a', '#6a2f27', '#2f5360', '#8a6a2c'];
  const palI = V('pal', Math.min(PAL.length - 1, Math.floor(R(1) * PAL.length))), pal = PAL[palI];
  const trimI = V('trim', R(2) < .5 ? 1 : 0), finish = V('finish', 1);
  const wallHex = pal[1], trimHex = trimI === 1 ? '#eee4cf' : trimI === 2 ? mix(wallHex, '#3a2a1a', .22) : mix(wallHex, '#ffffff', .30);
  const woodTone = WOODS[V('wood', Math.min(2, Math.floor(R(3) * 3)))], ornL = V('ornament', 3);
  const leaf = V('leaf', [0, 1, 2, 0][Math.min(3, Math.floor(R(9) * 4))]), doorKind = orn ? ['carved', 'studded', 'plain'][leaf] : 'plain';
  const doorPaint = PAINTS[V('paint', R(30) < .3 ? 1 + Math.min(3, Math.floor(R(31) * 4)) : 0)];
  const mKind = V('merlon', Math.floor(R(4) * 4)), mH = cls('mH', [.32, .45, .62], rng(5, .32, .6)), mPitch = cls('mPitch', [.5, .7, .9], rng(6, .5, .9)), mGap = cls('mGap', [.22, .35, .5], rng(7, .22, .5));
  const capV = V('cap', R(35) < .5 ? 0 : 1), capH = orn ? (capV ? .12 : .07) : .16;
  const hpSel = R(8), plinthI = V('plinth', hpSel < .3 ? 0 : hpSel < .65 ? 1 : 2), hp = [0, .55, .9, 1.3][plinthI], stonePlinth = V('stone', R(36) < .55 ? 1 : 0) === 1;
  const dKind0 = ['plain', 'stepped', 'crown', 'timber', 'portal', 'canopy'][V('door', Math.floor(R(10) * 4))], dKind = (!orn || ornL < 1) && dKind0 === 'crown' ? 'stepped' : dKind0;
  const wKind = ['band', 'beam', 'step', 'bare', 'deep'][V('win', Math.floor(R(11) * 3))], gKind = ['bars', 'diamond', 'cross', 'none', 'shutter'][V('grille', [0, 1, 2, 0][Math.min(3, Math.floor(R(12) * 4))])];
  const bandKind = ['tri', 'dent', 'line', 'none'][V('frieze', [0, 0, 1, 2][Math.min(3, Math.floor(R(17) * 4))])];
  const fieldV = V('field', 3), stackProb = fieldV === 1 ? 1 : fieldV === 2 ? 0 : fieldV === 0 ? 0 : rng(14, .1, .6), panelFrac = fieldV === 2 ? 1 : fieldV === 1 || fieldV === 0 ? 0 : R(15) * .7;
  const rowsN = V('rows', R(18) < .25 ? 0 : R(16) < .5 ? 1 : 2), rowPitch = rng(19, .42, .7), slabKind = V('slab', Math.min(1, Math.floor(R(20) * 2)) + 1);
  const crown = orn ? V('crown', 0) : 0, spouts = V('spouts', 0), corner = V('corner', 0), strips = V('strips', 0), lamps = V('lamps', 1);
  params.najdi = { tpl: tpl?.id || null, palette: pal[0], wallHex, trimHex, doorKind, doorPaint, merlon: ['tri', 'step', 'alt', 'arrow'][mKind], mH: +mH.toFixed(2), mPitch: +mPitch.toFixed(2), plinth: hp, stonePlinth, dKind, wKind, gKind, bandKind, rowsN, crown, spouts, corner, strips, slabKind, fieldV, ornL };

  // ───── خامات ─────
  const wallM = plasterMat(THREE, renderer, wallHex, 11 + seed * 7, 1024, 1, [.28, .55, .95][finish]), trimM = plasterMat(THREE, renderer, trimHex, 23 + seed * 5, 512, .9);
  const insetM = plasterMat(THREE, renderer, mix(wallHex, '#3a2a1a', .09), 41 + seed, 512, 1);
  const stoneM = stoneMat(THREE, renderer, stonePlinth, seed);
  const doorM = plankMat(THREE, renderer, doorPaint || woodTone, !!doorPaint, 5 + seed);
  const woodBar = new THREE.MeshStandardMaterial({ color: mix(woodTone, '#000000', .1), roughness: .72, metalness: 0 });
  const reliefM = new THREE.MeshStandardMaterial({ color: doorPaint ? mix(doorPaint, '#ffffff', .12) : mix(woodTone, '#ffffff', .1), roughness: .6, map: doorM.map, bumpMap: doorM.map, bumpScale: .5 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b78d3b', metalness: .8, roughness: .38 }), iron = new THREE.MeshStandardMaterial({ color: '#25211d', metalness: .6, roughness: .5 });
  const voidM = new THREE.MeshStandardMaterial({ color: '#241710', roughness: 1, emissive: '#ff9a3a', emissiveIntensity: night ? 1.6 : 0 });
  const darkTri = new THREE.MeshStandardMaterial({ color: mix(wallHex, '#2a1a0c', .42), roughness: 1 });
  const lampGlass = new THREE.MeshStandardMaterial({ color: '#fff0cc', emissive: '#ffd58a', emissiveIntensity: night ? 5 : .6 });
  for (const m of [wallM, trimM, insetM, stoneM]) m.userData.wuv = true;
  const frameWood = new THREE.MeshStandardMaterial({ color: mix(woodTone, '#000000', .15), roughness: .65 });
  const AO = aoTexture(THREE), aoMat = (a, c = '#000') => new THREE.MeshBasicMaterial({ color: c, alphaMap: AO, transparent: true, opacity: a * (night ? .5 : 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // ───── تجميع الهندسة المضافة حسب الخامة (شبكة واحدة لكل خامة) ─────
  const acc = new Map();
  function emit(geo, mat) {
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv; let a = acc.get(mat); if (!a) acc.set(mat, a = { p: [], n: [], u: [] });
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i); a.p.push(x, y, z); a.n.push(nx, ny, nz);
      if (mat.userData.wuv) { const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz); if (ay >= ax && ay >= az) a.u.push(x, z); else if (ax >= az) a.u.push(z, y); else a.u.push(x, y); } else a.u.push(U.getX(i), U.getY(i)); }
    if (curN) for (let i = 0; i < P.count; i++) { const pj = P.getX(i) * curN.x + P.getZ(i) * curN.z - curF; if (pj * 1000 > G.maxProjectionMm) G.maxProjectionMm = pj * 1000; }
    if (g !== geo) geo.dispose(); }
  const flush = () => { for (const [mat, a] of acc) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(a.u, 2));
    g.computeBoundingSphere(); const o = new THREE.Mesh(g, mat); o.castShadow = o.receiveShadow = true; o.name = 'najdi'; scene.add(o); } acc.clear(); };

  // ───── إعادة تغطية الجدران: لياسة طينية بإسقاط UV عالمي (متر) حتى لا تظهر حدود المداميك ─────
  const tmpV = new THREE.Vector3();
  const reuv = m => { const g = m.geometry, P = g.attributes.position, N = g.attributes.normal; if (!P || !N) return; const uv = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) { tmpV.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
      if (ny >= nx && ny >= nz) { uv[i * 2] = tmpV.x; uv[i * 2 + 1] = tmpV.z; } else if (nx >= nz) { uv[i * 2] = tmpV.z; uv[i * 2 + 1] = tmpV.y; } else { uv[i * 2] = tmpV.x; uv[i * 2 + 1] = tmpV.y; } }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); };
  // مداميك الحجر (blocks) تُخفى: اللياسة الطينية تُكسى على قلب الجدار/الظهر (plate) مباشرة بلا فواصل حجرية؛ يسقط وجه الجدار 1–4 سم فقط.
  for (const m of S.meshes) { const u = m.userData || {}; if (u.role === 'wall' || u.role === 'cladding') { if (u.part === 'blocks') { m.visible = false; continue; } m.material = wallM; reuv(m); m.castShadow = m.receiveShadow = true; }
    else if (u.role === 'frame') m.material = frameWood; }

  const box3 = m => new THREE.Box3().setFromObject(m), levels = bandLevels(), raycaster = new THREE.Raycaster();
  let gTop = 0, lightCount = 0;
  // أولًا: مسح كل الجهات لبناء القطع (segments) وحساب الارتفاع العام
  const sideInfo = {};
  for (const [side, [nx, nz]] of Object.entries(SIDES)) {
    const sm = S.meshes.filter(m => m.userData?.side === side && m.visible); if (!sm.length) continue;
    const n = new THREE.Vector3(nx, 0, nz), t = new THREE.Vector3().crossVectors(up, n);
    const loc = b => { const us = [b.min.x * t.x + b.min.z * t.z, b.max.x * t.x + b.max.z * t.z], ds = [b.min.x * n.x + b.min.z * n.z, b.max.x * n.x + b.max.z * n.z];
      return { u0: Math.min(...us), u1: Math.max(...us), y0: b.min.y, y1: b.max.y, d0: Math.min(...ds), d1: Math.max(...ds) }; };
    const grp = m => (m.name || '').split('/')[0] || 'x', segs = new Map();
    for (const m of sm) { const r = m.userData.role; if (r !== 'wall' && r !== 'cladding') continue; const b = loc(box3(m)), id = grp(m); let s = segs.get(id);
      if (!s) segs.set(id, s = { id, side, u0: 1e9, u1: -1e9, y0: 1e9, y1: -1e9, d0: 1e9, d1: -1e9, cores: [], ops: new Map(), cache: new Map() });
      s.u0 = Math.min(s.u0, b.u0); s.u1 = Math.max(s.u1, b.u1); s.y0 = Math.min(s.y0, b.y0); s.y1 = Math.max(s.y1, b.y1); s.d1 = Math.max(s.d1, b.d1); if (m.userData.part === 'wallcore') { s.cores.push(m); s.d0 = Math.min(s.d0, b.d0); } }
    for (const s of segs.values()) { if (s.d0 > 1e8) s.d0 = s.d1 - .25; gTop = Math.max(gTop, s.y1); }
    for (const m of sm) { const r = m.userData.role, s = segs.get(grp(m)); if (!s || !m.userData.opening || !['frame', 'glazing', 'door'].includes(r)) continue; const b = loc(box3(m)), k = m.userData.opening;
      let o = s.ops.get(k); if (!o) s.ops.set(k, o = { k, u0: 1e9, u1: -1e9, y0: 1e9, y1: -1e9, door: false, gl: null, dGl: -1e9, dDoor: -1e9, doorMesh: null });
      if (r === 'glazing') { o.gl = b; o.dGl = Math.max(o.dGl, b.d1); } if (r === 'door') { o.door = true; o.doorMesh = m; o.dDoor = Math.max(o.dDoor, b.d1); }
      o.u0 = Math.min(o.u0, b.u0); o.u1 = Math.max(o.u1, b.u1); o.y0 = Math.min(o.y0, b.y0); o.y1 = Math.max(o.y1, b.y1); }
    sideInfo[side] = { n, t, loc, segs: [...segs.values()] };
  }
  const P3 = (side, u, y, d) => { const { t, n } = sideInfo[side]; return new THREE.Vector3(t.x * u + n.x * d, y, t.z * u + n.z * d); };
  // ارتفاع الجدار عند u بالأشعة (يعالج الجدران المقصوصة بالارتداد)
  const topAt = (s, u) => { const k = Math.round(u * 20); if (s.cache.has(k)) return s.cache.get(k); let r = -1;
    if (s.cores.length) { raycaster.set(P3(s.side, k / 20, 60, (s.d0 + s.d1) / 2), new THREE.Vector3(0, -1, 0)); raycaster.far = 100; const h = raycaster.intersectObjects(s.cores, false); r = h.length ? h[0].point.y : -1; }
    s.cache.set(k, r); return r; };
  const frontTop = (s, u) => { let r = -1; for (const o of sideInfo[s.side].segs) if (o !== s && o.d1 > s.d1 + .12 && u >= o.u0 - .01 && u <= o.u1 + .01) r = Math.max(r, topAt(o, u)); return r; };
  // مجالات u التي يوجد فيها جدار ظاهر من yLo إلى yHi (الجدار يبلغ yHi وليست مغطاة بقطعة أمامية أعلى من yLo)
  const runs = (s, yLo, yHi, minLen = .3, a0 = s.u0, a1 = s.u1) => { const out = []; const step = .1; let st = null, last = null;
    const push = () => { if (st !== null) { const a = st <= a0 + step * .6 ? a0 : st, b = last >= a1 - step * .6 ? a1 : last; if (b - a >= minLen) out.push([a, b]); } st = null; };
    for (let u = a0; u <= a1 + step * .5; u += step) { const uu = Math.min(a1 - .02, Math.max(a0 + .02, u)), ok = topAt(s, uu) >= yHi - .002 && frontTop(s, uu) <= yLo + .02; if (ok) { if (st === null) st = u; last = Math.min(u, a1); } else push(); }
    push(); return out; };
  const subtract = (iv, [a, b]) => iv.flatMap(([x, y]) => (b <= x || a >= y) ? [[x, y]] : [...(a > x ? [[x, a]] : []), ...(b < y ? [[b, y]] : [])]);

  for (const side of Object.keys(sideInfo)) {
    const { n, t, segs } = sideInfo[side];
    const M = new THREE.Matrix4(), place = (geo, u, y, d, rz = 0) => { if (rz) geo.rotateZ(rz); const p = P3(side, u, y, d); M.makeBasis(t, up, n).setPosition(p); geo.applyMatrix4(M); return geo; };
    const box = (su, sy, sd, mat, u, y, d, rz = 0) => emit(place(new THREE.BoxGeometry(su, sy, sd), u, y, d, rz), mat);
    // d = المستوى الخلفي للمقطع؛ يبرز نحو الخارج بعمق depth
    const prism = (shape, depth, mat, u, y, d, rz = 0) => emit(place(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), u, y, d, rz), mat);
    const pr = (u, y, d) => P3(side, u, y, d);
    const ao = (a, b, away, alpha, col) => { const A = pr(...a), B = pr(...b), w = new THREE.Vector3().addScaledVector(t, away[0]).addScaledVector(n, away[2]).setY(away[1]);
      const g = new THREE.BufferGeometry(), v = [A, B, B.clone().add(w), A.clone().add(w)];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap(p => [p.x, p.y, p.z]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0]);
      const o = new THREE.Mesh(g, aoMat(alpha, col)); o.renderOrder = 2; scene.add(o); };
    const tri = (w, h, inv = false) => { const s = new THREE.Shape(); if (!inv) { s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); } else { s.moveTo(-w / 2, h); s.lineTo(w / 2, h); s.lineTo(0, 0); } s.closePath(); return s; };
    const merlon = (kind, w, h, i) => { const s = new THREE.Shape(), pts = kind === 0 ? [[-w * .45, 0], [w * .45, 0], [0, h]]
        : kind === 1 ? [[-w / 2, 0], [w / 2, 0], [w / 2, h / 3], [w * .34, h / 3], [w * .34, h * 2 / 3], [w * .17, h * 2 / 3], [w * .17, h], [-w * .17, h], [-w * .17, h * 2 / 3], [-w * .34, h * 2 / 3], [-w * .34, h / 3], [-w / 2, h / 3]]
        : kind === 2 ? (i % 2 ? [[-w * .35, 0], [w * .35, 0], [0, h * .55]] : [[-w * .5, 0], [w * .5, 0], [0, h]])
        : [[-w / 2, 0], [w / 2, 0], [w / 2, h * .42], [0, h], [-w / 2, h * .42]];
      pts.forEach(([x, y], k) => k ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; };
    const slot = (u, y, w, h, inv, dFace) => { // كوّة مثلثية: إطار جصي بارز + فراغ داكن
      const outer = tri(w + .07, h + .06, inv), hole = new THREE.Path(), hy = .03, hx = w / 2;
      if (!inv) { hole.moveTo(-hx, hy); hole.lineTo(hx, hy); hole.lineTo(0, hy + h); } else { hole.moveTo(-hx, hy + h); hole.lineTo(hx, hy + h); hole.lineTo(0, hy); } hole.closePath(); outer.holes.push(hole);
      prism(outer, .045, trimM, u, y - .03, dFace - .004); prism(tri(w, h, inv), .01, voidM, u, y, dFace + .002); };
    const stud = (u, y, d) => { const g = new THREE.SphereGeometry(.02, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateX(Math.PI / 2); emit(place(g, u, y, d), brass); };

    for (const s of segs) {
      curN = n; const F = s.d1; curF = F; const T = Math.min(F - s.d0, .3), ops = [...s.ops.values()].filter(o => o.u1 > o.u0), topSeg = s.y1 >= gTop - .05, doors = ops.filter(o => o.door);
      // ───── قاعدة (plinth) ─────
      const exU = [...doors.filter(o => o.y0 < hp + .01).map(o => [o.u0 - .25, o.u1 + .25]), ...(tpl ? ops.filter(o => !o.door && o.y0 < hp + .01).map(o => [o.u0 - .15, o.u1 + .15]) : [])];
      if (hp > 0) { let iv = runs(s, 0, hp, .2); for (const e of exU) iv = subtract(iv, e);
        for (const [a, b] of iv) { box(b - a, hp, .05, stoneM, (a + b) / 2, hp / 2, F + .02); box(b - a + .02, .05, .075, stoneM, (a + b) / 2, hp + .02, F + .03); } }
      // تماس الجدار بالأرض (ظلّ ترابي)
      for (const [a, b] of runs(s, 0, .5, .2)) { ao([a, .003, F], [b, .003, F], [0, 0, .5], .42, '#2a1b0e'); ao([a, 0, F + .003], [b, 0, F + .003], [0, .4, 0], .3, '#2a1b0e'); }
      // ───── أشرطة البلاطات (مدّ جصي بنتوء 10 سم) ─────
      const bands = levels.filter(y => y + BH < gTop - .05 && y >= s.y0 - .01);
      for (const yb of bands) for (const [a, b] of runs(s, yb, yb + BH, .3)) { const c = (a + b) / 2, L = b - a + .02;
        if (slabKind === 4) { box(L, .30, .20, trimM, c, yb + .18, F + .10); box(L, .05, .26, trimM, c, yb + .03, F + .13); box(L, .04, .24, trimM, c, yb + .335, F + .12); }
        else if (slabKind > 0) { box(L, .25, .10, trimM, c, yb + .175, F + .05); box(L, .05, .06, trimM, c, yb + .025, F + .03);
          if (slabKind === 2) box(L, .035, .13, trimM, c, yb + .335, F + .065);
          if (slabKind === 3) { const kb = Math.floor((L - .2) / .42); for (let i = 0; i < kb; i++) { const g = new THREE.CylinderGeometry(.055, .055, .27, 10); g.rotateX(Math.PI / 2); emit(place(g, a + (L - (kb - 1) * .42) / 2 + i * .42, yb + .175, F + .085), frameWood); } } }
        ao([a, yb, F + .003], [b, yb, F + .003], [0, -.32, 0], slabKind ? .34 : .18, '#2a1b0e'); }
      // ───── أعلى الجدار: غطاء + شرفات + شريط المثلثات المقلوبة ─────
      if (topSeg) for (const [a, b] of runs(s, gTop - .02, gTop - .02, .4)) { const len = b - a, mw = mPitch * (1 - mGap), cu = (a + b) / 2;
        const body = (h, y0) => box(len, h, T + .03, wallM, cu, y0 + h / 2, F - T / 2 + .0), cap = (y0, h = .06) => box(len + .04, h, T + .12, trimM, cu, y0 + h / 2, F - T / 2 + .03);
        const nM = Math.max(2, Math.round((len - mw) / mPitch) + 1), p2 = (len - mw) / (nM - 1), Dp = Math.min(.2, T - .04);
        const merl = y0 => { for (let i = 0; i < nM; i++) prism(merlon(mKind, mw, mH, i), Dp, trimM, a + mw / 2 + i * p2, y0, F - .015 - Dp); };
        if (crown === 0) { box(len, capH, T + .05, trimM, cu, gTop + capH / 2, F - T / 2 + .015);
          if (!orn) box(len - .24, .12, T * .6, trimM, cu, gTop + capH + .06, F - T * .3 - .02); // بلا زخرفة: غطاء مدرّج ثقيل يحفظ كتلة الدروة
          if (orn) merl(gTop + capH - .005); }
        else if (crown === 1) { body(.46, gTop); cap(gTop + .46); }
        else if (crown === 2) { const rr = rnd(seed * 31 + Math.round(a * 10) + side.charCodeAt(0)); let x = a; while (x < b - .05) { const w = Math.min(b - x, .3 + rr() * .45), h = .16 + rr() * .4; box(w, h, T + .03, wallM, x + w / 2, gTop + h / 2, F - T / 2); x += w; } box(len, .08, T + .03, wallM, cu, gTop + .04, F - T / 2); }
        else if (crown === 3) { body(.28, gTop); cap(gTop + .28, .05); if (orn) merl(gTop + .33 - .005); }
        else if (crown === 4) { box(len, .17, T + .06, trimM, cu, gTop + .085, F - T / 2 + .02); box(len - .2, .09, T * .65, trimM, cu, gTop + .215, F - T * .3 - .02); }
        else { box(len, .06, .12, trimM, cu, gTop - .15, F + .06); box(len, .06, .17, trimM, cu, gTop - .09, F + .085); box(len, .07, .22, trimM, cu, gTop - .025, F + .11); body(.22, gTop); cap(gTop + .22, .05); }
        if (spouts) { const sp = spouts === 1 ? 3.6 : 2.2, k = Math.max(1, Math.floor((len - .9) / sp) + 1); for (let i = 0; i < k; i++) { const u = k === 1 ? cu : a + (len - (k - 1) * sp) / 2 + i * sp, ys = gTop + .06;
          box(.11, .11, .62, woodBar, u, ys, F + .11); box(.17, .07, .13, trimM, u, ys - .09, F + .075); ao([u - .1, ys - .1, F + .03], [u + .1, ys - .1, F + .03], [0, -.9, 0], .32, '#2a1b0e'); } }
        const y1 = gTop - .2, bh = .34, bk = !orn ? 'line' : (ornL < 1 && bandKind !== 'none') ? 'line' : bandKind; if (bk !== 'none' && y1 - bh > (bands.length ? bands[bands.length - 1] + BH : 0) + .05) {
          box(len, .05, .06, trimM, (a + b) / 2, y1, F + .03); box(len, .05, .05, trimM, (a + b) / 2, y1 - bh, F + .025);
          if (bk === 'line') { /* خطوط فقط */ } else if (bk === 'tri') { const tw = .22, pitch = .34, k = Math.floor((len - .1) / pitch); for (let i = 0; i < k; i++) prism(tri(tw, bh - .1, true), .03, darkTri, a + (len - (k - 1) * pitch) / 2 + i * pitch, y1 - bh + .04, F + .005); }
          else if (bk === 'dent') { const k = Math.floor(len / .22); for (let i = 0; i < k; i++) box(.1, bh - .12, .035, trimM, a + (len - (k - 1) * .22) / 2 + i * .22, y1 - bh / 2, F + .02); }
          ao([a, y1 - bh, F + .003], [b, y1 - bh, F + .003], [0, -.2, 0], .22, '#2a1b0e'); } }
      // ───── الفتحات ─────
      let idx = 0;
      for (const o of ops) { idx++; const cx = (o.u0 + o.u1) / 2, w = o.u1 - o.u0, h = o.y1 - o.y0; if (frontTop(s, cx) > o.y0 + .02) continue;
        if (o.door) { // ═══ باب ═══
          const portal = dKind === 'portal', sw = portal ? .34 : rng(32, .17, .24), dj = portal ? .24 : rng(33, .10, .16), yTop = o.y1, W2 = w + 2 * sw;
          box(sw, yTop + .02, dj, trimM, o.u0 - sw / 2, (yTop + .02) / 2, F + dj / 2 - .005); box(sw, yTop + .02, dj, trimM, o.u1 + sw / 2, (yTop + .02) / 2, F + dj / 2 - .005);
          box(W2, .28, dj + .02, trimM, cx, yTop + .14, F + (dj + .02) / 2 - .005); let yc = yTop + .28;
          if (dKind === 'stepped') { box(W2 + .16, .1, dj + .05, trimM, cx, yc + .05, F + (dj + .05) / 2 - .005); yc += .1; }
          else if (dKind === 'timber') { box(W2 + .3, .15, dj + .04, frameWood, cx, yc + .075, F + (dj + .04) / 2 - .005); yc += .15; }
          else if (dKind === 'portal') { const nb = bands.find(yb => yb > yTop), ah = Math.min(.5, (nb ?? gTop + 1) - yc - .14); if (ah > .15) { box(W2, ah, dj, trimM, cx, yc + ah / 2, F + dj / 2 - .005); box(W2 + .2, .08, dj + .08, trimM, cx, yc + ah + .04, F + (dj + .08) / 2 - .005); if (orn && ornL >= 1) box(W2 - .5, ah - .2, .02, insetM, cx, yc + ah / 2, F + dj + .005); } }
          else if (dKind === 'canopy') { const pu = [o.u0 - sw - .18, o.u1 + sw + .18], yb2 = yTop + .45, W3 = pu[1] - pu[0] + .3;
            for (const u of pu) { const g = new THREE.CylinderGeometry(.07, .08, yb2 + .05, 10); emit(place(g, u, (yb2 + .05) / 2, F + .54), frameWood); box(.2, .1, .1, frameWood, u, yb2 + .02, F + .54); }
            box(W3, .12, .12, frameWood, cx, yb2 + .1, F + .54);
            const np = Math.max(4, Math.round(W3 / .3)); for (let i = 0; i < np; i++) { const g = new THREE.CylinderGeometry(.045, .045, .66, 8); g.rotateX(Math.PI / 2); emit(place(g, cx - W3 / 2 + .1 + i * (W3 - .2) / (np - 1), yb2 + .22, F + .3), woodBar); }
            box(W3 + .1, .04, .62, doorM, cx, yb2 + .275, F + .33); box(W3, .12, .1, frameWood, cx, yTop + .36, F + .05); }
          else if (dKind === 'crown') { const k = 5, pt = (W2 + .04) / k; for (let i = 0; i < k; i++) prism(tri(pt * .82, .2), .08, trimM, cx - (k - 1) * pt / 2 + i * pt, yc, F - .005); }
          // ورقة الباب: ألواح خشب + تزيين بارز على وجه الباب نفسه
          if (o.doorMesh) o.doorMesh.material = doorM; const dd = o.dDoor + .003, leaves = w > 1.25 ? 2 : 1, lw = w / leaves;
          for (let L = 0; L < leaves; L++) { const lu0 = o.u0 + L * lw, lc = lu0 + lw / 2, y0 = o.y0, bw = .07, mid = y0 + h * .42, pw = lw - .12;
            const rib = (u, y, sw2, sh) => box(sw2, sh, .03, reliefM, u, y, dd + .015);
            rib(lc, y0 + h - .08, pw, bw); rib(lc, y0 + .09, pw, bw); rib(lu0 + .07, y0 + h / 2, bw, h - .1); rib(lu0 + lw - .07, y0 + h / 2, bw, h - .1); rib(lc, mid, pw, bw);
            if (doorKind === 'carved') { const pb = mid + .04, pt2 = y0 + h - .12, ph = pt2 - pb, pc = (pb + pt2) / 2, ds = Math.min(pw * .85, ph * .9) / 2;
              for (const [sx, sy, rz] of [[-1, 1, Math.PI / 4], [1, 1, -Math.PI / 4], [-1, -1, -Math.PI / 4], [1, -1, Math.PI / 4]]) box(ds * 1.0, .03, .028, reliefM, lc + sx * ds * .5, pc + sy * ds * .5, dd + .014, rz);
              box(.07, .07, .035, brass, lc, pc, dd + .016, Math.PI / 4);
              const lb = y0 + .15, lt = mid - .04, lh = (lt - lb) * .8; box(pw * .8, lh, .02, reliefM, lc, (lb + lt) / 2, dd + .01); box(pw * .8 - .08, lh - .08, .03, doorM, lc, (lb + lt) / 2, dd + .012);
              if (ornL >= 2) for (let i = 0; i < 5; i++) prism(tri(.07, .08), .02, reliefM, lc - .24 + i * .12, (lb + lt) / 2 - .04, dd + .02); }
            if (doorKind !== 'plain') { const ns = Math.max(2, Math.floor(pw / .13)); for (const yy of [y0 + h - .08, y0 + .09, mid]) for (let i = 0; i <= ns; i++) { if (doorKind === 'carved' && yy === mid && i % 2) continue; stud(lu0 + .06 + i * (pw / ns), yy, dd + .03); }
              if (doorKind === 'studded') for (let r = 1; r <= 3; r++) for (let i = 0; i <= ns; i += 2) stud(lu0 + .06 + i * (pw / ns), mid + r * (h * .5 - .18) / 4 + .02, dd + .03); }
            else { box(pw, .05, .02, iron, lc, y0 + h * .78, dd + .012); box(pw, .05, .02, iron, lc, y0 + h * .22, dd + .012); }
            const hx = leaves === 1 ? lu0 + lw - .2 : (L === 0 ? lu0 + lw - .12 : lu0 + .12);
            if (doorKind === 'plain') box(.03, .16, .035, iron, hx, mid - .15, dd + .03); else emit(place(new THREE.TorusGeometry(.045, .009, 6, 14), hx, mid - .1, dd + .035), brass); }
          // مصباحان جداريان بجانب الباب
          if (lamps && dKind !== 'canopy') for (const sx of [o.u0 - sw - .3, o.u1 + sw + .3]) { box(.1, .2, .11, iron, sx, 2.05, F + .06); box(.07, .15, .01, lampGlass, sx, 2.05, F + .12);
            if (night && lightCount++ < 10) { const Ls = new THREE.SpotLight('#ffd9a0', 6, 4, 1.1, .6, 2); Ls.position.copy(pr(sx, 1.98, F + .1)); Ls.target.position.copy(pr(sx, 0, F + .35)); scene.add(Ls, Ls.target); } }
        } else { // ═══ نافذة ═══
          const small = w < .9, bw = rng(34, .10, .15), pj = rng(35, .04, .08), kind = small && wKind !== 'bare' && wKind !== 'deep' ? 'band' : wKind;
          if (kind === 'beam') { box(w + .38, .13, pj + .05, frameWood, cx, o.y1 + .09, F + (pj + .05) / 2 - .005); box(w + .16, .06, pj + .06, trimM, cx, o.y0 - .03, F + (pj + .06) / 2 - .005); }
          else if (kind === 'bare') { box(w + .12, .05, .12, trimM, cx, o.y0 - .025, F + .06); box(w + .24, .09, .07, frameWood, cx, o.y1 + .05, F + .035); }
          else if (kind === 'deep') { box(w + .3, .15, .2, trimM, cx, o.y1 + .075, F + .1); box(.14, h + .08, .2, trimM, o.u0 - .07, (o.y0 + o.y1) / 2 - .04, F + .1); box(.14, h + .08, .2, trimM, o.u1 + .07, (o.y0 + o.y1) / 2 - .04, F + .1); box(w + .36, .08, .26, trimM, cx, o.y0 - .04, F + .13); }
          else { const L = w + 2 * bw;
            box(L, bw + .05, pj, trimM, cx, o.y1 + (bw + .05) / 2, F + pj / 2 - .004); box(bw, h + bw * .8, pj, trimM, o.u0 - bw / 2, (o.y0 - bw * .8 + o.y1) / 2, F + pj / 2 - .004); box(bw, h + bw * .8, pj, trimM, o.u1 + bw / 2, (o.y0 - bw * .8 + o.y1) / 2, F + pj / 2 - .004);
            box(L + .1, .06, pj + .06, trimM, cx, o.y0 - bw * .8 + .03, F + (pj + .06) / 2 - .004);
            if (kind === 'step') box(L + .16, .07, pj + .04, trimM, cx, o.y1 + bw + .08, F + (pj + .04) / 2 - .004);
            if (orn && ornL >= 2 && (small || R(36 + idx) < .2)) { const k = small ? 3 : 5, pt = (L + .1) / k; for (let i = 0; i < k; i++) prism(tri(pt * .8, .14), .05, trimM, cx - (k - 1) * pt / 2 + i * pt, o.y1 + bw + (kind === 'step' ? .1 : .05), F - .003); } }
          ao([o.u0 - .1, o.y0 - bw * .8, F + .003], [o.u1 + .1, o.y0 - bw * .8, F + .003], [0, -.22, 0], .25, '#2a1b0e');
          // شبكة خشبية داخل التجويف أمام الزجاج
          const g = o.gl; if (g) { const gw = g.u1 - g.u0, gh = g.y1 - g.y0, gd = o.dGl + .035, gc = (g.u0 + g.u1) / 2, gm = (g.y0 + g.y1) / 2, kk = small && (gKind === 'bars' || gKind === 'shutter') ? 'cross' : gKind;
            if (kk === 'none') { /* بلا شبكة */ }
            else if (kk === 'shutter') { for (const sgn of [-1, 1]) { const lw2 = gw * .34, lc2 = gc + sgn * (gw / 2 - lw2 / 2); box(lw2, gh, .035, doorM, lc2, gm, gd); box(lw2, .05, .04, woodBar, lc2, gm + gh * .3, gd + .005); box(lw2, .05, .04, woodBar, lc2, gm - gh * .3, gd + .005); } }
            else if (kk === 'bars') { const nb = Math.max(2, Math.round(gw / .14)); for (let i = 1; i < nb; i++) box(.028, gh, .03, woodBar, g.u0 + gw * i / nb, gm, gd); box(gw, .04, .035, woodBar, gc, g.y0 + gh * .66, gd); }
            else if (kk === 'cross') { box(.045, gh, .035, woodBar, gc, gm, gd); box(gw, .045, .035, woodBar, gc, gm + gh * .12, gd); }
            else { const sp = small ? .18 : .24; for (let c = -(gw + gh) / 2; c <= (gw + gh) / 2; c += sp) for (const fam of [1, -1]) { const xa = Math.max(-gw / 2, c - gh / 2), xb = Math.min(gw / 2, c + gh / 2); if (xb - xa < .04) continue; const xm = (xa + xb) / 2, ym = fam > 0 ? c - xm : xm - c;
                box((xb - xa) * 1.4142, .022, .03, woodBar, gc + xm, gm + ym, gd, fam > 0 ? -Math.PI / 4 : Math.PI / 4); } } }
        } }
      // ───── كوّات مثلثية ورصّات ولوحات في المساحات الحرة ─────
      // ───── أكتاف رأسية (strips) وأركان (corner) ─────
      const stripU = [];
      if (strips || corner) {
        const free = (u, hw) => !ops.some(o => o.u1 + .3 > u - hw && o.u0 - .3 < u + hw) && topAt(s, u - hw) >= s.y1 - .02 && topAt(s, u + hw) >= s.y1 - .02 && frontTop(s, u) <= .02 && frontTop(s, u - hw) <= .02 && frontTop(s, u + hw) <= .02;
        const colm = (u, w2, pj2) => { const top = topAt(s, u) - .03; if (top < 1) return; box(w2, top, pj2, trimM, u, top / 2, F + pj2 / 2 - .005); box(w2 + .1, .07, pj2 + .05, trimM, u, top - .0, F + (pj2 + .05) / 2 - .005); stripU.push([u - w2 / 2 - .4, u + w2 / 2 + .4]); };
        if (strips) { const pitch = strips === 1 ? 3.0 : 1.6, w2 = strips === 1 ? .34 : .22, pj2 = strips === 1 ? .16 : .115, len = s.u1 - s.u0, k = Math.floor((len - 1.0) / pitch) + 1; for (let i = 0; i < k; i++) { const u = (s.u0 + s.u1) / 2 + (i - (k - 1) / 2) * pitch; if (u - w2 > s.u0 + .5 && u + w2 < s.u1 - .5 && free(u, w2 / 2 + .05)) colm(u, w2, pj2); } }
        if (corner === 1) { for (const u of [s.u0 + .21, s.u1 - .21]) if (free(u, .24)) colm(u, .36, .16); }
        else if (corner === 2) { for (const u of [s.u0 + .27, s.u1 - .27]) if (free(u, .3)) { const top = topAt(s, u) - .03; if (top < 1) continue; const steps = [[.30, .26], [.22, .30], [.14, .22], [.07, .22]]; let yy = 0; steps.forEach(([pj2, fr], i) => { const hh = i === steps.length - 1 ? top - yy : top * fr; box(.5, hh, pj2, trimM, u, yy + hh / 2, F + pj2 / 2 - .005); yy += hh; }); stripU.push([u - .7, u + .7]); } }
      }
      const occ = [...stripU.map(([a, b]) => [a, b, 0, 99]), ...ops.map(o => o.door ? [o.u0 - .75, o.u1 + .75, o.y0 - .1, o.y1 + .9] : [o.u0 - .5, o.u1 + .5, o.y0 - .55, o.y1 + .6])];
      const spans = []; let yPrev = hp + .35; for (const yb of bands) { spans.push([yPrev, yb - .25]); yPrev = yb + BH + .25; }
      if (topSeg) spans.push([yPrev, gTop - .2 - .34 - .12, 'field']);
      let gi = 0, slots = 0;
      for (const [yLo, yHi, kindF] of spans) { if (yHi - yLo < .5) continue;
        let iv = runs(s, yLo, yHi, .5, s.u0 + .35, s.u1 - .35); for (const [a, b, c, d2] of occ) if (d2 > yLo && c < yHi) iv = subtract(iv, [a, b]);
        if (kindF === 'field') { // صف كوّات أفقي في حقل الدروة
          if (rowsN && orn && ornL >= 3) for (let r = 0; r < rowsN; r++) { const yc = yLo + (yHi - yLo) * (rowsN === 1 ? .5 : (r + 1) / 3), th = Math.min(.3, (yHi - yLo) * .3), tw = th * .75;
            for (const [a, b] of runs(s, yc - th, yc + th * 2, .6, s.u0 + .3, s.u1 - .3)) { const k = Math.max(1, Math.floor((b - a - .1) / rowPitch) + 1); for (let i = 0; i < k; i++) { if (slots++ > 90) break; slot(a + (b - a - (k - 1) * rowPitch) / 2 + i * rowPitch, yc - th / 2, tw, th, (r + i) % 2 === 1 && R(37) < .5, F); } } }
          continue; }
        for (const [a, b] of iv) { gi++; const gw = b - a, rr = R(200 + gi * 3 + (side.charCodeAt(0) % 7));
          if (gw >= 1.2 && rr < panelFrac) { const pw = Math.min(gw - .3, 1.3), pc = (a + b) / 2, py0 = yLo + .1, py1 = yHi - .05, bwid = .06;
            box(pw, py1 - py0, .012, insetM, pc, (py0 + py1) / 2, F + .006); box(pw + .1, bwid, .04, trimM, pc, py1, F + .02); box(pw + .1, bwid, .04, trimM, pc, py0, F + .02); box(bwid, py1 - py0, .04, trimM, pc - pw / 2 - .02, (py0 + py1) / 2, F + .02); box(bwid, py1 - py0, .04, trimM, pc + pw / 2 + .02, (py0 + py1) / 2, F + .02);
            ao([pc - pw / 2, py0, F + .003], [pc + pw / 2, py0, F + .003], [0, -.12, 0], .15, '#2a1b0e'); }
          else if (orn && ornL >= 2 && rr < panelFrac + stackProb * (1 - panelFrac)) { const colSp = 1.5, nc = gw < 1.6 ? 1 : Math.floor(gw / colSp), th = .26, tw = .2, vp = th + .1, nk = Math.max(2, Math.min(6, Math.floor((yHi - yLo - .1) / vp))), y0c = (yLo + yHi) / 2 - nk * vp / 2 + .05;
            for (let c = 0; c < nc; c++) { const uc = (a + b) / 2 + (c - (nc - 1) / 2) * colSp; for (let i = 0; i < nk; i++) { if (slots++ > 90) break; slot(uc, y0c + i * vp, tw, th, i % 2 === 1, F); } } } } }
      // مصابيح أرضية ليلية (الجهة الجنوبية فقط)
      if (night && side === 's' && topSeg) for (const [a, b] of runs(s, 0, 2, 1)) for (let x = a + 1.2; x < b - .6; x += 3.4) if (lightCount++ < 14) { box(.12, .06, .1, iron, x, .03, F + .09); box(.08, .01, .06, lampGlass, x, .065, F + .09);
        const Ls = new THREE.SpotLight('#ffd09a', 5, 7, .7, .85, 1.6); Ls.position.copy(pr(x, .1, F + .1)); Ls.target.position.copy(pr(x, 4.5, F - .1)); scene.add(Ls, Ls.target); }
      flush();
    }
  }
  flush(); curN = null;
  G.hiddenBlocks = S.meshes.filter(m => m.userData?.part === 'blocks' && !m.visible).length;
  guarded.forEach((m, i) => { const a = before[i], b = bbk(m); if (a.some((v, k) => Math.abs(v - b[k]) > 1e-4)) G.moved.push(m.name); });
  G.openingsUnchanged = G.moved.length === 0; globalThis.__NAJDI_GATES = gates();
  // الجهة الجنوبية: وجه الواجهة الرئيسي (كنمط J) لـ decorateFloors
  const sS = sideInfo.s; if (!sS) return {};
  const wallD = Math.max(...sS.segs.map(s => s.d1)), face = sS.segs.filter(s => s.d1 > wallD - .1);
  return { wallZ: wallD, X0: Math.min(...face.map(s => s.u0)), X1: Math.max(...face.map(s => s.u1)) };
}

// ═══════════════════ أدوات ═══════════════════
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const rnd = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, k) { const A = hex(a), B = hex(b), r = A.map((v, i) => Math.round(v + (B[i] - v) * k)); return '#' + r.map(v => v.toString(16).padStart(2, '0')).join(''); }
/** ضجيج قيمي دوري (يتكرر بلا حدود مرئية عند أي تردد صحيح). */
function pnoise(seed, P = 16) { const r = rnd(seed), L = new Float32Array(P * P); for (let i = 0; i < L.length; i++) L[i] = r(); const f = t => t * t * (3 - 2 * t), g = (a, b) => L[(((b % P) + P) % P) * P + (((a % P) + P) % P)];
  return (x, y) => { const X = Math.floor(x), Y = Math.floor(y), u = f(x - X), v = f(y - Y); return g(X, Y) * (1 - u) * (1 - v) + g(X + 1, Y) * u * (1 - v) + g(X, Y + 1) * (1 - u) * v + g(X + 1, Y + 1) * u * v; }; }
const mkTex = (THREE, renderer, c, srgb, rep) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
function aoTexture(THREE) { const [c, x] = cnv(4, 128), g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, '#fff'); g.addColorStop(.25, '#8a8a8a'); g.addColorStop(.6, '#262626'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); }
/** لياسة طينية: دورة 3 م؛ لطخات منخفضة التردد + أثر ماجنة + حبيبات + قش وشقوق شعرية. */
function plasterMat(THREE, renderer, base, seed, S = 1024, rough = 1, bumpK = .55) {
  const [c, x] = cnv(S, S), [bc, bx] = cnv(S, S), img = x.createImageData(S, S), bim = bx.createImageData(S, S), d = img.data, bd = bim.data, A = pnoise(seed), B = pnoise(seed + 1), C = pnoise(seed + 2), D = pnoise(seed + 3), [R0, G0, B0] = hex(base), r = rnd(seed);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) { const u = px / S, v = py / S;
    const n1 = A(u * 16, v * 16), n2 = B(u * 32 + 5, v * 32), n3 = C(u * 64, v * 64), trow = D(u * 4, v * 40), g = r();
    const L = 1 + (n1 - .5) * .13 + (n2 - .5) * .08 + (n3 - .5) * .05 + (trow - .5) * .05 + (g - .5) * .035, i = (py * S + px) * 4;
    d[i] = Math.min(255, R0 * L); d[i + 1] = Math.min(255, G0 * L * (1 + (n2 - .5) * .02)); d[i + 2] = Math.min(255, B0 * L * (1 - (n1 - .5) * .03)); d[i + 3] = 255;
    const h = 128 + (n3 - .5) * 120 + (g - .5) * 70 + (n2 - .5) * 50; bd[i] = bd[i + 1] = bd[i + 2] = h; bd[i + 3] = 255; }
  x.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  for (let k = 0; k < S * .5; k++) { const px = r() * S, py = r() * S, a = r() * 6.28, l = 3 + r() * 9; x.strokeStyle = `rgba(${R0 * .55 | 0},${G0 * .5 | 0},${B0 * .4 | 0},${.1 + r() * .1})`; x.lineWidth = .7 + r() * .7; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  for (let k = 0; k < 5; k++) { let px = r() * S, py = r() * S, a = r() * 6.28; x.strokeStyle = `rgba(${R0 * .45 | 0},${G0 * .4 | 0},${B0 * .32 | 0},.2)`; x.lineWidth = .8; x.beginPath(); x.moveTo(px, py); for (let j = 0; j < 14; j++) { a += (r() - .5) * .9; px += Math.cos(a) * (6 + r() * 14); py += Math.sin(a) * (6 + r() * 14); x.lineTo(px, py); } x.stroke(); }
  const rep = [1 / 3, 1 / 3], map = mkTex(THREE, renderer, c, true, rep), bump = mkTex(THREE, renderer, bc, false, rep);
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: bumpK, roughness: rough * .96, metalness: 0, envMapIntensity: .35 }); m.name = 'najdi-plaster'; return m; }
/** حجر جيري خشن / لياسة قاعدة داكنة: صفوف حجارة غير منتظمة (دورة 2×1 م). */
function stoneMat(THREE, renderer, stone, seed) { const W = 1024, H = 512, [c, x] = cnv(W, H), r = rnd(seed * 3 + 7), N = pnoise(seed + 90); x.fillStyle = stone ? '#6f6253' : '#8a755b'; x.fillRect(0, 0, W, H);
  if (stone) { const rows = 5, rh = H / rows; for (let ry = 0; ry < rows; ry++) { let cx = 0, tot = 0, ws = []; while (tot < W - 80) { const w = 120 + r() * 120; ws.push(w); tot += w; } ws.push(W - tot); const sc = W / ws.reduce((a, b) => a + b, 0); ws = ws.map(w => w * sc);
      for (const w of ws) { const v = 112 + r() * 32, tint = r() * .5; x.fillStyle = `rgb(${v + 12 + tint * 12},${v + 4},${v - 14 + tint * 8})`; x.beginPath(); x.roundRect(cx + 4, ry * rh + 4, w - 8, rh - 8, 10); x.fill(); for (let k = 0; k < 90; k++) { x.fillStyle = `rgba(0,0,0,${r() * .12})`; x.fillRect(cx + 4 + r() * (w - 8), ry * rh + 4 + r() * (rh - 8), 1 + r() * 3, 1 + r() * 3); } cx += w; } } }
  else { const im = x.getImageData(0, 0, W, H), d = im.data; for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const k = .93 + (N(px / W * 16, py / H * 8) - .5) * .1 + (N(px / W * 48, py / H * 24) - .5) * .12 + (N(px / W * 128, py / H * 64) - .5) * .08 + (r() - .5) * .04, i = (py * W + px) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } x.putImageData(im, 0, 0); }
  const t = mkTex(THREE, renderer, c, true, [1 / 2, 1 / 1]), m = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: stone ? 1 : .25, roughness: .95 }); m.name = 'najdi-plinth'; return m; }
/** ألواح خشب رأسية (8 في عرض الباب) أو مدهونة بلون. */
function plankMat(THREE, renderer, tone, painted, seed) { const W = 512, H = 1024, [c, x] = cnv(W, H), r = rnd(seed + 55), N = pnoise(seed + 60), [R0, G0, B0] = hex(tone), np = 8, pw = W / np;
  for (let p = 0; p < np; p++) { const k = .86 + r() * .28; x.fillStyle = `rgb(${R0 * k | 0},${G0 * k | 0},${B0 * k | 0})`; x.fillRect(p * pw, 0, pw, H);
    for (let l = 0; l < 26; l++) { const lx = p * pw + 3 + r() * (pw - 6); x.strokeStyle = `rgba(0,0,0,${painted ? .05 : .12 + r() * .1})`; x.lineWidth = .8 + r(); x.beginPath(); x.moveTo(lx, 0); for (let yy = 0; yy <= H; yy += 64) x.lineTo(lx + (N(lx * .05, yy * .02) - .5) * 5, yy); x.stroke(); }
    x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(p * pw, 0, 2.5, H); }
  const t = mkTex(THREE, renderer, c, true, [1, 1]), m = new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: .8, roughness: painted ? .55 : .66 }); m.name = 'najdi-door'; return m; }
