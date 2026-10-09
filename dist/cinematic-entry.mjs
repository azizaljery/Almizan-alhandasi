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
  // Distinct massing and recesses, not a single flat rectangular block.
  mesh(7.1, 4.5, 7.7, -5.1, 2.35, -.7, sandstone);
  mesh(7.1, 4.2, 7.7, 5.1, 2.2, -.7, ivory);
  mesh(4.1, 3.6, 5.8, 0, 1.9, -.3, sandstone);
  mesh(7.75, .36, 8.3, -5.1, 4.8, -.7, roof);
  mesh(7.75, .36, 8.3, 5.1, 4.5, -.7, roof);
  mesh(4.6, .28, 6.3, 0, 3.8, -.3, ivory);
  // Najdi-inspired roof parapets, stone bands and deep openings.
  for (const sign of [-1, 1]) {
    const x = sign * 5.1, front = 3.25;
    mesh(7.7, .5, .27, x, 5.05 - (sign > 0 ? .3 : 0), front, ivory);
    mesh(.26, .65, 8.0, x + sign * 3.8, 4.95 - (sign > 0 ? .3 : 0), -.7, sandstone);
    mesh(7.8, .14, .6, x, 4.38 - (sign > 0 ? .3 : 0), front + .05, metal);
    mesh(2.05, 1.9, .19, x, 2.38, front + .09, glass);
    mesh(2.25, .17, .58, x, 3.42, front + .2, metal);
    mesh(.16, 2.1, .45, x - 1.13, 2.4, front + .19, ivory);
    mesh(.16, 2.1, .45, x + 1.13, 2.4, front + .19, ivory);
    mesh(.13, 1.9, .35, x, 2.38, front + .21, ivory);
    for (let k = 0; k < 4; k++) {
      const rib = x + sign * (2.1 + k * .35);
      mesh(.12, 2.45, .42, rib, 2.5, front + .1, ivory);
    }
  }
  // Recessed central portal and sculpted arch framing the entrance.
  mesh(3.25, 3.55, .28, 0, 1.9, 2.74, darkStone);
  mesh(2.35, 2.95, .31, 0, 1.55, 2.95, glass);
  mesh(.15, 2.9, .38, 0, 1.55, 3.16, metal);
  mesh(3.9, .25, 1.25, 0, 3.7, 3.02, roof);
  for (const sign of [-1, 1]) mesh(.28, 3.5, .58, sign * 1.78, 1.85, 3.08, ivory);
  const arch = new T.Shape();
  arch.moveTo(-1.72, .2);
  arch.lineTo(-1.72, 2.4);
  arch.quadraticCurveTo(-1.72, 3.55, 0, 3.75);
  arch.quadraticCurveTo(1.72, 3.55, 1.72, 2.4);
  arch.lineTo(1.72, .2);
  arch.closePath();
  const opening = new T.Path();
  opening.moveTo(-1.38, .2);
  opening.lineTo(-1.38, 2.38);
  opening.quadraticCurveTo(-1.3, 3.16, 0, 3.38);
  opening.quadraticCurveTo(1.3, 3.16, 1.38, 2.38);
  opening.lineTo(1.38, .2);
  opening.closePath();
  arch.holes.push(opening);
  const archGeometry = new T.ExtrudeGeometry(arch, { depth: .18, bevelEnabled: false, curveSegments: 16 });
  geometries.add(archGeometry);
  const archMesh = new T.Mesh(archGeometry, ivory);
  archMesh.position.set(0, .2, 3.16);
  archMesh.castShadow = true; archMesh.receiveShadow = true; scene.add(archMesh);
  // Warm entrance paving, landscaping and readable cast shadows.
  mesh(6.1, .14, 5.4, 0, .21, 5.8, ivory, false);
  for (let i = 0; i < 6; i++) {
    mesh(5.2, .025, .08, 0, .31, 3.7 + i * .75, darkStone, false);
  }
  const leaves = material('#315a45'), trunkMat = material('#967751');
  const tree = (x, z) => {
    const trunkGeometry = new T.CylinderGeometry(.13, .2, 2.3, 7); geometries.add(trunkGeometry);
    const trunk = new T.Mesh(trunkGeometry, trunkMat); trunk.position.set(x, 1.2, z);
    trunk.castShadow = true; scene.add(trunk);
    const crownGeometry = new T.SphereGeometry(1.35, 10, 7); geometries.add(crownGeometry);
    const crown = new T.Mesh(crownGeometry, leaves);
    crown.scale.set(1, .55, .92); crown.position.set(x, 2.7, z);
    crown.castShadow = true; crown.receiveShadow = true; scene.add(crown);
  };
  tree(-11.4, 4.6); tree(11.6, 5.1);
  tree(-13.6, -2.8); tree(13.5, -3.7);
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
  const far = new T.Vector3(58, 34, 67), near = new T.Vector3(12.5, 8.4, 17.2);
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
  let finished = false, scene = null, frame = 0, fallbackTimer = 0;
  const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const begin = win.performance.now();
  const finish = () => {
    if (finished) return;
    finished = true;
    win.cancelAnimationFrame(frame);
    if (fallbackTimer) win.clearTimeout(fallbackTimer);
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
  fallbackTimer = win.setTimeout(finish, CINEMATIC_TIMING.totalMs + 850);
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
