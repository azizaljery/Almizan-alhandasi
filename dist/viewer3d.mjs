import { circulationNetwork } from './circulation.mjs';
import { center, openingPoint, wallPieces } from './planner.mjs';
import { architecturalTextures, beveledBox, applyMeterTextureScale } from './architectural-materials.mjs';
import { solarVectors } from './solar-path.mjs';
import { furnishRoom } from './furniture3d.mjs';

export class RoomViewer {
  constructor(container, onMode, options = {}) {
    const T = globalThis.THREE;
    if (!T) throw Error('تعذّر تحميل مكتبة 3D. مخطط 2D يعمل؛ تحقّق من الاتصال ثم أعد المحاولة.');
    this.quality = { tier: 'balanced', reason: 'initial conservative limits', frames: 0, slowFrames: 0, complexFrames: 0, lastRenderMs: 0, pixelRatioCap: 1.5, shadowMapSize: 1024 };
    this.now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
    this.options = options; this.onState = options.onState; this.transitionMs = options.transitionMs ?? 320; this.frameId = null; this.transition = null; this.contextLost = false; this.destroyed = false; this.roofChoice = false; this.illustrativeFurniture = options.illustrativeFurniture === true;
    this.motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = options.reducedMotion ?? this.motionQuery?.matches ?? false;
    this.T = T; this.container = container; this.onMode = onMode; this.visible = true; this.mode = 'orbit';
    this.abort = new AbortController(); this.pointers = new Map(); this.scene = new T.Scene();
    this.scene.background = new T.Color('#edf0f2');
    this.camera = new T.PerspectiveCamera(42, 1, .05, 700);
    try { this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { throw Error('عرض 3D يحتاج WebGL، وهو غير متاح في هذا المتصفح. يمكنك متابعة المخطط 2D.'); }
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    if (T.ACESFilmicToneMapping) this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .95;
    this.textures = architecturalTextures(T);
    if (this.renderer.shadowMap) { this.renderer.shadowMap.enabled = true; if (T.PCFSoftShadowMap) this.renderer.shadowMap.type = T.PCFSoftShadowMap; }
    const canvas = this.renderer.domElement;
    for (const texture of Object.values(this.textures)) texture.anisotropy = Math.min(4, this.renderer.capabilities?.getMaxAnisotropy?.() ?? 1);
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'عرض ثلاثي الأبعاد. اسحب للتدوير؛ داخل الغرفة استخدم الأسهم أو أزرار الحركة.');
    container.prepend(canvas);
    this.ambientLight = new T.HemisphereLight(0xffffff, 0xb9bec6, 1.5); this.scene.add(this.ambientLight);
    const light = new T.DirectionalLight(0xffefd3, 2.7); this.sunLight = light; light.position.set(-28, 48, 18); light.castShadow = true; light.visible = false;
    if (light.shadow?.mapSize) {
      light.shadow.mapSize.width = 1024; light.shadow.mapSize.height = 1024;
      light.shadow.camera.near = 1; light.shadow.camera.far = 180;
      light.shadow.bias = -.00015; light.shadow.normalBias = .025;
    }
    this.scene.add(light);
    if (light.target) this.scene.add(light.target);
    const fill = new T.DirectionalLight(0xf3f6ff, .55); this.fillLight = fill; fill.intensity = .55; fill.castShadow = false; fill.position.set(24, 18, -35); this.scene.add(fill);
    // Neutral studio illumination keeps unknown-location/night previews readable.
    // It is not a physical sun or an illuminance simulation and casts no solar shadows.
    this.ambientLight.intensity = 1.5;
    this.studioLight = new T.DirectionalLight(0xfffaf3, 1.8); this.studioLight.intensity = 1.8; this.studioLight.castShadow = false;
    this.studioLight.position.set(-18, 30, 24); this.scene.add(this.studioLight); this.lightingMode = 'studio-preview';
    this.group = new T.Group(); this.scene.add(this.group);
    this.target = new T.Vector3(); this.theta = Math.PI * .23; this.phi = .65; this.radius = 35; this.yaw = 0; this.pitch = 0;
    const on = (event, handler, options = {}) => canvas.addEventListener(event, handler, { ...options, signal: this.abort.signal });
    on('pointerdown', e => { if (e.button !== 0) return; this.cancelTransition(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
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
      e.preventDefault(); this.cancelTransition();
      if (this.mode === 'inside') this.move(e.deltaY > 0 ? 'back' : 'forward', .3);
      else { this.radius = Math.max(4, Math.min(240, this.radius * Math.exp(Math.max(-200, Math.min(200, e.deltaY)) * .002))); this.render(); }
    }, { passive: false });
    on('keydown', e => {
      const keys = { ArrowUp: 'forward', w: 'forward', ArrowDown: 'back', s: 'back', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
      if (this.mode === 'inside' && keys[e.key]) { e.preventDefault(); this.move(keys[e.key], .28); }
      if (e.key === 'Escape') this.view('persp');
    });
    on('webglcontextlost', e => { e.preventDefault(); this.contextLost = true; this.cancelTransition(); this.pointers.clear(); this.emitState('context-lost', 'توقف عرض 3D مؤقتًا؛ مخططك محفوظ ويمكن متابعة 2D.'); });
    on('webglcontextrestored', () => {
      this.emitState('restoring', 'جارٍ استعادة عرض 3D…');
      try { this.contextLost = false; Object.values(this.textures).forEach(texture => { texture.needsUpdate = true; }); this.resize(); this.emitState('ready', 'عاد عرض 3D دون تغيير المخطط.'); }
      catch { this.contextLost = true; this.emitState('unavailable', 'تعذرت استعادة 3D؛ مخطط 2D محفوظ ومتاح.'); }
    });
    this.motionQuery?.addEventListener?.('change', e => { if (this.options.reducedMotion !== undefined) return; this.reducedMotion = e.matches; if (e.matches) this.cancelTransition(true); }, { signal: this.abort.signal });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
  }
  emitState(status, message) { this.onState?.({ status, message, mode: this.mode, view: this.currentViewName || 'persp' }); }
  clear() {
    const geometries = new Set(), materials = new Set();
    this.group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
    this.group.clear(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
  mesh(x, y, z, w, h, d, color, rotation = 0, opacity = 1, options = {}) {
    const T = this.T;
    const Material = options.glass && T.MeshPhysicalMaterial ? T.MeshPhysicalMaterial : T.MeshStandardMaterial;
    const texture = this.textures[options.texture];
    const material = new Material({ color, roughness: options.roughness ?? (options.glass ? .12 : .78), metalness: options.metalness ?? 0, transparent: opacity < 1 || options.glass, opacity, depthWrite: !(options.glass || opacity < .55), ...(texture ? { map: texture, bumpMap: texture, bumpScale: options.texture === 'stone' ? .002 : .001 } : {}), ...(options.glass ? { transmission: .35, thickness: .05, ior: 1.45 } : {}) });
    const sizes = [w, h, d].map(v => Math.max(.01, v));
    const geometry = options.rounded ? beveledBox(T, ...sizes) : new T.BoxGeometry(...sizes);
    if (texture) applyMeterTextureScale(geometry, options.texture === 'wood' ? 1.8 : 2.4);
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z); m.rotation.y = rotation; m.castShadow = options.castShadow ?? !options.glass; m.receiveShadow = options.receiveShadow ?? !options.glass;
    (options.parent || this.group).add(m); return m;
  }
  sphere(x, y, z, radius, color, options = {}) {
    const T = this.T, scale = options.scale || [1, 1, 1];
    if (!T.SphereGeometry) return this.mesh(x, y, z, radius * 2 * scale[0], radius * 2 * scale[1], radius * 2 * scale[2], color);
    const m = new T.Mesh(new T.SphereGeometry(radius, 12, 8), new T.MeshStandardMaterial({ color, roughness: options.roughness ?? .75, metalness: options.metalness ?? 0 }));
    m.position.set(x, y, z); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m); return m;
  }
  setModel(model, palette = 'modern') {
    this.cancelTransition(); this.pointers.clear(); this.clear(); this.model = model; this.pieces = wallPieces(model);
    const b = model.building, p = model.plot, T = this.T;
    const materials = {
      resort: { facade: '#ead9bc', accent: '#8e6948', roof: '#d2bea0', floor: '#eee5d5', metal: '#604d3b' },
      modern: { facade: '#f4f2ed', accent: '#5a6666', roof: '#d8d6cf', floor: '#e8e4dc', metal: '#303839' },
      classic: { facade: '#e5d3b6', accent: '#a77d49', roof: '#c5ad88', floor: '#eee2ce', metal: '#5c4936' },
      hijazi: { facade: '#d7bea0', accent: '#7c4f3c', roof: '#b89b77', floor: '#eadbc8', metal: '#483a31' },
    };
    const style = materials[palette] || materials.resort;
    const addBox = (...args) => this.mesh(...args);

    // Site, streets, entry walk and a raised architectural plinth.
    addBox(p.width / 2, -.18, -p.length / 2, p.width + 3, .28, p.length + 3, '#b8c0b0', 0, 1, { roughness: 1, receiveShadow: true });
    const road = '#777b7c';
    if (p.streets.s) addBox(p.width / 2, -.12, 1.15, p.width + 3, .12, 2.1, road);
    if (p.streets.n) addBox(p.width / 2, -.12, -p.length - 1.15, p.width + 3, .12, 2.1, road);
    if (p.streets.w) addBox(-1.15, -.12, -p.length / 2, 2.1, .12, p.length + 3, road);
    if (p.streets.e) addBox(p.width + 1.15, -.12, -p.length / 2, 2.1, .12, p.length + 3, road);
    if (model.massingParts?.length) {
      model.massingParts.forEach(part => addBox(part.x + part.w / 2, -.005, -part.y - part.h / 2, part.w, .16, part.h, '#d4c7b6', 0, 1, { receiveShadow: true }));
      model.courtyards?.forEach(court => addBox(court.x + court.w / 2, .005, -court.y - court.h / 2, court.w, .03, court.h, '#b9c99a', 0, 1, { receiveShadow: true }));
    } else addBox(b.x + b.w / 2, -.005, -b.y - b.h / 2, b.w, .16, b.h, '#d4c7b6', 0, 1, { receiveShadow: true });

    // Physical surface maps and detailed furniture share the exact room footprint.
    model.corridors.forEach(r => addBox(r.x + r.w / 2, .085, -r.y - r.h / 2, r.w, .035, r.h, '#cec7b8', 0, 1, { texture: 'stone', roughness: .72 }));
    model.rooms.forEach(r => {
      const texture = r.type === 'bedroom' || r.type === 'living' || r.type === 'majlis' ? 'wood' : r.type === 'bath' || r.type === 'kitchen' ? 'tile' : 'stone';
      const color = texture === 'wood' ? '#bfae95' : texture === 'tile' ? '#cbd1cf' : '#c9c4b8';
      addBox(r.x + r.w / 2, .09, -r.y - r.h / 2, r.w, .04, r.h, color, 0, 1, { texture, roughness: texture === 'tile' ? .58 : .76 });
      if (this.illustrativeFurniture) furnishRoom(this, r, palette);
    });

    // Exact wall pieces keep door/window voids physically open; exterior receives the selected material system.
    this.pieces.forEach(piece => addBox(piece.x, piece.bottom + piece.height / 2, -piece.y, piece.length, piece.height, piece.thickness, piece.type === 'ext' ? style.facade : '#f2eee6', piece.angle, 1, { roughness: piece.type === 'ext' ? .72 : .9, texture: piece.type === 'ext' ? 'stone' : undefined }));
    model.openings.forEach(o => {
      const wall = model.walls.find(w => w.id === o.wallId), point = openingPoint(model, o), angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
      if (o.type === 'window') {
        addBox(point.x, o.sill + o.h / 2, -point.y, o.w, o.h, .045, '#9db7bd', angle, .34, { glass: true, metalness: .12 });

      }
    });

    // Roof is split by room and circulation zone, making every planning strategy legible as massing.
    this.roof = new T.Group(); this.group.add(this.roof);
    // A removable illustrative ceiling follows modeled zones at the modeled wall height.
    // It is not a structural roof specification; no parapets, overhangs or invented level changes.
    const wallTop = Math.max(...this.pieces.map(piece => piece.bottom + piece.height));
    [...model.rooms, ...model.corridors].forEach(r => addBox(r.x + r.w / 2, wallTop + .05, -r.y - r.h / 2, r.w, .1, r.h, style.roof, 0, 1, { parent: this.roof, roughness: .9 }));
    this.roof.visible = this.roofChoice;

    const points = [[0, 0], [p.width, 0], [p.width, p.length], [0, p.length], [0, 0]].map(([x, y]) => new T.Vector3(x, .07, -y));
    const line = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineDashedMaterial({ color: 0x93753f, dashSize: .4, gapSize: .3 })); line.computeLineDistances(); this.group.add(line);
    if (this.sunLight.target) this.sunLight.target.position.set(b.x + b.w / 2, 0, -b.y - b.h / 2);
    if (this.sunLight.shadow?.camera) {
      const extent = Math.max(p.width, p.length) * .8;
      Object.assign(this.sunLight.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: Math.max(180, extent * 5) });
      this.sunLight.shadow.camera.updateProjectionMatrix();
    }
    this.view('persp', { immediate: true }); this.resize();
  }
  view(name, { immediate = false } = {}) {
    if (!this.model) return;
    this.cancelTransition(); const start = this.orbitPose(), wasInside = this.mode === 'inside';
    this.currentViewName = name; this.mode = 'orbit'; const b = this.model.building;
    this.target.set(b.x + b.w / 2, .8, -b.y - b.h / 2);
    this.phi = name === 'top' ? .02 : name === 'front' ? 1.3 : .78;
    const entryAngle = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[this.model.plot.entry] || 0;
    this.theta = entryAngle + (name === 'front' ? .08 : Math.PI * .22);
    // Roof visibility is an explicit user choice; camera presets must not silently change it.
    const aspect = Math.max(.35, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    const halfFov = Math.atan(Math.tan(21 * Math.PI / 180) * Math.min(1, aspect));
    this.radius = Math.hypot(b.w, b.h) / (2 * Math.sin(halfFov)) * 1.06;
    if (this.roof) this.roof.visible = this.roofChoice;
    this.onMode?.('orbit', name);
    if (!immediate && !wasInside && !this.reducedMotion && this.visible && !this.contextLost && globalThis.requestAnimationFrame) this.animateOrbit(start, this.orbitPose());
    else this.render();
  }
  enter(id) {
    const r = this.model?.rooms.find(r => r.id === id); if (!r) return false;
    let route;
    try { route = circulationNetwork(this.model).toRoom(id); } catch { return false; }
    const p = route?.points.at(-1);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    const c = center(r);
    this.cancelTransition?.(); this.mode = 'inside'; this.eye = { x: c.x, y: c.y }; this.yaw = Math.atan2(p.x - c.x, p.y - c.y); this.pitch = -.06;
    this.roof.visible = false; this.onMode?.('inside', r.name); this.render(); this.renderer.domElement.focus({ preventScroll: true });
    return true;
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
    this.cancelTransition();
    const yaw = this.yaw + (direction === 'left' ? -Math.PI / 2 : direction === 'right' ? Math.PI / 2 : direction === 'back' ? Math.PI : 0);
    const steps = Math.ceil(amount / .07), dx = Math.sin(yaw) * amount / steps, dy = Math.cos(yaw) * amount / steps;
    for (let i = 0; i < steps; i++) { const x = this.eye.x + dx, y = this.eye.y + dy; if (this.blocked(x, y)) break; this.eye = { x, y }; }
    this.render();
  }
  setRoof(show) { this.roofChoice = !!show; if (this.roof) { this.roof.visible = show && this.mode !== 'inside'; this.render(); } }
  setSun(preview) {
    if (!this.sunLight) return;
    const direction = solarVectors(preview);
    if (!direction.visible || !direction.world || !this.model) {
      this.sunLight.visible = false;
      this.render();
      return;
    }
    this.sunLight.visible = true;
    const b = this.model.building;
    const distance = Math.max(52, Math.max(this.model.plot.width, this.model.plot.length) * 1.8);
    this.sunLight.position.set(b.x + b.w / 2 + direction.world.x * distance, direction.world.y * distance, -b.y - b.h / 2 + direction.world.z * distance);
    this.sunLight.intensity = Math.max(1.3, Math.min(3.5, 1.2 + preview.altitude / 28)); this.render();
  }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false); this.render();
  }
  setVisible(show) { this.visible = show; if (!show) this.cancelTransition(); if (show) this.resize(); }
  render() {
    if (this.destroyed || this.contextLost || !this.visible || !this.model || !this.container.clientWidth) return;
    if (this.mode === 'inside') {
      this.camera.position.set(this.eye.x, 1.6, -this.eye.y);
      this.camera.lookAt(this.eye.x + Math.sin(this.yaw) * Math.cos(this.pitch), 1.6 + Math.sin(this.pitch), -this.eye.y - Math.cos(this.yaw) * Math.cos(this.pitch));
    } else {
      this.camera.position.set(this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta));
      this.camera.lookAt(this.target);
    }
    const started = this.now(); this.renderer.render(this.scene, this.camera); this.measureQuality(Math.max(0, this.now() - started));
  }
  orbitPose() { return { theta: this.theta, phi: this.phi, radius: this.radius, x: this.target.x, y: this.target.y, z: this.target.z }; }
  applyOrbit(pose) { this.theta = pose.theta; this.phi = pose.phi; this.radius = pose.radius; this.target.set(pose.x, pose.y, pose.z); }
  cancelTransition(finish = false) {
    if (this.frameId !== null) globalThis.cancelAnimationFrame?.(this.frameId);
    if (finish && this.transition) this.applyOrbit(this.transition.end);
    this.frameId = null; this.transition = null;
    if (finish) this.render();
  }
  animateOrbit(start, end) {
    if (!(this.transitionMs > 0)) { this.applyOrbit(end); this.render(); return; }
    end.theta = start.theta + Math.atan2(Math.sin(end.theta - start.theta), Math.cos(end.theta - start.theta));
    const transition = { start, end, time: null }; this.transition = transition; this.applyOrbit(start); this.render();
    const tick = now => {
      if (this.transition !== transition || this.destroyed || this.contextLost) return;
      this.frameId = null;
      if (transition.time === null) transition.time = now;
      const progress = Math.min(1, Math.max(0, (now - transition.time) / this.transitionMs)), t = progress * progress * (3 - 2 * progress), pose = {};
      for (const key of Object.keys(start)) pose[key] = start[key] + (end[key] - start[key]) * t;
      this.applyOrbit(pose); this.render();
      if (progress < 1) this.frameId = globalThis.requestAnimationFrame(tick); else this.transition = null;
    };
    this.frameId = globalThis.requestAnimationFrame(tick);
  }
  measureQuality(renderMs) {
    const q = this.quality, info = this.renderer.info?.render;
    q.frames++; q.lastRenderMs = renderMs;
    q.slowFrames = renderMs > 22 ? q.slowFrames + 1 : 0;
    q.complexFrames = (info?.calls > 1000 || info?.triangles > 200000) ? q.complexFrames + 1 : 0;
    if (q.tier === 'balanced' && (q.slowFrames >= 12 || q.complexFrames >= 3)) {
      q.tier = 'low'; q.reason = q.slowFrames >= 12 ? '12 consecutive CPU render submissions above 22ms' : '3 consecutive frames above 1000 draw calls or 200000 triangles';
      q.pixelRatioCap = 1; q.shadowMapSize = 512; this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1));
      if (this.sunLight.shadow?.mapSize) {
        this.sunLight.shadow.mapSize.width = this.sunLight.shadow.mapSize.height = 512;
        this.sunLight.shadow.map?.dispose(); this.sunLight.shadow.map = null;
        this.sunLight.shadow.mapPass?.dispose(); this.sunLight.shadow.mapPass = null;
        this.sunLight.shadow.needsUpdate = true;
      }
    }
  }
  getPerformanceStats() {
    const info = this.renderer.info;
    return { ...this.quality, lightingMode: this.lightingMode, measurement: 'CPU render submission time, not GPU frame time', geometries: info?.memory?.geometries ?? null, textures: info?.memory?.textures ?? null, drawCalls: info?.render?.calls ?? null, triangles: info?.render?.triangles ?? null, animating: !!this.transition };
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.cancelTransition(); this.pointers.clear(); this.abort.abort(); this.resizeObserver.disconnect(); this.clear();
    new Set(Object.values(this.textures)).forEach(texture => texture.dispose()); this.textures = {};
    this.sunLight.shadow?.map?.dispose(); this.sunLight.shadow?.mapPass?.dispose(); this.renderer.renderLists?.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
