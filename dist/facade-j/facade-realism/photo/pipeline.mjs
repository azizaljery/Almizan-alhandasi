// خط «الصورة المعمارية» للواجهة الواقعية: مستوى الجودة، الكاميرا الافتتاحية، سقف المبنى، بيئة انعكاس الزجاج من المحيط نفسه، ثم المحيط والخامات على مرحلتين
// (إطار أول سريع للمبنى وحده، ثم المحيط والنباتات، ثم تحسين تراكمي عند السكون).
import clip from '../../facade-kit/vendor/polygon-clipping.mjs';
import { designHash } from '../variation.mjs';
import { photoLook, upgradeMaterials, fitSun, buildingBox } from './look.mjs';
import { planSite, heroSide } from './site-plan.mjs';
import { buildSite, frontInfo } from './site.mjs';
import { createRefiner } from './refine.mjs';
export { frontSouthDoc } from './site-plan.mjs';

export const TIERS = Object.freeze({
  high:   { name: 'high',   pr: 2,    shadow: 4096, tex: 1024, plants: 1,   detail: true,  samples: 40, ao: .8, aoMap: 1024, sunDisk: .011, bgCube: 512, envCube: 256, aniso: 8, msaa: 0, neighbors: true },
  medium: { name: 'medium', pr: 1.5,  shadow: 2048, tex: 1024, plants: .7,  detail: true,  samples: 14, ao: .8, aoMap: 512,  sunDisk: .011, bgCube: 256, envCube: 128, aniso: 4, msaa: 0, neighbors: true },
  low:    { name: 'low',    pr: 1,    shadow: 1024, tex: 512,  plants: .4,  detail: false, samples: 0,  ao: 0,  aoMap: 256,  sunDisk: 0,    bgCube: 256, envCube: 0,   aniso: 2, msaa: 0, neighbors: true },
});
/** اختيار مستوى الجودة: صريح (?q=)، وإلا من الجهاز: جوال/ذاكرة/أنوية/مصيّر برمجي. يُخفَّض لاحقًا إن كان زمن الإطار المقيس عاليًا. */
export function pickTier(q, env = {}) {
  const forced = q.get('q'); let name = TIERS[forced] ? forced : null, why = 'forced';
  if (!name) { const nav = env.navigator || globalThis.navigator || {}, dm = nav.deviceMemory || 8, hc = nav.hardwareConcurrency || 8, ua = nav.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (nav.maxTouchPoints > 1 && Math.min(env.screenW ?? globalThis.screen?.width ?? 2000, env.screenH ?? globalThis.screen?.height ?? 2000) < 820);
    const soft = /swiftshader|llvmpipe|software|basic render/i.test(env.gpu || '');
    name = soft ? 'low' : mobile ? (dm >= 6 && hc >= 8 ? 'medium' : 'low') : (hc <= 2 || dm <= 2) ? 'low' : (hc <= 4 || dm <= 4) ? 'medium' : 'high';
    why = soft ? 'software-gl' : mobile ? 'mobile' : 'desktop'; }
  const t = { ...TIERS[name], why }; const s = q.get('samples'); if (s != null && s !== '') t.samples = Math.max(0, Math.min(256, +s || 0)); return t;
}
export function gpuName(renderer) { try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch { return ''; } }

/**
 * الكاميرا الافتتاحية: بمستوى عين إنسان (1.6 م) من الشارع بزاوية ¾، عدسة ~30 مم. النظر أفقي تقريبًا و«إزاحة العدسة» تتولاها nav (خطوط رأسية مستقيمة):
 * نقطة النظر تُرفع على الواجهة بقدر الإزاحة المطلوبة ليدخل أعلى المبنى في الإطار.
 */
export function heroCamera(THREE, { bb, side = 'e', aspect = 1.6, zMax = Infinity }) {
  const H = bb.max.y, tall = H > 7, fov = aspect < 1 ? 60 : tall ? 46 : 40, t = Math.tan(fov * Math.PI / 360), W = bb.max.x - bb.min.x, D = bb.max.z - bb.min.z, a = 33 * Math.PI / 180, sg = side === 'w' ? -1 : 1, S = .56;
  const need = Math.max((W * Math.cos(a) + D * Math.sin(a)) * 1.1 / (2 * t * aspect), (H + 2.2 - 1.6) / ((1 + S) * t) / .86);
  const cx = (bb.min.x + bb.max.x) / 2, zf = bb.max.z, dist = Math.min(Math.max(need, 11), Math.max(11, (zMax - zf) / Math.cos(a))), pos = [cx + sg * Math.sin(a) * dist - sg * W * .06, 1.6, zf + Math.cos(a) * dist];
  const shift = Math.max(.3, Math.min(S, ((H + 2.4 - 1.6) / (dist * .86)) / t - 1));
  return { pos, look: [cx - sg * W * .04, 1.6 + shift * t * dist, zf - D * .25], fov };
}

/** سقف الدور الأخير: بلاطة داخل محيط الجدران (منكمشة عن وجهها) تحت الدروة، فلا يظهر المبنى قشرةً مجوّفة من الأعلى. */
export function addRoof(THREE, scene, doc, FI) {
  const L0 = doc.levels?.[0]?.id, rects = (doc.walls || []).filter(w => (w.level ?? L0) === L0 && w.kind !== 'fence').map(w => { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1, k = Math.max(.03, (w.t || .2) / 4), nx = -dy / L * k, ny = dx / L * k, ex = dx / L * k, ey = dy / L * k;
    return [[[w.a.x - ex + nx, w.a.y - ey + ny], [w.b.x + ex + nx, w.b.y + ey + ny], [w.b.x + ex - nx, w.b.y + ey - ny], [w.a.x - ex - nx, w.a.y - ey - ny], [w.a.x - ex + nx, w.a.y - ey + ny]]]; });
  if (!rects.length) return null; let U; try { U = clip.union(...rects); } catch { return null; } if (!U.length) return null;
  const area = r => Math.abs(r.reduce((s, p, i) => { const n = r[(i + 1) % r.length]; return s + p[0] * n[1] - n[0] * p[1]; }, 0) / 2), ring = U.slice().sort((a, b) => area(b[0]) - area(a[0]))[0][0];
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))), { depth: .25, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, FI.parapetBase - .32, 0);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#d9cbb2', roughness: .95 })); m.material.name = 'roof-screed-concrete'; m.name = 'roof-slab'; m.castShadow = m.receiveShadow = true; scene.add(m); return m;
}

/** بيئة انعكاس الزجاج من المحيط نفسه (شارع، نخيل، سماء): كاميرا مكعبة أمام الواجهة ثم PMREM. */
function captureGlassEnv(THREE, { renderer, scene, state, bb, tier }) {
  if (!tier.envCube || !state.glass) return null;
  const crt = new THREE.WebGLCubeRenderTarget(tier.envCube, { type: THREE.UnsignedByteType, generateMipmaps: false }) /* 8 بت خطي: يقصّ اللمعات اللانهائية للمعادن المصقولة التي كانت تُفسد البيئة كلها (NaN) بعد التمويه */, cc = new THREE.CubeCamera(.3, 400, crt);
  cc.position.set((bb.min.x + bb.max.x) / 2, Math.min(3.2, bb.max.y * .45), bb.max.z + 1.6); const fog = scene.fog; scene.fog = null; const vis = state.glass.visible; state.glass.visible = false;
  cc.update(renderer, scene); scene.fog = fog; state.glass.visible = vis;
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromCubemap(crt.texture).texture; pm.dispose(); crt.dispose();
  state.glass.envMap = env; state.glass.envMapIntensity = state.night ? .9 : 1.25; state.glass.needsUpdate = true; state.disposables.push(env); return env;
}

/** المرحلة الأولى: قبل الإطار الأول. */
export function photoBegin(THREE, ctx) { const side = ctx.q.get('hero') || heroSide(ctx.doc); if (!ctx.q.has('az')) ctx.q.set('az', side === 'e' ? '236' : '124'); const state = photoLook(THREE, ctx); state.side = side; return state; }

/** المرحلة الثانية: بعد الإطار الأول — السقف والمحيط والنباتات وتفصيل الخامات وانعكاس الزجاج، ثم إعادة ضبط الظل على المشهد كله. */
export function photoFinish(THREE, { scene, renderer, S, q, doc, FI, state, styleId }) {
  const tier = state.tier, t0 = performance.now(), fi = frontInfo(THREE, S), info = { tier: tier.name };
  if (q.get('roof') !== '0') addRoof(THREE, scene, doc, FI);
  let site = null;
  if (q.get('site') !== '0') { const plan = planSite(doc, { doors: fi.doors, windows: fi.windows, B: fi.B, style: styleId || 'M', seed: designHash(doc), density: tier.plants });
    if (plan) { const g = S.meshes.find(m => m.name === 'ground'); if (g) g.visible = false; site = buildSite(THREE, { scene, S, plan, state, tier, night: state.night }); info.plants = site.plants; info.cornerSide = plan.gates.car ? plan.gates.car.side : plan.camSide; info.site = { gates: Object.keys(plan.gates), fixtures: plan.fixtures.map(f => f.kind), streets: plan.streets }; } }
  info.detailMaterials = upgradeMaterials(THREE, scene, state);
  const bb = buildingBox(THREE, S); fitSun(THREE, state, site ? site.bounds.clone().union(bb) : bb, 1.5); renderer.shadowMap.needsUpdate = true;
  if (site) captureGlassEnv(THREE, { renderer, scene, state, bb, tier });
  info.stage2Ms = Math.round(performance.now() - t0); return { site, info };
}
export { createRefiner };
