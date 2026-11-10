// جدول الأبواب والنوافذ (جدول الفتحات) من المستند: تُجمَّع الفتحات المتطابقة (النوع والعرض والارتفاع والجلسة)
// في «طراز» واحد برمز (D للأبواب، P للفتحات بلا باب، W للنوافذ) مع العدد الكلي والعدد لكل دور والموقع
// (خارجي/داخلي). يُعاد كبيانات (لصفحة المخرجات وكتاب المشروع) وكلوحة SVG بإطار لوحة المسقط. نقي.
import { OPENING_KINDS } from './catalog.mjs';
import { analyzeDoc } from './digest.mjs';
import { sheetCanvas, titleStrip, mm, n1, LW, esc, inkify } from './sheet-frame.mjs';
import { fmtDim } from './plan-annot.mjs';

const r2 = v => Math.round(v * 100) / 100;
export const SCHEDULE_GROUPS = Object.freeze({
  door: { prefix: 'D', title: 'جدول الأبواب', kinds: ['door', 'door2', 'slider', 'garage'] },
  passage: { prefix: 'P', title: 'فتحات بلا أبواب', kinds: ['arch'] },
  window: { prefix: 'W', title: 'جدول النوافذ', kinds: ['window', 'window2'] },
});
const groupOf = kind => Object.keys(SCHEDULE_GROUPS).find(g => SCHEDULE_GROUPS[g].kinds.includes(kind)) || 'door';
const LOC_AR = { exterior: 'خارجي', interior: 'داخلي', mixed: 'خارجي وداخلي' };

/**
 * @returns {{ types: object[], groups: {door, passage, window}, totals: {all, door, passage, window, byLevel}, byOpening: Map }}
 */
export function openingSchedule(doc) {
  let model = null; try { model = analyzeDoc(doc); } catch { /* مستند بلا جدران مكتملة */ }
  const ext = new Map();
  if (model) for (const lv of model.levels) for (const op of lv.openings) ext.set(op.id, op.sides.length < 2 || op.sides.some(s => s.exterior) ? 'exterior' : 'interior');
  const levelName = new Map(doc.levels.map(l => [l.id, l.name])), levelOrder = new Map(doc.levels.map((l, i) => [l.id, i]));
  const map = new Map();
  for (const o of doc.openings) {
    const w = r2(o.w), h = r2(o.h ?? OPENING_KINDS[o.kind]?.h ?? 2.1), sill = r2(o.sill ?? 0), key = [o.kind, w, h, sill].join('|');
    if (!map.has(key)) map.set(key, { kind: o.kind, group: groupOf(o.kind), kindAr: OPENING_KINDS[o.kind]?.ar || o.kind, w, h, sill, head: r2(sill + h), count: 0, ids: [], byLevel: {}, loc: new Set(), entry: false });
    const t = map.get(key); t.count++; t.ids.push(o.id); t.byLevel[o.level] = (t.byLevel[o.level] || 0) + 1; t.loc.add(ext.get(o.id) || 'interior'); if (o.entry) t.entry = true;
  }
  const kindOrder = k => Object.values(SCHEDULE_GROUPS).flatMap(g => g.kinds).indexOf(k);
  const types = [...map.values()].sort((a, b) => Object.keys(SCHEDULE_GROUPS).indexOf(a.group) - Object.keys(SCHEDULE_GROUPS).indexOf(b.group) || kindOrder(a.kind) - kindOrder(b.kind) || b.w - a.w || b.h - a.h || a.sill - b.sill);
  const counters = {};
  for (const t of types) {
    counters[t.group] = (counters[t.group] || 0) + 1;
    t.code = SCHEDULE_GROUPS[t.group].prefix + counters[t.group];
    t.location = t.loc.size > 1 ? 'mixed' : [...t.loc][0]; t.locationAr = LOC_AR[t.location]; delete t.loc;
    t.levels = Object.entries(t.byLevel).sort((a, b) => levelOrder.get(a[0]) - levelOrder.get(b[0])).map(([id, n]) => ({ id, name: levelName.get(id) || id, count: n }));
    t.levelsAr = t.levels.map(l => `${l.name}: ${l.count}`).join(' · ');
    t.sizeAr = `${fmtDim(t.w)} × ${fmtDim(t.h)}`;
    if (t.entry) t.kindAr += ' (مدخل)';
  }
  const groups = Object.fromEntries(Object.keys(SCHEDULE_GROUPS).map(g => [g, types.filter(t => t.group === g)]));
  const sum = list => list.reduce((s, t) => s + t.count, 0);
  const byLevel = Object.fromEntries(doc.levels.map(l => [l.id, doc.openings.filter(o => o.level === l.id).length]));
  const byOpening = new Map(types.flatMap(t => t.ids.map(id => [id, t.code])));
  return { types, groups, totals: { all: sum(types), door: sum(groups.door), passage: sum(groups.passage), window: sum(groups.window), byLevel }, byOpening };
}

export const SCHEDULE_HEAD = Object.freeze(['الرمز', 'النوع', 'العدد', 'العرض × الارتفاع (م)', 'الجلسة (م)', 'منسوب العتب من الأرضية (م)', 'الأدوار', 'الموقع']);
/** جداول جاهزة لدالة table(head, rows) في صفحة المخرجات وكتاب المشروع. */
export function scheduleTables(sched) {
  return Object.entries(SCHEDULE_GROUPS).filter(([g]) => sched.groups[g].length).map(([g, def]) => ({
    id: g, title: def.title, head: [...SCHEDULE_HEAD],
    rows: [...sched.groups[g].map(t => [t.code, t.kindAr, String(t.count), t.sizeAr, fmtDim(t.sill), fmtDim(t.head), t.levelsAr, t.locationAr]), ['المجموع', '', String(sched.totals[g]), '', '', '', '', '']],
  }));
}
/** HTML مستقل للجداول (RTL؛ أول عمود على اليمين). */
export function scheduleHtml(sched, { cls = 'pb-table schedule-table' } = {}) {
  return scheduleTables(sched).map(t => `<h4>${esc(t.title)}</h4><table class="${cls}" dir="rtl"><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')
    + `<p class="muted">مجموع الفتحات ${sched.totals.all}: أبواب ${sched.totals.door}، فتحات بلا أبواب ${sched.totals.passage}، نوافذ ${sched.totals.window}. الجلسة والعتب من أرضية الدور التشطيبية.</p>`;
}

/** لوحة الجداول (SVG). */
export function scheduleSheet(doc, opts = {}) {
  const sched = openingSchedule(doc);
  const c = sheetCanvas({ sheet: opts.sheet, title: `${doc.title || ''} — جدول الأبواب والنوافذ`, cls: 'schedule-sheet' });
  const { out, txt, P } = c;
  // الأعمدة من اليمين: الرمز، الشكل، النوع، العدد، المقاس، الجلسة، الأدوار، الموقع
  const COLS = [['الرمز', 12], ['الشكل 1:50', 20], ['النوع', 30], ['العدد', 11], ['العرض × الارتفاع', 25], ['الجلسة', 13], ['الأدوار', 34], ['الموقع', 17]];
  const tableW = mm(COLS.reduce((s, c2) => s + c2[1], 0));
  const blocks = [['door', 'passage'], ['window']];
  const colX = [P.x1 - mm(2), P.x1 - mm(2) - tableW - mm(8)];
  let rowsDrawn = 0;
  blocks.forEach((gs, bi) => {
    const x1 = colX[bi]; let y = P.y0 + mm(4);
    const nRows = gs.reduce((s, g) => s + sched.groups[g].length + 3, 0);
    const rowH = Math.max(mm(7), Math.min(mm(13), (P.y1 - P.y0 - mm(10) - gs.length * mm(14)) / Math.max(1, nRows)));
    for (const g of gs) {
      const list = sched.groups[g]; if (!list.length) continue;
      out.push(txt(x1, y + mm(4.5), SCHEDULE_GROUPS[g].title + ` (${sched.totals[g]})`, { size: mm(3.4), weight: 700, anchor: 'start' })); y += mm(7);
      // الرأس
      let x = x1; out.push(`<rect x="${n1(x1 - tableW)}" y="${n1(y)}" width="${n1(tableW)}" height="${n1(mm(7))}" fill="#eadfce" stroke="#000" stroke-width="${LW.medium}"/>`);
      for (const [h, w] of COLS) { out.push(txt(x - mm(w) / 2, y + mm(4.6), h, { size: mm(2.1), weight: 700 })); x -= mm(w); out.push(`<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x)}" y2="${n1(y + mm(7))}" stroke="#000" stroke-width="${LW.thin}"/>`); }
      y += mm(7);
      for (const t of list) {
        x = x1;
        out.push(`<g class="schedule-row" data-code="${t.code}" data-count="${t.count}"><rect x="${n1(x1 - tableW)}" y="${n1(y)}" width="${n1(tableW)}" height="${n1(rowH)}" fill="#fff" stroke="#000" stroke-width="${LW.thin}"/>`);
        const cells = [t.code, null, t.kindAr, String(t.count), t.sizeAr, fmtDim(t.sill), t.levelsAr, t.locationAr];
        cells.forEach((v, i) => {
          const w = mm(COLS[i][1]), cx = x - w / 2;
          if (v === null) out.push(glyph(t, cx, y + rowH / 2, w - mm(2), rowH - mm(1.5)));
          else { const size = Math.min(mm(i === 0 ? 2.8 : 2.2), (w - mm(1.5)) / Math.max(1, String(v).length * .55)); out.push(txt(cx, y + rowH / 2 + size * .35, v, { size, weight: i === 0 ? 700 : 400 })); }
          x -= w; out.push(`<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x)}" y2="${n1(y + rowH)}" stroke="#000" stroke-width="${LW.thin}"/>`);
        });
        out.push('</g>'); y += rowH; rowsDrawn++;
      }
      out.push(`<rect x="${n1(x1 - tableW)}" y="${n1(y)}" width="${n1(tableW)}" height="${n1(mm(7))}" fill="#f4ede4" stroke="#000" stroke-width="${LW.medium}"/>`, txt(x1 - mm(COLS[0][1] + COLS[1][1] + COLS[2][1] / 2), y + mm(4.6), 'المجموع', { size: mm(2.3), weight: 700 }), txt(x1 - mm(COLS[0][1] + COLS[1][1] + COLS[2][1] + COLS[3][1] / 2), y + mm(4.6), String(sched.totals[g]), { size: mm(2.5), weight: 700 }));
      y += mm(7) + mm(7);
    }
  });
  titleStrip(c, {
    doc, heading: 'جدول الأبواب والنوافذ', sheetNo: opts.sheetNo || 'A-D1', date: opts.date, fingerprint: opts.fingerprint, owner: opts.owner, office: opts.office,
    rows: [['مجموع الفتحات', `${sched.totals.all} (أبواب ${sched.totals.door} · بلا أبواب ${sched.totals.passage} · نوافذ ${sched.totals.window})`]],
    notes: ['الطراز = فتحات متطابقة في النوع والعرض والارتفاع والجلسة.', 'المقاسات صافي فتحة البناء بالمتر؛ الجلسة من أرضية الدور التشطيبية.', 'الموقع «خارجي» = فتحة في جدار يطل على الخارج أو على فناء مكشوف.', 'المواد والقطاعات والإكسسوارات تُحدد في مرحلة التصميم التفصيلي.'],
  });
  out.push('</svg>');
  return { svg: inkify(out.join('\n')), meta: { types: sched.types.length, rows: rowsDrawn, totals: sched.totals }, schedule: sched };
}

/** واجهة مصغرة للطراز بمقياس ثابت (1:50 مقيدًا بالخلية). */
function glyph(t, cx, cy, wMax, hMax) {
  const k = Math.min(mm(20), wMax / Math.max(.5, t.w), hMax / Math.max(.5, t.head + .1));
  const w = t.w * k, floor = cy + (t.head * k) / 2, y0 = floor - t.head * k, y1 = floor - t.sill * k, x0 = cx - w / 2;
  const p = [`<g class="glyph">`, `<line x1="${n1(cx - wMax / 2)}" y1="${n1(floor)}" x2="${n1(cx + wMax / 2)}" y2="${n1(floor)}" stroke="#000" stroke-width="${LW.thin}" stroke-dasharray="2 2"/>`];
  const isWin = t.group === 'window';
  p.push(`<rect x="${n1(x0)}" y="${n1(y0)}" width="${n1(w)}" height="${n1(y1 - y0)}" fill="${isWin || t.kind === 'slider' ? '#dfe5e8' : t.kind === 'arch' ? '#555' : '#fff'}" stroke="#000" stroke-width="${LW.medium}"/>`);
  if (t.kind === 'door2' || t.kind === 'slider' || (isWin && t.w > 1.1)) p.push(`<line x1="${n1(cx)}" y1="${n1(y0)}" x2="${n1(cx)}" y2="${n1(y1)}" stroke="#000" stroke-width="${LW.thin}"/>`);
  p.push('</g>');
  return p.join('');
}

export default { SCHEDULE_GROUPS, openingSchedule, scheduleTables, scheduleHtml, scheduleSheet, SCHEDULE_HEAD };
