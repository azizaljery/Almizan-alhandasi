// مصفوفة الواجهات: كل الطرز × كل القوالب (+ بلا قالب، دمج قالبين، عدد أدوار صريح) × مخططات وأراضٍ متنوعة.
// شكوى المالك: «الواجهات الأخرى تعطيني خطأً أو لا تطلع مضبوطة». السبب الجذري الذي كشفته المصفوفة: تبديل الطراز يمسح القالب (tpl='')
// فيُبنى المخطط الخام؛ وباب مدخل بجوار نافذة بفاصل أقل من 14 سم كان يجعل «صندوق o3.jambR يتقاطع مع الفتحة o14» يُسقط بناء الواجهة كله.
// الفحص هنا بلا متصفح: من نماذج الواجهة وخطة الكتلة نفسها مقابل هندسة مستقلة (المخطط وطبقات النموذج)، لا من ادعاء الوحدات.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { facadeDoc, floorsInfo, extrudeFloors, FLOOR } from '../dist/facade-j/facade-realism/floors.mjs';
import { buildAllSides, sideTransform } from '../dist/facade-j/facade-realism/model.mjs';
import { STYLES, transformDoc } from '../dist/facade-j/facade-realism/styles/index.mjs';
import { massingPlan, buildMassing } from '../dist/facade-j/facade-realism/massing.mjs';
import { upperOpenings } from '../dist/facade-j/facade-realism/upper.mjs';
import { resolveTemplate } from '../dist/facade-j/facade-realism/templates.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as THREE from '../dist/facade-j/vendor/three.module.js';

const counts = b => ({ bedrooms: b, majlis: 1, baths: b, kitchens: 1, halls: 1, dining: 1 });
const mk = (w, l, b, f, req = '') => {
  const land = { width: w, length: l, streets: ['s'], entries: ['s'], floors: f };
  const g = f === 1 ? generateVillaDesigns : generateVillaTwoFloors;
  return g({ land, counts: counts(b), requirements: extractRequirements(req, {}), keep: 1 }).designs[0].doc;
};
// أراضٍ وبرامج متنوعة (12.5×30 دورين، 15×25، 20×30 بتراس، 25×35). كل مخطط منها يفشل في بلا قالب قبل الإصلاح أو يمثّل طوبولوجيا مختلفة.
const DOCS = [
  ['20×30 دوران 4 غرف تراس', mk(20, 30, 4, 2, 'ابي فيلا دورين وتراس فوق')],
  ['12.5×30 دوران 3 غرف', mk(12.5, 30, 3, 2)],
  ['25×35 دور 5 غرف', mk(25, 35, 5, 1)],
  ['15×25 دور 4 غرف', mk(15, 25, 4, 1)],
  ['20×30 دوران 5 غرف', mk(20, 30, 5, 2)],
];

const overlap = (a, b, e = .01) => a.min[0] < b.max[0] - e && a.max[0] > b.min[0] + e && a.min[1] < b.max[1] - e && a.max[1] > b.min[1] + e && a.min[2] < b.max[2] - e && a.max[2] > b.min[2] + e;
/** فتحات الواجهة الأمامية بإحداثيات المشهد، مستقلة عن الوحدة: من طبقات الإطارات. */
function frontOpenings(built) {
  const B = built.s, M = sideTransform('s', B.off), out = [];
  for (const pc of B.F.pieces) for (const L of B.layers) {
    if (L.role !== 'frame' || !L.id.startsWith(pc.id + '/')) continue;
    const us = L.outer.map(p => p[0]), ys = L.outer.map(p => p[1]), base = String(L.opening).split('@')[0], o = pc.openings.find(x => x.id === base), ground = !(L.floor > 0);
    const x0 = M[0][0] * Math.min(...us) + M[0][3], x1 = M[0][0] * Math.max(...us) + M[0][3], z = pc.C + pc.t / 2;
    out.push({ id: L.opening, entry: ground && !!o?.entry && !/^window/.test(o.kind), box: { min: [x0, Math.min(...ys), z - .2], max: [x1, Math.max(...ys), z + 3.5] } });
  }
  return out;
}
/** عناصر الكتلة داخل خط الارتداد من الجهات الأربع (نفس فحص facade-massing لكن على كل قالب). */
function outsideLine(plan, built, doc) {
  const sb = doc.plot.setbacks, P = doc.plot.polygon, x0 = Math.min(...P.map(p => p.x)), x1 = Math.max(...P.map(p => p.x)), y0 = Math.min(...P.map(p => p.y)), y1 = Math.max(...P.map(p => p.y)), bad = [], E = 1e-6;
  const B = built.s, M = sideTransform('s', B.off), pcs = B.F.pieces.map(pc => ({ a: M[0][0] * pc.u0 + M[0][3], b: M[0][0] * pc.u1 + M[0][3], skin: pc.C + pc.t / 2 + .04 }));
  const wx0 = Math.min(...pcs.map(p => Math.min(p.a, p.b))), wx1 = Math.max(...pcs.map(p => Math.max(p.a, p.b))), lineZ = -(y0 + sb.s), skinMax = Math.max(...pcs.map(p => p.skin));
  for (const el of plan.elements) {
    const name = `${el.id}/${el.part}`;
    if (el.ground) { if (el.max[1] > .5 + E || el.max[2] > Math.max(lineZ, skinMax) + 1 + E || -el.max[2] < y0 + .3 - E) bad.push(name + ' (أرضي)'); }
    else { const over = pcs.filter(p => Math.min(p.a, p.b) < el.max[0] + .4 && Math.max(p.a, p.b) > el.min[0] - .4), zLim = Math.max(lineZ, ...(over.length ? over : pcs).map(p => p.skin)); if (el.max[2] > zLim + E) bad.push(name + ' أمامًا'); }
    if (el.min[0] < Math.min(x0 + sb.w, wx0) - E) bad.push(name + ' غربًا'); if (el.max[0] > Math.max(x1 - sb.e, wx1) + E) bad.push(name + ' شرقًا'); if (-el.min[2] > y1 - sb.n + E) bad.push(name + ' خلفًا');
  }
  return bad;
}

/** يبني كل ما تبنيه صفحة الواجهة (من facadeDoc إلى buildMassing) ويعيد قائمة الأعطال (فارغة = سليم). */
async function exercise(doc, style, q, tag) {
  const bad = [], logs = [], oe = console.error; console.error = (...a) => logs.push(a.join(' '));
  try {
    const dd = await facadeDoc(doc, q, transformDoc), FI = floorsInfo(q); FI.style = style;
    const b0 = buildAllSides(dd, 'A');
    if (FI.n > 1 && !FI.setback && q.get('upper') !== '0') FI.upper = upperOpenings(doc, b0);
    const built = extrudeFloors(b0, FI);
    const expect = Math.min(3, Math.max(1, Math.round(Number(q.get('floors')) || 1)));
    if (FI.n !== expect) bad.push(`عدد الأدوار ${FI.n} ≠ ${expect}`);
    const top = Math.max(...Object.values(built).flatMap(B => B.layers.filter(L => L.role === 'wall').map(L => Math.max(...L.outer.map(p => p[1]))))), lv = Math.round((top - FLOOR.ground) / FLOOR.upper) + 1;
    if (lv !== FI.n) bad.push(`أعلى جدار ${top.toFixed(2)} م يوافق ${lv} أدوار لا ${FI.n}`);
    const plan = massingPlan({ doc, built, style, exterior: {}, floors: FI.n });
    const scene = new THREE.Scene(), m = buildMassing(THREE, { scene, S: { meshes: [] }, plan }); m.dispose();
    for (const x of outsideLine(plan, built, doc)) bad.push('خارج حد البناء: ' + x);
    const ops = frontOpenings(built), entry = ops.filter(o => o.entry);
    // المدخل في مكانه: باب أرضي واحد على الأقل بقاعدته عند الأرض، وفي قطعة الواجهة (لا خارجها)
    if (doc.openings.some(o => o.entry)) {
      const ent = built.s.F.pieces.flatMap(pc => pc.openings.filter(o => o.entry && !/^window/.test(o.kind)).map(o => ({ pc, o })));
      if (!ent.length) bad.push('لا باب مدخل على الواجهة الأمامية');
      for (const { pc, o } of ent) { if (o.z0 > .6) bad.push(`باب المدخل ${o.id} مرفوع ${o.z0}`); if (o.u0 < pc.u0 - 1e-6 || o.u1 > pc.u1 + 1e-6) bad.push(`باب المدخل ${o.id} خارج قطعته`); }
    }
    for (const el of plan.elements) {
      for (const o of entry) if (overlap(el, o.box)) { bad.push(`${el.id}/${el.part} يسد المدخل ${o.id}`); break; }
      if (!el.screen) for (const o of ops) if (overlap(el, o.box)) { bad.push(`${el.id}/${el.part} مصمت أمام الفتحة ${o.id}`); break; }
      if (el.min[1] < -1e-6) bad.push(`${el.id}/${el.part} تحت الأرض`);
    }
    // الفتحات العلوية: داخل قطع الجدار، فلا فتحة أمام جدار صلب ولا خارج قطعتها
    for (const [side, B] of Object.entries(built)) for (const L of B.layers) {
      if (L.role !== 'frame' || !(L.floor > 0)) continue; const pc = B.F.pieces.find(p => p.id === L.id.split('/')[0]); if (!pc) { bad.push(`فتحة علوية بلا قطعة ${L.id}`); continue; }
      const us = L.outer.map(p => p[0]); if (Math.min(...us) < pc.u0 - 1e-6 || Math.max(...us) > pc.u1 + 1e-6) bad.push(`فتحة علوية ${L.opening} خارج قطعة ${side}`);
    }
  } catch (e) { bad.push('استثناء: ' + String(e?.message || e).slice(0, 120)); } finally { console.error = oe; }
  for (const l of logs) bad.push('console.error: ' + l.slice(0, 100));
  return bad.map(b => `${tag}: ${b}`);
}

const q0 = (style, tpl, extra = {}) => { const q = new URLSearchParams({ style, tseed: '3', ...extra }); if (tpl) q.set('tpl', tpl); return q; };

test('كل الطرز بلا قالب (حالة تبديل الطراز: tpl=\'\') تُبنى على كل المخططات دون استثناء ولا خطأ هندسي', async () => {
  const bad = [];
  for (const style of Object.keys(STYLES)) for (const [name, doc] of DOCS) bad.push(...await exercise(doc, style, q0(style, '', { floors: String(doc.levels.length) }), `${style}/بلا قالب/${name}`));
  assert.deepEqual(bad, []);
});

test('كل قوالب كل طراز (≈120 قالبًا) على المخططات المتنوعة: بناء سليم، كتلة داخل الحد، مدخل في مكانه، وعدد أدوار يطابق المخطط', async () => {
  const bad = []; let n = 0;
  for (const style of Object.keys(STYLES)) {
    const T = (await STYLES[style].load()).templates; assert.ok(T.length >= 10, style + ': قوالب');
    for (const t of T) for (const [name, doc] of DOCS.filter((_, i) => i % 2 === (T.indexOf(t) % 2))) { n++; bad.push(...await exercise(doc, style, q0(style, t.id, { floors: String(doc.levels.length) }), `${style}/${t.id}/${name}`)); }
  }
  assert.ok(n > 200, 'عدد التركيبات ' + n); assert.deepEqual(bad, []);
});

test('دمج قالبين وتطفيرهما (أزرار «ادمج» و«طفّر») وعدد أدوار صريح 1 و3 لا تكسر البناء', async () => {
  const bad = [];
  for (const style of Object.keys(STYLES)) {
    const T = (await STYLES[style].load()).templates;
    for (let i = 0; i < 4; i++) {
      const a = T[(i * 3) % T.length], b = T[(i * 5 + 2) % T.length]; if (a.id === b.id) continue;
      const r = resolveTemplate(T, new URLSearchParams({ tpl: a.id + '+' + b.id, tseed: String(i + 2) })); assert.ok(r && r.parents.length === 2);
      const doc = DOCS[i % DOCS.length][1], tag = `${style}/${a.id}+${b.id}`;
      bad.push(...await exercise(doc, style, q0(style, a.id + '+' + b.id, { floors: String(doc.levels.length), tseed: String(i + 2) }), tag + '/دمج'));
      bad.push(...await exercise(doc, style, q0(style, a.id, { floors: String(doc.levels.length), mut: '.4', mseed: String(i + 7) }), tag + '/تطفير'));
    }
    for (const fl of ['1', '3']) bad.push(...await exercise(DOCS[0][1], style, q0(style, '', { floors: fl }), `${style}/بلا قالب/أدوار ${fl}`));
  }
  assert.deepEqual(bad, []);
});

test('جذر الشكوى: باب مدخل بجوار نافذة بفاصل أقل من 14 سم لا يُسقط بناء الواجهة (يُقلَّص الحجر المجاور أو يُسقط)', async () => {
  // مخططات المولّد هذه كانت تفشل بلا قالب: «صندوق o3.jambL يتقاطع مع الفتحة o13» (20×30 دوران 4 غرف)
  for (const [name, doc] of DOCS) for (const v of ['A', 'B', 'C']) assert.doesNotThrow(() => buildAllSides(doc, v), `${name}/${v}`);
  // مخطط يقرّب نافذة إلى 5 سم من الباب: يجب أن يبقى البناء سليمًا والفتحتان بلا تداخل
  const doc = JSON.parse(JSON.stringify(DOCS[0][1])), ent = doc.openings.find(o => o.entry);
  const wall = doc.walls.find(w => w.id === ent.wall), len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y), win = doc.openings.find(o => o.wall === ent.wall && !o.entry && /^window/.test(o.kind));
  if (win) { win.at = ent.at + (ent.w + win.w) / 2 + .05; if (win.at + win.w / 2 < len) assert.doesNotThrow(() => buildAllSides(doc, 'A'), 'نافذة ملاصقة للباب'); }
});

test('توافق iOS/Safari 15–16 في الشيفرة المُسلَّمة للواجهة: لا roundRect خام، ولا lookbehind، ولا top-level await، ولا .at/findLast/toSorted، ولا حقول خاصة', async () => {
  const { readdir } = await import('node:fs/promises'), root = new URL('../dist/', import.meta.url), files = [];
  const walk = async (dir, rel) => { for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) { const r = rel + e.name; if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'assets') await walk(dir + e.name + '/', r + '/'); } else if (/\.(mjs|html)$/.test(e.name)) files.push(r); } };
  await walk('facade-j/', 'facade-j/'); files.push('view3d.mjs', 'view3d.html', 'exterior-brief.mjs');
  const BAN = [
    [/(?<![\w$])[A-Za-z_$][\w$]*\.roundRect\(/, 'CanvasRenderingContext2D.roundRect غير متوفر قبل Safari 16 (استعمل roundRectPath)'],
    [/\(\?<[=!]/, 'regex lookbehind غير متوفر قبل Safari 16.4'],
    [/\.(findLast|findLastIndex|toSorted|toReversed|toSpliced)\(/, 'طرائق مصفوفة حديثة غير متوفرة قبل Safari 15.4/16'],
    [/[\w\])]\.at\(-?[\w.]+\)/, 'Array.prototype.at غير متوفر قبل Safari 15.4'],
    [/\bstatic\s*\{/, 'static blocks غير متوفرة قبل Safari 16.4'],
    [/(^|[\s;{])this\.#\w+/, 'حقول خاصة (#) غير متوفرة قبل Safari 14.1/15'],
    [/Object\.groupBy|Promise\.withResolvers|Array\.fromAsync|AbortSignal\.any/, 'واجهات حديثة جدًا'],
    [/^await\s/m, 'top-level await'],
  ];
  const hits = [];
  for (const f of files) { let src = await readFile(new URL(f, root), 'utf8'); if (f.endsWith('.html')) src = [...src.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n'); const code = src.replace(/\/\/[^\n]*/g, '').split('\n').filter(l => !/roundRectPath = /.test(l)).join('\n');
    for (const [re, why] of BAN) { const m = code.match(re); if (m) hits.push(`${f}: ${why} — «${m[0].slice(0, 40)}»`); } }
  assert.deepEqual(hits, []);
  // OffscreenCanvas وrequestIdleCallback لا تُستعمل إلا بحارس typeof
  for (const f of files) { const src = await readFile(new URL(f, root), 'utf8'); for (const m of src.matchAll(/OffscreenCanvas/g)) assert.match(src.slice(Math.max(0, m.index - 40), m.index + 30), /typeof OffscreenCanvas|new OffscreenCanvas/, f + ': OffscreenCanvas بلا حارس'); assert.ok(!/requestIdleCallback/.test(src) || /globalThis\.requestIdleCallback/.test(src), f); }
});

test('رسالة واضحة بالعربية عند غياب WebGL (لا شاشة بيضاء ولا نص إنجليزي من المكتبة)، والصفحة الأم تقرأ فشل الإطار وتعود إلى المجسم', async () => {
  const f = await readFile(new URL('../dist/facade-j/index.html', import.meta.url), 'utf8'), v = await readFile(new URL('../dist/view3d.html', import.meta.url), 'utf8');
  assert.match(f, /متصفحك أو جهازك لا يوفّر WebGL كافيًا/); assert.match(f, /role', 'alert'/); assert.match(f, /throw new Error\('WebGL: '/);
  assert.match(v, /onFrameError/); assert.match(v, /fr\.contentWindow && fr\.contentWindow\.__FR/); assert.match(v, /الواجهة الواقعية تحتاج WebGL/);
});
