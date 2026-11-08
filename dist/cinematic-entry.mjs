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
  // هوية العاج والبرونز: نهار عاجي دافئ (كان أخضر داكنًا)
  scene.background = new T.Color('#efe6da');
  scene.fog = new T.Fog('#efe6da', 62, 150);
  const camera = new T.PerspectiveCamera(37, 1, .1, 180);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  if (T.ACESFilmicToneMapping) renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const materials = new Set(), geometries = new Set(), textures = new Set();
  // خامات إجرائية خفيفة (لا صور): خرائط إضاءة رمادية حول 1.0 تُضرب في لون الخامة فتبقى هوية العاج والبرونز كما هي،
  // مع خرائط نتوء/خشونة صغيرة (≤ 512) لكتل الحجر وفواصلها وحبيبات اللياسة. بلا Canvas (اختبارات) تعود الخامات لونًا صافيًا.
  const hasCanvas = typeof document !== 'undefined' && !!document.createElement;
  const rnd = (seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(20261108);
  const canvasTex = (S, metres, srgb, draw) => {
    if (!hasCanvas) return null;
    const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d'), S);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / metres, 1 / metres); t.anisotropy = 4;
    if (srgb) t.colorSpace = T.SRGBColorSpace; textures.add(t); t.userData.canvas = c; return t;
  };
  const toNormal = (hTex, k) => { // تفاضل الارتفاع → خريطة عمودي مماسي (تلتف عند الحواف)
    if (!hTex) return null; const c = hTex.userData.canvas, S = c.width, src = c.getContext('2d').getImageData(0, 0, S, S).data;
    return canvasTex(S, 1 / hTex.repeat.x, false, (x) => { const img = x.createImageData(S, S), d = img.data, h = (i, j) => src[(((j + S) % S) * S + ((i + S) % S)) * 4] / 255;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const dx = (h(i + 1, j) - h(i - 1, j)) * k, dy = -(h(i, j + 1) - h(i, j - 1)) * k, l = Math.hypot(dx, dy, 1), o = (j * S + i) * 4; d[o] = (-dx / l * .5 + .5) * 255; d[o + 1] = (-dy / l * .5 + .5) * 255; d[o + 2] = (.5 / l + .5) * 255; d[o + 3] = 255; }
      x.putImageData(img, 0, 0); });
  };
  const speck = (x, S, n, a) => { for (let i = 0; i < n; i++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${a * rnd()})`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); } };
  // حجر: مداميك 30 سم وكتل 40–90 سم، فاصل 1 سم أغمق وغائر، تفاوت لوني خفيف لكل كتلة
  const blocks = (x, S, metres, mortar, face) => { const px = S / metres, rows = Math.round(metres / .3), rh = S / rows, j = Math.max(2, Math.round(.012 * px));
    x.fillStyle = mortar; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) { let u = -rnd() * px * .5; while (u < S) { const len = px * (.4 + rnd() * .5), v = face(); for (const off of [-S, 0, S]) { x.fillStyle = v; x.fillRect(u + off + j / 2, r * rh + j / 2, len - j, rh - j); } u += len; } } };
  const stoneMap = canvasTex(512, 2.4, true, (x, S) => { blocks(x, S, 2.4, 'rgb(196,190,180)', () => { const v = 238 + Math.round(rnd() * 17); return `rgb(${v},${v - 2},${v - 6})`; }); speck(x, S, 2600, .12); });
  const stoneH = canvasTex(512, 2.4, false, (x, S) => { blocks(x, S, 2.4, 'rgb(60,60,60)', () => { const v = 200 + Math.round(rnd() * 30); return `rgb(${v},${v},${v})`; }); speck(x, S, 3000, .25); });
  const plasterMap = canvasTex(256, 2, true, (x, S) => { x.fillStyle = 'rgb(250,248,244)'; x.fillRect(0, 0, S, S); speck(x, S, 1500, .06); });
  const plasterH = canvasTex(256, 2, false, (x, S) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, S, S); speck(x, S, 6000, .35); });
  const stoneN = toNormal(stoneH, 4), plasterN = toNormal(plasterH, 1.2);
  const material = (color, roughness = .82, extra = {}) => {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness: .03, envMapIntensity: .2, ...extra });
    materials.add(m); return m;
  };
  const NS = (k) => new T.Vector2(k, k);
  const sandstone = material('#e2cfaa', .86, stoneMap ? { map: stoneMap, normalMap: stoneN, normalScale: NS(.9) } : {});
  const ivory = material('#f4ead6', .9, plasterMap ? { map: plasterMap, normalMap: plasterN, normalScale: NS(.5) } : {});
  const darkStone = material('#a9926d', .8, stoneMap ? { map: stoneMap, normalMap: stoneN, normalScale: NS(1) } : {});
  // سقف وبرونز وزجاج: الزجاج يعكس سماء عاجية (بيئة PMREM) بدل لون رمادي مسطح؛ البرونز معدني فعلًا
  const roof = material('#7a5136', .7), glass = material('#3f4a52', .08, { metalness: .2, envMapIntensity: .8 }), metal = material('#a97142', .32, { metalness: .6, envMapIntensity: .8 });
  const grass = material('#d6c6ae');
  // UV بالمتر من موضع الصندوق في المشهد: تتصل الكتل والفواصل بين الصناديق المتجاورة ولا تتمدد مع حجم الوجه
  const metreUV = (geometry, ox, oy, oz) => { const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) { const X = p.getX(i) + ox, Y = p.getY(i) + oy, Z = p.getZ(i) + oz, ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, X, Z); else if (ax >= az) uv.setXY(i, Z, Y); else uv.setXY(i, X, Y); } uv.needsUpdate = true; };
  const mesh = (w, h, d, x, y, z, mat, shadow = true) => {
    const geometry = new T.BoxGeometry(w, h, d); geometries.add(geometry); if (mat.map) metreUV(geometry, x, y, z);
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
  const leaves = material('#6d7a55'), trunkMat = material('#8a6a4a');
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
  // بيئة انعكاس من سماء عاجية متدرجة (PMREM): تعطي الزجاج والبرونز انعكاسًا ناعمًا؛ ونصف الكرة يُخفَّض بقدر ما تضيفه البيئة
  let envTarget = null;
  try {
    const pm = new T.PMREMGenerator(renderer), envScene = new T.Scene(), skyGeo = new T.SphereGeometry(40, 24, 12);
    const skyMat = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 v; void main(){ float h = v.y; vec3 top = vec3(.86,.89,.93), hor = vec3(1.0,.95,.88), gr = vec3(.55,.48,.38); vec3 c = h > 0.0 ? mix(hor, top, pow(h, .6)) : mix(hor, gr, clamp(-h * 3.0, 0.0, 1.0)); vec3 s = normalize(vec3(-.5,.62,.4)); c += vec3(1.0,.9,.7) * pow(max(dot(v, s), 0.0), 60.0) * 4.0; gl_FragColor = vec4(c, 1.0); }' });
    envScene.add(new T.Mesh(skyGeo, skyMat)); envTarget = pm.fromScene(envScene, .02); scene.environment = envTarget.texture;
    skyGeo.dispose(); skyMat.dispose(); pm.dispose();
  } catch { envTarget = null; }
  const hemi = new T.HemisphereLight(0xfff4e2, 0xb8a58c, envTarget ? 1.85 : 2.0); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffe0a4, 3.6);
  sun.position.set(-23, 33, 18); sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .02;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 25, bottom: -25, near: 1, far: 95 });
  sun.shadow.bias = -.00025;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0xffe6cc, .7); fill.position.set(17, 13, -15); scene.add(fill);
  const target = new T.Vector3(0, 1.7, .2);
  const far = new T.Vector3(40, 26, 47), near = new T.Vector3(19.5, 11.5, 26.5);
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
    // بعد الاقتراب: تمايل بطيء حول المبنى يمينًا ويسارًا (طابع ثلاثي الأبعاد للصفحة الأولى)
    const orbit = elapsed > CINEMATIC_TIMING.totalMs ? Math.sin((elapsed - CINEMATIC_TIMING.totalMs) * .00011) * .32 : 0; // تمايل هادئ يبقي المبنى في مكانه
    if (orbit) { const dx = camera.position.x - target.x, dz = camera.position.z - target.z, c = Math.cos(orbit), s = Math.sin(orbit); camera.position.x = target.x + dx * c - dz * s; camera.position.z = target.z + dx * s + dz * c; }
    // الشاشات العريضة: المبنى في النصف الأيسر والنص في الأيمن (العربية من اليمين)
    const side = width > 760 ? Math.min(8.5, width / 170) : 0;
    if (side) {
      const dir = new T.Vector3().subVectors(target, camera.position).normalize(), right = new T.Vector3().crossVectors(dir, camera.up).normalize();
      camera.position.addScaledVector(right, side); camera.lookAt(target.clone().addScaledVector(right, side));
    } else {
      // الجوال: المبنى كاملًا في أعلى الشاشة فوق النص
      camera.position.sub(target).multiplyScalar(2.7).add(target);
      camera.lookAt(target.x, target.y - 17, target.z);
    }
    renderer.render(scene, camera);
    return state;
  };
  const dispose = () => {
    renderer.domElement.remove();
    renderer.dispose();
    for (const m of materials) m.dispose();
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    envTarget?.dispose();
  };
  return { update, dispose };
}

export function startCinematic({ doc = document, win = window, playIntro = false } = {}) {
  const intro = doc.getElementById('intro');
  const skip = doc.getElementById('cinematicSkip');
  const host = doc.getElementById('cinematicCanvas');
  const app = doc.getElementById('app');
  if (!intro || !skip || !host) return null;
  let finished = false, scene = null, frame = 0, fallbackTimer = 0;
  const reduced = !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const begin = win.performance.now();
  if (app) app.inert = true;
  const finish = () => {
    if (finished) return;
    finished = true;
    win.cancelAnimationFrame(frame);
    if (fallbackTimer) win.clearTimeout(fallbackTimer);
    scene?.dispose();
    intro.classList.add('cinematic-finished', 'off');
    if (app) app.inert = false;
    const designTab = doc.querySelector('[data-tab="design"]');
    if (designTab) designTab.click();
    else doc.querySelector('[data-go="design"]')?.click();
    doc.getElementById('studioBrief')?.focus({ preventScroll: true });
    win.setTimeout(() => { intro.inert = true; }, 700);
  };
  skip.addEventListener('click', finish, { once: true });
  // The project surface is available immediately; the introduction is opt-in.
  if (!playIntro) { finish(); return { finish }; }
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
