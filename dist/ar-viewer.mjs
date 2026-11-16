// جلسة WebXR immersive-ar لوضع المبنى على الأرض بمقياس 1:1: hit-test + حلقة وضع + تدوير بإصبعين + تأكيد الموضع.
// المنطق القابل للاختبار (آلة الحالات وحساب زاوية الإصبعين) نقي في الأعلى؛ الجزء الذي يحتاج جهازًا حقيقيًا (startWebXrAr) غير متحقق عليه هنا.
import { AR_MESSAGES } from './ar-support.mjs';

/** آلة حالات الوضع: searching (لا سطح بعد) → positioning (المبنى يتبع الحلقة) → placed (مثبَّت). */
export function createPlacement() {
  const s = { phase: 'searching', yaw: 0, hit: null, anchor: null };
  return {
    get state() { return { ...s, hit: s.hit && { ...s.hit }, anchor: s.anchor && { ...s.anchor } }; },
    /** نقطة تقاطع أرضية جديدة (م) أو null. تتجاهل أثناء التثبيت. */
    hit(p) {
      if (s.phase === 'placed') return;
      s.hit = p ? { x: p.x, y: p.y, z: p.z } : null;
      s.phase = s.hit ? 'positioning' : 'searching';
    },
    rotate(dYaw) { if (s.phase !== 'placed' && Number.isFinite(dYaw)) s.yaw = ((s.yaw + dYaw) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); },
    confirm() { if (s.phase !== 'positioning' || !s.hit) return false; s.anchor = { ...s.hit }; s.phase = 'placed'; return true; },
    reset() { s.phase = s.hit ? 'positioning' : 'searching'; s.anchor = null; },
  };
}

/** زاوية الخط بين إصبعين (راديان على الشاشة، تزداد مع عقارب الساعة لأن y للأسفل). */
export const fingerAngle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
/** فرق زاويتين مطوَّى إلى (-π, π]. */
export const angleDelta = (from, to) => { let d = to - from; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };
/** لف الإصبعين باتجاه عقارب الساعة على الشاشة يدير المبنى باتجاه عقارب الساعة كما يُرى من الأعلى = دوران سالب حول Y. */
export const yawFromTwist = d => -d;

export function buildThreeGroup(THREE, model) {
  const group = new THREE.Group(); group.name = model.name;
  const mats = new Map(model.materials.map(m => [m.id, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(m.color[0], m.color[1], m.color[2]), roughness: m.roughness, metalness: 0, transparent: m.alpha < 1, opacity: m.alpha, depthWrite: m.alpha >= 1 })]));
  for (const m of model.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    group.add(new THREE.Mesh(g, mats.get(m.material)));
  }
  return group;
}

const AR_TEXT = Object.freeze({
  searching: 'حرّك الهاتف ببطء فوق الأرض حتى تظهر الحلقة.',
  positioning: 'المبنى يتبع الحلقة. أدِره بإصبعين، وحين يناسبك الموضع اضغط «ثبّت هنا».',
  placed: 'تم التثبيت بمقياس 1:1. تحرّك حوله وادخل فيه. «إعادة الوضع» لتحريكه من جديد.',
});

/**
 * يبدأ جلسة الواقع المعزز. يرجع { end() } أو يرمي خطأ بنص عربي. يتطلب سياقًا آمنًا وإذن الكاميرا (يطلبه المتصفح).
 * @param {{THREE:object, model:object, overlay:HTMLElement, nav?:Navigator}} o
 */
export async function startWebXrAr({ THREE, model, overlay, nav = navigator }) {
  const ui = {
    status: overlay.querySelector('[data-ar=status]'), size: overlay.querySelector('[data-ar=size]'),
    confirm: overlay.querySelector('[data-ar=confirm]'), reset: overlay.querySelector('[data-ar=reset]'), close: overlay.querySelector('[data-ar=close]'), touch: overlay.querySelector('[data-ar=touch]'),
  };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2)); renderer.xr.enabled = true;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(4, 10, 6); scene.add(sun);
  const building = buildThreeGroup(THREE, model); building.visible = false; scene.add(building);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd4a73c }));
  ring.visible = false; scene.add(ring);
  const [bx, by, bz] = model.size; void by;
  const foot = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-bx / 2, 0.01, -bz / 2], [bx / 2, 0.01, -bz / 2], [bx / 2, 0.01, bz / 2], [-bx / 2, 0.01, bz / 2]].map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0xd4a73c }));
  foot.visible = false; scene.add(foot);

  let session;
  try {
    session = await nav.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: overlay } });
  } catch (e) { renderer.dispose(); throw Object.assign(new Error(AR_MESSAGES.failed), { cause: e }); }
  const place = createPlacement(); let hitSource = null, ended = false, viewerSpace = null;
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  overlay.hidden = false; overlay.style.display = '';
  const hasOverlay = !!session.domOverlayState; // دون dom-overlay لا أزرار ولا تدوير: نكتفي بنقرة XR للتثبيت
  if (ui.size) ui.size.textContent = `بصمة المبنى ${model.size[0].toFixed(1)} × ${model.size[2].toFixed(1)} م، الارتفاع ${model.size[1].toFixed(1)} م`;
  const render = () => {
    const st = place.state; if (ui.status) ui.status.textContent = AR_TEXT[st.phase] + (hasOverlay ? '' : ' (اضغط الشاشة للتثبيت؛ التدوير غير متاح في هذا المتصفح)');
    if (ui.confirm) ui.confirm.hidden = st.phase !== 'positioning'; if (ui.reset) ui.reset.hidden = st.phase !== 'placed';
    const at = st.anchor || st.hit; building.visible = !!at; foot.visible = st.phase === 'positioning';
    if (at) { building.position.set(at.x, at.y, at.z); building.rotation.y = st.yaw; foot.position.copy(building.position); foot.rotation.y = st.yaw; }
  };
  const onConfirm = () => { place.confirm(); render(); }, onReset = () => { place.reset(); render(); };
  ui.confirm?.addEventListener('click', onConfirm); ui.reset?.addEventListener('click', onReset);
  if (!hasOverlay) session.addEventListener('select', () => { place.state.phase === 'placed' ? place.reset() : place.confirm(); render(); });
  // تدوير بإصبعين على طبقة اللمس داخل الـoverlay
  const pts = new Map(); let last = null;
  const down = e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; last = fingerAngle(a, b); } };
  const move = e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2 && last !== null) { const [a, b] = [...pts.values()], ang = fingerAngle(a, b); place.rotate(yawFromTwist(angleDelta(last, ang))); last = ang; render(); } };
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) last = null; };
  const touch = ui.touch || overlay;
  touch.addEventListener('pointerdown', down); touch.addEventListener('pointermove', move); touch.addEventListener('pointerup', up); touch.addEventListener('pointercancel', up);
  const stop = () => { if (!ended) session.end().catch(() => {}); };
  ui.close?.addEventListener('click', stop);
  const cleanup = () => {
    ended = true; renderer.setAnimationLoop(null); try { hitSource?.cancel(); } catch { /* انتهت */ }
    ui.confirm?.removeEventListener('click', onConfirm); ui.reset?.removeEventListener('click', onReset); ui.close?.removeEventListener('click', stop);
    touch.removeEventListener('pointerdown', down); touch.removeEventListener('pointermove', move); touch.removeEventListener('pointerup', up); touch.removeEventListener('pointercancel', up);
    overlay.hidden = true; renderer.dispose(); building.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  };
  session.addEventListener('end', cleanup);
  viewerSpace = await session.requestReferenceSpace('viewer'); hitSource = await session.requestHitTestSource({ space: viewerSpace });
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), up3 = new THREE.Vector3();
  renderer.setAnimationLoop((_t, frame) => {
    if (frame && hitSource && place.state.phase !== 'placed') {
      const ref = renderer.xr.getReferenceSpace(), hits = frame.getHitTestResults(hitSource); let ok = null;
      for (const h of hits) { const pose = h.getPose(ref); if (!pose) continue; m4.fromArray(pose.transform.matrix); up3.setFromMatrixColumn(m4, 1); if (up3.y > 0.7) { v.setFromMatrixPosition(m4); ok = { x: v.x, y: v.y, z: v.z }; break; } } // أسطح أفقية فقط
      place.hit(ok); ring.visible = !!ok; if (ok) ring.position.set(ok.x, ok.y, ok.z); render();
    } else if (place.state.phase === 'placed') ring.visible = false;
    renderer.render(scene, camera);
  });
  render();
  return { end: stop, session };
}

export default { createPlacement, fingerAngle, angleDelta, yawFromTwist, buildThreeGroup, startWebXrAr };
