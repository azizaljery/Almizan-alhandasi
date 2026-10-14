// DrawViewer: the interactive 3D view of a drawing document.
//
//   const viewer = new DrawViewer(container, { THREE, onState });
//   viewer.setDoc(doc);
//   viewer.setMode('orbit' | 'dollhouse' | 'top' | 'walk' | 'section');
//
// Render on demand (no permanent loop): a requestAnimationFrame loop only runs while something moves
// (camera transition, inertia, walking).  Controls are implemented here (no OrbitControls addon).
import { buildBuildingScene, buildSectionCap, stairHeightAt } from './scene3d.mjs';
import { tagAt } from './meshbuilder.mjs';
import { pointInPolygon, bounds as boundsOf } from './geom.mjs';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const STYLES = Object.freeze({
  day: {
    zenith: '#5d92cf', horizon: '#dfeaf3', ground: '#d8d0bd', sun: '#fff1da', sunIntensity: 2.7, hemiSky: '#cfe2f5', hemiGround: '#b8a888', hemi: .42,
    env: 1.0, exposure: .9, fog: '#dde7ee', sunAltitude: 52, glassGlow: 0, lamp: 0.25,
  },
  dusk: {
    zenith: '#243257', horizon: '#f2a46b', ground: '#4b3f49', sun: '#ff9d5c', sunIntensity: 2.3, hemiSky: '#7d8cc0', hemiGround: '#4a3f45', hemi: .45,
    env: .62, exposure: 1.05, fog: '#c98d73', sunAltitude: 7, glassGlow: .55, lamp: 1.2,
  },
});

export class DrawViewer {
  constructor(container, { THREE, onState = null, shadows = true, shadowSize = 2048, antialias = true, preserveDrawingBuffer = false, maxPixelRatio = 2, autoSelect = true } = {}) {
    this.THREE = THREE || globalThis.THREE;
    if (!this.THREE) throw new Error('THREE is required');
    const T = this.THREE;
    this.container = container; this.onState = onState; this.autoSelect = autoSelect; this.maxPixelRatio = maxPixelRatio;
    this.shadowsOn = shadows; this.shadowSize = shadowSize;
    this.renderer = new T.WebGLRenderer({ antialias, preserveDrawingBuffer, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.enabled = shadows; r.shadowMap.type = T.PCFSoftShadowMap;
    r.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio));
    this.canvas = r.domElement; this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(42, 1, .6, 1200);
    this.scene.add(this.camera);
    this.sun = new T.DirectionalLight('#fff1da', 3.6);
    this.sun.castShadow = shadows; this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = .035; this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new T.HemisphereLight('#cfe2f5', '#b8a888', .55); this.scene.add(this.hemi);
    this.lamp = new T.PointLight('#ffe1b0', 0, 9, 2); this.scene.add(this.lamp); // walk-mode "headlamp" fill, off by default
    this.skyUniforms = { top: { value: new T.Color() }, horizon: { value: new T.Color() }, ground: { value: new T.Color() }, sunDir: { value: new T.Vector3(0, 1, 0) }, sunColor: { value: new T.Color() }, glow: { value: 1 } };
    this.sky = new T.Mesh(new T.SphereGeometry(1, 32, 16), this.makeSkyMaterial(false));
    this.sky.scale.setScalar(900); this.sky.renderOrder = -10; this.sky.frustumCulled = false; this.scene.add(this.sky);
    this.pmrem = new T.PMREMGenerator(r);
    this.envTarget = null;
    this.style = 'day'; this.sunState = { azimuthDeg: 135, altitudeDeg: STYLES.day.sunAltitude, north: 0 };
    this.mode = 'orbit'; this.built = null; this.doc = null;
    this.orbit = { target: new T.Vector3(), az: 35 * DEG, el: 24 * DEG, dist: 30, vAz: 0, vEl: 0, minDist: 2, maxDist: 400 };
    this.walk = { x: 0, y: 0, yaw: 0, pitch: 0, level: 0, floor: 0, eye: 1.6, speed: 1.9, input: { forward: 0, strafe: 0, turn: 0, run: false }, keys: new Set(), vYaw: 0, vPitch: 0 };
    this.visibleLevels = null; // null = all
    this.sectionHeight = 1.2; this.sectionCap = null; this.sectionPlane = new T.Plane(new T.Vector3(0, -1, 0), 1.2);
    this.selected = null; this.highlight = null;
    this.tween = null; this.rafId = 0; this.needsRender = true; this.lastT = 0; this.frameMs = 0; this.disposed = false; this.lost = false;
    this.pointers = new Map(); this.drag = null;
    this.bind();
    this.resize();
    this.applyStyle();
    this.requestRender();
  }

  // ---------------------------------------------------------------------------------------------------------- sky / environment
  makeSkyMaterial() {
    const T = this.THREE;
    return new T.ShaderMaterial({
      uniforms: this.skyUniforms, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; uniform float glow; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, ground, clamp(-h * 3.0, 0.0, 1.0));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunColor * (pow(s, 600.0) * 3.0 + pow(s, 14.0) * 0.18) * glow; gl_FragColor = vec4(c, 1.0); }`,
    });
  }

  rebuildEnvironment() {
    const T = this.THREE, S = STYLES[this.style];
    const envScene = new T.Scene();
    const mat = new T.ShaderMaterial({
      uniforms: { top: { value: new T.Color(S.zenith) }, horizon: { value: new T.Color(S.horizon) }, ground: { value: new T.Color(S.ground).multiplyScalar(.7) }, sunDir: this.skyUniforms.sunDir, sunColor: { value: new T.Color(S.sun).multiplyScalar(6) } },
      side: T.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5)) * 1.15 : mix(horizon * 0.7, ground, clamp(-h * 2.5, 0.0, 1.0));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunColor * (pow(s, 90.0) * 1.2 + pow(s, 12.0) * 0.12); gl_FragColor = vec4(c, 1.0); }`,
    });
    envScene.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), mat));
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(envScene, .02);
    this.scene.environment = this.envTarget.texture;
    mat.dispose(); envScene.children[0].geometry.dispose();
  }

  applyStyle() {
    const T = this.THREE, S = STYLES[this.style];
    this.skyUniforms.top.value.set(S.zenith); this.skyUniforms.horizon.value.set(S.horizon); this.skyUniforms.ground.value.set(S.ground); this.skyUniforms.sunColor.value.set(S.sun);
    // The visible sky dome writes raw colours to the canvas (no tone mapping), so it needs the sRGB numbers, not linear ones.
    for (const k of ['top', 'horizon', 'ground', 'sunColor']) this.skyUniforms[k].value.convertLinearToSRGB();
    this.scene.fog = new T.Fog(new T.Color(S.fog), 90, 420);
    this.sun.color.set(S.sun); this.sun.intensity = S.sunIntensity; this.hemi.color.set(S.hemiSky); this.hemi.groundColor.set(S.hemiGround); this.hemi.intensity = S.hemi;
    this.renderer.toneMappingExposure = S.exposure;
    this.updateSunVector();
    this.rebuildEnvironment();
    if (this.built) {
      const m = this.built.lib.m;
      for (const mat of Object.values({ ...m, ...this.built.lib.fixtures })) if (mat.isMeshStandardMaterial) { mat.envMapIntensity = (mat.userData.baseEnv ??= mat.envMapIntensity) * S.env; }
      m.glass.emissive.set(S.glassGlow ? '#ffd08a' : '#000000'); m.glass.emissiveIntensity = S.glassGlow;
      const ls = this.built.lib.fixtures.lampShade; if (ls) ls.emissiveIntensity = S.lamp;
    }
  }

  setStyle(name) {
    if (!STYLES[name]) return;
    this.style = name;
    if (name === 'dusk' && this.sunState.altitudeDeg > 20) this.sunState = { ...this.sunState, altitudeDeg: STYLES.dusk.sunAltitude };
    if (name === 'day' && this.sunState.altitudeDeg < 20) this.sunState = { ...this.sunState, altitudeDeg: STYLES.day.sunAltitude };
    this.applyStyle(); this.fitShadow(); this.emit('style'); this.requestRender();
  }

  /** Sun in compass terms: azimuth clockwise from north, altitude above the horizon; `north` = plan rotation of north (degrees, clockwise from plan-up). */
  setSun({ azimuthDeg = this.sunState.azimuthDeg, altitudeDeg = this.sunState.altitudeDeg, north = this.sunState.north } = {}) {
    this.sunState = { azimuthDeg, altitudeDeg: clamp(altitudeDeg, 1, 89), north };
    this.updateSunVector(); this.fitShadow(); this.emit('sun'); this.requestRender();
  }

  /** Unit vector from the ground towards the sun, in three.js coordinates. */
  sunDirection() {
    const { azimuthDeg, altitudeDeg, north } = this.sunState, az = azimuthDeg * DEG, al = altitudeDeg * DEG, n = north * DEG;
    const east = Math.sin(az) * Math.cos(al), nor = Math.cos(az) * Math.cos(al);
    // plan basis: true north is (sin n, cos n) in plan, true east is (cos n, -sin n)
    const px = east * Math.cos(n) + nor * Math.sin(n), py = -east * Math.sin(n) + nor * Math.cos(n);
    return new this.THREE.Vector3(px, Math.sin(al), -py).normalize();
  }
  updateSunVector() { this.skyUniforms.sunDir.value.copy(this.sunDirection()); }

  fitShadow() {
    const b = this.built?.bounds; if (!b) return;
    const T = this.THREE, c = new T.Vector3((b.x0 + b.x1) / 2, (b.minY + b.maxY) / 2, -(b.y0 + b.y1) / 2);
    const plot = this.built.plotBounds, ex = plot ? Math.max(plot.w, plot.h) * .5 : 0;
    const R = Math.max(Math.hypot(b.w, b.h) / 2 + 3, Math.min(ex * .8 + 2, 26), 8);
    const dir = this.sunDirection();
    this.sun.position.copy(c).addScaledVector(dir, R * 3); this.sun.target.position.copy(c); this.sun.target.updateMatrixWorld();
    const cam = this.sun.shadow.camera; cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = R * 1.2; cam.far = R * 5.4; cam.updateProjectionMatrix();
    this.sun.shadow.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------------------- document
  setDoc(doc, options = {}) {
    if (this.built) { this.scene.remove(this.built.group); this.built.dispose(); this.built = null; }
    this.clearHighlight(); this.clearSection();
    this.doc = doc;
    this.built = buildBuildingScene(doc, this.THREE, { maxAnisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy()), ...options });
    this.scene.add(this.built.group);
    this.pickables = [];
    this.built.group.traverse(o => { if (o.isMesh) { const p = o.parent?.name; if (['walls', 'floors', 'fixtures', 'openings', 'stairs'].includes(p)) this.pickables.push(o); } });
    this.visibleLevels = null;
    if (doc.north !== undefined) this.sunState = { ...this.sunState, north: doc.north || 0 };
    this.applyStyle();
    this.fitShadow();
    if (options.keepCamera && this.built.bounds) { if (this.mode !== 'walk') this.applyOrbitCamera(); } else this.frameBuilding();
    this.applyVisibility();
    this.emit('doc');
    this.requestRender();
    return this.built;
  }

  getBuilt() { return this.built; }
  center() { const b = this.built.bounds; return new this.THREE.Vector3((b.x0 + b.x1) / 2, (b.minY + b.maxY) / 2 + 1, -(b.y0 + b.y1) / 2); }
  radius() { const b = this.built.bounds, p = this.built.plotBounds; return Math.max(Math.hypot(b.w, b.h) / 2, p ? Math.max(p.w, p.h) * .38 : 0, 5); }

  frameBuilding() {
    if (!this.built) return;
    const R = this.radius(), fov = this.camera.fov * DEG;
    Object.assign(this.orbit, { target: this.center(), dist: clamp(R / Math.sin(fov / 2) * 1.15, 6, 300), minDist: 2, maxDist: R * 14 });
    this.orbit.target.y = Math.max(1.5, this.built.bounds.maxY * .42);
    if (this.mode !== 'walk') this.applyOrbitCamera();
  }

  // ---------------------------------------------------------------------------------------------------------- visibility
  levelIndex(ref) { if (typeof ref === 'number') return ref; return this.built?.levels.findIndex(l => l.id === ref) ?? -1; }
  showLevel(ref) {
    if (!this.built) return;
    if (ref === 'all' || ref == null) this.visibleLevels = null; else { const i = this.levelIndex(ref); this.visibleLevels = new Set(this.built.levels.filter(l => l.index <= i).map(l => l.id)); }
    this.applyVisibility(); this.emit('level'); this.requestRender();
  }
  isolateLevel(ref) {
    if (!this.built) return;
    const i = this.levelIndex(ref); if (i < 0) return;
    this.visibleLevels = new Set([this.built.levels[i].id]);
    this.applyVisibility(); this.emit('level'); this.requestRender();
  }
  applyVisibility() {
    if (!this.built) return;
    const cut = this.mode === 'dollhouse' || this.mode === 'top';
    const topShown = Math.max(...this.built.levels.filter(l => !this.visibleLevels || this.visibleLevels.has(l.id)).map(l => l.index), 0);
    for (const lv of this.built.levels) {
      const on = !this.visibleLevels || this.visibleLevels.has(lv.id);
      lv.group.visible = on;
      const open = cut && lv.index === topShown;
      lv.parts.ceilings.visible = !open; lv.parts.roof.visible = !open;
      // when only lower levels are shown, the topmost shown level is open from above
      if (!cut && this.visibleLevels && lv.index === topShown && lv.index < this.built.levels.length - 1) { lv.parts.ceilings.visible = false; }
    }
    if (this.built.site) this.built.site.group.visible = true;
  }

  // ---------------------------------------------------------------------------------------------------------- modes & camera
  setMode(mode, { animate = true, duration = 700 } = {}) {
    if (!this.built || !['orbit', 'dollhouse', 'top', 'walk', 'section'].includes(mode)) { this.mode = mode; return; }
    const prev = this.mode, from = this.currentPose();
    if (prev === 'walk') this.leaveWalk();
    this.mode = mode;
    this.clearSection();
    const R = this.radius(), fov = this.camera.fov * DEG, base = clamp(R / Math.sin(fov / 2) * 1.15, 6, 300);
    if (mode === 'orbit') Object.assign(this.orbit, { az: this.orbit.az, el: clamp(this.orbit.el, 8 * DEG, 40 * DEG), dist: Math.max(this.orbit.dist, base * .6) });
    if (mode === 'dollhouse') { this.fixOrbitForBuilding(); Object.assign(this.orbit, { el: 52 * DEG, dist: clamp(R * 2.15 / Math.sin(fov / 2) * .68, 7, 120) }); this.orbit.target.copy(this.center()); this.orbit.target.y = this.built.levels[0].elevation + 1.2; }
    if (mode === 'top') { this.fixOrbitForBuilding(); Object.assign(this.orbit, { az: 0, el: 89.8 * DEG, dist: clamp(R * 1.5 / Math.sin(fov / 2) * .9, 7, 150) }); this.orbit.target.copy(this.center()); this.orbit.target.y = 0; }
    if (mode === 'section') { this.fixOrbitForBuilding(); Object.assign(this.orbit, { el: 50 * DEG, dist: clamp(R * 1.5 / Math.sin(fov / 2) * .8, 7, 120) }); this.orbit.target.copy(this.center()); this.orbit.target.y = 1.0; this.enableSection(this.sectionHeight); }
    this.applyVisibility();
    // a tight near plane is only needed indoors; outdoors a far one keeps the depth buffer precise (no z-fighting on the paving)
    if (mode === 'walk') { this.camera.fov = 72; this.camera.near = .06; this.camera.updateProjectionMatrix(); this.enterWalk(); } else { this.camera.fov = 42; this.camera.near = .6; this.camera.updateProjectionMatrix(); }
    const to = mode === 'walk' ? this.walkPose() : this.orbitPose();
    if (animate && prev !== mode && from) this.startTween(from, to, duration, () => { if (mode !== 'walk') this.applyOrbitCamera(); }); else { this.applyPose(to); }
    this.emit('mode'); this.requestRender();
  }
  fixOrbitForBuilding() { if (this.orbit.target.lengthSq() === 0) this.orbit.target.copy(this.center()); }

  currentPose() { return { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov }; }
  orbitPose() {
    const o = this.orbit, T = this.THREE, ce = Math.cos(o.el);
    const pos = new T.Vector3(o.target.x + o.dist * ce * Math.sin(o.az), o.target.y + o.dist * Math.sin(o.el), o.target.z + o.dist * ce * Math.cos(o.az));
    const m = new T.Matrix4().lookAt(pos, o.target, new T.Vector3(0, 1, 0));
    return { pos, quat: new T.Quaternion().setFromRotationMatrix(m), fov: 42 };
  }
  walkPose() {
    const w = this.walk, T = this.THREE, pos = new T.Vector3(w.x, w.floor + w.eye, -w.y);
    const q = new T.Quaternion().setFromEuler(new T.Euler(w.pitch, -w.yaw, 0, 'YXZ'));
    return { pos, quat: q, fov: 72 };
  }
  applyPose(p) { this.camera.position.copy(p.pos); this.camera.quaternion.copy(p.quat); if (p.fov && Math.abs(this.camera.fov - p.fov) > 1e-3) { this.camera.fov = p.fov; this.camera.updateProjectionMatrix(); } this.camera.updateMatrixWorld(); }
  applyOrbitCamera() { this.applyPose(this.orbitPose()); }
  startTween(from, to, duration, done) {
    this.tween = { from, to, t0: performance.now(), duration, done };
    this.kick();
  }

  /** Move the orbit camera: { azimuthDeg, elevationDeg, distance, target:{x,y,z}|[x,y,z] , animate } */
  orbitTo({ azimuthDeg, elevationDeg, distance, target, animate = false, duration = 600 } = {}) {
    const from = this.currentPose(), o = this.orbit;
    if (azimuthDeg !== undefined) o.az = azimuthDeg * DEG;
    if (elevationDeg !== undefined) o.el = clamp(elevationDeg * DEG, 2 * DEG, 89.9 * DEG);
    if (distance !== undefined) o.dist = clamp(distance, o.minDist, o.maxDist);
    if (target) o.target.set(...(Array.isArray(target) ? target : [target.x, target.y, target.z]));
    if (this.mode === 'walk') return;
    if (animate) this.startTween(from, this.orbitPose(), duration, () => this.applyOrbitCamera()); else this.applyOrbitCamera();
    this.requestRender();
  }
  /** Fly the orbit camera to look at a room. */
  focusRoom(key, { animate = true } = {}) {
    const r = this.built?.rooms.get(key) || [...(this.built?.rooms.values() || [])].find(x => x.spaceId === key); if (!r) return;
    const size = Math.max(r.bounds.w ?? (r.bounds.x1 - r.bounds.x0), r.bounds.h ?? (r.bounds.y1 - r.bounds.y0));
    this.orbitTo({ target: [r.centroid.x, r.elevation + 1, -r.centroid.y], distance: clamp(size * 1.8 + 3, 4, 40), elevationDeg: 48, animate });
  }

  // ---------------------------------------------------------------------------------------------------------- section
  enableSection(h) {
    const T = this.THREE;
    this.sectionHeight = h; this.sectionPlane.constant = h;
    this.renderer.clippingPlanes = [this.sectionPlane];
    const touch = m => { if (!m.clipShadows) { m.clipShadows = true; m.needsUpdate = true; } };
    this.built.group.traverse(o => { if (o.isMesh) touch(o.material); });
    this.rebuildSectionCap();
    void T;
  }
  rebuildSectionCap() {
    if (this.sectionCap) { this.scene.remove(this.sectionCap); this.sectionCap.traverse(o => o.geometry?.dispose()); this.sectionCap = null; }
    if (!this.built) return;
    const mat = this.built.lib.m.section;
    this.sectionCap = buildSectionCap(this.THREE, this.built, this.sectionHeight, mat); this.scene.add(this.sectionCap);
  }
  clearSection() {
    this.renderer.clippingPlanes = [];
    if (this.sectionCap) { this.scene.remove(this.sectionCap); this.sectionCap.traverse(o => o.geometry?.dispose()); this.sectionCap = null; }
  }
  setSectionHeight(h) {
    this.sectionHeight = clamp(h, .1, (this.built?.bounds.maxY || 4) + 1);
    if (this.mode !== 'section') { this.setMode('section'); return; }
    this.sectionPlane.constant = this.sectionHeight; this.rebuildSectionCap(); this.emit('section'); this.requestRender();
  }

  // ---------------------------------------------------------------------------------------------------------- selection
  clearHighlight() { if (this.highlight) { this.scene.remove(this.highlight); this.highlight.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); this.highlight = null; } this.selected = null; }
  highlightRoom(key) {
    this.clearHighlight();
    if (!key || !this.built) { this.emit('select'); this.requestRender(); return null; }
    const room = this.built.rooms.get(key) || [...this.built.rooms.values()].find(r => r.spaceId === key);
    if (!room) return null;
    const T = this.THREE, shape = new T.Shape(room.polygon.map(p => new T.Vector2(p.x, p.y)));
    for (const h of room.holes) shape.holes.push(new T.Path(h.map(p => new T.Vector2(p.x, p.y))));
    const geo = new T.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); // plan (x, y) -> (x, 0, -y)
    const fill = new T.Mesh(geo, new T.MeshBasicMaterial({ color: '#ffb23e', transparent: true, opacity: .42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: T.DoubleSide }));
    fill.position.y = room.elevation + .012; fill.renderOrder = 4;
    const pts = room.polygon.map(p => new T.Vector3(p.x, room.elevation + .02, -p.y)); pts.push(pts[0].clone());
    const line = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: '#ff9a00' })); line.renderOrder = 5;
    const g = new T.Group(); g.add(fill, line); this.highlight = g; this.scene.add(g);
    this.selected = room.key; this.emit('select'); this.requestRender();
    return room;
  }

  /** Ray pick at client coordinates. Returns {kind:'room'|'wall'|'fixture'|'opening'|'stairs'|'ground', point, room?, wallId?, levelId?, distance} or null. */
  pick(clientX, clientY) {
    if (!this.built) return null;
    const T = this.THREE, rect = this.canvas.getBoundingClientRect();
    const ndc = new T.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new T.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const cands = this.pickables.filter(o => { let p = o; while (p) { if (p.visible === false) return false; p = p.parent; } return true; });
    const hits = ray.intersectObjects(cands, false);
    const clip = this.renderer.clippingPlanes?.[0];
    for (const h of hits) {
      if (clip && clip.distanceToPoint(h.point) < 0) continue;
      const o = h.object, parentName = o.parent?.name, point = { x: h.point.x, y: -h.point.z, z: h.point.y };
      if (o.userData.kind === 'room') { const room = this.built.rooms.get(o.userData.room); return { kind: 'room', room, key: room.key, spaceId: room.spaceId, levelId: room.levelId, point, distance: h.distance }; }
      if (parentName === 'walls') {
        const tag = tagAt(o.userData.tags, h.faceIndex);
        const lvl = this.built.levels.find(l => l.id === (tag?.level || o.userData.levelId));
        const room = lvl?.locate({ x: point.x, y: point.y }) ? this.built.rooms.get(lvl.locate({ x: point.x, y: point.y }).key) : null;
        return { kind: 'wall', wallId: tag?.wallId || null, segId: tag?.segId || null, levelId: lvl?.id || null, room, point, distance: h.distance };
      }
      return { kind: parentName === 'openings' ? 'opening' : parentName === 'stairs' ? 'stairs' : 'fixture', point, distance: h.distance, levelId: o.parent?.parent?.userData?.levelId || null };
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------------------- walking
  /** Start position: the centre of the room `roomKey`, or of the entry hall / first room. */
  enterWalk(roomKey = null) {
    const b = this.built; if (!b) return;
    const w = this.walk;
    let room = roomKey ? (b.rooms.get(roomKey) || [...b.rooms.values()].find(r => r.spaceId === roomKey)) : null;
    if (!room && !(w.x || w.y)) room = [...b.rooms.values()].find(r => r.type === 'entrance') || [...b.rooms.values()][0];
    if (room) { w.x = room.inside.x; w.y = room.inside.y; w.level = room.levelIndex; w.floor = room.elevation; w.yaw = Math.atan2(room.centroid.x - w.x + .001, room.centroid.y - w.y + 1); w.pitch = 0; }
    this.installKeys();
    this.lamp.intensity = 1.2;
  }
  leaveWalk() { this.removeKeys(); this.lamp.intensity = 0; }

  /** Teleport the walker: walkTo(x, y, { level, headingDeg, pitchDeg }) in plan metres; heading 0 looks along plan +y (north), clockwise positive. */
  walkTo(x, y, { level = null, headingDeg = null, pitchDeg = 0 } = {}) {
    const w = this.walk, b = this.built; if (!b) return;
    if (level !== null) w.level = this.levelIndex(level);
    else { const hit = b.levels.findIndex(l => l.locate({ x, y })); if (hit >= 0) w.level = hit; }
    w.x = x; w.y = y; w.floor = b.levels[w.level]?.elevation ?? 0;
    if (headingDeg !== null) w.yaw = headingDeg * DEG;
    w.pitch = clamp(pitchDeg * DEG, -1.2, 1.2);
    if (this.mode !== 'walk') this.setMode('walk', { animate: false }); else { this.applyPose(this.walkPose()); this.requestRender(); }
    this.emit('walk');
  }
  /** Walk into a room and look at its centre from the doorway side. */
  walkToRoom(key, headingDeg = null) {
    const r = this.built?.rooms.get(key) || [...(this.built?.rooms.values() || [])].find(x => x.spaceId === key); if (!r) return;
    this.walk.x = r.inside.x; this.walk.y = r.inside.y;
    this.walkTo(r.inside.x, r.inside.y, { level: r.levelIndex, headingDeg });
  }
  /** On-screen friendly movement: move('forward'|'back'|'left'|'right'|'turnLeft'|'turnRight', metres or degrees). */
  move(dir, amount = .6) {
    const w = this.walk;
    if (dir === 'turnLeft' || dir === 'turnRight') { w.yaw += (dir === 'turnRight' ? 1 : -1) * (amount > 3 ? amount : 15) * DEG; this.afterWalk(); return; }
    const f = { forward: [1, 0], back: [-1, 0], left: [0, -1], right: [0, 1] }[dir]; if (!f) return;
    this.walkStep(f[0] * amount, f[1] * amount);
    this.afterWalk();
  }
  setWalkInput(input) { Object.assign(this.walk.input, input); this.kick(); }
  walkStep(fwd, side) {
    const w = this.walk, sy = Math.sin(w.yaw), cy = Math.cos(w.yaw);
    const dx = sy * fwd + cy * side, dy = cy * fwd - sy * side;
    const tryMove = (mx, my) => { if (!this.blocked(w.x + mx, w.y + my)) { w.x += mx; w.y += my; return true; } return false; };
    if (!tryMove(dx, dy)) { if (!tryMove(dx, 0)) tryMove(0, dy); }
    this.updateFloor();
  }
  blocked(x, y) {
    const lv = this.built.levels[this.walk.level], r = .24;
    const pts = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]];
    for (const poly of lv.colliders) {
      if (!poly.bb) poly.bb = boundsOf(poly);
      if (x + r < poly.bb.x0 || x - r > poly.bb.x1 || y + r < poly.bb.y0 || y - r > poly.bb.y1) continue;
      for (const [ox, oy] of pts) if (pointInPolygon({ x: x + ox, y: y + oy }, poly, 0)) return true;
    }
    for (const f of this.built.fixtureBoxes || []) {
      if (f.level !== lv.id || f.kind === 'rug' || f.kind === 'plant') continue;
      if (x + r < f.x - 3 || x - r > f.x + 3 || y + r < f.y - 3 || y - r > f.y + 3) continue;
      for (const [ox, oy] of pts) if (pointInPolygon({ x: x + ox, y: y + oy }, f.poly, 0)) return true;
    }
    const pb = this.built.plotBounds; if (pb && (x < pb.x0 - 12 || x > pb.x1 + 12 || y < pb.y0 - 12 || y > pb.y1 + 12)) return true;
    return false;
  }
  updateFloor() {
    const w = this.walk, b = this.built, p = { x: w.x, y: w.y };
    let target = b.levels[w.level].elevation;
    const own = b.levels[w.level], below = b.levels[w.level - 1];
    for (const st of own.stairs) { const h = stairHeightAt(st.layout, p); if (h.inside) { target = own.elevation + h.h; if (h.t > .96 && !st.toRoof) { w.level++; target = b.levels[w.level].elevation; } break; } }
    if (below) for (const st of below.stairs) { const h = stairHeightAt(st.layout, p); if (h.inside) { target = below.elevation + h.h; if (h.t < .04) { w.level--; } break; } }
    w.targetFloor = target;
  }
  afterWalk() { this.updateFloor(); this.walk.floor = this.walk.targetFloor ?? this.walk.floor; this.applyPose(this.walkPose()); this.emit('walk'); this.requestRender(); }

  installKeys() {
    if (this._keys) return;
    const map = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr', KeyQ: 'tl', KeyE: 'tr' };
    const set = (e, down) => {
      if (this.mode !== 'walk') return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { this.walk.input.run = down; this.kick(); return; }
      const k = map[e.code]; if (!k) return;
      e.preventDefault(); down ? this.walk.keys.add(k) : this.walk.keys.delete(k); this.kick();
    };
    this._keys = { down: e => set(e, true), up: e => set(e, false), blur: () => { this.walk.keys.clear(); } };
    globalThis.addEventListener('keydown', this._keys.down); globalThis.addEventListener('keyup', this._keys.up); globalThis.addEventListener('blur', this._keys.blur);
  }
  removeKeys() {
    if (!this._keys) return;
    globalThis.removeEventListener('keydown', this._keys.down); globalThis.removeEventListener('keyup', this._keys.up); globalThis.removeEventListener('blur', this._keys.blur);
    this._keys = null; this.walk.keys.clear();
  }
  walkActive() { const w = this.walk, i = w.input; return this.mode === 'walk' && (w.keys.size > 0 || i.forward || i.strafe || i.turn || Math.abs(w.vYaw) > 1e-3 || Math.abs(w.vPitch) > 1e-3 || (w.targetFloor !== undefined && Math.abs(w.targetFloor - w.floor) > 1e-3)); }

  // ---------------------------------------------------------------------------------------------------------- events
  bind() {
    const c = this.canvas;
    this._on = (t, fn, opts) => { c.addEventListener(t, fn, opts); (this._unbind ||= []).push(() => c.removeEventListener(t, fn, opts)); };
    this._on('contextmenu', e => e.preventDefault());
    this._on('pointerdown', e => this.onDown(e));
    this._on('pointermove', e => this.onMove(e));
    this._on('pointerup', e => this.onUp(e));
    this._on('pointercancel', e => this.onUp(e));
    this._on('wheel', e => this.onWheel(e), { passive: false });
    this._on('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.emit('contextlost'); });
    this._on('webglcontextrestored', () => { this.lost = false; this.applyStyle(); this.fitShadow(); this.emit('contextrestored'); this.requestRender(); });
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.container); }
    else { this._rs = () => this.resize(); globalThis.addEventListener('resize', this._rs); }
  }

  onDown(e) {
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, shift: e.shiftKey, t: performance.now() });
    this.tween = null;
    if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    this.orbit.vAz = this.orbit.vEl = 0;
  }
  onMove(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (this.mode === 'walk') {
      if (this.pointers.size === 1) { const w = this.walk; w.yaw += dx * .0042; w.pitch = clamp(w.pitch - dy * .0035, -1.2, 1.2); w.vYaw = 0; this.applyPose(this.walkPose()); this.requestRender(); }
      return;
    }
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.dolly(this.pinch.d / Math.max(d, 1)); this.pan(mx - this.pinch.mx, my - this.pinch.my); this.pinch = { d, mx, my }; return;
    }
    const panning = p.button === 2 || p.button === 1 || p.shift;
    if (panning) this.pan(dx, dy);
    else if (this.mode !== 'top') { const o = this.orbit; o.az -= dx * .0062; o.el = clamp(o.el + dy * .0052, 2 * DEG, 89.5 * DEG); o.vAz = -dx * .0062; o.vEl = dy * .0052; this.applyOrbitCamera(); this.requestRender(); }
    else this.pan(dx, dy);
  }
  onUp(e) {
    const p = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p) return;
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (moved < 5 && performance.now() - p.t < 600 && p.button === 0) {
      const hit = this.pick(e.clientX, e.clientY);
      if (this.autoSelect) { if (hit?.room) this.highlightRoom(hit.room.key); else if (!hit) this.highlightRoom(null); }
      this.emit('pick', hit);
    } else if (this.mode !== 'walk' && this.mode !== 'top' && (Math.abs(this.orbit.vAz) > .0008 || Math.abs(this.orbit.vEl) > .0008)) this.kick();
  }
  onWheel(e) { e.preventDefault(); if (this.mode === 'walk') { this.walkStep(-e.deltaY * .004, 0); this.afterWalk(); return; } this.dolly(Math.exp(e.deltaY * (e.ctrlKey ? .01 : .0012))); }
  dolly(f) { const o = this.orbit; o.dist = clamp(o.dist * f, o.minDist, o.maxDist); this.applyOrbitCamera(); this.requestRender(); }
  pan(dx, dy) {
    const T = this.THREE, o = this.orbit, h = this.canvas.clientHeight || 1, k = 2 * o.dist * Math.tan(this.camera.fov * DEG / 2) / h;
    const right = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    if (this.mode === 'top') up.set(0, 0, -1).applyAxisAngle(new T.Vector3(0, 1, 0), 0);
    o.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    const b = this.built?.bounds; if (b) { o.target.x = clamp(o.target.x, b.x0 - 40, b.x1 + 40); o.target.z = clamp(o.target.z, -b.y1 - 40, -b.y0 + 40); o.target.y = clamp(o.target.y, -1, 20); }
    this.applyOrbitCamera(); this.requestRender();
  }

  // ---------------------------------------------------------------------------------------------------------- loop / render
  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.requestRender();
  }
  requestRender() { this.needsRender = true; this.kick(); }
  kick() { if (!this.rafId && !this.disposed) this.rafId = requestAnimationFrame(t => this.tick(t)); }

  tick(now) {
    this.rafId = 0; if (this.disposed) return;
    const dt = this.lastT ? clamp((now - this.lastT) / 1000, 0, .08) : .016; this.lastT = now;
    let active = false;
    // transition
    if (this.tween) {
      const tw = this.tween, k = clamp((performance.now() - tw.t0) / tw.duration, 0, 1), e = ease(k), T = this.THREE;
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
      this.camera.quaternion.slerpQuaternions(tw.from.quat, tw.to.quat, e);
      const fov = tw.from.fov + (tw.to.fov - tw.from.fov) * e; if (Math.abs(fov - this.camera.fov) > 1e-3) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      this.camera.updateMatrixWorld(); void T;
      if (k >= 1) { const d = tw.done; this.tween = null; d?.(); } else active = true;
      this.needsRender = true;
    }
    // orbit inertia
    if (this.mode !== 'walk' && !this.tween && this.pointers.size === 0) {
      const o = this.orbit;
      if (Math.abs(o.vAz) > .0004 || Math.abs(o.vEl) > .0004) {
        o.az += o.vAz; o.el = clamp(o.el + o.vEl, 2 * DEG, 89.5 * DEG); const damp = Math.pow(.88, dt * 60); o.vAz *= damp; o.vEl *= damp;
        this.applyOrbitCamera(); active = true; this.needsRender = true;
      } else o.vAz = o.vEl = 0;
    }
    // walking
    if (this.mode === 'walk' && !this.tween) {
      const w = this.walk, i = w.input, ks = w.keys;
      const fwd = (ks.has('f') ? 1 : 0) - (ks.has('b') ? 1 : 0) + i.forward, side = (ks.has('r') ? 1 : 0) - (ks.has('l') ? 1 : 0) + i.strafe, turn = (ks.has('tr') ? 1 : 0) - (ks.has('tl') ? 1 : 0) + i.turn;
      const sp = w.speed * (i.run ? 1.8 : 1);
      if (turn) { w.yaw += turn * 1.7 * dt; this.needsRender = true; }
      if (fwd || side) { const len = Math.hypot(fwd, side) || 1; this.walkStep(fwd / len * sp * dt, side / len * sp * dt); this.needsRender = true; }
      if (w.targetFloor !== undefined && Math.abs(w.targetFloor - w.floor) > 1e-3) { w.floor += (w.targetFloor - w.floor) * Math.min(1, dt * 12); this.needsRender = true; }
      if (this.needsRender) this.applyPose(this.walkPose());
      active = active || !!(fwd || side || turn) || Math.abs((w.targetFloor ?? w.floor) - w.floor) > 1e-3;
      if (fwd || side || turn) this.emit('walk');
    }
    if (this.needsRender) { this.needsRender = false; this.renderNow(); }
    if (active) this.kick();
  }

  renderNow() {
    if (this.lost || !this.renderer) return;
    this.sky.position.copy(this.camera.position);
    if (this.mode === 'walk') this.lamp.position.copy(this.camera.position).add(new this.THREE.Vector3(0, -.3, 0));
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.frameMs = performance.now() - t0;
  }

  stats() {
    const i = this.renderer.info;
    return { drawCalls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, frameMs: this.frameMs, meshes: this.built?.stats.meshes, sceneTriangles: this.built?.stats.triangles };
  }

  getState() {
    return { mode: this.mode, style: this.style, sun: { ...this.sunState }, selected: this.selected, section: this.sectionHeight, levels: this.built?.levels.map(l => ({ id: l.id, name: l.name, visible: l.group.visible })) || [], walk: this.mode === 'walk' ? { x: this.walk.x, y: this.walk.y, level: this.built?.levels[this.walk.level]?.id, room: this.built?.roomAt(this.walk.x, this.walk.y, this.walk.level)?.key || null } : null, contextLost: this.lost };
  }
  emit(type, detail) { try { this.onState?.({ type, detail, state: this.getState() }); } catch { /* UI errors must not break rendering */ } }

  /** High resolution still. Resolves a PNG Blob. */
  capturePNG(scale = 2) {
    return new Promise((resolve, reject) => {
      const r = this.renderer, c = this.canvas, w = this.container.clientWidth, h = this.container.clientHeight, pr = r.getPixelRatio();
      try {
        const max = r.capabilities.maxTextureSize || 4096, s = Math.min(scale, max / Math.max(w, h));
        r.setPixelRatio(s); r.setSize(w, h, false);
        this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
        r.render(this.scene, this.camera);
        c.toBlob(blob => { r.setPixelRatio(pr); r.setSize(w, h, false); this.requestRender(); blob ? resolve(blob) : reject(new Error('capture failed')); }, 'image/png');
      } catch (err) { r.setPixelRatio(pr); r.setSize(w, h, false); reject(err); }
    });
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.rafId);
    this.removeKeys(); (this._unbind || []).forEach(f => f()); this.ro?.disconnect(); if (this._rs) globalThis.removeEventListener('resize', this._rs);
    this.clearHighlight(); this.clearSection();
    if (this.built) { this.scene.remove(this.built.group); this.built.dispose(); this.built = null; }
    this.envTarget?.dispose(); this.pmrem.dispose(); this.sky.geometry.dispose(); this.sky.material.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss?.(); this.canvas.remove();
  }
}

export default DrawViewer;
