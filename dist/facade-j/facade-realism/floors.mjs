// (طلب المالك 2026-11-05) عينة C1 معزولة: نموذج بطابقين أو ثلاثة حسب رغبة العميل (floors=1|2|3).
// افتراض تصوير لا مخطط: الطابق الأرضي كما هو في C1 تمامًا (فتحاته ومناسيبه، شريط البلاطة 3.55–3.85)،
// والأدوار العليا امتداد رأسي للجدران نفسها بارتفاع 3.6 م لكل دور، والدروة تنتقل إلى أعلى الدور الأخير.
// فتحات الأدوار العليا تكرار لمواقع فتحات الأرضي: النافذة بالمنسوب النسبي نفسه، والباب يصير نافذة بعرضه نفسه
// (جلسة 0.9 م ورأس 2.6 م فوق منسوب الدور). لا يُعدَّل مسقط ولا فتحة في الأرضي.
// setback=1 مع floors=3: الدور الأخير (ملحق) يرتد 1.75 م عن الواجهة الأمامية P1 مع مظلة سوداء رفيعة وبرجولة شرائح (مرجع المالك J18-1128 / J18-1137).
export const FLOOR = Object.freeze({ ground: 3.85, upper: 3.6, slabTop: 3.55, parapetBase: 3.85, top1: 5.45, sill: .9, head: 2.6, setback: 1.75 });
export const ASSUMPTION = 'افتراض تصوير: فتحات الأدوار العليا تكرار لمواقع الأرضي (الأبواب نوافذ بالعرض نفسه، جلسة 0.9 ورأس 2.6 م)، وليست مخططًا معتمدًا';

/** منسوب أرضية الدور k (0 = الأرضي). */
export const floorLevel = k => k === 0 ? 0 : FLOOR.ground + (k - 1) * FLOOR.upper;
/** معاملات الأدوار المستخرجة من الاستعلام. */
export function floorsInfo(q) {
  const n = Math.max(1, Math.min(3, Math.round(Number(q.get('floors') || 1)) || 1));
  const setback = n === 3 && q.get('setback') !== '0';
  const dz = (n - 1) * FLOOR.upper;
  return { n, setback, dz, top: FLOOR.top1 + dz, parapetBase: FLOOR.parapetBase + dz, levels: Array.from({ length: n }, (_, k) => floorLevel(k)) };
}
const rect = (u0, u1, z0, z1) => [[u0, z0], [u1, z0], [u1, z1], [u0, z1]];
const bb = pts => { const us = pts.map(p => p[0]), zs = pts.map(p => p[1]); return { u0: Math.min(...us), u1: Math.max(...us), z0: Math.min(...zs), z1: Math.max(...zs) }; };
const isDoorRect = r => r.z0 < .6;
/** فتحة الأرضي ← فتحة الدور k (منسوب FL). */
function upperRect(r, FL) { return isDoorRect(r) ? { u0: r.u0, u1: r.u1, z0: FL + FLOOR.sill, z1: FL + FLOOR.head } : { u0: r.u0, u1: r.u1, z0: r.z0 + FL, z1: r.z1 + FL }; }
const shiftUp = (pts, dz, above) => pts.map(([u, z]) => [u, z > above + 1e-6 ? z + dz : z]);

/**
 * يعيد نسخة من built (buildAllSides) بأدوار إضافية. البيانات فقط؛ المشهد يُبنى بعدها بـbuildBuildingScene كما هو.
 * الفتحات المضافة تُلحق في نهاية الطبقات فتبقى فهارس زجاج الأرضي (gi) كما كانت.
 */
export function extrudeFloors(built, info) {
  const { n, dz, setback, top } = info;
  if (n <= 1) return built;
  const out = {};
  const FLtop = floorLevel(n - 1), SB = FLOOR.setback, UP = .25; // UP: قائم فوق بلاطة الدور تحت الملحق (حافة السطح)
  for (const [side, B] of Object.entries(built)) {
    if (!B || !B.layers) { out[side] = B; continue; }
    const base = B.layers, layers = [], extra = [];
    const frames = base.filter(L => L.role === 'frame');
    // منطقة الإزالة في الدور الأخير مع الارتداد: الواجهة الأمامية P1 كلها، وأطراف الجدارين الجانبيين المجاورة لها
    const cut = (L) => {
      if (!setback) return null;
      if (side === 's' && /^P1\//.test(L.id)) return { u0: -1e3, u1: 1e3 };
      if (side === 'w' && /^w0\//.test(L.id)) return { u0: 19.9 - SB, u1: 1e3 };
      if (side === 'e' && /^e1\//.test(L.id)) return { u0: -1e3, u1: SB };
      return null;
    };
    const holesFor = (L, k, FL, c) => frames.filter(f => f.id.split('/')[0] === L.id.split('/')[0]).map(f => upperRect(bb(f.outer), FL))
      .filter(r => !(k === n - 1 && c && r.u1 > c.u0 && r.u0 < c.u1)).map(r => rect(r.u0, r.u1, r.z0, r.z1));
    for (const L of base) {
      const c = cut(L);
      if (L.role === 'wall' || L.role === 'cladding') {
        const b0 = bb(L.outer);
        let outer = shiftUp(L.outer, dz, FLOOR.parapetBase);
        if (c && b0.z1 >= FLOOR.top1 - 1e-6) { // قصّ الدور الأخير في منطقة الارتداد إلى قائم بارتفاع UP
          const zc = FLtop + UP, u0 = Math.max(b0.u0, c.u0), u1 = Math.min(b0.u1, c.u1);
          if (u0 <= b0.u0 + 1e-6 && u1 >= b0.u1 - 1e-6) outer = rect(b0.u0, b0.u1, 0, zc);
          else if (u0 <= b0.u0 + 1e-6) outer = [[b0.u0, 0], [b0.u1, 0], [b0.u1, top], [u1, top], [u1, zc], [b0.u0, zc]];
          else outer = [[b0.u0, 0], [b0.u1, 0], [b0.u1, zc], [u0, zc], [u0, top], [b0.u0, top]];
        }
        const holes = [...L.holes];
        for (let k = 1; k < n; k++) holes.push(...holesFor(L, k, floorLevel(k), c));
        const nb = bb(outer);
        layers.push({ ...L, outer, holes, z1: nb.z1 });
        // الدور الأخير المرتد للواجهة الأمامية: جدار مستقل خلف الواجهة بـSB
        if (c && side === 's') {
          const hs = frames.filter(f => f.id.split('/')[0] === L.id.split('/')[0]).map(f => upperRect(bb(f.outer), FLtop)).map(r => rect(r.u0, r.u1, r.z0, r.z1));
          extra.push({ ...L, id: L.id.replace('P1/', 'P1T/'), C: L.C - SB, outer: rect(b0.u0, b0.u1, FLtop, top), holes: hs, z0: FLtop, z1: top, floor: n - 1 });
        }
      } else if (L.role === 'cornice' && /coping/.test(L.id)) {
        layers.push({ ...L, outer: L.outer.map(([u, z]) => [u, z + dz]), z0: L.z0 + dz, z1: L.z1 + dz });
        if (c && side === 's') { // حافة القائم الأمامي، وغطاء دروة الملحق
          const b0 = bb(L.outer); layers.pop();
          layers.push({ ...L, outer: rect(b0.u0, b0.u1, FLtop + UP, FLtop + UP + .06) });
          extra.push({ ...L, id: L.id.replace('P1/', 'P1T/'), C: L.C - SB, outer: L.outer.map(([u, z]) => [u, z + dz]) });
        }
      } else if (L.role === 'cornice') { // كورنيش منسوب البلاطة: يتكرر عند كل بلاطة (يخفيه نمط J ويستبدله بشريط الحجر الرمادي)
        layers.push(L);
        for (let k = 1; k < n; k++) extra.push({ ...L, id: L.id + '@F' + k, outer: L.outer.map(([u, z]) => [u, z + k * FLOOR.upper]) });
      } else layers.push(L);
      // فتحات الأدوار العليا: إطار + زجاج (الباب يصير نافذة)
      if (L.role === 'frame') {
        const r0 = bb(L.outer);
        for (let k = 1; k < n; k++) {
          const FL = floorLevel(k), r = upperRect(r0, FL);
          const inT = k === n - 1 && c;
          if (inT && side !== 's') { if (r.u1 > c.u0 && r.u0 < c.u1) continue; }
          const C = inT && side === 's' ? L.C - SB : L.C, tag = inT && side === 's' ? 'P1T' : null;
          const id = (tag ? L.id.replace('P1/', 'P1T/') : L.id) + '@F' + k, op = L.opening + '@F' + k, i = .06;
          extra.push({ ...L, id, C, o0: .005, o1: .105, outer: rect(r.u0, r.u1, r.z0, r.z1), holes: [rect(r.u0 + i, r.u1 - i, r.z0 + i, r.z1 - i)], z0: r.z0, z1: r.z1, opening: op, floor: k });
          extra.push({ ...L, id: id.replace('.frame', '.glazing'), role: 'glazing', mat: 'glass', cls: 'glass', C, o0: .01, o1: .02, outer: rect(r.u0 + i, r.u1 - i, r.z0 + i, r.z1 - i), holes: [], u0: r.u0 + i, u1: r.u1 - i, z0: r.z0 + i, z1: r.z1 - i, opening: op, floor: k });
        }
      }
    }
    out[side] = { ...B, layers: [...layers, ...extra] };
  }
  return out;
}

/** مناسيب أسفل أشرطة البلاطات لنمط J (خطاف globalThis.__FLOORS في style-j.mjs): 3.55 + 3.6k. */
export const bandLevels = info => Array.from({ length: info.n }, (_, k) => FLOOR.slabTop + k * FLOOR.upper);

/**
 * يُستدعى بعد applyStyleJ (الذي يرسم الأشرطة عند كل بلاطة والدروة وشرائحها من globalThis.__FLOORS):
 * - عمود الشرائح الرأسية بجانب المدخل الثاني يتكرر في كل دور.
 * - مع الارتداد: نقل شرائح الدروة إلى الملحق، شريط سقف الملحق وغطاؤه وإنارته، قصّ عناصر الجهتين الشرقية والغربية فوق التراس،
 *   ونقل إظلام التماس لنوافذ الملحق إلى وجهه؛ وأرضية تراس، درابزين زجاجي، مظلة سوداء رفيعة بارزة وبرجولة شرائح.
 */
export function decorateFloors(THREE, { scene, S, q, info, J }) {
  const { n, setback, top, parapetBase } = info;
  if (n <= 1 || !J || J.wallZ === undefined) return; // ليس نمط J: يكفي امتداد الهندسة
  const box = o => new THREE.Box3().setFromObject(o);
  const own = new Set(); S.group.traverse(o => own.add(o));
  const added = scene.children.filter(o => !own.has(o) && o.isMesh);
  const isBox = (o, h) => o.geometry?.parameters && Math.abs(o.geometry.parameters.height - h) < 1e-3;
  const grey = added.find(o => isBox(o, .30) && Math.abs(o.position.y - 3.70) < 1e-3)?.material;
  const led = added.find(o => o.material?.emissive && o.material.emissiveIntensity > 1)?.material;
  const black = added.find(o => o.material?.name === 'steel-blackJ')?.material || new THREE.MeshStandardMaterial({ color: '#17191b', metalness: .55, roughness: .38 });
  const wallZ = J.wallZ, X0 = J.X0, X1 = J.X1, SB = FLOOR.setback, FLtop = floorLevel(n - 1), zT = wallZ - SB, PROJ = Number(q.get('proj') ?? .20);
  const add = (geo, mat, x, y, z, cast = true) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; scene.add(o); return o; };
  // 1) عمود الشرائح بجانب المدخل الثاني (0.45 إلى أسفل الشريط الأول) يتكرر في كل دور من المنسوب +0.10
  const col = added.filter(o => { const b = box(o); return Math.abs(b.min.y - .45) < .02 && Math.abs(b.max.y - 3.55) < .02 && b.max.x - b.min.x < 1 && (o.isInstancedMesh || isBox(o, 3.10)); });
  for (let k = 1; k < n; k++) for (const o of col) { const c = o.clone(); c.position.y += floorLevel(k) + .10 - .45; if (setback && k === n - 1) c.position.z -= SB; scene.add(c); }
  if (!setback) return;
  // 2) قصّ عناصر J فوق التراس: الأشرطة والأغطية وإظلام التماس على الجهتين الجانبيتين تمتد بطول الجدار؛ تُقصّ عند وجه الملحق
  const zMax = zT + PROJ + .02, yCut = FLtop + .25 + .01;
  for (const o of added) { const b = box(o); if (b.min.y < yCut || b.max.z <= zMax + .01 || b.min.z >= zT - .05) continue;
    if (b.max.x - b.min.x > 1) continue; // عناصر الجهة الأمامية (ممتدة في x) لا تُقصّ هنا
    const pos = o.geometry.attributes.position; o.updateMatrixWorld(); const inv = new THREE.Matrix4().copy(o.matrixWorld).invert(), v = new THREE.Vector3();
    o.geometry = o.geometry.clone(); const P = o.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); if (v.z > zMax) { v.z = zMax; v.applyMatrix4(inv); P.setXYZ(i, v.x, v.y, v.z); } }
    P.needsUpdate = true; o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); }
  // 3) إظلام التماس لصناديق نوافذ الملحق رُسم على وجه P1: يُنقل إلى وجه الملحق
  for (const o of added) { if (!o.material?.alphaMap || o.geometry?.parameters) continue; const b = box(o);
    if (b.min.y > yCut + .1 && Math.abs(b.max.z - (wallZ + .003)) < .01 && b.max.x - b.min.x < X1 - X0 - .5) o.position.z -= SB; }
  // 4) دروة الملحق: شرائح الخشب الصغيرة على القائم (من FLtop) تُنقل إلى دروة الملحق، وغطاء الدروة، وشريط سقف الملحق
  const par = added.filter(o => { const b = box(o); return Math.abs(b.min.y - FLtop) < .02 && b.max.y < FLtop + .3 && b.max.x - b.min.x > 1 && (o.isInstancedMesh || isBox(o, b.max.y - b.min.y)); });
  const h1 = top - .02 - parapetBase;
  for (const o of par) {
    if (o.isInstancedMesh) { const p = o.geometry.parameters; o.geometry = new THREE.BoxGeometry(p.width, h1, p.depth); const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3();
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, M4); M4.decompose(V, Q, Sc); V.y = parapetBase + h1 / 2; V.z -= SB; M4.compose(V, Q, Sc); o.setMatrixAt(i, M4); } o.instanceMatrix.needsUpdate = true; o.computeBoundingBox?.(); o.computeBoundingSphere?.(); }
    else { const p = o.geometry.parameters; o.geometry = new THREE.BoxGeometry(p.width, h1, p.depth); o.position.y = parapetBase + h1 / 2; o.position.z -= SB; } }
  if (grey) {
    add(new THREE.BoxGeometry(X1 - X0 + .02, .30, PROJ), grey, (X0 + X1) / 2, parapetBase - .15, zT + PROJ / 2);
    add(new THREE.BoxGeometry(X1 - X0 + .02, .08, .34), grey, (X0 + X1) / 2, top + .04, zT - .12);
  }
  if (led) add(new THREE.BoxGeometry(X1 - X0 - .2, .015, .015), led, (X0 + X1) / 2, parapetBase - .302, zT + PROJ - .04, false);
  // 5) التراس: أرضية، درابزين زجاجي بإطار علوي أسود، مظلة سوداء رفيعة بارزة (62% من العرض) وبرجولة شرائح سوداء على الباقي
  const W = X1 - X0, cx = (X0 + X1) / 2;
  add(new THREE.BoxGeometry(W - .3, .04, SB - .1), new THREE.MeshStandardMaterial({ color: '#b9b4ab', roughness: .85 }), cx, FLtop + .02, wallZ - SB / 2 - .1, false);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#cfdde3', roughness: .05, transparent: true, opacity: .3 });
  add(new THREE.BoxGeometry(W - .1, 1.0, .015), glass, cx, FLtop + .31 + .5, wallZ - .09, false);
  add(new THREE.BoxGeometry(W - .1, .04, .05), black, cx, FLtop + .31 + 1.0, wallZ - .09);
  const yC = parapetBase + .06, cw = W * .62, cx0 = X1 - cw;
  add(new THREE.BoxGeometry(cw, .12, SB + .6), black, cx0 + cw / 2, yC, zT - .3 + (SB + .6) / 2);
  const pw = W - cw - .3, px0 = X0 + .15, nS = Math.floor(pw / .25);
  add(new THREE.BoxGeometry(pw, .12, .08), black, px0 + pw / 2, yC, wallZ + .26);
  for (let i = 0; i <= nS; i++) add(new THREE.BoxGeometry(.05, .12, SB + .3), black, px0 + i * (pw / nS), yC, zT + (SB + .3) / 2);
  if (led) add(new THREE.BoxGeometry(cw - .2, .012, .012), led, cx0 + cw / 2, yC - .066, wallZ + .2, false);
  if (q.get('night') === '1') { // إنارة شريط سقف الملحق (شريط J الأمامي عند FLtop يُضاء من applyStyleJ)
    for (let x = X0 + .8; x < X1; x += 1.6) { const L = new THREE.SpotLight('#ffe2b0', 4, 4.5, 1.0, .7, 2); L.position.set(x, parapetBase - .33, zT + PROJ - .05); L.target.position.set(x, parapetBase - 2.3, zT + .05); scene.add(L, L.target); }
    const L = new THREE.PointLight('#ffd9a0', 3, 6, 2); L.position.set(cx0 + cw / 2, yC - .3, wallZ - .4); scene.add(L);
  }
}
export default { extrudeFloors, decorateFloors, bandLevels, floorsInfo, floorLevel, FLOOR, ASSUMPTION };

/** الدور الأرضي وحده (جدرانه وفتحاته): أساس نموذج الواجهة. الأدوار العليا يضيفها extrudeFloors بعدد أدوار المخطط. لا يغيّر الأصل. */
export function groundLevelOnly(doc) {
  const L = doc?.levels || []; if (L.length < 2) return doc;
  const g = L[0].id, on = x => (x?.level ?? g) === g, d = { ...doc, levels: [L[0]] };
  d.walls = (doc.walls || []).filter(on); const ids = new Set(d.walls.map(w => w.id));
  d.openings = (doc.openings || []).filter(o => ids.has(o.wall));
  for (const k of ['labels', 'fixtures', 'stairs', 'slabs', 'rooms', 'columns', 'beams']) if (Array.isArray(doc[k])) d[k] = doc[k].filter(on);
  return d;
}
/**
 * مستند الواجهة وعدد أدوارها. القاعدة (المالك): عدد الأدوار في الواجهة يتبع المخطط أو طلب العميل الصريح، لا القالب.
 * النموذج يُبنى من الدور الأرضي ثم يُمدّ رأسيًا إلى العدد المطلوب؛ كان مخطط الدورين يُبنى بدوريه ثم يُمدّ فوقهما دور ثالث،
 * وكانت قوالب بعض الطرز تفرض عدد أدوارها على مخطط العميل.
 * @param q URLSearchParams: يُضبط فيه floors النهائي (المطلوب صراحةً، وإلا عدد أدوار المخطط).
 * @param transformDoc (styleId, doc, q) => doc  تحويل قالب الطراز (يُستدعى فقط مع style و tpl)
 */
export async function facadeDoc(doc, q, transformDoc) {
  const planLevels = Math.min(3, Math.max(1, (doc?.levels || []).length || 1)), asked = q.get('floors');
  let d = groundLevelOnly(doc);
  if (q.get('style') && q.get('tpl') && transformDoc) d = groundLevelOnly(await transformDoc(q.get('style'), d, q));
  q.set('floors', asked || String(planLevels));
  return d;
}
