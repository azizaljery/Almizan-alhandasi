// The drawing editor controller: tools, pointer / keyboard handling, selection, history and the canvas loop.
// All document changes go through applyCommand (so undo, the AI assistant and saved files agree).
import { applyCommand, createHistory, DrawError, getById, fitOpening } from '../doc.mjs';
import { analyzeDoc } from '../digest.mjs';
import { exteriorWallIds } from '../topology.mjs';
import { ROOM_TYPES, OPENING_KINDS, FIXTURES, WALL_DEFAULTS, roomTypeName, fixtureName } from '../catalog.mjs';
import { dist, sub, add, mul, norm, perp, closestOnSegment, rotate, clean } from '../geom.mjs';
import { snapPoint, nearestWall, gridStep } from './snap.mjs';
import { hitItem, hitNode, itemsInBox, stairBox } from './hit.mjs';
import { renderPlan, makeView, toScreen, toWorld, fitView, docBounds } from './render2d.mjs';

export const TOOLS = ['select', 'pan', 'wall', 'rect', 'opening', 'room', 'fixture', 'stair', 'column', 'dimension', 'text', 'erase', 'measure'];
const r3 = v => Math.round(v * 1000) / 1000;

export class Editor {
  constructor(canvas, { doc, onEvent = () => {} } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.emit = onEvent;
    this.history = createHistory(doc);
    this.levelId = doc.levels[0].id;
    this.tool = 'select';
    this.opts = { thickness: doc.settings?.defaultThickness ?? WALL_DEFAULTS.thickness, wallKind: 'wall', openingKind: 'door', fixtureKind: 'sofa-3', roomType: 'bedroom', stairKind: 'straight', fixtureRot: 0, snap: true, ortho: true, grid: true, dims: true, areas: true, fixtures: true };
    this.view = makeView(); this.W = 800; this.H = 600; this.dpr = 1;
    this.selection = new Set(); this.hover = null; this.cursor = null; this.snap = null; this.ghost = null; this.selBox = null; this.markers = [];
    this.draft = null;     // tool in progress
    this.drag = null;      // pointer drag in progress
    this.typed = '';       // typed length while drawing a wall
    this.pointers = new Map(); this.pinch = null; this.space = false;
    this.flags = {}; this.dirty = true; this.raf = 0;
    this.model = null; this.refreshModel();
    this.bind(); this.resize(); this.fit();
  }

  // ----------------------------------------------------------------------------------------------- document
  get doc() { return this.history.doc; }
  level() { return this.doc.levels.find(l => l.id === this.levelId) || this.doc.levels[0]; }
  refreshModel() {
    try { this.model = analyzeDoc(this.doc); } catch { this.model = null; }
    const lv = this.model?.levelById.get(this.levelId);
    this.lv = lv || null;
    this.extWalls = lv ? exteriorWallIds(lv.analysis) : new Set();
  }
  /** Run a command; returns { ids } or null when it was refused (the reason goes to the UI). */
  exec(command, label = '', { key = null, silent = false } = {}) {
    try {
      const r = applyCommand(this.doc, command);
      this.history.commit(r.doc, label || command.type, { key });
      this.afterChange();
      return r;
    } catch (e) {
      if (e instanceof DrawError) { if (!silent) this.emit({ type: 'error', message: e.message, code: e.code }); return null; }
      throw e;
    }
  }
  /** Replace the whole document (open a file / example); clears history. */
  load(doc, { keepView = false } = {}) {
    this.history.reset(doc); this.selection.clear(); this.draft = null; this.typed = '';
    if (!doc.levels.some(l => l.id === this.levelId)) this.levelId = doc.levels[0].id;
    this.afterChange(); if (!keepView) this.fit();
  }
  afterChange() { this.refreshModel(); this.pruneSelection(); this.markDirty(); this.emit({ type: 'doc' }); this.emit({ type: 'selection' }); }
  undo() { if (this.history.canUndo) { this.history.undo(); this.draft = null; this.afterChange(); } }
  redo() { if (this.history.canRedo) { this.history.redo(); this.afterChange(); } }
  pruneSelection() { const keep = [...this.selection].filter(id => getById(this.doc, id) || this.lv?.roomsById.has(id)); if (keep.length !== this.selection.size) this.selection = new Set(keep); }
  setLevel(id) { if (this.levelId === id) return; this.levelId = id; this.selection.clear(); this.draft = null; this.refreshModel(); this.markDirty(); this.emit({ type: 'level' }); this.emit({ type: 'selection' }); }
  setTool(tool, opts = {}) {
    if (!TOOLS.includes(tool)) return;
    this.cancel(); this.tool = tool; Object.assign(this.opts, opts); this.ghost = null; this.updateCursor(); this.markDirty(); this.emit({ type: 'tool' });
  }
  setOpts(o) { Object.assign(this.opts, o); this.markDirty(); this.emit({ type: 'tool' }); }
  select(ids, { add = false } = {}) { if (!add) this.selection = new Set(); for (const id of ids) this.selection.add(id); this.markDirty(); this.emit({ type: 'selection' }); }
  selectedItems() { return [...this.selection].map(id => getById(this.doc, id)).filter(Boolean); }
  cancel() { this.setPreview(null); this.draft = null; this.drag = null; this.typed = ''; this.selBox = null; this.ghost = null; this.markDirty(); this.emit({ type: 'draft' }); }

  // ----------------------------------------------------------------------------------------------- view
  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.W = Math.max(50, r.width); this.H = Math.max(50, r.height); this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr); this.markDirty();
  }
  fit(margin = 70) { this.view = fitView(docBounds(this.doc, this.levelId), this.W, this.H, margin); if (this.doc.plot?.polygon?.length && !this.doc.walls.some(w => w.level === this.levelId)) { const xs = this.doc.plot.polygon.map(p => p.x), ys = this.doc.plot.polygon.map(p => p.y); this.view = fitView({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, this.W, this.H, margin); } this.markDirty(); this.emit({ type: 'view' }); }
  zoomAt(factor, sx, sy) {
    const before = toWorld(this.view, this.W, this.H, { x: sx, y: sy });
    this.view.scale = Math.max(4, Math.min(600, this.view.scale * factor));
    const after = toWorld(this.view, this.W, this.H, { x: sx, y: sy });
    this.view.cx += before.x - after.x; this.view.cy += before.y - after.y; this.markDirty(); this.emit({ type: 'view' });
  }
  panBy(dx, dy) { this.view.cx -= dx / this.view.scale; this.view.cy += dy / this.view.scale; this.markDirty(); }
  world(e) { const r = this.canvas.getBoundingClientRect(); return toWorld(this.view, this.W, this.H, { x: e.clientX - r.left, y: e.clientY - r.top }); }
  screen(p) { return toScreen(this.view, this.W, this.H, p); }
  get px() { return 1 / this.view.scale; }
  markDirty() { this.dirty = true; if (!this.raf && typeof requestAnimationFrame === 'function') this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); }); }
  paint() {
    if (!this.dirty) return; this.dirty = false;
    const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const doc = this.previewDoc || this.doc, lv = this.previewDoc ? this.previewLv : this.lv;
    renderPlan(ctx, {
      doc, levelId: this.levelId, analysis: lv ? { rooms: lv.rooms, gaps: lv.analysis.gaps, exteriorWallIds: this.previewDoc ? exteriorWallIds(lv.analysis) : this.extWalls } : null,
      view: this.view, W: this.W, H: this.H, selection: this.selection, hover: this.hover, ghost: this.ghost, snap: this.snap, cursor: this.cursor,
      selBox: this.selBox, markers: this.markers, flags: { grid: this.opts.grid, dims: this.opts.dims, areas: this.opts.areas, fixtures: this.opts.fixtures },
    });
  }
  setMarkers(m) { this.markers = m; this.markDirty(); }

  // ----------------------------------------------------------------------------------------------- input
  bind() {
    const c = this.canvas;
    c.style.touchAction = 'none'; c.tabIndex = 0;
    c.addEventListener('pointerdown', e => this.onDown(e));
    c.addEventListener('pointermove', e => this.onMove(e));
    c.addEventListener('pointerup', e => this.onUp(e));
    c.addEventListener('pointercancel', e => this.onUp(e, true));
    c.addEventListener('pointerleave', () => { if (!this.drag) { this.cursor = null; this.hover = null; this.ghost = this.draft ? this.ghost : null; this.markDirty(); } });
    c.addEventListener('dblclick', e => this.onDouble(e));
    c.addEventListener('wheel', e => { e.preventDefault(); const r = c.getBoundingClientRect(); if (e.ctrlKey || !e.shiftKey) this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0016)), e.clientX - r.left, e.clientY - r.top); else this.panBy(-e.deltaY, 0); }, { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('keydown', e => this.onKey(e));
    c.addEventListener('keyup', e => { if (e.key === ' ') { this.space = false; this.updateCursor(); } });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.resize()).observe(c);
  }
  updateCursor() {
    const t = this.tool;
    this.canvas.style.cursor = this.space || t === 'pan' ? 'grab' : t === 'select' ? 'default' : t === 'erase' ? 'not-allowed' : 'crosshair';
  }
  pointerPoint(e, from = null) {
    const raw = this.world(e);
    const free = e.altKey; // Alt = no snapping
    if (!this.opts.snap || free) return { raw, snap: { p: { x: r3(raw.x), y: r3(raw.y) }, kind: 'free', guides: [] } };
    const snap = snapPoint(this.doc, this.levelId, raw, { scale: this.view.scale, from, ortho: !!(e.shiftKey || this.opts.ortho && from && false), angleStep: e.shiftKey ? 45 : 45, grid: undefined, ignore: this.draft?.ignore });
    return { raw, snap };
  }
  onDown(e) {
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) { // two fingers: pinch / pan, cancel whatever was started
      this.drag = null; this.selBox = null; const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return;
    }
    if (this.pointers.size > 2) return;
    const panning = e.button === 1 || e.button === 2 || this.space || this.tool === 'pan';
    if (panning) { this.drag = { type: 'pan', lx: e.clientX, ly: e.clientY }; this.canvas.style.cursor = 'grabbing'; return; }
    if (e.button !== 0) return;
    this.down = { x: e.clientX, y: e.clientY, t: performance.now(), shift: e.shiftKey };
    this.toolDown(e);
  }
  onMove(e) {
    const rec = this.pointers.get(e.pointerId);
    if (rec) { const dx = e.clientX - rec.x, dy = e.clientY - rec.y; rec.x = e.clientX; rec.y = e.clientY;
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r = this.canvas.getBoundingClientRect();
        this.zoomAt(d / Math.max(this.pinch.d, 1), mx - r.left, my - r.top); this.panBy(mx - this.pinch.mx, my - this.pinch.my); this.pinch = { d, mx, my }; return;
      }
      if (this.drag?.type === 'pan') { this.panBy(dx, dy); return; }
    }
    this.toolMove(e);
  }
  onUp(e, cancelled = false) {
    const had = this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!had) return;
    if (this.drag?.type === 'pan') { this.drag = null; this.updateCursor(); return; }
    if (cancelled) { this.drag = null; this.selBox = null; this.markDirty(); return; }
    this.toolUp(e);
  }
  onDouble(e) {
    const p = this.world(e);
    if (this.tool === 'wall' && this.draft) { this.finishWalls(); return; }
    if (this.tool === 'select') {
      const hit = hitItem(this.doc, this.levelId, p, this.px);
      if (hit?.kind === 'labels') { this.emit({ type: 'rename', id: hit.id }); return; }
      if (!hit) { const room = this.roomAt(p); if (room) { this.emit({ type: 'rename-room', room }); return; } }
      if (hit) this.emit({ type: 'inspect', id: hit.id });
    }
  }
  roomAt(p) { return this.lv?.roomAt?.(p) || null; }

  // ----------------------------------------------------------------------------------------------- tools
  toolDown(e) {
    const t = this.tool, { raw, snap } = this.pointerPoint(e, this.draft?.last);
    this.cursor = raw; this.snap = snap;
    if (t === 'select') return this.selectDown(e, raw, snap);
    if (t === 'wall') return this.wallClick(snap.p);
    if (t === 'rect') { if (!this.draft) { this.draft = { type: 'rect', a: snap.p }; this.drag = { type: 'rect', started: performance.now() }; } else this.rectFinish(snap.p); return; }
    if (t === 'dimension') { if (!this.draft) this.draft = { type: 'dim', a: snap.p }; else { const a = this.draft.a; this.draft = null; if (dist(a, snap.p) > .02) this.exec({ type: 'add-dimension', level: this.levelId, a, b: snap.p, offset: this.dimOffset(a, snap.p) }, 'قياس'); } this.markDirty(); return; }
    if (t === 'measure') { if (!this.draft) this.draft = { type: 'measure', a: snap.p }; else this.draft = null; this.markDirty(); return; }
    if (t === 'erase') { const hit = hitItem(this.doc, this.levelId, raw, this.px); if (hit) { this.selection.delete(hit.id); this.exec({ type: 'delete', ids: [hit.id] }, 'حذف'); } return; }
    if (t === 'opening') return this.placeOpening(raw);
    if (t === 'room') return this.placeRoom(raw);
    if (t === 'fixture') return this.placeFixture(raw, snap);
    if (t === 'stair') { this.exec({ type: 'add-stair', level: this.levelId, kind: this.opts.stairKind, x: snap.p.x, y: snap.p.y, rot: this.opts.fixtureRot || 0, w: 1.1, run: 3.2 }, 'سلم'); return; }
    if (t === 'column') { this.exec({ type: 'add-column', level: this.levelId, x: snap.p.x, y: snap.p.y, size: .3 }, 'عمود'); return; }
    if (t === 'text') { this.emit({ type: 'ask-text', at: snap.p }); return; }
  }
  toolMove(e) {
    const t = this.tool;
    const { raw, snap } = this.pointerPoint(e, (t === 'wall' || t === 'dimension' || t === 'measure') ? this.draft?.last || this.draft?.a : null);
    this.cursor = raw; this.snap = snap;
    this.emit({ type: 'cursor', p: snap.p, raw });
    if (this.drag?.type === 'select-move') return this.dragMove(e, raw, snap);
    if (this.drag?.type === 'select-box') { const d = this.drag, a = d.a; this.selBox = { x0: Math.min(a.x, raw.x), x1: Math.max(a.x, raw.x), y0: Math.min(a.y, raw.y), y1: Math.max(a.y, raw.y), crossing: raw.x < a.x }; this.markDirty(); return; }
    if (this.drag?.type === 'opening-slide') { const o = this.drag.o, w = this.doc.walls.find(x => x.id === o.wall), c = closestOnSegment(raw, w.a, w.b); this.drag.at = c.t * dist(w.a, w.b); this.ghost = { type: 'opening', wall: w, at: this.drag.at, w: o.w }; this.markDirty(); return; }
    if (this.drag?.type === 'node') { this.drag.to = snap.p; this.ghost = null; this.previewNode(); return; }
    if (t === 'select') { const hit = hitItem(this.doc, this.levelId, raw, this.px), room = !hit ? this.roomAt(raw) : null, nh = hitNode(this.doc, this.levelId, raw, this.px); const id = hit?.id || null; const nextHover = { id, roomId: room?.id || null, node: nh?.p || null }; if (JSON.stringify(nextHover) !== JSON.stringify(this.hover)) { this.hover = nextHover; this.canvas.style.cursor = nh && this.selection.has(nh.wall.id) ? 'move' : hit ? 'pointer' : 'default'; } this.markDirty(); return; }
    this.hover = null;
    if (t === 'wall') { if (this.draft) { const a = this.draft.last; this.ghost = { type: 'wall', a, b: snap.p, t: this.opts.thickness, angleLabel: this.angleText(a, snap.p) }; } else this.ghost = { type: 'point', p: snap.p }; }
    else if (t === 'rect') { if (this.draft) this.ghost = this.rectGhost(this.draft.a, snap.p); else this.ghost = { type: 'point', p: snap.p }; }
    else if (t === 'dimension' || t === 'measure') { this.ghost = this.draft ? { type: 'dim', a: this.draft.a, b: snap.p, offset: t === 'dimension' ? this.dimOffset(this.draft.a, snap.p) : 0 } : { type: 'point', p: snap.p }; }
    else if (t === 'opening') this.ghost = this.openingGhost(raw);
    else if (t === 'fixture') this.ghost = this.fixtureGhost(raw, snap);
    else if (t === 'stair') this.ghost = { type: 'rect', poly: stairBox({ x: snap.p.x, y: snap.p.y, rot: this.opts.fixtureRot || 0, w: 1.1, run: 3.2, kind: this.opts.stairKind }) };
    else if (t === 'column') this.ghost = { type: 'rect', poly: [[-.15, -.15], [.15, -.15], [.15, .15], [-.15, .15]].map(([x, y]) => ({ x: snap.p.x + x, y: snap.p.y + y })) };
    else if (t === 'room') { const room = this.roomAt(raw); this.hover = { roomId: room?.id || null }; this.ghost = null; }
    else if (t === 'erase') { const hit = hitItem(this.doc, this.levelId, raw, this.px); this.hover = { id: hit?.id || null }; }
    else this.ghost = null;
    this.markDirty();
  }
  toolUp(e) {
    const raw = this.world(e);
    if (this.drag?.type === 'select-box') {
      const d = this.drag, moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      if (moved < 4) { if (!this.down.shift) this.select([]); }
      else { const b = this.selBox; const ids = itemsInBox(this.doc, this.levelId, b, b.crossing); const rooms = this.lv ? this.lv.rooms.filter(r => r.label && ids.includes(r.label.id)).map(r => r.id) : []; this.select(ids.concat([]), { add: this.down.shift }); void rooms; }
      this.selBox = null; this.drag = null; this.markDirty(); return;
    }
    if (this.drag?.type === 'select-move') { const d = this.drag; this.drag = null; if (d.moved) this.commitMove(d); else if (d.clickId) this.clickSelect(d, e.shiftKey || this.down.shift); this.ghost = null; this.markDirty(); return; }
    if (this.drag?.type === 'opening-slide') { const d = this.drag; this.drag = null; this.ghost = null; if (d.at !== undefined && Math.abs(d.at - d.o.at) > .01) this.exec({ type: 'update', id: d.o.id, patch: { at: r3(d.at) } }, 'تحريك فتحة'); this.markDirty(); return; }
    if (this.drag?.type === 'node') { const d = this.drag; this.drag = null; this.ghost = null; this.setNodeBase(null); this.setPreview(null); if (d.to && dist(d.to, d.from) > .005) this.exec({ type: 'move-node', level: this.levelId, from: d.from, to: d.to }, 'تحريك نقطة'); this.markDirty(); return; }
    if (this.drag?.type === 'rect') { const d = this.drag; this.drag = null; const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y); if (moved > 8 && this.draft?.type === 'rect') { const { snap } = this.pointerPoint(e); this.rectFinish(snap.p); } return; }
  }
  onKey(e) {
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (k === ' ') { this.space = true; this.updateCursor(); e.preventDefault(); return; }
    if (ctrl && (k === 'z' || k === 'Z')) { e.shiftKey ? this.redo() : this.undo(); e.preventDefault(); return; }
    if (ctrl && (k === 'y' || k === 'Y')) { this.redo(); e.preventDefault(); return; }
    if (ctrl && (k === 'a' || k === 'A')) { const ids = itemsInBox(this.doc, this.levelId, { x0: -1e4, y0: -1e4, x1: 1e4, y1: 1e4 }, true); this.select(ids); e.preventDefault(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { this.duplicateSelection(); e.preventDefault(); return; }
    if (k === 'Escape') { if (this.draft || this.typed) this.cancel(); else if (this.selection.size) this.select([]); else this.setTool('select'); return; }
    if (this.tool === 'wall' && this.draft) {
      if (/^[0-9.,٠-٩]$/.test(k)) { this.typed += k.replace(',', '.').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)); this.typedPreview(); e.preventDefault(); return; }
      if (k === 'Backspace' && this.typed) { this.typed = this.typed.slice(0, -1); this.typedPreview(); e.preventDefault(); return; }
      if (k === 'Enter') { if (this.typed) this.commitTyped(); else this.finishWalls(); e.preventDefault(); return; }
    }
    if (k === 'Enter' && this.draft?.type === 'rect') return;
    if (k === 'Delete' || k === 'Backspace') { this.deleteSelection(); e.preventDefault(); return; }
    if (k === 'r' || k === 'R' || k === 'ق') { if (this.tool === 'fixture' || this.tool === 'stair') { this.opts.fixtureRot = ((this.opts.fixtureRot || 0) + Math.PI / 2) % (Math.PI * 2); this.opts.autoRot = false; this.markDirty(); } else this.rotateSelection(e.shiftKey ? -Math.PI / 2 : Math.PI / 2); e.preventDefault(); return; }
    if (k === 'f' || k === 'F') { this.fit(); return; }
    if (k === '+' || k === '=') { this.zoomAt(1.25, this.W / 2, this.H / 2); return; }
    if (k === '-') { this.zoomAt(.8, this.W / 2, this.H / 2); return; }
    if (k.startsWith('Arrow') && this.selection.size) { const step = e.shiftKey ? .5 : .05; const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[k]; this.exec({ type: 'translate', ids: [...this.selection], dx: d[0], dy: d[1] }, 'إزاحة', { key: 'nudge' }); e.preventDefault(); return; }
    const hot = { v: 'select', h: 'pan', w: 'wall', m: 'measure', e: 'erase', d: 'opening', t: 'text' }[k.toLowerCase()];
    if (hot && !ctrl) this.setTool(hot, hot === 'opening' ? { openingKind: 'door' } : {});
  }

  // ----- select tool
  selectDown(e, raw, snap) {
    const px = this.px, hitN = hitNode(this.doc, this.levelId, raw, px);
    if (hitN && this.selection.has(hitN.wall.id)) { this.drag = { type: 'node', from: { ...hitN.p }, to: null }; this.setNodeBase(this.drag); return; }
    const hit = hitItem(this.doc, this.levelId, raw, px);
    if (hit) {
      if (hit.kind === 'openings' && this.selection.has(hit.id) && this.selection.size === 1) { const o = this.doc.openings.find(x => x.id === hit.id); this.drag = { type: 'opening-slide', o }; return; }
      this.drag = { type: 'select-move', start: raw, startSnap: snap.p, clickId: hit.id, hit, base: this.doc, moved: false };
      const sel = this.selection.has(hit.id) ? new Set(this.selection) : (e.shiftKey ? new Set([...this.selection, hit.id]) : new Set([hit.id]));
      this.drag.ids = [...sel].filter(id => getById(this.doc, id)?.collection !== 'openings');
      if (!this.selection.has(hit.id)) { if (e.shiftKey) this.select([hit.id], { add: true }); else this.select([hit.id]); this.drag.selectedNow = true; }
      return;
    }
    const room = this.roomAt(raw);
    if (room && room.label) { const id = room.label.id; if (e.shiftKey) this.select([id], { add: true }); else this.select([id]); this.drag = { type: 'select-box', a: raw }; this.drag.pending = true; this.selBox = null; this.dragRoom = room; return; }
    this.drag = { type: 'select-box', a: raw };
  }
  dragMove(e, raw, snap) {
    const d = this.drag, dx = raw.x - d.start.x, dy = raw.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * this.view.scale < 4) return;
    d.moved = true;
    // snap the movement so that the first moved node lands on the grid / other nodes
    const ref = this.refPoint(d), target = this.opts.snap && !e.altKey ? snapPoint(this.doc, this.levelId, { x: ref.x + dx, y: ref.y + dy }, { scale: this.view.scale, ignore: new Set(d.ids) }).p : { x: ref.x + dx, y: ref.y + dy };
    d.dx = r3(target.x - ref.x); d.dy = r3(target.y - ref.y);
    try { const r = applyCommand(d.base, { type: 'translate', ids: d.ids, dx: d.dx, dy: d.dy }); this.setPreview(r.doc); } catch { this.setPreview(null); }
    this.markDirty();
    this.emit({ type: 'moving', dx: d.dx, dy: d.dy });
  }
  refPoint(d) { const items = d.ids.map(id => getById(d.base, id)).filter(Boolean); const first = items[0]?.item; if (!first) return d.start; if (first.a) return first.a; if (first.x !== undefined) return { x: first.x, y: first.y }; if (first.seed) return first.seed; if (first.at) return first.at; return d.start; }
  commitMove(d) { this.setPreview(null); if (d.dx || d.dy) this.exec({ type: 'translate', ids: d.ids, dx: d.dx, dy: d.dy }, 'نقل'); else this.markDirty(); }
  clickSelect(d, shift) { if (!d.selectedNow) { if (shift) { if (this.selection.has(d.clickId)) { this.selection.delete(d.clickId); this.emit({ type: 'selection' }); } } } }
  setNodeBase() {}
  setPreview(doc) { this.previewDoc = doc; this.previewLv = null; if (doc) { try { this.previewLv = analyzeDoc(doc).levelById.get(this.levelId) || null; } catch { this.previewLv = null; } } }
  previewNode() { const d = this.drag; if (!d?.to) return; try { this.setPreview(applyCommand(this.doc, { type: 'move-node', level: this.levelId, from: d.from, to: d.to }).doc); } catch { /* refused: keep the last good preview */ } this.markDirty(); }

  deleteSelection() { if (!this.selection.size) return; const ids = [...this.selection].filter(id => getById(this.doc, id)); if (!ids.length) return; this.selection = new Set(); this.exec({ type: 'delete', ids }, 'حذف'); }
  rotateSelection(angle) {
    const items = this.selectedItems(); if (!items.length) return;
    const ids = items.map(i => i.item.id), pts = items.map(i => i.item.a ? [i.item.a, i.item.b] : [i.item.seed || i.item.at || { x: i.item.x, y: i.item.y }]).flat().filter(p => p && Number.isFinite(p.x));
    if (!pts.length) return; const about = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    if (items.length === 1 && (items[0].collection === 'fixtures' || items[0].collection === 'stairs')) { const it = items[0].item; return void this.exec({ type: 'update', id: it.id, patch: { rot: ((it.rot || 0) + angle) } }, 'تدوير'); }
    this.exec({ type: 'rotate', ids, angle, about: { x: r3(about.x), y: r3(about.y) } }, 'تدوير');
  }
  duplicateSelection() { const ids = [...this.selection].filter(id => getById(this.doc, id)); if (!ids.length) return; const r = this.exec({ type: 'duplicate', ids, dx: 1, dy: -1 }, 'تكرار'); if (r?.ids) this.select(r.ids); }

  // ----- wall tool
  wallClick(p) {
    if (!this.draft) { this.draft = { type: 'wall', first: p, last: p, count: 0, ignore: new Set(), made: [] }; this.markDirty(); this.emit({ type: 'draft' }); return; }
    const a = this.draft.last;
    if (dist(a, p) < .05) { this.finishWalls(); return; }
    this.addWall(a, p);
    const closes = dist(p, this.draft.first) < .02 && this.draft.count >= 2;
    this.draft.last = p; this.typed = '';
    if (closes) this.finishWalls(); else this.markDirty();
  }
  addWall(a, b) {
    const r = this.exec({ type: 'add-wall', level: this.levelId, a, b, t: this.opts.thickness, kind: this.opts.wallKind }, 'جدار');
    if (r) { this.draft.count++; this.draft.made.push(...(r.ids || [])); }
    return r;
  }
  finishWalls() { this.draft = null; this.typed = ''; this.ghost = null; this.markDirty(); this.emit({ type: 'draft' }); }
  typedPreview() {
    const d = this.draft; if (!d || !this.cursor) return;
    const L = parseFloat(this.typed); if (!Number.isFinite(L)) return;
    const dir = this.typedDir(); this.ghost = { type: 'wall', a: d.last, b: { x: d.last.x + dir.x * L, y: d.last.y + dir.y * L }, t: this.opts.thickness, angleLabel: 'الطول: ' + this.typed };
    this.markDirty(); this.emit({ type: 'typed', text: this.typed });
  }
  typedDir() { const d = this.draft, c = this.snap?.p || this.cursor, v = sub(c, d.last), l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }
  commitTyped() {
    const L = parseFloat(this.typed), d = this.draft; if (!d || !Number.isFinite(L) || L < .05) { this.typed = ''; return; }
    const dir = this.typedDir(), p = { x: r3(d.last.x + dir.x * L), y: r3(d.last.y + dir.y * L) };
    this.addWall(d.last, p); d.last = p; this.typed = ''; this.ghost = null; this.markDirty(); this.emit({ type: 'typed', text: '' });
  }
  angleText(a, b) { const d = sub(b, a); let ang = Math.atan2(d.y, d.x) * 180 / Math.PI; if (ang < 0) ang += 360; return Math.round(ang) + '°'; }

  // ----- rectangle
  rectGhost(a, b) { const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y); const poly = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; const w = x1 - x0, h = y1 - y0; return { type: 'poly', points: poly, sides: [[poly[0], poly[1]], [poly[1], poly[2]]], center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, label: w > .1 && h > .1 ? (w * h).toFixed(2) + ' م²' : '' }; }
  rectFinish(b) { const a = this.draft.a; this.draft = null; this.ghost = null; this.drag = null; if (Math.abs(a.x - b.x) < .1 || Math.abs(a.y - b.y) < .1) { this.markDirty(); return; } this.exec({ type: 'add-rect', level: this.levelId, a, b, t: this.opts.thickness }, 'غرفة مستطيلة'); }
  dimOffset(a, b) { const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, u = norm(sub(b, a)), n = { x: -u.y, y: u.x }, c = this.cursor || m; return Math.sign((c.x - m.x) * n.x + (c.y - m.y) * n.y || 1) * Math.max(.4, Math.min(2, Math.abs((c.x - m.x) * n.x + (c.y - m.y) * n.y))); }

  // ----- openings
  openingGhost(raw) {
    const near = nearestWall(this.doc, this.levelId, raw, Math.max(.5, 20 * this.px)); if (!near) return null;
    const def = OPENING_KINDS[this.opts.openingKind], w = this.opts.openingW || def.w;
    let at = near.at; try { at = fitOpening(this.doc, near.wall, near.at, w); } catch { return null; }
    return { type: 'opening', wall: near.wall, at, w, side: this.sideOf(near, raw) };
  }
  sideOf(near, raw) { const wl = near.wall, u = norm(sub(wl.b, wl.a)), n = perp(u); return ((raw.x - near.point.x) * n.x + (raw.y - near.point.y) * n.y) >= 0 ? 'in' : 'out'; }
  placeOpening(raw) {
    const g = this.openingGhost(raw); if (!g) { this.emit({ type: 'hint', message: 'قرّب المؤشر من جدار لوضع الفتحة.' }); return; }
    const kind = this.opts.openingKind, def = OPENING_KINDS[kind];
    const cmd = { type: 'add-opening', wall: g.wall.id, kind, at: g.at, w: g.w };
    if (['door', 'door2'].includes(kind)) { cmd.swing = g.side; const wl = g.wall, u = norm(sub(wl.b, wl.a)); const along = ((raw.x - wl.a.x) * u.x + (raw.y - wl.a.y) * u.y) - g.at; cmd.hinge = along > 0 ? 'right' : 'left'; }
    const r = this.exec(cmd, def.ar); if (r?.ids) this.select(r.ids);
  }

  // ----- rooms
  placeRoom(raw) {
    const room = this.roomAt(raw);
    if (!room) { this.emit({ type: 'hint', message: 'اضغط داخل غرفة مغلقة بالجدران. إن لم تتلوّن الغرفة فهناك فجوة في الجدران.' }); return; }
    const type = this.opts.roomType;
    if (room.label) { this.exec({ type: 'update', id: room.label.id, patch: { type, name: this.nameFor(type, room.label.id) } }, 'نوع الغرفة'); this.select([room.label.id]); return; }
    const r = this.exec({ type: 'add-label', level: this.levelId, name: this.nameFor(type), roomType: type, seed: { x: r3(room.space.inside?.x ?? room.centroid.x), y: r3(room.space.inside?.y ?? room.centroid.y) } }, 'تسمية غرفة');
    if (r?.ids) this.select(r.ids);
  }
  nameFor(type, skipId = null) {
    const base = roomTypeName(type), same = this.doc.labels.filter(l => l.type === type && l.id !== skipId).length;
    return same ? `${base} ${same + 1}` : base;
  }

  // ----- fixtures
  fixtureGhost(raw, snap) {
    const kind = this.opts.fixtureKind, def = FIXTURES[kind]; if (!def) return null;
    const place = this.fixturePlacement(raw, snap, def);
    const poly = fixturePoly(place.x, place.y, def.w, def.d, place.rot);
    return { type: 'rect', poly };
  }
  fixturePlacement(raw, snap, def) {
    const near = this.opts.autoRot === false ? null : nearestWall(this.doc, this.levelId, raw, def.d / 2 + .45);
    let rot = this.opts.fixtureRot || 0, x = snap.p.x, y = snap.p.y;
    if (near && !['tree', 'plant', 'car', 'rug'].includes(this.opts.fixtureKind)) {
      const wl = near.wall, u = norm(sub(wl.b, wl.a)), n0 = perp(u), side = ((raw.x - near.point.x) * n0.x + (raw.y - near.point.y) * n0.y) >= 0 ? 1 : -1, n = mul(n0, side);
      rot = Math.atan2(-n.x, n.y); // front faces away from the wall
      const gap = wl.t / 2 + def.d / 2 + .01, base = near.point;
      x = base.x + n.x * gap; y = base.y + n.y * gap;
      // keep the position along the wall on the grid-ish step
      const step = .05; const along = (x - wl.a.x) * u.x + (y - wl.a.y) * u.y; const q = Math.round(along / step) * step; x += u.x * (q - along); y += u.y * (q - along);
      // pushed against the nearest perpendicular wall corner if close
    }
    return { x: r3(x), y: r3(y), rot: r3(rot) };
  }
  placeFixture(raw, snap) {
    const kind = this.opts.fixtureKind, def = FIXTURES[kind]; if (!def) return;
    const p = this.fixturePlacement(raw, snap, def);
    const r = this.exec({ type: 'add-fixture', level: this.levelId, kind, x: p.x, y: p.y, rot: p.rot }, def.ar); if (r?.ids) this.select(r.ids);
  }

  // ----- helpers for the UI
  stats() {
    const lv = this.lv, rooms = lv?.rooms || [], total = rooms.reduce((s, r) => s + (r.unlabelled ? 0 : r.area), 0);
    return { walls: this.doc.walls.filter(w => w.level === this.levelId).length, rooms: rooms.length, gaps: lv?.analysis.gaps.length || 0, area: rooms.reduce((s, r) => s + r.area, 0), labelled: total, unlabelled: rooms.filter(r => r.unlabelled).length };
  }
  closeGaps() {
    const gaps = this.lv?.analysis.gaps || []; if (!gaps.length) return 0; let n = 0;
    const cmds = gaps.map(g => ({ type: 'close-gap', level: this.levelId, from: g.at, to: g.point }));
    try { let d = this.doc; for (const c of cmds) { try { d = applyCommand(d, c).doc; n++; } catch { /* skip */ } } if (n) { this.history.commit(d, 'إغلاق فجوات'); this.afterChange(); } } catch { /* nothing */ }
    return n;
  }
}

function fixturePoly(x, y, w, d, rot) {
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => { const r = rotate({ x: a, y: b }, rot); return { x: x + r.x, y: y + r.y }; });
}

export default { Editor, TOOLS };
