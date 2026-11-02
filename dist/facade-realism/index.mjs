// (طلب المالك 2026-11-02) واجهة أمامية ثنائية البعد لكل بديل، من طبقات النموذج نفسها (model.mjs) لا من رسم منفصل.
// يبقى composeElevation في dist/facade-styles.mjs مرجعًا كما هو. هذه الوحدة نقية: بلا DOM ولا THREE ولا شبكة.
import { buildVariant, VARIANTS, MATERIALS, CLASSES, CLASS_AR, TAG, SIDE } from './model.mjs';
export { buildVariant, VARIANTS, MATERIALS, CLASSES, CLASS_AR, TAG, SIDE };

const FILL = Object.freeze({ limestoneWhite: '#ece6d8', limestoneBeige: '#d6bf97', render: '#e9e0cc', aluminium: '#3a3d41', glass: '#a9c2cd', timberLook: '#8a6240' });
const inPoly = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const cover = (L, p) => inPoly(p, L.outer) && !L.holes.some(h => inPoly(p, h));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r3 = v => Math.round(v * 1000) / 1000;

/** الأسطح الظاهرة من الأمام: لكل نقطة في شبكة 5 سم، الطبقة الأمامية (أكبر C + o1) تفوز. */
export function rasterFront(layers, F, step = .05) {
  const zMax = Math.max(...F.pieces.map(p => p.zTop)), cells = [];
  const nu = Math.round(F.width / step), nz = Math.round(zMax / step);
  for (let iu = 0; iu < nu; iu++) for (let iz = 0; iz < nz; iz++) {
    const p = [(iu + .5) * step, (iz + .5) * step];
    let best = null, bf = -Infinity;
    for (const L of layers) if (cover(L, p)) { const f = L.C + L.o1; if (f > bf) { bf = f; best = L; } }
    cells.push(best ? best.cls : 'none');
  }
  return { cells, total: cells.length, step };
}
/** توزيع الكسوات الظاهرة (نسب من السطح الأمامي المرسوم). */
export function fingerprint(raster) {
  const c = Object.fromEntries(CLASSES.map(k => [k, 0])); c.none = 0;
  for (const k of raster.cells) c[k] = (c[k] || 0) + 1;
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, r3(v / raster.total)]));
}
export function distance(a, b) { return r3(CLASSES.reduce((s, k) => s + Math.abs((a[k] || 0) - (b[k] || 0)), 0)); }

/** فحوص آلية على المسقط: كل فتحة أمامية في المخطط مرة واحدة بمقاساتها، ولا ثقب بلا فتحة، وكل طبقة خارج المخطط موسومة. */
export function checkVariant(doc, id, built = buildVariant(doc, id)) {
  const docOpen = new Map((doc.openings || []).map(o => [o.id, o]));
  const planOpen = built.F.pieces.flatMap(p => p.openings);
  const eq = (a, b) => Math.abs(a - b) < 1e-6;
  const frames = built.layers.filter(l => l.role === 'frame' && l.opening);
  const countById = {};
  for (const f of frames) countById[f.opening] = (countById[f.opening] || 0) + 1;
  const sizeErrors = [];
  for (const o of planOpen) {
    const d = docOpen.get(o.id);
    if (!d) { sizeErrors.push(o.id + ': غير موجودة في المسقط'); continue; }
    if (!eq(o.u1 - o.u0, d.w) || !eq(o.z1 - o.z0, d.h || (o.z1 - o.z0))) sizeErrors.push(o.id + ': المقاس مختلف');
    const f = frames.find(x => x.opening === o.id);
    if (!f || !eq(f.u0, o.u0) || !eq(f.u1, o.u1) || !eq(f.z0, o.z0) || !eq(f.z1, o.z1)) sizeErrors.push(o.id + ': الإطار لا يطابق مكان الفتحة');
  }
  const openPolys = planOpen.map(o => JSON.stringify(o.poly));
  const fakeHoles = built.layers.flatMap(l => l.holes.filter(h => !openPolys.includes(JSON.stringify(h)) && !(l.role === 'frame'))).length;
  const frameHoles = frames.filter(f => !openPolys.includes(JSON.stringify(f.outer))).length;
  return {
    variant: id,
    openingsInPlan: planOpen.length,
    openingsDocFront: built.F.openingIds.length,
    openingsDrawnOnce: planOpen.every(o => countById[o.id] === 1),
    sizeErrors,
    fakeHoles,
    frameHoles,
    untaggedNonPlan: built.layers.filter(l => !l.plan && !l.tag).map(l => l.id),
    planLayersNotWallOrOpening: built.layers.filter(l => l.plan && !['wall', 'glazing', 'door'].includes(l.role)).map(l => l.id),
  };
}

/** لوحة الواجهة الأمامية ثنائية البعد (SVG) للبديل. مرسوم من الطبقات: الكسوة بتعبئة، والتعديلات المقترحة بخط متقطع. */
export function elevationSvgVariant(built, { title = '' } = {}) {
  const F = built.F, zMax = Math.max(...F.pieces.map(p => p.zTop)), W = F.width, pad = 1.4, px = 60;
  const X = u => r3(u), Y = z => r3(zMax + 1 - z);
  const path = pts => 'M' + pts.map(([u, z]) => `${X(u)},${Y(z)}`).join('L') + 'Z';
  const d = L => [path(L.outer), ...L.holes.map(path)].join(' ');
  const out = [];
  for (const L of built.layers) {
    const fill = FILL[L.mat] || '#ccc';
    const proud = L.tag ? ` stroke="#b5562b" stroke-width=".025" stroke-dasharray=".08 .05"` : ` stroke="#4a463f" stroke-width=".012"`;
    const data = ` data-layer="${esc(L.id)}" data-role="${L.role}" data-mat="${L.mat}" data-plan="${L.plan}"${L.opening ? ` data-opening="${esc(L.opening)}"` : ''}${L.tag ? ` data-tag="${esc(TAG)}"` : ''}`;
    out.push(`<path d="${d(L)}" fill="${fill}" fill-rule="evenodd"${proud}${data}/>`);
  }
  const ground = `<line x1="${-pad}" y1="${Y(0)}" x2="${W + pad}" y2="${Y(0)}" stroke="#4a463f" stroke-width=".04"/>`;
  const dim = `<text x="${W / 2}" y="${Y(-.55)}" font-size=".38" text-anchor="middle" fill="#4a463f">${W.toFixed(2)} م</text>`;
  const legend = `<text x="${W + pad - .2}" y="${Y(-1.25)}" font-size=".3" text-anchor="end" fill="#b5562b">خط متقطع = تعديل مقترح يحتاج مراجعة مهندس مختص (ليس في المخطط الأصلي)</text>`;
  const head = `<text x="${W + pad - .2}" y="${Y(zMax + .7)}" font-size=".42" font-weight="700" text-anchor="end" fill="#1f3b33">الواجهة الأمامية — البديل ${built.variant.id}: ${esc(built.variant.ar)}</text>`;
  const svgW = Math.round((W + 2 * pad) * px), svgH = Math.round((zMax + 3.2) * px);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-.1 + 0} ${r3(W + 2 * pad)} ${r3(zMax + 2.6)}" width="${svgW}" height="${svgH}" direction="rtl" role="img" aria-label="${esc(title || built.variant.ar)}" data-variant="${built.variant.id}" data-side="${SIDE}"><rect x="${-pad}" y="${-.1}" width="${r3(W + 2 * pad)}" height="${r3(zMax + 2.6)}" fill="#fbf8f2"/>${out.join('')}${ground}${dim}${head}${legend}</svg>`;
}

/** العينة كاملة: البدائل الثلاثة مع الفحوص والبصمات والمسافات بينها. */
export function buildSample(doc) {
  const variants = {};
  for (const id of Object.keys(VARIANTS)) {
    const built = buildVariant(doc, id), raster = rasterFront(built.layers, built.F), fp = fingerprint(raster);
    variants[id] = { built, fingerprint: fp, checks: checkVariant(doc, id, built) };
  }
  const ids = Object.keys(variants), pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push({ pair: ids[i] + ids[j], distance: distance(variants[ids[i]].fingerprint, variants[ids[j]].fingerprint) });
  return { variants, pairs };
}
export default { buildSample, buildVariant, checkVariant, rasterFront, fingerprint, distance, elevationSvgVariant, MATERIALS };
