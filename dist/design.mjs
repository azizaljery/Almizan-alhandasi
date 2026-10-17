// صفحة عرض التصميم على العميل: المخطط بأبعاده ومناطقه، المواصفات، جدول الغرف، ما طُبّق من طلبه،
// ثم: اعتماد ← العرض ثلاثي الأبعاد، أو «اطلب تصميمًا آخر» (شرعاء تسأل عمّا لم يعجبه)، أو التعديل في المرسم.
import { loadSession, saveSession, redesign, approve, FEEDBACK, ZONES, zoneOf, summarizeDoc, currentDoc } from './design-session.mjs';
import { analyzeDoc } from './draw/digest.mjs';
import { renderPlan, fitView, docBounds } from './draw/editor/render2d.mjs';
import { exteriorWallIds } from './draw/topology.mjs';
import { writeHandoff, STUDIO_KEY } from './draw/handoff.mjs';
import { serialize } from './draw/doc.mjs';

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };
const fmt = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const toast = t => { const n = el('div', { class: 'toast', role: 'status' }, t); document.body.append(n); setTimeout(() => n.remove(), 3200); };

let session = loadSession(localStorage), doc = null, levelId = 'L1', zonesOn = true, view = null, model = null;

function init() {
  if (!session) {
    $('main').replaceChildren(el('div', { class: 'empty card' }, el('h2', {}, 'لا يوجد تصميم بعد'), el('p', {}, 'ابدأ من الأرض ثم تحدّث مع شرعاء لنصمّم لك منزلك.'), el('a', { class: 'btn primary', href: './home.html' }, 'ابدأ رحلة التصميم')));
    return;
  }
  show(session.current);
}

function show(index) {
  session.current = index; saveSession(localStorage, session);
  doc = currentDoc(session); model = analyzeDoc(doc); levelId = doc.levels[0].id; view = null; goal = null; inertia = null;
  const d = session.designs[index], S = summarizeDoc(doc), req = session.input.requirements || {};
  const specs = [
    ['غرف النوم', S.specs.bedrooms], ['دورات المياه', S.specs.baths], ['المجالس', S.specs.majlis], ['الأدوار', S.specs.floors],
    ['مسطح البناء', fmt(S.specs.built) + ' م²'], ['أبعاد المبنى', `${fmt(S.specs.width)} × ${fmt(S.specs.depth)} م`], ['المداخل', S.specs.entries],
  ];
  const levels = doc.levels.length > 1 ? el('div', { class: 'seg', role: 'tablist' }, doc.levels.map(l => el('button', { 'data-level': l.id, class: l.id === levelId ? 'on' : '', onclick: () => { levelId = l.id; view = null; goal = null; inertia = null; document.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('on', b.dataset.level === levelId)); paint(); } }, l.name))) : null;
  const zoneToggle = el('label', {}, el('input', { type: 'checkbox', id: 'zonesOn', checked: zonesOn, onchange: e => { zonesOn = e.target.checked; paint(); legend(); } }), 'تلوين المناطق');
  const plan = el('div', { class: 'card plancard' },
    el('div', { class: 'planbar' }, levels, zoneToggle, el('div', { class: 'tools' }, el('button', { title: 'تكبير', 'aria-label': 'تكبير', onclick: () => zoom(1.25) }, '+'), el('button', { title: 'تصغير', 'aria-label': 'تصغير', onclick: () => zoom(.8) }, '−'), el('button', { title: 'ملاءمة', 'aria-label': 'ملاءمة', onclick: () => { goal = null; inertia = null; view = null; paint(); } }, '⤢'))),
    el('div', { class: 'planwrap', id: 'planWrap' }, el('canvas', { id: 'plan', 'aria-label': 'مسقط التصميم' })),
    el('div', { class: 'legend', id: 'legend' }));
  const applied = [...(req.understood || [])];
  const side = el('div', { class: 'actions card' },
    el('h2', {}, 'ما رأيك في هذا التصميم؟'),
    el('button', { class: 'btn gold', id: 'btnApprove', onclick: onApprove }, 'أعجبني — اعتمده واعرضه ثلاثي الأبعاد ←'),
    el('button', { class: 'btn primary', id: 'btnAnother', onclick: openShara }, 'اطلب تصميمًا آخر'),
    el('button', { class: 'btn', id: 'btnStudio', onclick: onStudio }, 'عدّل عليه بيدك في المرسم'),
    el('small', {}, 'الاعتماد يفتح العرض ثلاثي الأبعاد في صفحة مستقلة، ومنه المخرجات (الإنشائي والكميات والتكلفة وكتاب المشروع).'));
  const reqCard = el('div', { class: 'card' }, el('h2', {}, 'ما طبّقته من طلبك'),
    applied.length ? el('ul', { class: 'tick' }, applied.map(t => el('li', {}, t))) : el('p', { class: 'sub' }, 'طُبّقت الأعداد التي حددتها.'),
    (req.unsupported || []).length ? el('ul', { class: 'tick' }, req.unsupported.map(t => el('li', { class: 'no' }, t))) : null);
  const notes = el('div', { class: 'card' }, el('h2', {}, 'ملاحظات التصميم'), el('ul', { class: 'notes' }, [d.summary, ...(d.notes || [])].filter(Boolean).map(t => el('li', {}, t))),
    d.feedback ? el('p', { class: 'sub' }, 'عدّلتُ هذا التصميم بناءً على: ' + d.feedback.changes.join('، ')) : null);
  const table = el('table', { class: 'rooms' }, el('thead', {}, el('tr', {}, el('th', {}, 'الفراغ'), doc.levels.length > 1 ? el('th', {}, 'الدور') : null, el('th', {}, 'الأبعاد (م)'), el('th', {}, 'المساحة (م²)'), el('th', {}, 'المنطقة'))),
    el('tbody', {}, S.rooms.filter(r => r.area >= 2).map(r => el('tr', {}, el('td', {}, el('span', { class: 'z', style: `background:${ZONES[r.zone].color}` }), r.name), doc.levels.length > 1 ? el('td', {}, r.level) : null, el('td', { class: 'num' }, `${fmt(r.l)} × ${fmt(r.w)}`), el('td', { class: 'num' }, fmt(r.area)), el('td', {}, ZONES[r.zone].label)))),
    el('tfoot', {}, el('tr', {}, el('th', {}, 'إجمالي المساحات الصافية'), doc.levels.length > 1 ? el('th', {}) : null, el('th', {}), el('th', { class: 'num' }, fmt(S.specs.net)), el('th', {}))));
  const history = session.designs.length > 1 ? el('div', { class: 'history', 'aria-label': 'التصاميم السابقة' }, session.designs.map((x, i) => el('button', { class: i === index ? 'on' : '', onclick: () => show(i) }, 'التصميم ' + (i + 1)))) : null;
  $('main').replaceChildren(
    el('div', { class: 'titlebar' }, el('div', {}, el('h1', {}, index === 0 ? 'تصميمك الأولي' : 'التصميم ' + (index + 1)), el('div', { class: 'sub' }, 'مسقط مبدئي قابل للتعديل؛ الأبعاد بين محاور الجدران والمساحات صافية من داخل الجدران.')), history),
    el('section', { class: 'specs', 'aria-label': 'المواصفات' }, specs.map(([k, v]) => el('div', { class: 'spec' }, el('b', {}, v), el('span', {}, k)))),
    el('div', { class: 'grid' }, plan, el('div', { class: 'actions', style: 'gap:16px' }, side, reqCard)),
    el('div', { class: 'cols' }, el('div', { class: 'card' }, el('h2', {}, 'جدول الفراغات'), table), notes));
  legend(); bindPlan(); paint();
}

function legend() {
  const box = $('legend'); if (!box) return;
  box.replaceChildren(...(zonesOn ? Object.values(ZONES).map(z => el('span', {}, el('i', { style: `background:${z.color}` }), z.label)) : [el('span', {}, 'ألوان حسب نوع الفراغ')]), el('span', { style: 'margin-inline-start:auto' }, 'الشمال أعلى المسقط'));
}

// ------------------------------------------------------------------------------------------ المسقط
// اللمس والفأرة بدقة: إصبع واحد يسحب 1:1، إصبعان تكبير حول منتصفهما مع السحب، والعجلة/لوحة اللمس تكبير حول المؤشر.
// التكبير بالأزرار والعجلة ينساب (تحريك ناعم)، والسحب يستمر قليلًا بعد رفع الإصبع ثم يتوقف تدريجيًا.
let goal = null, raf = 0, lastT = 0, inertia = null;
const MIN_S = 4, MAX_S = 400;
function size() { const r = $('plan').getBoundingClientRect(); return { W: r.width, H: r.height, L: r.left, T: r.top }; }
function zoomAround(v, f, sx, sy) {
  const { W, H } = size(), s = Math.max(MIN_S, Math.min(MAX_S, v.scale * f));
  const wx = (sx - W / 2) / v.scale + v.cx, wy = v.cy - (sy - H / 2) / v.scale;
  return { scale: s, cx: wx - (sx - W / 2) / s, cy: wy + (sy - H / 2) / s };
}
function animate(now) {
  raf = 0; const dt = lastT ? Math.min(.05, (now - lastT) / 1000) : .016; lastT = now;
  let more = false;
  if (inertia && view) {
    view = { ...view, cx: view.cx - inertia.vx * dt / view.scale, cy: view.cy + inertia.vy * dt / view.scale };
    const k = Math.exp(-dt * 6); inertia.vx *= k; inertia.vy *= k;
    if (Math.hypot(inertia.vx, inertia.vy) < 8) inertia = null; else more = true;
  }
  if (goal && view) {
    const a = 1 - Math.exp(-dt * 16);
    view = { scale: view.scale + (goal.scale - view.scale) * a, cx: view.cx + (goal.cx - view.cx) * a, cy: view.cy + (goal.cy - view.cy) * a };
    if (Math.abs(goal.scale - view.scale) / goal.scale < .002 && Math.hypot(goal.cx - view.cx, goal.cy - view.cy) * view.scale < .4) { view = goal; goal = null; } else more = true;
  }
  paint();
  if (more) raf = requestAnimationFrame(animate); else lastT = 0;
}
const run = () => { if (!raf) raf = requestAnimationFrame(animate); };
function bindPlan() {
  const c = $('plan'), pts = new Map(); let pinch = null, samples = [];
  c.addEventListener('pointerdown', e => {
    c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); goal = null; inertia = null; samples = [];
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; }
    c.style.cursor = 'grabbing';
  });
  c.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p || !view) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, { L, T } = size();
      view = zoomAround(view, d / Math.max(1, pinch.d), mx - L, my - T);
      view = { ...view, cx: view.cx - (mx - pinch.mx) / view.scale, cy: view.cy + (my - pinch.my) / view.scale };
      pinch = { d, mx, my }; paint(); return;
    }
    if (pts.size !== 1) return;
    view = { ...view, cx: view.cx - dx / view.scale, cy: view.cy + dy / view.scale };
    const t = performance.now(); samples.push({ t, dx, dy }); while (samples.length && t - samples[0].t > 90) samples.shift();
    paint();
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      c.style.cursor = 'grab';
      const t = performance.now(), recent = samples.filter(s => t - s.t < 90);
      if (recent.length > 1) { const span = Math.max(16, t - recent[0].t) / 1000, vx = recent.reduce((a, s) => a + s.dx, 0) / span, vy = recent.reduce((a, s) => a + s.dy, 0) / span; if (Math.hypot(vx, vy) > 120) { inertia = { vx: Math.max(-2500, Math.min(2500, vx)), vy: Math.max(-2500, Math.min(2500, vy)) }; run(); } }
      samples = [];
    } else if (pts.size === 1) samples = [];
  };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', e => {
    e.preventDefault(); if (!view) return; inertia = null;
    const { L, T } = size(), base = goal || view;
    // لوحة اللمس/القرص ترسل ctrlKey بقيم صغيرة متتالية؛ الفأرة قيم كبيرة: معاملان مختلفان مع حدّ لكل حدث
    const f = Math.max(.8, Math.min(1.25, Math.exp(-e.deltaY * (e.ctrlKey ? .012 : .0018))));
    goal = zoomAround(base, f, e.clientX - L, e.clientY - T); run();
  }, { passive: false });
  // Safari (آيباد/ماك) يرسل إيماءات قرص خاصة؛ نمنع تكبير الصفحة نفسها فوق المسقط
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) c.addEventListener(g, e => e.preventDefault());
  new ResizeObserver(() => paint()).observe($('planWrap'));
}
function zoom(f) { if (!view) return; const { W, H } = size(); goal = zoomAround(goal || view, f, W / 2, H / 2); run(); }
function paint() {
  const c = $('plan'); if (!c) return;
  const r = c.getBoundingClientRect(), dpr = Math.min(2.5, devicePixelRatio || 1), W = Math.max(10, r.width), H = Math.max(10, r.height);
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lv = model.levelById.get(levelId);
  if (!view) { const b = docBounds(doc, levelId); view = fitView({ x0: b.x0 - 2.4, y0: b.y0 - 2.4, x1: b.x1 + 2.4, y1: b.y1 + 1 }, W, H, Math.min(40, W * .05)); }
  renderPlan(ctx, {
    doc, levelId, view, W, H, analysis: lv ? { rooms: lv.rooms, gaps: [], exteriorWallIds: exteriorWallIds(lv.analysis) } : null,
    flags: { grid: false, dims: true, areas: true, fixtures: true, underlay: false, roomDims: true },
    roomFill: zonesOn ? rm => ZONES[zoneOf(rm.label)].color : null,
  });
}

// ------------------------------------------------------------------------------------------ الأفعال
function storeForStudio() { try { localStorage.setItem(STUDIO_KEY, serialize(doc)); } catch { /* التخزين غير متاح */ } }
function onApprove() { session = approve(session); saveSession(localStorage, session); storeForStudio(); location.href = './view3d.html'; }
function onStudio() {
  const alternatives = (session.alternatives || []).map(a => { try { return { index: a.index, strategy: a.strategy, doc: JSON.parse(a.doc) }; } catch { return null; } }).filter(Boolean);
  try { writeHandoff(sessionStorage, doc, { source: 'design-page', note: 'التصميم ' + (session.current + 1) + ' من صفحة العرض؛ عدّل عليه ثم اعتمده.', dna: session.dna, alternatives }); } catch { storeForStudio(); }
  location.href = './studio.html';
}
function openShara() {
  const box = $('fbChips'); box.replaceChildren(...FEEDBACK.map(f => el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-id': f.id, onclick: e => { const on = e.currentTarget.getAttribute('aria-pressed') === 'true'; e.currentTarget.setAttribute('aria-pressed', String(!on)); } }, f.label)));
  $('fbText').value = ''; $('fbStatus').textContent = ''; $('shara').hidden = false; $('fbGo').disabled = false;
}
$('fbClose').addEventListener('click', () => { $('shara').hidden = true; });
$('fbGo').addEventListener('click', async () => {
  const picks = [...document.querySelectorAll('#fbChips .chip[aria-pressed=true]')].map(b => b.dataset.id), text = $('fbText').value.trim();
  $('fbGo').disabled = true; $('fbStatus').textContent = 'أصمّم بديلًا مختلفًا بناءً على ملاحظاتك…';
  await new Promise(r => setTimeout(r, 30));
  try {
    const out = await redesign(session, { picks, text });
    session = out.session; saveSession(localStorage, session);
    $('shara').hidden = true; show(session.current); toast('طبّقت: ' + out.changes.join('، '));
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { $('fbStatus').textContent = err.message || 'تعذّر تصميم بديل.'; $('fbGo').disabled = false; }
});

try { init(); } catch (e) { $('main').replaceChildren(el('div', { class: 'empty card' }, el('h2', {}, 'تعذّر عرض التصميم'), el('p', {}, e.message), el('a', { class: 'btn', href: './home.html' }, 'العودة'))); }
globalThis.__mizanDesign = { get session() { return session; }, get doc() { return doc; }, get view() { return view; } }; // للاختبارات الحية
