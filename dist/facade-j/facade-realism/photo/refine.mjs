// التحسين التراكمي: حين تسكن الكاميرا يُعاد تصيير الإطار عدة مرات بإزاحة جزء من البكسل (تنعيم فائق)، وباهتزاز صغير لاتجاه الشمس (ظلال ناعمة الحواف)،
// وبضوء سماء من اتجاه عشوائي مع ظله في كل عيّنة (تعتيم محيطي حقيقي: الزوايا والتجاويف وما تحت البروزات أغمق)، ثم يُعرض متوسطها.
// أثناء الحركة يُرسم إطار واحد عادي مباشرة (سريع)؛ التحسين لا يكلّف شيئًا أثناء التنقل ويُقطع فور أي حركة.
import { rnd } from './util.mjs';

export function createRefiner(THREE, { renderer, scene, camera, state, tier }) {
  const R = rnd(977), size = new THREE.Vector2(); let rtA = null, rtB = null, rtS = null, n = 0, target = 0, raf = 0, w = 0, h = 0, onDone = null, lens = { shift: 0 };
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadGeo = new THREE.PlaneGeometry(2, 2);
  const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
  const blendMat = new THREE.ShaderMaterial({ uniforms: { tNew: { value: null }, tOld: { value: null }, k: { value: 1 } }, vertexShader: vs, fragmentShader: 'uniform sampler2D tNew, tOld; uniform float k; varying vec2 vUv; void main(){ vec4 n = texture2D( tNew, vUv ); n.rgb = clamp( n.rgb, vec3( 0.0 ), vec3( 48.0 ) ); gl_FragColor = mix( texture2D( tOld, vUv ), n, k ); }', depthTest: false, depthWrite: false, toneMapped: false });
  const outMat = new THREE.ShaderMaterial({ uniforms: { tAcc: { value: null } }, vertexShader: vs, fragmentShader: 'uniform sampler2D tAcc; varying vec2 vUv; void main(){ gl_FragColor = vec4( texture2D( tAcc, vUv ).rgb, 1.0 );\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}', depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(quadGeo, blendMat); quad.frustumCulled = false; const qScene = new THREE.Scene(); qScene.add(quad);
  // ضوء السماء المظلَّل (يحلّ محلّ جزء السماء من ضوء نصف الكرة أثناء التراكم)
  const skyL = new THREE.DirectionalLight('#ffffff', 0); skyL.castShadow = true; skyL.shadow.mapSize.set(tier.aoMap, tier.aoMap); skyL.shadow.bias = -0.0004; skyL.shadow.normalBias = .05; skyL.shadow.radius = 3; skyL.visible = false; scene.add(skyL, skyL.target);
  const base = { hemi: state.hemi.intensity, sunPos: new THREE.Vector3(), skyCol: state.hemi.color.clone(), gndCol: state.hemi.groundColor.clone() };
  const AO = tier.ao; // حصة ضوء السماء التي تُظلَّل
  function alloc() { renderer.getDrawingBufferSize(size); if (rtA && w === size.x && h === size.y) return; w = size.x; h = size.y; for (const t of [rtA, rtB, rtS]) t?.dispose();
    const o = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }; rtA = new THREE.WebGLRenderTarget(w, h, o); rtB = new THREE.WebGLRenderTarget(w, h, o); rtS = new THREE.WebGLRenderTarget(w, h, { ...o, depthBuffer: true, samples: tier.msaa }); }
  /** إسقاط الكاميرا مع «إزاحة عدسة» رأسية (خطوط رأسية مستقيمة) وإزاحة جزء بكسل للتنعيم. */
  function project(jx = 0, jy = 0) { camera.updateProjectionMatrix(); const e = camera.projectionMatrix.elements; e[8] += jx; e[9] += lens.shift + jy; camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); }
  function fitSky(dir) { const b = state.bounds, c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() / 2 + 1; skyL.target.position.copy(c); skyL.position.copy(c).addScaledVector(dir, r + 20); const cam = skyL.shadow.camera; Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 2 * r + 40 }); cam.updateProjectionMatrix(); skyL.target.updateMatrixWorld(); }
  function restore() { skyL.visible = false; skyL.intensity = 0; state.hemi.intensity = base.hemi; state.hemi.color.copy(base.skyCol); if (n > 0) { state.sun.position.copy(base.sunPos); } renderer.shadowMap.needsUpdate = true; }
  function direct() { cancel(); project(); renderer.setRenderTarget(null); renderer.render(scene, camera); }
  function cancel() { if (raf) cancelAnimationFrame(raf); raf = 0; if (n > 0 || skyL.visible) { restore(); n = 0; } target = 0; }
  function sample() {
    alloc(); if (n === 0) base.sunPos.copy(state.sun.position);
    // إزاحة جزء بكسل (هالتون) + اهتزاز الشمس ضمن قرص زاويّ صغير + اتجاه سماء عشوائي
    const hx = halton(n + 1, 2) - .5, hy = halton(n + 1, 3) - .5; project(hx * 2 / w, hy * 2 / h);
    const c = state.sun.target.position, d = base.sunPos.clone().sub(c), L = d.length(), a = R() * 6.283, rr = Math.sqrt(R()) * tier.sunDisk * L, t1 = new THREE.Vector3(0, 1, 0).cross(d).normalize(), t2 = d.clone().cross(t1).normalize();
    state.sun.position.copy(base.sunPos).addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr);
    if (AO > 0) { const u = R(), th = R() * 6.283, s = Math.sqrt(1 - u * u), dir = new THREE.Vector3(s * Math.cos(th), .08 + u * .92, s * Math.sin(th)).normalize(); fitSky(dir);
      skyL.visible = true; skyL.color.copy(base.skyCol); skyL.intensity = base.hemi * AO * 2; state.hemi.intensity = base.hemi; state.hemi.color.copy(base.skyCol).multiplyScalar(1 - AO); }
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(rtS); renderer.render(scene, camera);
    quad.material = blendMat; blendMat.uniforms.tNew.value = rtS.texture; blendMat.uniforms.tOld.value = rtA.texture; blendMat.uniforms.k.value = 1 / (n + 1);
    renderer.setRenderTarget(rtB); renderer.render(qScene, quadCam); [rtA, rtB] = [rtB, rtA]; n++;
    quad.material = outMat; outMat.uniforms.tAcc.value = rtA.texture; renderer.setRenderTarget(null); renderer.render(qScene, quadCam);
  }
  function loop() { raf = 0; if (n >= target) { finish(); return; } sample(); raf = requestAnimationFrame(loop); }
  function finish() { const done = n; restore(); project(); n = 0; target = 0; onDone?.(done); onDone = null; api.converged = done; }
  function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
  const api = {
    converged: 0, get samples() { return n; }, get busy() { return target > 0; }, lens,
    /** إطار واحد مباشر (أثناء الحركة). */
    render: direct,
    /** يبدأ التراكم بعد سكون الكاميرا. */
    start(samples = tier.samples, cb = null) { if (samples <= 0) { direct(); cb?.(0); return; } cancel(); api.converged = 0; target = samples; onDone = cb; raf = requestAnimationFrame(loop); },
    cancel,
    /** تراكم متزامن كامل (للقطة عالية الجودة وللاختبار الآلي). */
    async settle(samples = tier.samples, step = null) { cancel(); if (samples <= 0) { direct(); return 0; } target = samples; for (let i = 0; i < samples; i++) { sample(); if (step && i % 4 === 3) await step(i + 1, samples); } const done = n; restore(); project(); n = 0; target = 0; api.converged = done; return done; },
    dispose() { cancel(); for (const t of [rtA, rtB, rtS]) t?.dispose(); blendMat.dispose(); outMat.dispose(); quadGeo.dispose(); scene.remove(skyL, skyL.target); skyL.shadow.map?.dispose(); },
  };
  return api;
}
