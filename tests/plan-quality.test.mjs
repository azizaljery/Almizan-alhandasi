// جودة إخراج المسقط: رموز الأثاث المعمارية، رموز الأبواب والنوافذ، علامة المدخل، نقش الأرضيات، وجدول العنوان.
// الاختبار على أوامر الرسم الفعلية (Canvas مسجَّل) وعلى SVG اللوحة، لا على وجود الدوال فقط.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, applyCommand } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { exteriorWallIds } from '../dist/draw/topology.mjs';
import { fixtureSymbol } from '../dist/draw/plan-annot.mjs';
import { FIXTURES } from '../dist/draw/catalog.mjs';
import { renderPlan, fitView, docBounds, THEME, FLOOR_PATTERNS } from '../dist/draw/editor/render2d.mjs';
import { planSheet } from '../dist/draw/plan-sheet.mjs';

const sym = (kind, extra = {}) => fixtureSymbol({ kind, x: 0, y: 0, w: FIXTURES[kind].w, d: FIXTURES[kind].d, rot: 0, ...extra });

function house() {
  let doc = createDoc({ title: 'بيت الجودة' });
  const run = c => { doc = applyCommand(doc, c).doc; };
  run({ type: 'add-rect', level: 'L1', a: { x: 0, y: 0 }, b: { x: 10, y: 6 }, t: .25 });
  run({ type: 'add-wall', level: 'L1', a: { x: 4, y: 0 }, b: { x: 4, y: 6 }, t: .12 });
  run({ type: 'add-wall', level: 'L1', a: { x: 7, y: 0 }, b: { x: 7, y: 6 }, t: .12 });
  run({ type: 'add-label', level: 'L1', name: 'مجلس', roomType: 'majlis', seed: { x: 2, y: 3 } });
  run({ type: 'add-label', level: 'L1', name: 'غرفة نوم', roomType: 'bedroom', seed: { x: 5.5, y: 3 } });
  run({ type: 'add-label', level: 'L1', name: 'حمام', roomType: 'bath', seed: { x: 8.5, y: 3 } });
  const south = doc.walls.find(w => Math.abs(w.a.y) < 1e-6 && Math.abs(w.b.y) < 1e-6);
  run({ type: 'add-opening', wall: south.id, kind: 'door', at: 1.5, w: 1, swing: 'in', hinge: 'left', entry: true });
  run({ type: 'add-opening', wall: south.id, kind: 'window', at: 5.5, w: 1.4 });
  run({ type: 'add-fixture', level: 'L1', kind: 'majlis-sofa', x: 2, y: 5.3, rot: 0 });
  run({ type: 'add-fixture', level: 'L1', kind: 'bed-double', x: 5.5, y: 4.6, rot: 0 });
  run({ type: 'add-fixture', level: 'L1', kind: 'wc', x: 9.3, y: 5.2, rot: 0 });
  return doc;
}

/** سياق Canvas يسجّل الأوامر والخصائص وقت الرسم. */
function recorder() {
  const calls = [], props = {};
  const ctx = new Proxy({}, {
    get: (t, k) => k === 'measureText' ? s => ({ width: String(s).length * 6 }) : k in props ? props[k] : (...a) => { calls.push({ op: k, a, fill: props.fillStyle, stroke: props.strokeStyle, lw: props.lineWidth }); },
    set: (t, k, v) => { props[k] = v; return true; },
  });
  return { ctx, calls };
}
function paint(doc, flags = {}, W = 900, H = 700) {
  const m = analyzeDoc(doc), lv = m.levelById.get('L1'), b = docBounds(doc, 'L1'), { ctx, calls } = recorder();
  const st = { doc, levelId: 'L1', view: fitView({ x0: b.x0 - 2, y0: b.y0 - 2, x1: b.x1 + 2, y1: b.y1 + 1 }, W, H, 40), W, H,
    analysis: { rooms: lv.rooms, gaps: [], exteriorWallIds: exteriorWallIds(lv.analysis) }, flags: { grid: false, underlay: false, roomDims: true, ...flags } };
  renderPlan(ctx, st);
  return { calls, st };
}

test('رموز الأثاث: لكل نوع فراغ رمز معماري مفصّل لا مستطيل أصم', () => {
  const bed = sym('bed-double'); assert.equal(bed.rects.length, 2, 'وسادتان'); assert.ok(bed.lines.length >= 4, 'لوح رأس وطيّة غطاء بزاوية مقلوبة'); assert.ok(bed.tints.length >= 3);
  assert.equal(sym('bed-single').rects.length, 1, 'وسادة واحدة للسرير المفرد');
  const s3 = sym('sofa-3'), s2 = sym('sofa-2'); assert.equal(s3.lines.length - s2.lines.length, 1, 'تقسيم وسائد الجلوس يتبع عدد المقاعد');
  const mj = fixtureSymbol({ kind: 'majlis-sofa', x: 0, y: 0, w: 4.5, d: .8, rot: 0 });
  assert.equal(mj.tints.length, Math.round((4.5 - 2 * .14) / .75), 'الجلسة العربية: مسند ظهر لكل مقعد بطول الجلسة');
  const short = fixtureSymbol({ kind: 'dining-table', x: 0, y: 0, w: 1.3, d: .9, rot: 0 }), long = fixtureSymbol({ kind: 'dining-table', x: 0, y: 0, w: 2.6, d: 1, rot: 0 });
  assert.equal(short.rects.length, 2 * 2 + 1, 'طاولة قصيرة: كرسيان لكل جانب'); assert.equal(long.rects.length, 4 * 2 + 2 + 1, 'طاولة طويلة: أربعة لكل جانب وكرسيا الرأسين');
  const wc = sym('wc'); assert.equal(wc.outline, null, 'المرحاض بلا مستطيل محيط'); assert.equal(wc.ellipses.length, 2); assert.equal(wc.rects.length, 1, 'خزان خلفي');
  assert.ok(sym('basin').ellipses.length >= 2, 'حوض وخلاط'); assert.ok(sym('shower').ellipses.length === 1 && sym('shower').lines.length === 2, 'دش: قطران ومصرف');
  const kr = sym('kitchen-run'); assert.equal(kr.rects.length, 2, 'حوض مزدوج'); assert.ok(kr.lines.length >= 2, 'حافة السطح ومصفاة'); assert.ok(sym('stove').ellipses.length === 8);
  assert.ok(sym('wardrobe').lines.length >= 3 && sym('fridge').lines.length === 2 && sym('nightstand').ellipses.length === 1);
});

test('رموز الأثاث: كل الهندسة داخل حدود القطعة (عدا كراسي الطاولة) وتتبع الدوران', () => {
  for (const kind of Object.keys(FIXTURES)) {
    if (kind === 'dining-table') continue;
    const f = { kind, x: 3, y: 2, w: FIXTURES[kind].w, d: FIXTURES[kind].d, rot: Math.PI / 2 }, s = fixtureSymbol(f);
    const pts = [...s.rects.flat(), ...s.lines.flat(), ...(s.tints || []).flat(), ...s.ellipses.map(e => e.c)];
    for (const p of pts) assert.ok(Math.abs(p.x - 3) <= f.d / 2 + 1e-6 && Math.abs(p.y - 2) <= f.w / 2 + 1e-6, `${kind}: نقطة خارج القطعة بعد الدوران`);
  }
});

test('المسقط (Canvas): أقواس الأبواب، زجاج النوافذ، علامة المدخل، لوحات التسميات، نقش الأرضية، وظل الكتلة', () => {
  const { calls, st } = paint(house());
  const arcs = calls.filter(c => c.op === 'arc');
  assert.ok(arcs.some(c => Math.abs(c.a[2] - 1 * st.view.scale) < .5), 'قوس فتح الباب بنصف قطر عرض الضلفة');
  assert.ok(calls.some(c => c.op === 'fill' && c.fill === 'rgba(96,160,196,.5)'), 'لوح زجاج النافذة ملوّن');
  assert.equal(st.entryMarks.length, 1); assert.match(st.entryMarks[0].text, /المدخل الرئيسي/);
  const south = st.doc.walls.find(w => Math.abs(w.a.y) < 1e-6 && Math.abs(w.b.y) < 1e-6);
  assert.ok(st.entryMarks[0].y < st.H / 2 - (0 - st.view.cy) * st.view.scale, 'تسمية المدخل داخل المبنى (فوق الجدار الجنوبي على الشاشة) لا فوق سلاسل الأبعاد'); assert.ok(south);
  assert.ok(calls.some(c => c.op === 'fillText' && c.a[0] === 'مجلس') && calls.some(c => c.op === 'fillText' && /م²|م2/.test(String(c.a[0]))), 'اسم الفراغ ومساحته');
  assert.ok(calls.filter(c => c.op === 'roundRect').length >= 3, 'لوحة خلف كل تسمية');
  assert.ok(!calls.some(c => c.op === 'strokeText' && c.a[0] === 'مجلس'), 'بلا هالة سميكة حول التسميات على الشاشة');
  assert.ok(calls.some(c => c.op === 'ellipse'), 'رمز المرحاض بيضوي');
  assert.ok(calls.some(c => c.op === 'stroke' && /^rgba\(43,33,27,0?\.(1|055|05|06)\)$/.test(String(c.stroke))), 'نقش الأرضية يُخطّ داخل الفراغات');
  assert.ok(calls.some(c => c.op === 'fill' && c.fill === 'rgba(43,33,27,.085)'), 'ظل الكتلة');
  assert.ok(FLOOR_PATTERNS.wet.grid && !FLOOR_PATTERNS.wood.grid);
});

test('المسقط (Canvas): وضع اللوحة يبقى أسود على أبيض بلا ظل ولا نقش ولا لوحات ملوّنة', () => {
  const { calls } = paint(house(), { sheet: true });
  assert.ok(!calls.some(c => c.op === 'stroke' && /^rgba\(43,33,27,0?\.(1|055|05|06)\)$/.test(String(c.stroke))), 'لا نقش أرضية');
  assert.ok(!calls.some(c => c.fill === 'rgba(43,33,27,.085)'), 'لا ظل');
  assert.ok(calls.some(c => c.op === 'strokeText' && c.a[0] === 'مجلس'), 'الهالة البيضاء باقية للطباعة');
});

test('المسقط (Canvas): تباين ألوان النص على الورق ≥ 4.5:1', () => {
  const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  for (const key of ['ink', 'inkSoft']) for (const bg of [THEME.paper, '#e6d6bd', '#d6e4ea']) assert.ok(ratio(THEME[key], bg) >= 4.5, `${key} على ${bg}: ${ratio(THEME[key], bg).toFixed(2)}`);
  assert.ok(ratio(THEME.accent, '#fdfbf6') >= 4.5, 'لون علامة المدخل على لوحتها الفاتحة');
});

test('لوحة المسقط (SVG): أثاث مظلَّل، زجاج نوافذ، نقش أرضيات، زخارف زوايا، وتنبيه اعتماد المهندس', () => {
  const { svg } = planSheet(house(), { levelId: 'L1', date: '2026-11-11', fingerprint: 'abc', sheetNo: 'A-01' });
  assert.match(svg, /class="fx-tint"/); assert.match(svg, /class="glass"/);
  assert.match(svg, /-fl-tile/); assert.match(svg, /-fl-wood/); assert.match(svg, /class="floor-pattern"/);
  assert.equal((svg.match(/class="corner-star"/g) || []).length, 4);
  assert.match(svg, /يلزم اعتماد مهندس مرخّص/); assert.match(svg, /مخطط مبدئي/); assert.match(svg, /A-01/); assert.match(svg, /2026-11-11/); assert.match(svg, /1:\d+/);
  assert.match(svg, /<ellipse/, 'رمز المرحاض'); assert.match(svg, / A[\d.]+ [\d.]+ 0 0 [01] /, 'قوس فتح الباب');
});

// ---------------------------------------------------------------- المخرجات والهوية
import { readFileSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { buildFinalData, projectBookHtml, areaSchedule } from '../dist/final-outputs.mjs';
const C1 = () => parseDoc(readFileSync(new URL('../dist/facade-j/facade-realism/C1.json', import.meta.url), 'utf8'));

test('جدول المساحات: صف لكل فراغ، مجموع لكل دور، وإجمالي يساوي جمع الصفوف', () => {
  const d = buildFinalData(C1()), html = areaSchedule(d);
  assert.equal((html.match(/<tr><td class="num">\d+<\/td>/g) || []).length, d.rooms.length);
  const total = d.rooms.reduce((a, r) => a + r.area, 0).toFixed(2);
  assert.ok(html.includes(`<td class="num">${total}</td></tr></tfoot>`), 'الإجمالي = مجموع المساحات المعروضة');
  const levels = new Set(d.rooms.map(r => r.level));
  assert.equal((html.match(/class="grp"/g) || []).length, levels.size > 1 ? levels.size : 0);
  assert.equal(areaSchedule({ rooms: [] }), '', 'بلا فراغات لا جدول');
});

test('كتاب المشروع: غلاف بالهوية والتاريخ وتنبيه اعتماد المهندس، وجدول المساحات ضمنه', () => {
  const d = buildFinalData(C1()), html = projectBookHtml(d, { css: readFileSync(new URL('../dist/final.css', import.meta.url), 'utf8') });
  assert.match(html, /class="pb-head"/); assert.match(html, /يلزم اعتماده من مهندس مرخّص/); assert.ok(html.includes(d.fingerprint));
  assert.match(html, /<h2>جدول المساحات<\/h2>/); assert.match(html, /area-table/);
  assert.match(html, /\.pb-head\{/, 'أنماط الغلاف مضمَّنة في الملف المستقل');
  assert.ok(!/#143428|#1f4d3a/.test(readFileSync(new URL('../dist/final.css', import.meta.url), 'utf8')), 'لا أخضر قديم في أنماط المخرجات');
});

test('الهوية الموحّدة: نقش النجمة، تدرج العناوين، إطار المسقط، حركة «يُرسم»، واحترام تقليل الحركة', () => {
  const css = readFileSync(new URL('../dist/lux-theme.css', import.meta.url), 'utf8');
  for (const token of ['--lx-star:url("data:image/svg+xml', '--lx-title:linear-gradient', '.plancard::after', '@keyframes lxPlanDraw', ':focus-visible', '"Aref Ruqaa"']) assert.ok(css.includes(token), token);
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.plan-drawin\{display:none\}/); assert.match(reduced, /animation:none!important/);
  assert.ok(!/background-attachment:fixed/.test(css.slice(css.indexOf('/* ===== 5)'))), 'النقش لا يُثبَّت (أداء التمرير)');
  assert.ok(Buffer.byteLength(css) < 40000, 'ملف الهوية خفيف');
  for (const page of ['home.html', 'design.html', 'final.html']) {
    const html = readFileSync(new URL('../dist/' + page, import.meta.url), 'utf8');
    assert.match(html, /Aref\+Ruqaa/, page + ': خط العناوين الاحتفالية'); assert.match(html, /IBM\+Plex\+Sans\+Arabic/); assert.match(html, /lux-theme\.css/); assert.match(html, /dir="rtl"/);
  }
  const design = readFileSync(new URL('../dist/design.mjs', import.meta.url), 'utf8');
  assert.match(design, /prefers-reduced-motion: reduce/); assert.match(design, /plan-drawin/);
});
