import { TYPES, DIRECTIONS, center, openingPoint } from './planner.mjs';

export const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const f = n => Number(n.toFixed(5));
const box = (r, pad = 0) => ({ x: r.x - pad, y: -r.y - r.h - pad, w: r.w + pad * 2, h: r.h + pad * 2 });
export const plotViewBox = m => box({ x: 0, y: 0, w: m.plot.width, h: m.plot.length }, 2.3);
export const buildingViewBox = m => box(m.building, 1.4);
export const roomViewBox = r => box(r, .8);

function furniture(r) {
  const x = r.x + .3, y = -r.y - r.h + .3;
  if (r.type === 'bedroom' && r.w > 2.5 && r.h > 2.5) return `<g fill="#ffffff70" stroke="#74809a" stroke-width=".035" opacity=".5"><rect x="${x}" y="${y}" width="1.5" height="2" rx=".06"/><path d="M${x},${y + .5}h1.5"/><rect x="${x + .1}" y="${y + .1}" width=".55" height=".3" rx=".04"/><rect x="${x + .85}" y="${y + .1}" width=".55" height=".3" rx=".04"/></g>`;
  if (r.type === 'kitchen') return `<path d="M${x},${y + Math.min(2.5, r.h - .6)}V${y}H${x + r.w - .6}" fill="none" stroke="#a6b69b" stroke-width=".5" opacity=".55"/>`;
  if (r.type === 'bath') return `<g fill="#fff" stroke="#70909d" stroke-width=".035" opacity=".5"><rect x="${x}" y="${y}" width=".55" height=".28" rx=".03"/><ellipse cx="${x + .275}" cy="${y + .5}" rx=".23" ry=".3"/></g>`;
  if (['majlis', 'living'].includes(r.type)) return `<rect x="${x}" y="${y}" width="${Math.min(2.8, r.w - .6)}" height=".7" rx=".1" fill="#ffffff55" stroke="#9a917a" stroke-width=".055" opacity=".55"/>`;
  return '';
}

export function buildPlanSVG(model) {
  const v = buildingViewBox(model), W = model.plot.width, L = model.plot.length;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="مخطط الدور الأرضي؛ اختر غرفة لعرض تفاصيلها" style="font-family:'IBM Plex Sans Arabic',sans-serif"><defs><pattern id="paper-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#d7ddd8" stroke-width=".018"/></pattern></defs>`;
  s += `<rect x="-200" y="-200" width="400" height="400" fill="#f8f7f1"/><rect x="0" y="${-L}" width="${W}" height="${L}" fill="url(#paper-grid)" stroke="#a88b51" stroke-width=".065" stroke-dasharray=".3 .2"/>`;
  const fp = box(model.footprint);
  s += `<rect x="${fp.x}" y="${fp.y}" width="${fp.w}" height="${fp.h}" fill="none" stroke="#5b9981" stroke-width=".03" stroke-dasharray=".16 .18"/>`;
  const b = box(model.building);
  s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#eceae3"/>`;
  for (const r of model.corridors) { const v = box(r); s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="#faf7e9"/>`; }
  for (const r of model.reserves) {
    const v = box(r);
    s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="#e2e2df"/><text x="${v.x + v.w / 2}" y="${v.y + v.h / 2}" fill="#69716e" font-size=".24" text-anchor="middle">غير موزّع</text>`;
  }
  for (const r of model.rooms) {
    const v = box(r), cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const words = r.name.split(/\s+/), lines = [''];
    words.forEach(word => { if ((lines.at(-1) + word).length > 16 && lines.length < 2) lines.push(word); else lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word; });
    const font = Math.min(.38, v.w / (Math.max(...lines.map(l => l.length)) * .56 + 2));
    const label = `${r.name}، ${r.area} متر مربع، ${r.w.toFixed(2)} في ${r.h.toFixed(2)} متر`;
    s += `<g data-room-id="${r.id}" class="plan-room" tabindex="0" role="button" aria-label="${escapeXML(label)}"><title>${escapeXML(label)}</title><rect class="room-fill" x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${TYPES[r.type].color}"/>${furniture(r)}<g pointer-events="none" text-anchor="middle" fill="#263d4a" direction="rtl">`;
    lines.forEach((line, i) => { s += `<text x="${cx}" y="${cy - .25 + i * .43}" font-size="${font}" font-weight="700" paint-order="stroke" stroke="${TYPES[r.type].color}" stroke-width=".09">${escapeXML(line)}</text>`; });
    s += `<text x="${cx}" y="${cy + (lines.length - 1) * .43 + .23}" font-size=".29" font-weight="500">${r.area} م²</text><text x="${cx}" y="${cy + (lines.length - 1) * .43 + .6}" font-size=".24" fill="#536973">${r.w.toFixed(2)} × ${r.h.toFixed(2)} م</text></g></g>`;
  }
  model.walls.forEach(w => { s += `<line x1="${f(w.x1)}" y1="${f(-w.y1)}" x2="${f(w.x2)}" y2="${f(-w.y2)}" stroke="${w.type === 'ext' ? '#394a4b' : '#657574'}" stroke-width="${w.t}" stroke-linecap="square" pointer-events="none"/>`; });
  model.openings.forEach(o => {
    const wall = model.walls.find(w => w.id === o.wallId), p = openingPoint(model, o), angle = Math.atan2(-(wall.y2 - wall.y1), wall.x2 - wall.x1);
    const dx = Math.cos(angle), dy = Math.sin(angle), a = { x: p.x - dx * o.w / 2, y: -p.y - dy * o.w / 2 }, z = { x: p.x + dx * o.w / 2, y: -p.y + dy * o.w / 2 };
    s += `<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" stroke="#faf7e9" stroke-width="${wall.t + .04}" pointer-events="none"/>`;
    if (o.type === 'window') {
      for (const k of [-.035, .035]) s += `<line x1="${a.x - dy * k}" y1="${a.y + dx * k}" x2="${z.x - dy * k}" y2="${z.y + dx * k}" stroke="#248da6" stroke-width=".035" pointer-events="none"/>`;
    } else {
      const target = o.roomId ? center(model.rooms.find(r => r.id === o.roomId)) : center(model.corridors[0]);
      const sign = (-dy * (target.x - p.x) + dx * (-target.y + p.y)) >= 0 ? 1 : -1;
      const leaf = { x: a.x - dy * sign * o.w, y: a.y + dx * sign * o.w };
      s += `<path d="M${a.x} ${a.y}L${leaf.x} ${leaf.y} M${z.x} ${z.y}A${o.w} ${o.w} 0 0 ${sign > 0 ? 1 : 0} ${leaf.x} ${leaf.y}" fill="none" stroke="#ad8244" stroke-width=".04" pointer-events="none"/>`;
    }
  });
  const entry = openingPoint(model, model.openings.find(o => o.type === 'door' && o.connects.includes('outside')));
  s += `<circle cx="${entry.x}" cy="${-entry.y}" r=".12" fill="#ac7634"/><text x="${b.x + b.w / 2}" y="${b.y + b.h + .75}" font-size=".35" fill="#7e6032" text-anchor="middle">المدخل ${DIRECTIONS[model.plot.entry]} · الأرض ${W} × ${L} م</text>`;
  s += `<g transform="translate(${b.x + b.w + .55},${b.y + 1.5})" fill="#3e5c59"><path d="M0 -1L-.2 -.25H.2Z"/><path d="M0 -.3V.65" stroke="#3e5c59" stroke-width=".05"/><text y="-1.2" font-size=".32" text-anchor="middle">N</text></g></svg>`;
  return s;
}

// Pointer coordinates are transformed through the actual SVG CTM, including letterboxing.
export class PlanViewport {
  constructor(container, model, onSelect) {
    this.container = container; this.model = model; this.onSelect = onSelect;
    container.innerHTML = buildPlanSVG(model); this.svg = container.querySelector('svg');
    this.pointers = new Map(); this.view = buildingViewBox(model); this.start = null;
    const svg = this.svg;
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      svg.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.start = { x: e.clientX, y: e.clientY, room: e.target.closest('[data-room-id]')?.dataset.roomId, moved: false };
    });
    svg.addEventListener('pointermove', e => {
      if (!this.pointers.has(e.pointerId)) return;
      const before = [...this.pointers.values()]; this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); const after = [...this.pointers.values()];
      if (this.start && (after.length > 1 || Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > 5)) this.start.moved = true;
      const midpoint = list => ({ x: list.reduce((s, p) => s + p.x, 0) / list.length, y: list.reduce((s, p) => s + p.y, 0) / list.length });
      const oldMid = midpoint(before), newMid = midpoint(after), old = this.point(oldMid.x, oldMid.y), next = this.point(newMid.x, newMid.y);
      this.view.x += old.x - next.x; this.view.y += old.y - next.y; this.apply();
      if (after.length === 2) {
        const distance = a => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (distance(after) > 1) this.zoom(distance(before) / distance(after), newMid);
      }
    });
    const finish = e => {
      if (e.type === 'pointerup' && this.start && !this.start.moved && this.start.room && this.pointers.size === 1) onSelect(this.start.room);
      this.pointers.delete(e.pointerId); this.start = null;
    };
    svg.addEventListener('pointerup', finish); svg.addEventListener('pointercancel', finish);
    svg.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(Math.max(-200, Math.min(200, e.deltaY)) * .003), { x: e.clientX, y: e.clientY }); }, { passive: false });
    svg.addEventListener('keydown', e => { const room = e.target.closest('[data-room-id]'); if (room && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onSelect(room.dataset.roomId); } });
  }
  point(x, y) { const p = this.svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(this.svg.getScreenCTM().inverse()); }
  apply() { this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${this.view.w} ${this.view.h}`); }
  zoom(factor, client) {
    const rect = this.svg.getBoundingClientRect(), at = client || { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const p = this.point(at.x, at.y), width = Math.max(2.5, Math.min(this.model.plot.width * 2.5, this.view.w * factor));
    factor = width / this.view.w;
    this.view = { x: p.x - (p.x - this.view.x) * factor, y: p.y - (p.y - this.view.y) * factor, w: width, h: this.view.h * factor }; this.apply();
  }
  fit(plot = false) { this.view = plot ? plotViewBox(this.model) : buildingViewBox(this.model); this.apply(); }
  focus(id) { const r = this.model.rooms.find(r => r.id === id); if (r) { this.view = roomViewBox(r); this.apply(); this.select(id); } }
  select(id) { this.svg.querySelectorAll('[data-room-id]').forEach(g => { const on = g.dataset.roomId === id; g.classList.toggle('selected', on); g.setAttribute('aria-pressed', String(on)); }); }
}
