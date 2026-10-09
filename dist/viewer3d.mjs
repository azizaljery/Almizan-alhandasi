import { TYPES, center, openingPoint, wallPieces } from './planner.mjs';

export class RoomViewer {
  constructor(container, onMode) {
    const T = globalThis.THREE;
    if (!T) throw Error('تعذّر تحميل مكتبة 3D. مخطط 2D يعمل؛ تحقّق من الاتصال ثم أعد المحاولة.');
    this.T = T; this.container = container; this.onMode = onMode; this.visible = true; this.mode = 'orbit';
    this.abort = new AbortController(); this.pointers = new Map(); this.scene = new T.Scene(); this.autoOrbit = false; this.orbitFrame = 0; this.orbitLast = 0;
    this.scene.background = new T.Color('#e8eceb');
    this.camera = new T.PerspectiveCamera(48, 1, .05, 700);
    try { this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { throw Error('عرض 3D يحتاج WebGL، وهو غير متاح في هذا المتصفح. يمكنك متابعة المخطط 2D.'); }
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    if (T.ACESFilmicToneMapping) this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    if (this.renderer.shadowMap) { this.renderer.shadowMap.enabled = true; if (T.PCFSoftShadowMap) this.renderer.shadowMap.type = T.PCFSoftShadowMap; }
    const canvas = this.renderer.domElement;
    if (canvas.style) canvas.style.touchAction = 'none';
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'عرض ثلاثي الأبعاد. اسحب للتدوير؛ داخل الغرفة استخدم الأسهم أو أزرار الحركة.');
    container.prepend(canvas);
    this.ambientLight = new T.HemisphereLight(0xfffbef, 0x6f7c70, 1.8); this.scene.add(this.ambientLight);
    const light = new T.DirectionalLight(0xffe4b6, 3.1); this.sunLight = light; light.position.set(-28, 48, 18); light.castShadow = true;
    if (light.shadow?.mapSize) { const size = Math.min(globalThis.innerWidth || 1200, globalThis.innerHeight || 900) < 700 ? 1024 : 2048; light.shadow.mapSize.width = size; light.shadow.mapSize.height = size; light.shadow.camera.near = 1; light.shadow.camera.far = 200; light.shadow.bias = -.00022; }
    this.scene.add(light);
    const fill = new T.DirectionalLight(0xbcd8ff, .75); this.fillLight = fill; fill.position.set(24, 18, -35); this.scene.add(fill);
    this.group = new T.Group(); this.scene.add(this.group);
    this.target = new T.Vector3(); this.theta = Math.PI * .23; this.phi = .65; this.radius = 35; this.yaw = 0; this.pitch = 0;
    const on = (event, handler, options = {}) => canvas.addEventListener(event, handler, { ...options, signal: this.abort.signal });
    on('pointerdown', e => { if (e.button !== 0) return; this.stopOrbit(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    on('pointermove', e => {
      if (!this.pointers.has(e.pointerId)) return;
      const old = this.pointers.get(e.pointerId), before = [...this.pointers.values()];
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const dx = e.clientX - old.x, dy = e.clientY - old.y;
      if (this.pointers.size > 1 && this.mode === 'orbit') {
        const after = [...this.pointers.values()], distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (distance(after) > 1) this.radius *= distance(before) / distance(after);
        this.radius = Math.max(4, Math.min(240, this.radius));
        // Two-finger pan uses the actual touch-centroid shift, not a page scroll.
        const midpoint = points => ({
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        });
        const previous = midpoint(before), current = midpoint(after);
        const scale = this.radius * .0014;
        const shiftX = (current.x - previous.x) * scale;
        const shiftY = (current.y - previous.y) * scale;
        const p = this.model?.plot;
        if (p) {
          this.target.x = Math.max(-5, Math.min(p.width + 5, this.target.x - shiftX * Math.cos(this.theta) + shiftY * Math.sin(this.theta)));
          this.target.z = Math.max(-p.length - 5, Math.min(5, this.target.z + shiftX * Math.sin(this.theta) + shiftY * Math.cos(this.theta)));
        }
      } else if (this.pointers.size === 1) {
        if (this.mode === 'inside') { this.yaw -= dx * .005; this.pitch = Math.max(-.85, Math.min(.85, this.pitch - dy * .004)); }
        else { this.theta -= dx * .007; this.phi = Math.max(.02, Math.min(1.45, this.phi - dy * .005)); }
      }
      this.render();
    });
    on('pointerup', e => this.pointers.delete(e.pointerId)); on('pointercancel', e => this.pointers.delete(e.pointerId));
    on('wheel', e => {
      e.preventDefault(); this.stopOrbit();
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
  mesh(x, y, z, w, h, d, color, rotation = 0, opacity = 1, options = {}) {
    const T = this.T;
    const Material = options.glass && T.MeshPhysicalMaterial ? T.MeshPhysicalMaterial : T.MeshStandardMaterial;
    const material = new Material({ color, roughness: options.roughness ?? (options.glass ? .12 : .78), metalness: options.metalness ?? 0, transparent: opacity < 1 || options.glass, opacity, depthWrite: !(options.glass || opacity < .55), ...(options.glass ? { transmission: .55, thickness: .05 } : {}) });
    const m = new T.Mesh(new T.BoxGeometry(Math.max(.01, w), Math.max(.01, h), Math.max(.01, d)), material);
    m.position.set(x, y, z); m.rotation.y = rotation; m.castShadow = options.castShadow ?? !options.glass; m.receiveShadow = options.receiveShadow ?? !options.glass;
    (options.parent || this.group).add(m); return m;
  }
  setModel(model, palette = 'resort') {
    this.clear(); this.model = model; this.pieces = wallPieces(model);
    const b = model.building, p = model.plot, T = this.T, concept = model.architecture?.massing || 'spine';
    // Shadow frustum follows the actual plot, not Three.js' tiny default ±5m area.
    const camera = this.sunLight.shadow?.camera;
    if (camera) {
      const span = Math.max(p.width, p.length) + 12;
      camera.left = -span; camera.right = span; camera.top = span; camera.bottom = -span;
      camera.near = 1; camera.far = Math.max(160, span * 4);
      camera.updateProjectionMatrix?.();
    }
    this.sunLight.target?.position?.set(p.width / 2, 0, -p.length / 2);
    this.sunLight.target?.updateMatrixWorld?.();
    const materials = {
      resort: { facade: '#ead9bc', accent: '#8e6948', roof: '#d2bea0', floor: '#eee5d5', metal: '#604d3b' },
      modern: { facade: '#f4f2ed', accent: '#5a6666', roof: '#d8d6cf', floor: '#e8e4dc', metal: '#303839' },
      classic: { facade: '#e5d3b6', accent: '#a77d49', roof: '#c5ad88', floor: '#eee2ce', metal: '#5c4936' },
      hijazi: { facade: '#d7bea0', accent: '#7c4f3c', roof: '#b89b77', floor: '#eadbc8', metal: '#483a31' },
    };
    const style = materials[palette] || materials.resort;
    const floorColors = { bedroom: '#dfe3ee', majlis: '#ead9bb', living: '#d7e8df', dining: '#eee3cf', kitchen: '#dce8d3', bath: '#dcecf1', storage: '#e6e1da', service: '#ead9d5', corridor: '#eee9df' };
    const addBox = (...args) => this.mesh(...args);

    // Site, streets, entry walk and a raised architectural plinth.
    addBox(p.width / 2, -.18, -p.length / 2, p.width + 3, .28, p.length + 3, '#aebd9d', 0, 1, { roughness: 1, receiveShadow: true });
    const road = '#777b7c';
    if (p.streets.s) addBox(p.width / 2, -.12, 1.15, p.width + 3, .12, 2.1, road);
    if (p.streets.n) addBox(p.width / 2, -.12, -p.length - 1.15, p.width + 3, .12, 2.1, road);
    if (p.streets.w) addBox(-1.15, -.12, -p.length / 2, 2.1, .12, p.length + 3, road);
    if (p.streets.e) addBox(p.width + 1.15, -.12, -p.length / 2, 2.1, .12, p.length + 3, road);
    if (model.massingParts?.length) {
      model.massingParts.forEach(part => addBox(part.x + part.w / 2, -.005, -part.y - part.h / 2, part.w + .3, .16, part.h + .3, '#d4c7b6', 0, 1, { receiveShadow: true }));
      model.courtyards?.forEach(court => addBox(court.x + court.w / 2, .005, -court.y - court.h / 2, court.w, .03, court.h, '#b9c99a', 0, 1, { receiveShadow: true }));
    } else addBox(b.x + b.w / 2, -.005, -b.y - b.h / 2, b.w + .3, .16, b.h + .3, '#d4c7b6', 0, 1, { receiveShadow: true });

    const externalDoor = model.openings.find(o => o.type === 'door' && o.connects?.includes('outside'));
    if (externalDoor) {
      const ep = openingPoint(model, externalDoor), entry = model.plot.entry;
      if (entry === 's') addBox(ep.x, .02, -ep.y / 2, 1.45, .08, Math.max(.2, ep.y), '#c9b18d');
      if (entry === 'n') addBox(ep.x, .02, -(ep.y + p.length) / 2, 1.45, .08, Math.max(.2, p.length - ep.y), '#c9b18d');
      if (entry === 'w') addBox(ep.x / 2, .02, -ep.y, Math.max(.2, ep.x), .08, 1.45, '#c9b18d');
      if (entry === 'e') addBox((ep.x + p.width) / 2, .02, -ep.y, Math.max(.2, p.width - ep.x), .08, 1.45, '#c9b18d');
      addBox(ep.x, 2.65, -ep.y, externalDoor.w + 1.35, .18, 1.25, style.accent, entry === 'e' || entry === 'w' ? Math.PI / 2 : 0, 1, { metalness: .05 });
      for (const side of [-1, 1]) {
        const sideways = entry === 'e' || entry === 'w';
        addBox(ep.x + (sideways ? 0 : side * (externalDoor.w + 1) / 2), 1.3, -ep.y + (sideways ? side * (externalDoor.w + 1) / 2 : 0), .12, 2.6, .12, style.metal);
      }
    }

    // Floor finishes and furniture groups remain explicitly schematic, but read at architectural scale.
    model.corridors.forEach(r => addBox(r.x + r.w / 2, .085, -r.y - r.h / 2, r.w, .035, r.h, '#eee8da', 0, 1, { roughness: .62 }));
    model.rooms.forEach(r => {
      addBox(r.x + r.w / 2, .09, -r.y - r.h / 2, r.w, .04, r.h, floorColors[r.type] || TYPES[r.type].color, 0, 1, { roughness: .58 });
      if (r.type === 'bedroom' && r.w >= 2.5 && r.h >= 2.5) {
        addBox(r.x + 1.05, .24, -r.y - r.h + 1.25, 1.55, .32, 2.05, '#b9b4aa');
        addBox(r.x + 1.05, .47, -r.y - r.h + 1.25, 1.48, .16, 1.96, '#e9e5dc');
        addBox(r.x + 1.05, .59, -r.y - r.h + .52, 1.3, .12, .38, '#f7f4ed');
        addBox(r.x + r.w - .38, .95, -r.y - r.h / 2, .48, 1.78, Math.min(2.2, r.h - .5), '#887966');
      } else if (r.type === 'majlis' || r.type === 'living') {
        const sofa = r.type === 'majlis' ? '#b9986f' : '#779da0';
        addBox(r.x + r.w / 2, .3, -r.y - .48, Math.max(1.1, r.w - .7), .5, .58, sofa);
        addBox(r.x + .48, .3, -r.y - r.h / 2, .58, .5, Math.max(1.1, r.h - 1), sofa);
        addBox(r.x + r.w / 2, .25, -r.y - r.h / 2, Math.min(1.45, r.w * .32), .36, Math.min(1.2, r.h * .28), '#76563c');
      } else if (r.type === 'dining') {
        addBox(r.x + r.w / 2, .42, -r.y - r.h / 2, Math.min(2.5, r.w * .52), .14, Math.min(1.3, r.h * .38), '#75543a');
        for (const [dx, dz] of [[-.9, -.72], [.9, -.72], [-.9, .72], [.9, .72]]) addBox(r.x + r.w / 2 + dx, .28, -r.y - r.h / 2 + dz, .42, .52, .42, '#ad9d84');
      } else if (r.type === 'kitchen') {
        addBox(r.x + r.w / 2, .46, -r.y - r.h + .34, Math.max(.6, r.w - .35), .88, .58, '#9fab91');
        if (r.w > 3.2 && r.h > 3) addBox(r.x + r.w / 2, .48, -r.y - r.h / 2, Math.min(1.8, r.w - 1.2), .9, .72, '#c4b69d');
      } else if (r.type === 'bath') {
        addBox(r.x + .5, .27, -r.y - r.h + .6, .5, .5, .7, '#edf3f2');
        addBox(r.x + r.w - .4, .48, -r.y - .42, .55, .9, .5, '#d5e3e2', 0, .5, { glass: true });
      } else if (r.type === 'storage' || r.type === 'service') addBox(r.x + r.w / 2, .78, -r.y - .32, Math.max(.4, r.w - .35), 1.5, .34, '#9f9584');
    });

    // Exact wall pieces keep door/window voids physically open; exterior receives the selected material system.
    this.pieces.forEach(piece => addBox(piece.x, piece.bottom + piece.height / 2, -piece.y, piece.length, piece.height, piece.thickness, piece.type === 'ext' ? style.facade : '#f2eee6', piece.angle, 1, { roughness: piece.type === 'ext' ? .72 : .9 }));
    model.openings.forEach(o => {
      const wall = model.walls.find(w => w.id === o.wallId), point = openingPoint(model, o), angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
      if (o.type === 'window') {
        addBox(point.x, o.sill + o.h / 2, -point.y, o.w, o.h, .045, '#78aeba', angle, .34, { glass: true, metalness: .12 });
        const ux = Math.cos(angle), uz = -Math.sin(angle), half = Math.max(0, o.w / 2 - .035);
        for (const sign of [-1, 1]) addBox(point.x + ux * half * sign, o.sill + o.h / 2, -point.y + uz * half * sign, .055, o.h + .12, .09, style.metal, angle, 1, { metalness: .35 });
        for (const y of [o.sill, o.sill + o.h, o.sill + o.h / 2]) addBox(point.x, y, -point.y, o.w + .1, .055, .09, style.metal, angle, 1, { metalness: .35 });
      } else {
        addBox(point.x, o.h / 2, -point.y, o.w, o.h, .055, o.roomId ? '#8c633d' : style.accent, angle + .28, 1, { roughness: .5 });
        addBox(point.x, o.h + .045, -point.y, o.w + .16, .09, .12, style.metal, angle);
      }
    });

    // Roof is split by room and circulation zone, making every planning strategy legible as massing.
    this.roof = new T.Group(); this.group.add(this.roof);
    model.rooms.forEach(r => {
      const lift = concept === 'twin-wings' ? (r.resolvedSide === 'left' ? .12 : 0) : concept === 'garden-front' && r.position === 'front' ? .16 : 0;
      addBox(r.x + r.w / 2, 3.29 + lift, -r.y - r.h / 2, r.w + .08, .2, r.h + .08, style.roof, 0, 1, { parent: this.roof, roughness: .82 });
    });
    model.corridors.forEach((r, i) => addBox(r.x + r.w / 2, 3.34 + (concept === 'spine' && i === 0 ? .22 : 0), -r.y - r.h / 2, r.w + .14, .18, r.h + .14, concept === 'spine' && i === 0 ? style.accent : style.roof, 0, 1, { parent: this.roof }));
    const parapet = palette === 'modern' ? .34 : .5;
    const parapetRects = model.massingParts?.length ? model.massingParts : [b];
    parapetRects.forEach(r => {
      for (const [x, z, w, d] of [[r.x + r.w / 2, -r.y, r.w + .35, .16], [r.x + r.w / 2, -r.y - r.h, r.w + .35, .16], [r.x, -r.y - r.h / 2, .16, r.h], [r.x + r.w, -r.y - r.h / 2, .16, r.h]]) addBox(x, 3.5, z, w, parapet, d, style.accent, 0, 1, { parent: this.roof });
    });
    this.roof.visible = false;

    // Landscape and shade elements distinguish the architectural concepts without external images.
    const outside = (x, y) => x < b.x - .7 || x > b.x + b.w + .7 || y < b.y - .7 || y > b.y + b.h + .7;
    [[1, 1], [p.width - 1, 1], [1, p.length - 1], [p.width - 1, p.length - 1]].filter(([x, y]) => outside(x, y)).forEach(([x, y], i) => {
      addBox(x, .65, -y, .22, 1.3, .22, '#70543a');
      addBox(x, 1.55, -y, 1.05, .72, 1.05, i % 2 ? '#507455' : '#60835d');
      addBox(x, 2.05, -y, .72, .55, .72, '#6f9265');
    });
    if (concept === 'garden-front' || palette === 'resort') {
      const gy = model.plot.entry === 'n' ? b.y - .9 : b.y + b.h + .9;
      for (let i = -2; i <= 2; i++) addBox(b.x + b.w / 2 + i * 1.05, 2.35, -gy, .09, .16, 2.1, style.accent);
      for (const i of [-2.1, 2.1]) addBox(b.x + b.w / 2 + i, 1.15, -gy, .12, 2.3, .12, style.metal);
    }
    if (palette === 'hijazi') {
      const frontY = model.plot.entry === 'n' ? b.y + b.h : b.y;
      for (let x = b.x + .8; x < b.x + b.w - .4; x += 1.15) addBox(x, 2.35, -frontY, .16, 1.3, .18, '#6f4434');
    }

    const points = [[0, 0], [p.width, 0], [p.width, p.length], [0, p.length], [0, 0]].map(([x, y]) => new T.Vector3(x, .07, -y));
    const line = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineDashedMaterial({ color: 0x93753f, dashSize: .4, gapSize: .3 })); line.computeLineDistances(); this.group.add(line);
    this.view('persp'); this.resize();
  }
  view(name) {
    if (!this.model) return;
    this.stopOrbit();
    this.mode = 'orbit'; const b = this.model.building, s = Math.max(b.w, b.h);
    this.target.set(b.x + b.w / 2, .8, -b.y - b.h / 2);
    this.phi = name === 'top' ? .02 : name === 'front' ? 1.42 : .65;
    this.theta = name === 'front' ? ({ s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[this.model.plot.entry]) : Math.PI * .23;
    const aspect = Math.max(.35, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    this.radius = s * (name === 'front' ? 1.35 : Math.max(1.18, .96 / aspect));
    this.onMode?.('orbit', name); this.render();
  }
  enter(id) {
    this.stopOrbit();
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
  setSun(preview) {
    if (!this.sunLight) return;
    if (!preview?.visible || !Number.isFinite(preview.altitude) || preview.altitude <= 0) {
      this.sunLight.visible = false;
      if (this.ambientLight) this.ambientLight.intensity = .5;
      if (this.fillLight) this.fillLight.intensity = .22;
      this.render(); return;
    }
    this.sunLight.visible = true;
    if (this.ambientLight) this.ambientLight.intensity = Math.max(.75, Math.min(1.8, .75 + preview.altitude / 55));
    if (this.fillLight) this.fillLight.intensity = .55;
    const rad = preview.azimuth * Math.PI / 180;
    const altitude = Math.max(.035, preview.altitude * Math.PI / 180);
    const distance = Math.max(55, (this.model?.plot?.length || 0) * 1.6, (this.model?.plot?.width || 0) * 1.6);
    const origin = this.sunLight.target?.position || { x: 0, y: 0, z: 0 };
    this.sunLight.position.set(
      origin.x + Math.sin(rad) * Math.cos(altitude) * distance,
      origin.y + Math.sin(altitude) * distance,
      origin.z - Math.cos(rad) * Math.cos(altitude) * distance
    );
    this.sunLight.intensity = Math.max(.45, Math.min(3.1, .5 + preview.altitude / 25));
    this.render();
  }
  startOrbit() {
    if (!this.model || typeof requestAnimationFrame !== 'function') return false;
    if (this.mode !== 'orbit') this.view('persp');
    if (this.autoOrbit) return true;
    this.autoOrbit = true; this.orbitLast = 0;
    const tick = now => {
      if (!this.autoOrbit) return;
      const elapsed = this.orbitLast ? Math.min(64, now - this.orbitLast) : 16;
      this.orbitLast = now;
      if (this.visible) { this.theta += elapsed * .00013; this.render(); }
      this.orbitFrame = requestAnimationFrame(tick);
    };
    this.orbitFrame = requestAnimationFrame(tick);
    return true;
  }
  stopOrbit() {
    this.autoOrbit = false; this.orbitLast = 0;
    if (this.orbitFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.orbitFrame);
    this.orbitFrame = 0;
  }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false); this.render();
  }
  setVisible(show) { this.visible = show; if (!show) this.stopOrbit(); if (show) this.resize(); }
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
  destroy() { this.stopOrbit(); this.abort.abort(); this.resizeObserver.disconnect(); this.clear(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
