// Cinematic entrance: a short architectural establishing shot, then a camera approach
// that resolves into the Mizan identity. This scene is decorative, not a floor plan.
import { loadThreeRuntime } from './three-runtime.mjs';

export const CINEMATIC_TIMING = Object.freeze({ holdMs: 2700, approachMs: 1550, revealMs: 550, totalMs: 4800 });
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ease = x => 1 - Math.pow(1 - clamp(x), 3);

export function cinematicFrame(elapsedMs) {
  const t = Math.max(0, Number(elapsedMs) || 0);
  const approach = ease((t - CINEMATIC_TIMING.holdMs) / CINEMATIC_TIMING.approachMs);
  const reveal = ease((t - CINEMATIC_TIMING.holdMs - CINEMATIC_TIMING.approachMs * .64) / CINEMATIC_TIMING.revealMs);
  return { approach, reveal, finished: t >= CINEMATIC_TIMING.totalMs };
}

export function createArchitecturalScene(T, host) {
  const scene = new T.Scene();
  scene.background = new T.Color('#0d211c');
  scene.fog = new T.Fog('#0d211c', 48, 130);
  const camera = new T.PerspectiveCamera(37, 1, .1, 180);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  if (T.ACESFilmicToneMapping) renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const materials = new Set(), geometries = new Set();
  const material = (color, roughness = .82) => {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness: .03 });
    materials.add(m); return m;
  };
  const sandstone = material('#e2cfaa'), ivory = material('#f4ead6'), darkStone = material('#a9926d');
  const roof = material('#9b7951'), glass = material('#557e7c', .23), metal = material('#ad8a4f', .38);
  const grass = material('#1e3b30');
  const mesh = (w, h, d, x, y, z, mat, shadow = true) => {
    const geometry = new T.BoxGeometry(w, h, d); geometries.add(geometry);
    const object = new T.Mesh(geometry, mat); object.position.set(x, y, z);
    object.castShadow = shadow; object.receiveShadow = true; scene.add(object); return object;
  };
  mesh(170, .1, 170, 0, -.22, 0, grass, false);
  mesh(18, .35, 14, 0, 0, 0, darkStone, false);
  // A contemporary Najdi-inspired villa: two masses, central portal and deep openings.
  mesh(6.7, 4.4, 7.2, -4.7, 2.25, -.6, sandstone);
  mesh(6.7, 4.4, 7.2, 4.7, 2.25, -.6, sandstone);
  mesh(3.5, 3.5, 4.3, 0, 1.8, -2.2, ivory);
  mesh(17.8, .35, 8.4, 0, 4.6, -.7, roof);
  mesh(3.1, 3.8, .35, 0, 2.2, 3.45, darkStone);
  mesh(2.1, 3.15, .42, 0, 1.75, 3.72, glass);
  mesh(2.45, .14, .45, 0, 3.55, 3.76, metal);
  for (const sign of [-1, 1]) {
    mesh(.26, 4.15, .48, sign * 1.58, 2.1, 3.7, ivory);
    mesh(1.5, 1.55, .16, sign * 5.3, 2.15, 3.1, glass);
    mesh(1.65, .15, .43, sign * 5.3, 3.05, 3.2, metal);
    mesh(.18, 1.75, .38, sign * 4.46, 2.2, 3.15, ivory);
    mesh(.18, 1.75, .38, sign * 6.14, 2.2, 3.15, ivory);
    mesh(6.8, .28, .55, sign * 4.7, 4.35, 3.15, ivory);
    mesh(.4, 1.25, .4, sign * 8.5, 4.7, 3.2, sandstone);
  }
  // Recessed terrace, landscaping and a long afternoon shadow.
  mesh(5.8, .16, 4.4, 0, .22, 5.15, ivory, false);
  for (const sign of [-1, 1]) {
    mesh(.28, 2.3, .28, sign * 9.8, 1.1, 4.3, darkStone);
    mesh(1.7, .75, 1.7, sign * 9.8, 2.5, 4.3, grass);
  }
  const hemi = new T.HemisphereLight(0xf7ead4, 0x345349, 2.1); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffe0a4, 3.6);
  sun.position.set(-23, 33, 18); sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 25, bottom: -25, near: 1, far: 95 });
  sun.shadow.bias = -.00025;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0xb2d4c5, .7); fill.position.set(17, 13, -15); scene.add(fill);
  const target = new T.Vector3(0, 1.7, .2);
  const far = new T.Vector3(30, 20, 38), near = new T.Vector3(10.5, 7.4, 14.8);
  let width = 0, height = 0;
  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    if (w === width && h === height) return;
    width = w; height = h; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
  };
  host.append(renderer.domElement);
  const update = elapsed => {
    resize();
    const state = cinematicFrame(elapsed);
    camera.position.copy(far).lerp(near, state.approach);
    camera.position.x += Math.sin(elapsed * .00018) * (1 - state.approach) * .9;
    camera.lookAt(target);
    renderer.render(scene, camera);
    return state;
  };
  const dispose = () => {
    renderer.domElement.remove();
    renderer.dispose();
    for (const m of materials) m.dispose();
    for (const g of geometries) g.dispose();
  };
  return { update, dispose };
}

export function startCinematic({ doc = document, win = window } = {}) {
  const intro = doc.getElementById('intro');
  const enter = doc.getElementById('enter');
  const skip = doc.getElementById('cinematicSkip');
  const host = doc.getElementById('cinematicCanvas');
  if (!intro || !enter || !skip || !host) return null;
  let finished = false, scene = null, frame = 0;
  const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const begin = win.performance.now();
  const finish = () => {
    if (finished) return;
    finished = true;
    win.cancelAnimationFrame(frame);
    scene?.dispose();
    intro.classList.add('cinematic-finished');
    enter.click(); // Existing boot code keeps the old route and saved-project logic intact.
    doc.querySelector('[data-go="design"]')?.click();
    doc.getElementById('studioBrief')?.focus({ preventScroll: true });
  };
  skip.addEventListener('click', finish, { once: true });
  if (reduced) {
    intro.classList.add('cinematic-reduced');
    frame = win.requestAnimationFrame(finish);
    return { finish };
  }
  const tick = now => {
    if (finished) return;
    const state = cinematicFrame(now - begin);
    if (scene) scene.update(now - begin);
    intro.style.setProperty('--cinematic-reveal', String(state.reveal));
    if (state.finished) return finish();
    frame = win.requestAnimationFrame(tick);
  };
  frame = win.requestAnimationFrame(tick);
  loadThreeRuntime().then(T => {
    if (finished) return;
    try {
      scene = createArchitecturalScene(T, host);
      intro.classList.add('cinematic-webgl');
    } catch {
      intro.classList.add('cinematic-fallback');
    }
  }).catch(() => intro.classList.add('cinematic-fallback'));
  return { finish };
}

if (typeof document !== 'undefined') startCinematic();
