import { TYPES, center, openingPoint, wallPieces } from './planner.mjs';

export class RoomViewer {
  constructor(container, onMode) {
    const T = globalThis.THREE;
    if (!T) throw Error('تعذّر تحميل مكتبة 3D. مخطط 2D يعمل؛ تحقّق من الاتصال ثم أعد المحاولة.');
    this.T = T; this.container = container; this.onMode = onMode; this.visible = true; this.mode = 'orbit';
    this.abort = new AbortController(); this.pointers = new Map(); this.scene = new T.Scene();
    this.scene.background = new T.Color('#e8eceb');
    this.camera = new T.PerspectiveCamera(48, 1, .05, 700);
    try { this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { throw Error('عرض 3D يحتاج WebGL، وهو غير متاح في هذا المتصفح. يمكنك متابعة المخطط 2D.'); }
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'عرض ثلاثي الأبعاد. اسحب للتدوير؛ داخل الغرفة استخدم الأسهم أو أزرار الحركة.');
    container.prepend(canvas);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x88877b, 2));
    const light = new T.DirectionalLight(0xfff0d5, 2.2); light.position.set(30, 60, -10); this.scene.add(light);
    this.group = new T.Group(); this.scene.add(this.group);
    this.target = new T.Vector3(); this.theta = Math.PI * .23; this.phi = .65; this.radius = 35; this.yaw = 0; this.pitch = 0;
    const on = (event, handler, options = {}) => canvas.addEventListener(event, handler, { ...options, signal: this.abort.signal });
    on('pointerdown', e => { if (e.button !== 0) return; canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    on('pointermove', e => {
      if (!this.pointers.has(e.pointerId)) return;
      const old = this.pointers.get(e.pointerId), before = [...this.pointers.values()];
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const dx = e.clientX - old.x, dy = e.clientY - old.y;
      if (this.pointers.size > 1 && this.mode === 'orbit') {
        const after = [...this.pointers.values()], distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (distance(after) > 1) this.radius *= distance(before) / distance(after);
        this.radius = Math.max(4, Math.min(240, this.radius));
      } else if (this.pointers.size === 1) {
        if (this.mode === 'inside') { this.yaw -= dx * .005; this.pitch = Math.max(-.85, Math.min(.85, this.pitch - dy * .004)); }
        else { this.theta -= dx * .007; this.phi = Math.max(.02, Math.min(1.45, this.phi - dy * .005)); }
      }
      this.render();
    });
    on('pointerup', e => this.pointers.delete(e.pointerId)); on('pointercancel', e => this.pointers.delete(e.pointerId));
    on('wheel', e => {
      e.preventDefault();
      if (this.mode === 'inside') this.move(e.deltaY > 0 ? 'back' : 'forward', .3);
      else { this.radius = Math.max(4, Math.min(240, this.radius * Math.exp(Math.max(-200, Math.min(200, e.deltaY)) * .002))); this.render(); }
    }, { passive: false });
    on('keydown', e => {
      const keys = { ArrowUp: 'forward', w: 'forward', ArrowDown: 'back', s: 'back', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
      if (this.mode === 'inside' && keys[e.key]) { e.preventDefault(); this.move(keys[e.key], .28); }
      if (e.key === 'Escape') this.view('persp');
    });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
  }
  clear() {
    const geometries = new Set(), materials = new Set();
    this.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
    this.group.clear(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
  mesh(x, y, z, w, h, d, color, rotation = 0, opacity = 1) {
    const T = this.T, material = new T.MeshStandardMaterial({ color, roughness: .85, transparent: opacity < 1, opacity });
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), material); m.position.set(x, y, z); m.rotation.y = rotation; this.group.add(m); return m;
  }
  setModel(model, palette = 'resort') {
    this.clear(); this.model = model; this.pieces = wallPieces(model);
    const b = model.building, p = model.plot, T = this.T;
    const color = { resort: '#ead9bc', modern: '#f3f1ec', classic: '#e0ceae', hijazi: '#cdb390' }[palette] || '#ead9bc';
    this.mesh(p.width / 2, -.12, -p.length / 2, p.width, .18, p.length, '#c8d3c1');
    this.mesh(b.x + b.w / 2, -.01, -b.y - b.h / 2, b.w, .12, b.h, '#e6e1d5');
    model.rooms.forEach(r => {
      this.mesh(r.x + r.w / 2, .058, -r.y - r.h / 2, r.w, .015, r.h, TYPES[r.type].color);
      // Schematic furniture only; not included in the quantity schedule.
      if (r.type === 'bedroom' && r.w >= 2.5 && r.h >= 2.5) {
        this.mesh(r.x + 1.1, .28, -r.y - r.h + 1.3, 1.5, .42, 2, '#d6d9e6');
        this.mesh(r.x + 1.1, .53, -r.y - r.h + .55, 1.3, .12, .4, '#f7f4ed');
      } else if (r.type === 'kitchen') this.mesh(r.x + r.w / 2, .45, -r.y - r.h + .35, r.w - .4, .9, .55, '#b4c2a4');
      else if (r.type === 'bath') this.mesh(r.x + .55, .27, -r.y - r.h + .65, .55, .5, .7, '#f4f8fa');
    });
    this.pieces.forEach(p => this.mesh(p.x, p.bottom + p.height / 2, -p.y, p.length, p.height, p.thickness, p.type === 'ext' ? color : '#f5f1e9', p.angle));
    model.openings.filter(o => o.type === 'window').forEach(o => {
      const w = model.walls.find(w => w.id === o.wallId), point = openingPoint(model, o);
      this.mesh(point.x, o.sill + o.h / 2, -point.y, o.w, o.h, .025, '#80b8c7', Math.atan2(w.y2 - w.y1, w.x2 - w.x1), .28);
    });
    // Doors intentionally shown open so the actual wall openings remain visible.
    this.roof = this.mesh(b.x + b.w / 2, 3.32, -b.y - b.h / 2, b.w, .22, b.h, '#b9a88a'); this.roof.visible = false;
    const points = [[0, 0], [p.width, 0], [p.width, p.length], [0, p.length], [0, 0]].map(([x, y]) => new T.Vector3(x, .07, -y));
    const line = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineDashedMaterial({ color: 0x93753f, dashSize: .4, gapSize: .3 })); line.computeLineDistances(); this.group.add(line);
    this.view('persp'); this.resize();
  }
  view(name) {
    if (!this.model) return;
    this.mode = 'orbit'; const b = this.model.building, s = Math.max(b.w, b.h);
    this.target.set(b.x + b.w / 2, .8, -b.y - b.h / 2);
    this.phi = name === 'top' ? .02 : name === 'front' ? 1.42 : .65;
    this.theta = name === 'front' ? ({ s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[this.model.plot.entry]) : Math.PI * .23;
    const aspect = Math.max(.35, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    this.radius = s * (name === 'front' ? 1.8 : Math.max(1.65, 1.3 / aspect));
    this.onMode?.('orbit', name); this.render();
  }
  enter(id) {
    const r = this.model?.rooms.find(r => r.id === id); if (!r) return;
    const c = center(r), door = this.model.openings.find(o => o.type === 'door' && o.roomId === id), p = openingPoint(this.model, door);
    this.mode = 'inside'; this.eye = { x: c.x, y: c.y }; this.yaw = Math.atan2(p.x - c.x, p.y - c.y); this.pitch = -.06;
    this.roof.visible = false; this.onMode?.('inside', r.name); this.render(); this.renderer.domElement.focus({ preventScroll: true });
  }
  blocked(x, y) {
    const p = this.model.plot, radius = .18;
    if (x < -.8 || y < -.8 || x > p.width + .8 || y > p.length + .8) return true;
    return this.pieces.some(w => {
      if (w.bottom > 1.6 || w.bottom + w.height < 1.6) return false;
      const dx = x - w.x, dy = y - w.y, along = dx * Math.cos(w.angle) + dy * Math.sin(w.angle), perpendicular = -dx * Math.sin(w.angle) + dy * Math.cos(w.angle);
      return Math.abs(along) < w.length / 2 + radius && Math.abs(perpendicular) < w.thickness / 2 + radius;
    });
  }
  move(direction, amount = .45) {
    if (this.mode !== 'inside') return;
    const yaw = this.yaw + (direction === 'left' ? -Math.PI / 2 : direction === 'right' ? Math.PI / 2 : direction === 'back' ? Math.PI : 0);
    const steps = Math.ceil(amount / .07), dx = Math.sin(yaw) * amount / steps, dy = Math.cos(yaw) * amount / steps;
    for (let i = 0; i < steps; i++) { const x = this.eye.x + dx, y = this.eye.y + dy; if (this.blocked(x, y)) break; this.eye = { x, y }; }
    this.render();
  }
  setRoof(show) { if (this.roof) { this.roof.visible = show && this.mode !== 'inside'; this.render(); } }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false); this.render();
  }
  setVisible(show) { this.visible = show; if (show) this.resize(); }
  render() {
    if (!this.visible || !this.model || !this.container.clientWidth) return;
    if (this.mode === 'inside') {
      this.camera.position.set(this.eye.x, 1.6, -this.eye.y);
      this.camera.lookAt(this.eye.x + Math.sin(this.yaw) * Math.cos(this.pitch), 1.6 + Math.sin(this.pitch), -this.eye.y - Math.cos(this.yaw) * Math.cos(this.pitch));
    } else {
      this.camera.position.set(this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta));
      this.camera.lookAt(this.target);
    }
    this.renderer.render(this.scene, this.camera);
  }
  destroy() { this.abort.abort(); this.resizeObserver.disconnect(); this.clear(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
