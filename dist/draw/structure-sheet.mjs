// لوحة المخطط الإنشائي المبدئي (SVG مستقل) من نتيجة computeStructure: مسقط بمحاور وأبعاد، رموز أعمدة وجسور،
// جداول الأعمدة والجسور والبلاطة، افتراضات وملاحظات، وكتلة عنوان. كل ما فيها «تحجيم أولي» يُعلن ذلك على اللوحة نفسها.
// نقي: لا DOM. اتجاه النص من اليمين لليسار؛ الأرقام لاتينية لوضوح الأبعاد.
import { wallRect } from './review.mjs';
import { docBounds } from './editor/render2d.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = v => (Math.round(v * 10) / 10).toString();
const n2 = v => (Math.round(v * 100) / 100).toFixed(2);
const cm = m => Math.round(m * 100);
const FONT = `Tahoma, 'Noto Naskh Arabic', 'Noto Sans Arabic', Arial, sans-serif`;
const C = { paper: '#fbf9f4', ink: '#1d2a24', green: '#143428', green2: '#1f4a38', gold: '#d9ba79', brass: '#a8814a', ivory: '#f6f2ea', wall: '#d8d2c4', wallLine: '#b3ab9a', grid: '#8fa097', room: '#8b867a', warn: '#8a3b2a' };

/** أنواع الأعمدة والجسور: كل مقطع مختلف نوع واحد (C1، C2… / B1، B2…) كما في اللوحات الإنشائية. */
export function structureTypes(level) {
  const colTypes = [], beamTypes = [], colType = new Map(), beamType = new Map();
  const bySize = [...new Set(level.columns.map(c => cm(c.size)))].sort((a, b) => a - b);
  bySize.forEach((s, i) => colTypes.push({ id: 'C' + (i + 1), size: s, count: 0, maxPu: 0, maxAt: 0, ids: [] }));
  for (const c of level.columns) { const t = colTypes.find(x => x.size === cm(c.size)); t.count++; t.maxPu = Math.max(t.maxPu, c.Pu); t.maxAt = Math.max(t.maxAt, c.At); t.ids.push(c.id); colType.set(c.id, t.id); }
  const keys = [...new Set(level.beams.map(b => cm(b.width) + 'x' + cm(b.depth)))].sort((a, b) => { const [aw, ad] = a.split('x').map(Number), [bw, bd] = b.split('x').map(Number); return ad - bd || aw - bw; });
  keys.forEach((k, i) => { const [w, d] = k.split('x').map(Number); beamTypes.push({ id: 'B' + (i + 1), width: w, depth: d, count: 0, length: 0, maxSpan: 0, minSpan: Infinity, ids: [] }); });
  for (const b of level.beams) { const t = beamTypes.find(x => x.width === cm(b.width) && x.depth === cm(b.depth)); t.count++; t.length += b.length; t.maxSpan = Math.max(t.maxSpan, b.length); t.minSpan = Math.min(t.minSpan, b.length); t.ids.push(b.id); beamType.set(b.id, t.id); }
  return { colTypes, beamTypes, colType, beamType };
}

/** محاور الأعمدة: تجميع الإحداثيات المتقاربة (≤ tol) في محور واحد. الأرقام 1.. لمحاور X (يسار→يمين)، والحروف A.. لمحاور Y (أسفل→أعلى). */
export function structureAxes(level, tol = 0.45) {
  const cluster = vals => { const s = [...vals].sort((a, b) => a - b), out = []; for (const v of s) { const last = out[out.length - 1]; if (last && v - last.max <= tol) { last.vals.push(v); last.max = v; } else out.push({ vals: [v], max: v }); } return out.map(g => g.vals.reduce((a, b) => a + b, 0) / g.vals.length); };
  const xs = cluster(level.columns.map(c => c.x)), ys = cluster(level.columns.map(c => c.y));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return { x: xs.map((pos, i) => ({ label: String(i + 1), pos })), y: ys.map((pos, i) => ({ label: letters[i] || 'A' + i, pos })) };
}

function wrap(text, n) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur); return lines;
}

/**
 * @param {object} doc  مستند المرسم
 * @param {object} structure  ناتج computeStructure
 * @param {{ levelId?: string, fingerprint?: string, date?: string, sheetNo?: string }} [opts]
 * @returns {string} SVG
 */
export function structureSheetSvg(doc, structure, opts = {}) {
  const level = structure.levels.find(l => l.id === (opts.levelId || doc.levels[0].id));
  const lvlDoc = doc.levels.find(l => l.id === (opts.levelId || doc.levels[0].id));
  const W = 1500, H = 1060;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" direction="rtl" font-family="${FONT}">`,
    `<title>المخطط الإنشائي المبدئي — ${esc(doc.title)} — ${esc(lvlDoc?.name)}</title>`,
    `<rect width="${W}" height="${H}" fill="${C.paper}"/>`,
    `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${C.green}" stroke-width="2.5"/><rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="${C.gold}" stroke-width="1"/>`];
  const txt = (x, y, s, { size = 12, weight = 400, fill = C.ink, anchor = 'end', halo = false, rotate = 0 } = {}) =>
    `<text x="${n1(x)}" y="${n1(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor === 'end' ? 'start' : anchor === 'start' ? 'end' : anchor}"${halo ? ` stroke="${C.paper}" stroke-width="3" paint-order="stroke"` : ''}${rotate ? ` transform="rotate(${rotate} ${n1(x)} ${n1(y)})"` : ''}>${esc(s)}</text>`;

  // ------------------------------------------------------------------ الترويسة
  out.push(`<rect x="20" y="20" width="${W - 40}" height="62" fill="${C.green}"/><rect x="20" y="80" width="${W - 40}" height="2.5" fill="${C.gold}"/>`);
  out.push(logo(W - 78, 26, 50));
  out.push(txt(W - 90, 52, 'المخطط الإنشائي المبدئي', { size: 26, weight: 700, fill: C.ivory }));
  out.push(txt(W - 90, 72, `${doc.title || 'مشروع بلا اسم'} · ${lvlDoc?.name || ''}`, { size: 14, fill: C.gold }));
  out.push(txt(40, 52, 'AL MIZAN · STRUCTURAL PRE-SIZING', { size: 13, weight: 700, fill: C.gold, anchor: 'start' }));
  out.push(txt(40, 72, 'تحجيم أولي لا يغني عن التصميم الإنشائي المعتمد', { size: 12, fill: C.ivory, anchor: 'start' }));

  if (!level?.columns) {
    out.push(txt(W / 2, H / 2, (level?.warnings || [])[0] || 'لا توجد أعمدة وجسور لهذا الدور بعد؛ ارسم محيط مبنى مغلقًا.', { size: 20, anchor: 'middle', fill: C.warn }));
    out.push('</svg>'); return out.join('\n');
  }
  const T = structureTypes(level), axes = structureAxes(level), A = structure.assumptions;

  // ------------------------------------------------------------------ منطقة المسقط (يمين) ولوحة الجداول (يسار)
  const PX0 = 470, PX1 = W - 36, PY0 = 100, PY1 = 820, MARGIN = 92;
  const b = docBounds(doc, level.id), bx0 = Math.min(b.x0, ...level.columns.map(c => c.x)), bx1 = Math.max(b.x1, ...level.columns.map(c => c.x));
  const by0 = Math.min(b.y0, ...level.columns.map(c => c.y)), by1 = Math.max(b.y1, ...level.columns.map(c => c.y));
  const s = Math.min((PX1 - PX0 - MARGIN * 2) / Math.max(1, bx1 - bx0), (PY1 - PY0 - MARGIN * 2) / Math.max(1, by1 - by0));
  const ox = PX0 + ((PX1 - PX0) - (bx1 - bx0) * s) / 2, oy = PY0 + ((PY1 - PY0) - (by1 - by0) * s) / 2;
  const X = x => ox + (x - bx0) * s, Y = y => oy + (by1 - y) * s;
  out.push(`<rect x="${PX0}" y="${PY0}" width="${PX1 - PX0}" height="${PY1 - PY0}" fill="#fff" stroke="${C.wallLine}" stroke-width="1"/>`);

  // المحاور
  for (const a of axes.x) out.push(`<line x1="${n1(X(a.pos))}" y1="${n1(Y(by1) - 52)}" x2="${n1(X(a.pos))}" y2="${n1(Y(by0) + 30)}" stroke="${C.grid}" stroke-width="0.8" stroke-dasharray="14 3 2 3"/>`);
  for (const a of axes.y) out.push(`<line x1="${n1(X(bx0) - 90)}" y1="${n1(Y(a.pos))}" x2="${n1(X(bx1) + 30)}" y2="${n1(Y(a.pos))}" stroke="${C.grid}" stroke-width="0.8" stroke-dasharray="14 3 2 3"/>`);
  // الجدران (هادئة اللون حتى يبقى الهيكل هو الأوضح)
  for (const w of doc.walls) if (w.level === level.id) out.push(`<polygon points="${wallRect(w).map(p => n1(X(p.x)) + ',' + n1(Y(p.y))).join(' ')}" fill="${C.wall}" stroke="${C.wallLine}" stroke-width="0.6"/>`);
  for (const o of doc.openings) {
    if (o.level !== level.id) continue; const w = doc.walls.find(x => x.id === o.wall); if (!w) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    const p = k => ({ x: w.a.x + u.x * (o.at + k * o.w / 2), y: w.a.y + u.y * (o.at + k * o.w / 2) }), a = p(-1), c = p(1);
    out.push(`<line x1="${n1(X(a.x))}" y1="${n1(Y(a.y))}" x2="${n1(X(c.x))}" y2="${n1(Y(c.y))}" stroke="#fff" stroke-width="${n1(Math.max(2, (w.t || 0.2) * s * 0.9))}"/>`);
  }
  for (const l of doc.labels) if (l.level === level.id && l.seed) out.push(txt(X(l.seed.x), Y(l.seed.y) + 4, l.name, { size: 11, anchor: 'middle', fill: C.room }));

  // الجسور
  for (const bm of level.beams) {
    const a = { x: X(bm.a.x), y: Y(bm.a.y) }, c = { x: X(bm.b.x), y: Y(bm.b.y) }, wpx = Math.max(3, bm.width * s * 0.55);
    out.push(`<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(c.x)}" y2="${n1(c.y)}" stroke="${C.brass}" stroke-width="${n1(wpx)}" stroke-dasharray="${bm.supportEnd === 'beam' ? '3 3' : '9 4'}" opacity="0.9"/>`);
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2, horizontal = Math.abs(c.x - a.x) >= Math.abs(c.y - a.y);
    out.push(txt(horizontal ? mx : mx + 9, horizontal ? my - 7 : my, T.beamType.get(bm.id), { size: 10.5, weight: 700, fill: C.brass, anchor: 'middle', halo: true, rotate: horizontal ? 0 : -90 }));
  }
  // الأعمدة
  for (const c of level.columns) {
    const r = Math.max(5, c.size * s / 2), x = X(c.x), y = Y(c.y), user = c.source === 'user';
    out.push(`<rect x="${n1(x - r)}" y="${n1(y - r)}" width="${n1(r * 2)}" height="${n1(r * 2)}" fill="${C.green}" stroke="${user ? C.gold : C.ivory}" stroke-width="${user ? 2.2 : 1}"/>`);
    out.push(txt(x + r + 3, y - r - 2, T.colType.get(c.id), { size: 11.5, weight: 700, fill: C.green, anchor: 'start', halo: true }));
  }
  // فقاعات المحاور
  const bubble = (x, y, label) => `<circle cx="${n1(x)}" cy="${n1(y)}" r="12" fill="#fff" stroke="${C.green}" stroke-width="1.4"/>${txt(x, y + 4.5, label, { size: 12.5, weight: 700, fill: C.green, anchor: 'middle' })}`;
  for (const a of axes.x) out.push(bubble(X(a.pos), Y(by1) - 64, a.label));
  for (const a of axes.y) out.push(bubble(X(bx0) - 78, Y(a.pos), a.label));
  // سلاسل الأبعاد بين المحاور
  const dimH = (y, list) => { for (let i = 0; i + 1 < list.length; i++) { const x1 = X(list[i].pos), x2 = X(list[i + 1].pos); out.push(`<line x1="${n1(x1)}" y1="${n1(y)}" x2="${n1(x2)}" y2="${n1(y)}" stroke="${C.ink}" stroke-width="0.9"/><line x1="${n1(x1)}" y1="${n1(y - 5)}" x2="${n1(x1)}" y2="${n1(y + 5)}" stroke="${C.ink}"/><line x1="${n1(x2)}" y1="${n1(y - 5)}" x2="${n1(x2)}" y2="${n1(y + 5)}" stroke="${C.ink}"/>`, txt((x1 + x2) / 2, y - 4, n2(list[i + 1].pos - list[i].pos), { size: 10.5, anchor: 'middle', halo: true })); } };
  const dimV = (x, list) => { for (let i = 0; i + 1 < list.length; i++) { const y1 = Y(list[i].pos), y2 = Y(list[i + 1].pos); out.push(`<line x1="${n1(x)}" y1="${n1(y1)}" x2="${n1(x)}" y2="${n1(y2)}" stroke="${C.ink}" stroke-width="0.9"/><line x1="${n1(x - 5)}" y1="${n1(y1)}" x2="${n1(x + 5)}" y2="${n1(y1)}" stroke="${C.ink}"/><line x1="${n1(x - 5)}" y1="${n1(y2)}" x2="${n1(x + 5)}" y2="${n1(y2)}" stroke="${C.ink}"/>`, txt(x - 4, (y1 + y2) / 2, n2(list[i + 1].pos - list[i].pos), { size: 10.5, anchor: 'middle', halo: true, rotate: -90 })); } };
  dimH(Y(by1) - 36, axes.x); dimV(X(bx0) - 34, axes.y);
  if (axes.x.length > 2) dimH(Y(by1) - 22, [axes.x[0], axes.x[axes.x.length - 1]]);
  if (axes.y.length > 2) dimV(X(bx0) - 56, [axes.y[0], axes.y[axes.y.length - 1]]);
  // سهم الشمال وشريط المقياس
  const north = (doc.north ?? 0) * Math.PI / 180, nx = PX1 - 40, ny = PY0 + 46;
  out.push(`<g transform="rotate(${n1((doc.north || 0))} ${nx} ${ny})"><circle cx="${nx}" cy="${ny}" r="22" fill="#fff" stroke="${C.green}"/><path d="M${nx} ${ny - 18} L${nx + 7} ${ny + 8} L${nx} ${ny + 3} L${nx - 7} ${ny + 8} Z" fill="${C.green}"/></g>${txt(nx, ny - 27, 'ش', { size: 13, weight: 700, anchor: 'middle', fill: C.green })}`);
  void north;
  const sbx = PX1 - 30, sby = PY1 - 22; out.push(`<rect x="${n1(sbx - 5 * s)}" y="${sby}" width="${n1(5 * s)}" height="6" fill="${C.green}"/><rect x="${n1(sbx - 2.5 * s)}" y="${sby}" width="${n1(2.5 * s)}" height="6" fill="#fff" stroke="${C.green}" stroke-width="0.8"/>${txt(sbx, sby - 4, '5 م', { size: 11, anchor: 'end' })}${txt(sbx - 5 * s, sby - 4, '0', { size: 11, anchor: 'start' })}`);
  // مفتاح الرموز
  const ly = PY1 - 22, lx = PX0 + 14; let lxx = lx;
  const key = (draw, label, w) => { out.push(draw(lxx, ly), txt(lxx + 22, ly + 9, label, { size: 11, anchor: 'start' })); lxx += w; };
  key((x, y) => `<rect x="${x}" y="${y}" width="12" height="12" fill="${C.green}" stroke="${C.ivory}"/>`, 'عمود مقترح', 100);
  key((x, y) => `<rect x="${x}" y="${y}" width="12" height="12" fill="${C.green}" stroke="${C.gold}" stroke-width="2.2"/>`, 'عمود رسمته', 104);
  key((x, y) => `<line x1="${x}" y1="${y + 6}" x2="${x + 18}" y2="${y + 6}" stroke="${C.brass}" stroke-width="4" stroke-dasharray="7 3"/>`, 'جسر', 66);
  key((x, y) => `<line x1="${x}" y1="${y + 6}" x2="${x + 18}" y2="${y + 6}" stroke="${C.grid}" stroke-dasharray="10 2 2 2"/>`, 'محور', 62);
  key((x, y) => `<rect x="${x}" y="${y}" width="16" height="12" fill="${C.wall}" stroke="${C.wallLine}"/>`, 'جدار', 60);

  // ------------------------------------------------------------------ لوحة الجداول (يسار)
  const LX0 = 36, LX1 = 450; let ty = 100;
  const section = (title) => { out.push(`<rect x="${LX0}" y="${ty}" width="${LX1 - LX0}" height="26" fill="${C.green}"/>`, txt(LX1 - 10, ty + 18, title, { size: 14, weight: 700, fill: C.ivory })); ty += 26; };
  const table = (cols, rows) => {
    const total = cols.reduce((a, c) => a + c.w, 0), k = (LX1 - LX0) / total; let xr = LX1;
    const edges = cols.map(c => { const w = c.w * k; const r = { right: xr, left: xr - w, w }; xr -= w; return r; });
    out.push(`<rect x="${LX0}" y="${ty}" width="${LX1 - LX0}" height="22" fill="#e8e1d0"/>`);
    cols.forEach((c, i) => out.push(txt(edges[i].right - edges[i].w / 2, ty + 15, c.h, { size: 11, weight: 700, anchor: 'middle', fill: C.green })));
    ty += 22;
    rows.forEach((r, ri) => { out.push(`<rect x="${LX0}" y="${ty}" width="${LX1 - LX0}" height="21" fill="${ri % 2 ? '#fbf9f4' : '#fff'}" stroke="#e3dccb" stroke-width="0.6"/>`); r.forEach((v, i) => out.push(txt(edges[i].right - edges[i].w / 2, ty + 14.5, v, { size: 11.5, anchor: 'middle', weight: i === 0 ? 700 : 400 }))); ty += 21; });
  };
  section('جدول الأعمدة');
  table([{ h: 'الرمز', w: 1 }, { h: 'المقطع (سم)', w: 1.5 }, { h: 'العدد', w: 1 }, { h: 'أقصى حمل (kN)', w: 1.6 }, { h: 'أقصى مساحة تحميل (م²)', w: 2 }],
    T.colTypes.map(t => [t.id, `${t.size}×${t.size}`, String(t.count), String(Math.round(t.maxPu)), n1(t.maxAt)]));
  ty += 12; section('جدول الجسور');
  table([{ h: 'الرمز', w: 1 }, { h: 'المقطع (سم)', w: 1.5 }, { h: 'العدد', w: 1 }, { h: 'إجمالي الطول (م)', w: 1.6 }, { h: 'البحر (م)', w: 1.6 }],
    T.beamTypes.map(t => [t.id, `${t.width}×${t.depth}`, String(t.count), n1(t.length), t.minSpan === t.maxSpan ? n2(t.maxSpan) : `${n1(t.minSpan)}–${n1(t.maxSpan)}`]));
  ty += 12; section('البلاطة والمواد');
  const lines = [
    `بلاطة مصمتة ${level.slab.mode === 'two-way' ? 'باتجاهين' : 'باتجاه واحد'} — السماكة ${cm(level.slab.thickness)} سم (أسوأ لوح ${n1(level.slab.governingSpan)} م)`,
    `خرسانة fc′ = ${A.fc} MPa · حديد fy = ${A.fy} MPa`,
    `حمل البلاطة المحسوب (1.2D+1.6L): ${n1(level.slab.wu)} kN/م²`,
    `حمل حي ${level.isTop ? A.liveRoof : A.liveFloor} kN/م² · أحمال ميتة إضافية ${level.isTop ? A.sdlRoof : A.sdlFloor} kN/م² · بلوك ${A.masonry} kN/م³`,
    `أقصى بحر للجسر ${A.maxSpan} م · عمود ≥ ${cm(A.minColumn)} سم · جسر ≥ ${cm(A.minBeamWidth)}×${cm(A.minBeamDepth)} سم`,
  ];
  for (const l of lines) for (const w of wrap(l, 64)) { out.push(txt(LX1 - 8, ty + 17, w, { size: 11.5 })); ty += 16; }
  ty += 10; section('ملاحظات');
  const notes = [...(level.warnings || []), 'أعماق الجسور من جداول ACI 318 بحسب البحر واستمرارية الطرفين (L/16، L/18.5، L/21)؛ مطابقة نسخة SBC 304 المعتمدة غير متحقق منها.',
    'القص والثقب والانحراف والأحمال الجانبية والأساسات ونحافة الأعمدة وتفاصيل الحديد غير محسوبة هنا.', 'الأبعاد بالمتر والمقاطع بالسنتيمتر. المحاور من مراكز الأعمدة.'];
  for (const n of notes) { const ws = wrap('• ' + n, 66); for (const w of ws) { if (ty > PY1 - 6) break; out.push(txt(LX1 - 8, ty + 17, w, { size: 11, fill: n === notes[0] && (level.warnings || []).length ? C.warn : C.ink })); ty += 15; } ty += 3; }

  // ------------------------------------------------------------------ كتلة العنوان
  const TY = 840, TH = 190;
  out.push(`<rect x="36" y="${TY}" width="${W - 72}" height="${TH}" fill="#fff" stroke="${C.green}" stroke-width="1.6"/>`);
  const col = [{ x: W - 36, w: 430 }, { x: W - 466, w: 560 }, { x: W - 1026, w: 438 }]; // يمين → يسار
  out.push(`<line x1="${W - 466}" y1="${TY}" x2="${W - 466}" y2="${TY + TH}" stroke="${C.wallLine}"/><line x1="${W - 1026}" y1="${TY}" x2="${W - 1026}" y2="${TY + TH}" stroke="${C.wallLine}"/>`);
  out.push(logo(W - 100, TY + 18, 64), txt(W - 114, TY + 44, 'الميزان الهندسي', { size: 22, weight: 700, fill: C.green }), txt(W - 114, TY + 66, 'نحو منزلك', { size: 13, fill: C.brass }), txt(W - 52, TY + 110, 'AL MIZAN / ARCHITECTURE', { size: 11, weight: 700, fill: C.green2 }), txt(W - 52, TY + 130, 'SAUDI ARCHITECTURAL INTELLIGENCE', { size: 10, fill: C.brass }));
  void col;
  const rows = [['المشروع', doc.title || 'مشروع بلا اسم'], ['الدور', lvlDoc?.name || ''], ['اللوحة', `${opts.sheetNo || 'S-01'} — مخطط إنشائي مبدئي`], ['التاريخ', opts.date || ''], ['المقياس', 'غير مطبوع — الأبعاد بالمتر']];
  rows.forEach(([k, v], i) => { out.push(txt(W - 486, TY + 34 + i * 30, k, { size: 12, fill: C.brass }), txt(W - 560, TY + 34 + i * 30, v, { size: 14, weight: 600 })); });
  out.push(txt(W - 1046, TY + 34, 'بصمة الهندسة', { size: 12, fill: C.brass }), txt(W - 1046, TY + 56, opts.fingerprint || '—', { size: 15, weight: 700, fill: C.green }));
  out.push(txt(W - 1046, TY + 92, `${level.columns.length} عمود · ${level.beams.length} جسرًا · ${T.colTypes.length} نوع أعمدة · ${T.beamTypes.length} نوع جسور`, { size: 12.5 }));
  out.push(`<rect x="${W - 1046 - 392}" y="${TY + 112}" width="400" height="62" fill="#faf0e4" stroke="${C.brass}" stroke-width="1.2"/>`);
  wrap('تحجيم أولي من الرسم لأغراض التخطيط والمقارنة، وليس تصميمًا إنشائيًا ولا اعتمادًا. يُراجَع ويُصمَّم تفصيليًا من مهندس إنشائي معتمد قبل أي تنفيذ.', 66).forEach((w, i) => out.push(txt(W - 1046 + 2, TY + 132 + i * 17, w, { size: 11.5, fill: C.warn })));
  out.push('</svg>');
  return out.join('\n');
}

function logo(x, y, size) {
  const k = size / 96;
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect x="3" y="3" width="90" height="90" rx="22" fill="#123629" stroke="#d9ba79" stroke-width="2.4"/><path d="M56.9 31.8Q52.9 27.7 47.2 27.7Q43.7 27.7 41.9 30.3L40.3 31.1L39.7 29.2Q39.3 27.7 39.3 26.3Q39.3 24.1 40.4 22.7Q41.4 21.3 43.4 20.8Q45.4 20.2 46.7 20.1Q48.1 20 50.1 20Q54.2 20 58 24.5Q61.9 29 64.2 34.9Q63.8 35.7 63 37.6Q62.2 39.6 61.6 40.8Q60 40.5 57.2 40Q54.4 39.4 51.8 39.1Q49.2 38.8 45.7 38.8Q41.6 38.8 39.7 40.8Q41.3 53.4 41.3 61.5Q41.3 66.6 39.4 70.7L37.9 74L37.2 70.5Q36.2 65.7 35 60.7Q33.9 55.7 33.5 53.7Q33 51.6 32.6 48.7Q32.1 45.8 31.8 42.3L31.9 42Q32.9 39.3 35.2 34.3L35.3 34.1Q38.6 31.2 45.2 31.2Q52.5 31.2 56.9 31.8Z" fill="#edce89"/></g>`;
}

/** جدول الأعمدة والجسور CSV (يُضاف لحزمة التصدير): كل صف عنصر فعلي بنوعه وحمله. */
export function structureCsv(structure) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['الدور', 'العنصر', 'المعرّف', 'النوع', 'x', 'y', 'المقطع سم', 'الطول م', 'الحمل kN', 'المصدر', 'الدرجة']];
  for (const L of structure.levels) {
    if (!L.columns) continue; const T = structureTypes(L);
    for (const c of L.columns) rows.push([L.name, 'عمود', c.id, T.colType.get(c.id), c.x, c.y, `${cm(c.size)}x${cm(c.size)}`, '', Math.round(c.Pu), c.source === 'user' ? 'رسمه المستخدم' : 'مقترح', 'تقدير']);
    for (const b of L.beams) rows.push([L.name, 'جسر', b.id, T.beamType.get(b.id), `${b.a.x}→${b.b.x}`, `${b.a.y}→${b.b.y}`, `${cm(b.width)}x${cm(b.depth)}`, b.length, '', 'مقترح', 'تقدير']);
    rows.push([L.name, 'بلاطة', 'S', L.slab.mode, '', '', cm(L.slab.thickness) + ' سم', '', '', 'محسوب', 'تقدير']);
  }
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\n');
}

export default { structureSheetSvg, structureTypes, structureAxes, structureCsv };
