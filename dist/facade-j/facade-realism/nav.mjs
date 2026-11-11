// التنقل داخل الواجهة الواقعية (nav=1): دوران حول المبنى، تكبير، سحب جانبي، وتجوّل بمستوى العين — كما في المجسم.
// الرسم عند الحاجة فقط (لا حلقة دائمة)، والظلال تُحسب مرة واحدة لأن الشمس والمبنى ثابتان.
//
//   enableNavigation(THREE, { renderer, scene, camera, S, host, initial })
//
// الفأرة: سحب = دوران، زر يمين أو Shift+سحب = تحريك جانبي، العجلة = تكبير.
// اللمس: إصبع = دوران، إصبعان = تكبير وتحريك.
// التجوّل: سحب = النظر، W/S أو الأسهم = تقدّم/تراجع، A/D = خطوة جانبية، أزرار على الشاشة للّمس.
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function buildingBounds(THREE, S) {
  const bb = new THREE.Box3();
  S.meshes.forEach(m => { if (m.name !== 'ground' && m.visible) bb.expandByObject(m); });
  if (bb.isEmpty()) bb.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 8, 10));
  return bb;
}

export function enableNavigation(THREE, { renderer, scene, camera, S, host, initial = null, refiner = null, maxPixelRatio = 1.5 }) {
  const canvas = renderer.domElement, bb = buildingBounds(THREE, S), EL_MIN = refiner ? -40 * DEG : 2 * DEG; // مع إزاحة العدسة يجوز أن تكون نقطة النظر أعلى من العين (كاميرا الشارع)
  const center = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, size.y * 1.6, 8);
  const orbit = { az: 0, el: 20 * DEG, dist: span * 1.5, target: new THREE.Vector3(center.x, size.y * .45, center.z), minDist: 3, maxDist: span * 5 };
  const walk = { yaw: 0, pitch: 0, pos: new THREE.Vector3(), keys: new Set(), eye: 1.65 };
  let mode = 'orbit', goal = null, inertia = null, tween = null, raf = 0, lastT = 0, samples = [];
  const pointers = new Map(); let pinch = null;

  // الحالة الابتدائية من كاميرا اللقطة نفسها، حتى يبدأ العميل من الصورة التي رآها
  function fromCamera(cam) {
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const hit = orbit.target.clone(); const t = Math.max(1, (cam.position.y - orbit.target.y) / Math.max(.05, -dir.y));
    if (dir.y < -.05) hit.copy(cam.position).addScaledVector(dir, t); else hit.copy(cam.position).addScaledVector(dir, cam.position.distanceTo(center));
    hit.y = clamp(hit.y, 0, size.y); orbit.target.copy(hit);
    const off = cam.position.clone().sub(orbit.target); orbit.dist = clamp(off.length(), orbit.minDist, orbit.maxDist);
    orbit.az = Math.atan2(off.x, off.z); orbit.el = clamp(Math.asin(off.y / orbit.dist), EL_MIN, 89 * DEG);
  }
  fromCamera(camera);
  const home = { az: orbit.az, el: orbit.el, dist: orbit.dist, target: orbit.target.clone() };

  function orbitPose(o) {
    const p = new THREE.Vector3(o.target.x + o.dist * Math.cos(o.el) * Math.sin(o.az), o.target.y + o.dist * Math.sin(o.el), o.target.z + o.dist * Math.cos(o.el) * Math.cos(o.az));
    if (p.y < .4) p.y = .4;
    return { pos: p, look: o.target.clone() };
  }
  function walkPose() {
    const d = new THREE.Vector3(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
    return { pos: walk.pos.clone(), look: walk.pos.clone().add(d) };
  }
  // «إزاحة العدسة»: قرب مستوى العين يبقى النظر أفقيًا ويُزاح الإسقاط رأسيًا بدل إمالة الكاميرا، فتبقى الخطوط الرأسية مستقيمة (تصوير معماري)؛
  // مع زيادة الميل (فوق ~18°) تعود الإمالة العادية تدريجيًا حتى اللقطة العلوية.
  let lastPose = null;
  function apply(p) {
    camera.position.copy(p.pos); lastPose = { pos: p.pos.clone(), look: p.look.clone() };
    if (!refiner || mode === 'walk') { if (refiner) refiner.lens.shift = 0; camera.lookAt(p.look); return; }
    const dx = p.look.x - p.pos.x, dy = p.look.y - p.pos.y, dz = p.look.z - p.pos.z, hl = Math.hypot(dx, dz) || 1e-6, pitch = Math.atan2(dy, hl), a = Math.abs(pitch);
    const t = clamp((a - 18 * DEG) / (16 * DEG), 0, 1), w = 1 - t * t * (3 - 2 * t), keep = pitch * (1 - w);
    camera.lookAt(p.pos.x + dx, p.pos.y + Math.tan(keep) * hl, p.pos.z + dz); refiner.lens.shift = Math.tan(pitch * w) / Math.tan(camera.fov * DEG / 2) / Math.max(.2, Math.cos(keep));
  }
  let slow = 0, pr = 0;
  const render = () => { if (refiner) refiner.render(); else renderer.render(scene, camera); };
  // قياس زمن الإطار أثناء الحركة: إن ظل فوق ~55 مللي ثانية تُخفَّض دقة العرض تدريجيًا (حتى 0.75) ليبقى التنقل سلسًا على الأجهزة الضعيفة
  function noteFrame(ms) { if (!refiner || !pr) return; slow = ms > 55 ? slow + 1 : Math.max(0, slow - 1); if (slow >= 10 && pr > .75) { pr = Math.max(.75, pr * .8); slow = 0; api.degraded = pr; resize(); } }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function tick(now) {
    // التجوّل بزمن حقيقي (حتى ¼ ثانية للإطار) فتبقى المسافة متوقعة على الأجهزة البطيئة؛ الدوران والتكبير بتنعيم أقصر
    raf = 0; if (lastT) noteFrame(now - lastT); const raw = lastT ? (now - lastT) / 1000 : .016, dt = clamp(raw, 0, .08), dtw = clamp(raw, 0, .25); lastT = now; let active = false;
    if (tween) {
      const k = clamp((performance.now() - tween.t0) / tween.ms, 0, 1), e = ease(k);
      apply({ pos: new THREE.Vector3().lerpVectors(tween.from.pos, tween.to.pos, e), look: tween.from.look.clone().lerp(tween.to.look, e) });
      if (k >= 1) { tween = null; if (mode === 'orbit') apply(orbitPose(orbit)); } else active = true;
    } else if (mode === 'orbit') {
      if (inertia) { const g = goalOrbit(); g.az += inertia.vAz * dt; g.el = clamp(g.el + inertia.vEl * dt, EL_MIN, 89 * DEG); const f = Math.exp(-dt * 4); inertia.vAz *= f; inertia.vEl *= f; if (Math.hypot(inertia.vAz, inertia.vEl) < .02) inertia = null; else active = true; }
      if (goal) {
        const a = 1 - Math.exp(-dt * 14);
        orbit.az += (goal.az - orbit.az) * a; orbit.el += (goal.el - orbit.el) * a; orbit.dist += (goal.dist - orbit.dist) * a; orbit.target.lerp(goal.target, a);
        if (Math.abs(goal.az - orbit.az) < 1e-4 && Math.abs(goal.el - orbit.el) < 1e-4 && Math.abs(goal.dist - orbit.dist) < 1e-3 && orbit.target.distanceTo(goal.target) < 1e-3) goal = null; else active = true;
      }
      apply(orbitPose(orbit));
    } else if (mode === 'walk') {
      const f = (walk.keys.has('f') ? 1 : 0) - (walk.keys.has('b') ? 1 : 0), s = (walk.keys.has('r') ? 1 : 0) - (walk.keys.has('l') ? 1 : 0);
      const t = (walk.keys.has('tl') ? 1 : 0) - (walk.keys.has('tr') ? 1 : 0);
      if (f || s || t) { step(f * 3.2 * dtw, s * 2.4 * dtw); walk.yaw -= t * 1.4 * dtw; active = true; }
      apply(walkPose());
    }
    render();
    if (active) kick(); else { lastT = 0; refiner?.start(); }
  }
  function goalOrbit() { if (!goal) goal = { az: orbit.az, el: orbit.el, dist: orbit.dist, target: orbit.target.clone() }; return goal; }
  function step(fwd, side) {
    const fx = Math.sin(walk.yaw), fz = -Math.cos(walk.yaw), rx = Math.cos(walk.yaw), rz = Math.sin(walk.yaw);
    walk.pos.x = clamp(walk.pos.x + fx * fwd + rx * side, bb.min.x - 40, bb.max.x + 40);
    walk.pos.z = clamp(walk.pos.z + fz * fwd + rz * side, bb.min.z - 40, bb.max.z + 40);
    walk.pos.y = walk.eye;
  }
  function moveTo(to, ms = 650) { const cur = lastPose; tween = { from: cur || { pos: camera.position.clone(), look: camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3())) }, to, t0: performance.now(), ms }; kick(); }

  // ---------------------------------------------------------------- أحداث الإدخال
  canvas.style.touchAction = 'none'; canvas.tabIndex = 0;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.focus({ preventScroll: true }); canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, type: e.pointerType });
    tween = null; inertia = null; samples = [];
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (mode === 'walk') { if (pointers.size === 1) { walk.yaw += dx * .0042; walk.pitch = clamp(walk.pitch - dy * .0035, -1.1, 1.1); kick(); } return; }
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      dolly(pinch.d / Math.max(d, 1)); pan(mx - pinch.mx, my - pinch.my); pinch = { d, mx, my }; return;
    }
    if (pointers.size > 2) return;
    if (p.button === 2 || p.button === 1 || p.shift) { pan(dx, dy); return; }
    const w = Math.max(600, canvas.clientWidth || 800), h = Math.max(400, canvas.clientHeight || 600), k = p.type === 'touch' ? .85 : 1;
    const dAz = -dx * 4.36 / w * k, dEl = dy * 2.1 / h * k, g = goalOrbit();
    g.az += dAz; g.el = clamp(g.el + dEl, EL_MIN, 89 * DEG);
    const t = performance.now(); samples.push({ t, dAz, dEl }); while (samples.length && t - samples[0].t > 90) samples.shift();
    kick();
  });
  const up = e => {
    pointers.delete(e.pointerId); canvas.releasePointerCapture?.(e.pointerId); if (pointers.size < 2) pinch = null;
    if (mode === 'orbit' && !pointers.size) {
      const t = performance.now(), rec = samples.filter(s => t - s.t < 90);
      if (rec.length > 1) { const span = Math.max(16, t - rec[0].t) / 1000, vAz = rec.reduce((a, s) => a + s.dAz, 0) / span, vEl = rec.reduce((a, s) => a + s.dEl, 0) / span; if (Math.hypot(vAz, vEl) > .25) { inertia = { vAz: clamp(vAz, -6, 6), vEl: clamp(vEl, -3, 3) }; kick(); } }
    }
    samples = [];
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (mode === 'walk') { step(-e.deltaY * .004, 0); kick(); return; }
    inertia = null; dolly(clamp(Math.exp(e.deltaY * (e.ctrlKey ? .011 : .0011)), .82, 1.22));
  }, { passive: false });
  function dolly(f) { const g = goalOrbit(); g.dist = clamp(g.dist * f, orbit.minDist, orbit.maxDist); kick(); }
  function pan(dx, dy) {
    const g = goalOrbit(), h = canvas.clientHeight || 1, k = 2 * g.dist * Math.tan(camera.fov * DEG / 2) / h;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), upv = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    g.target.addScaledVector(right, -dx * k).addScaledVector(upv, dy * k);
    g.target.x = clamp(g.target.x, bb.min.x - 30, bb.max.x + 30); g.target.z = clamp(g.target.z, bb.min.z - 30, bb.max.z + 30); g.target.y = clamp(g.target.y, 0, size.y + 10);
    kick();
  }
  const KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr', KeyQ: 'tl', KeyE: 'tr' };
  addEventListener('keydown', e => { const k = KEYS[e.code]; if (!k || mode !== 'walk') return; e.preventDefault(); walk.keys.add(k); kick(); });
  addEventListener('keyup', e => { const k = KEYS[e.code]; if (k) walk.keys.delete(k); });
  addEventListener('blur', () => walk.keys.clear());

  // ---------------------------------------------------------------- الأوضاع واللقطات
  function setMode(m) {
    mode = m; goal = null; inertia = null; walk.keys.clear();
    if (m === 'walk') {
      // يبدأ التجوّل أمام المدخل الأمامي (الجنوب، z الأكبر) بمستوى العين وينظر إلى المبنى
      walk.pos.set(center.x, walk.eye, bb.max.z + Math.max(8, size.x * .6)); walk.yaw = 0; walk.pitch = 4 * DEG;
      moveTo(walkPose(), 700);
    } else { moveTo(orbitPose(orbit), 600); }
    ui.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    ui.querySelector('.fn-walkpad').hidden = m !== 'walk';
    ui.querySelector('.fn-hint').textContent = m === 'walk' ? 'اسحب للنظر حولك، وتقدّم بالأسهم أو W/S، وخطوة جانبية A/D — أو بالأزرار.' : 'اسحب للدوران حول المبنى، والعجلة أو إصبعان للتكبير، وزر الفأرة الأيمن أو Shift للتحريك.';
  }
  function view(name) {
    if (mode !== 'orbit') { mode = 'orbit'; walk.keys.clear(); ui.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === 'orbit'))); ui.querySelector('.fn-walkpad').hidden = true; }
    goal = null; inertia = null; // هدف دوران سابق لم يكتمل لا يُرجع الكاميرا بعد اللقطة
    const t = new THREE.Vector3(center.x, size.y * .45, center.z), d = span * 1.35;
    const V = {
      front: { az: 0, el: 6 * DEG, dist: d, target: t },
      corner: { az: -38 * DEG, el: 18 * DEG, dist: d * 1.05, target: t },
      side: { az: -90 * DEG, el: 8 * DEG, dist: d, target: t },
      back: { az: 180 * DEG, el: 10 * DEG, dist: d, target: t },
      top: refiner ? { az: -18 * DEG, el: 58 * DEG, dist: d * 2.1, target: new THREE.Vector3(center.x, 0, center.z + size.z * .15) } : { az: 0, el: 80 * DEG, dist: d * 1.2, target: new THREE.Vector3(center.x, 0, center.z) },
      home,
    }[name];
    Object.assign(orbit, { az: V.az, el: V.el, dist: V.dist }); orbit.target.copy(V.target);
    moveTo(orbitPose(orbit), 700);
  }

  // ---------------------------------------------------------------- واجهة الأزرار (فوق المشهد)
  const css = document.createElement('style');
  css.textContent = `.fn-ui{position:fixed;inset:auto 12px 12px 12px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;pointer-events:none;font-family:system-ui,"IBM Plex Sans Arabic",sans-serif;z-index:5}
.fn-row{display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto}
.fn-ui button{border:1px solid #ffffff55;background:#1c3a32e6;color:#f6f2ea;border-radius:999px;padding:7px 13px;font:inherit;font-size:13px;cursor:pointer;min-height:36px}
.fn-ui button[aria-pressed=true]{background:#c9a45c;color:#1c2a24;border-color:#c9a45c}
.fn-hint{pointer-events:none;background:#000a;color:#fff;border-radius:10px;padding:6px 10px;font-size:12px;max-width:min(560px,100%)}
.fn-walkpad{display:grid;grid-template-columns:repeat(3,44px);gap:6px;pointer-events:auto}
.fn-walkpad[hidden]{display:none}
.fn-walkpad button{padding:0;width:44px;height:44px;border-radius:12px;font-size:18px}`;
  document.head.append(css);
  const ui = document.createElement('div'); ui.className = 'fn-ui'; ui.dir = 'rtl';
  ui.innerHTML = `<div class="fn-row" role="group" aria-label="طريقة التنقل"><button data-mode="orbit" aria-pressed="true">حول المبنى</button><button data-mode="walk" aria-pressed="false">تجوّل بمستوى العين</button></div>
<div class="fn-row" role="group" aria-label="لقطات"><button data-view="front">الواجهة الأمامية</button><button data-view="corner">زاوية</button><button data-view="side">جانبية</button><button data-view="back">خلفية</button><button data-view="top">من الأعلى</button><button data-view="home">البداية</button></div>
<div class="fn-walkpad" hidden><span></span><button data-k="f" aria-label="تقدّم">▲</button><span></span><button data-k="tr" aria-label="التفت يمينًا">↻</button><button data-k="b" aria-label="تراجع">▼</button><button data-k="tl" aria-label="التفت يسارًا">↺</button></div>
<div class="fn-hint"></div>`;
  (host || document.body).append(ui);
  ui.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  ui.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => view(b.dataset.view)));
  ui.querySelectorAll('[data-k]').forEach(b => {
    const k = b.dataset.k, on = e => { e.preventDefault(); walk.keys.add(k); kick(); }, off = () => walk.keys.delete(k);
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  });
  ui.querySelector('.fn-hint').textContent = 'اسحب للدوران حول المبنى، والعجلة أو إصبعان للتكبير، وزر الفأرة الأيمن أو Shift للتحريك.';

  // ---------------------------------------------------------------- الحجم: يملأ الإطار ويتبعه
  function resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    if (!pr) pr = Math.min(devicePixelRatio || 1, maxPixelRatio); renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix(); kick();
  }
  addEventListener('resize', resize); resize();
  apply(orbitPose(orbit)); render();
  const api = { setMode, view, get mode() { return mode; }, get orbit() { return { ...orbit, target: orbit.target.clone() }; }, get camera() { return camera; }, ui };
  globalThis.__facadeNav = api;
  return api;
}
