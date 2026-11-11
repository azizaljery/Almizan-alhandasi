// «الصورة المعمارية»: ضوء ساعة ذهبية، سماء تحليلية وبيئة انعكاس منها، زجاج عاكس يُرى الداخل الدافئ خلفه، وتفصيل خامات بمقياس العالم.
// لا يغيّر جدارًا ولا فتحة: إضاءة وخامات فقط. كل شيء إجرائي (لا صور ولا شبكة).
import { rnd, clamp, tileNoise, dataTex, canvas, canvasTex } from './util.mjs';
import { doorMaterial, fitDoorUV, tintBlocks } from '../hq-env.mjs';

/** اتجاه الشمس من السمت (من الشمال مع عقارب الساعة) والارتفاع بالدرجات، في إحداثيات المشهد (Z = −شمال). */
export function sunVector(THREE, az, el) { const a = az * Math.PI / 180, e = el * Math.PI / 180; return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)); }

/** خامة قبة السماء: إشعاع خطي (HDR) دالة في الاتجاه فقط. */
function skyMaterial(THREE, sunDir, sc, night, clouds) {
  const k = night ? .1 : 1;
  return new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { uSun: { value: sunDir.clone() }, uSunC: { value: new THREE.Vector3(sc[0], sc[1], sc[2]) }, uK: { value: k }, uClouds: { value: night ? 0 : clouds },
      uZen: { value: new THREE.Color('#7fb2e6').convertSRGBToLinear() }, uHor: { value: new THREE.Color('#f3e7d3').convertSRGBToLinear() }, uGnd: { value: new THREE.Color('#9a8468').convertSRGBToLinear() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun, uSunC, uZen, uHor, uGnd; uniform float uK, uClouds;
float h21( vec2 p ){ return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vn( vec2 p ){ vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float fbm( vec2 p ){ float s = 0.0, a = .5; for ( int i = 0; i < 5; i ++ ) { s += a * vn( p ); p = p * 2.03 + 7.1; a *= .5; } return s; }
void main(){ vec3 d = normalize( vD ); float h = d.y, sd = max( dot( d, normalize( uSun ) ), 0.0 );
  float tz = pow( smoothstep( -.02, .8, h ), .42 ); vec3 c = mix( uHor * vec3( .98, 1.0, 1.06 ) * 1.1, uZen * 1.08, tz );
  float az = pow( max( dot( normalize( d.xz + 1e-5 ), normalize( uSun.xz ) ), 0.0 ), 2.0 );
  c = mix( c, vec3( 1.0, .84, .62 ) * 1.5, exp( - max( h, 0.0 ) * 9.0 ) * ( .2 + .6 * az ) );
  c += uSunC * ( pow( sd, 20.0 ) * .22 + pow( sd, 90.0 ) * 1.4 + pow( sd, 700.0 ) * 9.0 );
  if ( uClouds > 0.0 && h > .01 ) { vec2 p = d.xz / ( h + .18 ) * vec2( 1.0, 3.2 ); float f = fbm( p * 2.1 + fbm( p * .9 ) * 1.2 ); float m = smoothstep( .56, .8, f ) * smoothstep( .03, .3, h ) * uClouds; c = mix( c, ( vec3( 1.0, .95, .88 ) * 1.2 + uSunC * pow( sd, 3.0 ) * .8 ), m ); }
  c = mix( uGnd * .55, c, smoothstep( -.06, .0, h ) ); gl_FragColor = vec4( c * uK, 1.0 ); }` });
}

/** لون ضوء الشمس حسب ارتفاعها: ذهبي عند الأفق، أبيض دافئ في العلو. */
export function sunColor(el) { const t = clamp((el - 4) / 40); return [1, .74 + .2 * t, .5 + .38 * t]; }

/**
 * المرحلة الأولى (قبل الإطار الأول): السماء والبيئة والشمس والزجاج والداخل والأبواب.
 * يعيد كائن الحالة الذي تستعمله المراحل التالية.
 */
export function photoLook(THREE, { scene, renderer, sun, S, q, Sky, tier }) {
  const night = q.get('night') === '1';
  const az = Number(q.get('az') ?? 236), el = Number(q.get('el') ?? (night ? 4 : 22));
  const dir = sunVector(THREE, az, el), sc = sunColor(el);
  // سماء إجرائية للساعة الذهبية (تدرّج سمت/أفق، هالة حول الشمس، غيوم سمحاقية خفيفة، وأرض دافئة تحت الأفق): مصدر واحد للخلفية وبيئة الانعكاس والإضاءة المحيطة
  const skyScene = new THREE.Scene(), skyMat = skyMaterial(THREE, dir, sc, night, Number(q.get('clouds') ?? .4));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat); skyScene.add(dome);
  const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(skyScene, 0, .1, 1100).texture; pm.dispose();
  const crt = new THREE.WebGLCubeRenderTarget(tier.bgCube, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }); new THREE.CubeCamera(1, 2000, crt).update(renderer, skyScene);
  scene.environment = env; scene.background = crt.texture; dome.geometry.dispose(); skyMat.dispose(); void Sky;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMappingExposure = Number(q.get('exp') ?? (night ? 1.5 : .86));
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // ضباب مسافة خفيف بلون الأفق: يفصل المبنى عن الجوار ويليّن خط الأفق
  scene.fog = new THREE.FogExp2(night ? '#0c0e14' : '#ecd9bd', night ? .004 : Number(q.get('fog') ?? .0052));
  // الشمس + ضوء سماء/ارتداد أرض (نصف كرة). ضوء البيئة (IBL) يُخفَّض على الخامات الخشنة ليأتي أغلب المحيط من مصدر يمكن تظليله عند التحسين التراكمي.
  let hemi = null; scene.traverse(o => { if (o.isHemisphereLight) hemi = o; }); if (!hemi) { hemi = new THREE.HemisphereLight(); scene.add(hemi); }
  hemi.color.set(night ? '#46587f' : '#dfe3ea'); hemi.groundColor.set(night ? '#4a3a2c' : '#d9b48c'); hemi.intensity = Number(q.get('hemi') ?? (night ? 1.6 : .9));
  sun.color.setRGB(sc[0], sc[1], sc[2]); sun.intensity = Number(q.get('sun') ?? (night ? .06 : 5.4));
  const state = { az, el, dir, night, hemi, sun, env, envRough: Number(q.get('envi') ?? .3), tier, bounds: null, disposables: [crt, env] };
  fitSun(THREE, state, buildingBox(THREE, S), 4);
  // زجاج: انعكاس بقوته الكاملة (فرينل) فوق شفافية تُظهر الداخل — بلا transmission (لا تمريرة تصيير إضافية لكل إطار)
  const glass = glassMaterial(THREE, { night }); state.glass = glass;
  const room = roomTexture(THREE, tier, night);
  const interior = new THREE.MeshStandardMaterial({ map: room, roughness: 1, color: '#ffffff', emissive: '#ffe0b4', emissiveMap: room, emissiveIntensity: Number(q.get('glow') ?? (night ? 2.6 : 1.5)), envMapIntensity: 0 }); interior.name = 'interior'; state.interior = interior;
  // إحداثيات خامة الداخل من موضع العالم (لا من UV القطعة): نوافذ الطرز المضافة كصناديق تأخذ جزءًا صحيحًا ومختلفًا من مشهد الغرف
  interior.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n{ vec3 rW = ( modelMatrix * vec4( position, 1.0 ) ).xyz; vec2 rU = vec2( ( rW.x + rW.z ) / 4.8, rW.y / 3.2 );\n#ifdef USE_MAP\n vMapUv = rU;\n#endif\n#ifdef USE_EMISSIVEMAP\n vEmissiveMapUv = rU;\n#endif\n}'); }; interior.customProgramCacheKey = () => 'photo-room';
  const door = doorMaterial(THREE, renderer), jointMat = new THREE.MeshStandardMaterial({ color: '#8d8474', roughness: .98 }); jointMat.name = 'joint';
  const stoneFace = new Map();
  for (const m of S.meshes) { const n = m.material?.name || '';
    if (n === 'glass') { m.material = glass; m.castShadow = false; } else if (n === 'interior') { m.material = interior; m.castShadow = false; m.receiveShadow = false; }
    else if (m.userData?.role === 'door') { m.material = door.mat; fitDoorUV(THREE, m); }
    else if (/Joint$/.test(n)) m.material = jointMat;
    else if (m.userData?.part === 'blocks') { tintBlocks(THREE, m); if (!stoneFace.has(n)) { const c = m.material.clone(); c.vertexColors = true; stoneFace.set(n, c); } m.material = stoneFace.get(n); } }
  return state;
}

export function buildingBox(THREE, S) { const bb = new THREE.Box3(); for (const m of S.meshes) if (m.name !== 'ground' && m.visible) bb.expandByObject(m); return bb; }

/** يضبط موضع الشمس وإطار ظلها على صندوق المشهد (في فضاء الضوء) بهامش، فلا تُهدر دقة الخريطة. */
export function fitSun(THREE, state, box, pad = 2) {
  const { sun, dir, tier } = state; state.bounds = box.clone();
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2 + pad;
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(dir, r + 30); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  // حدود الصندوق في محوري الضوء
  const z = dir.clone().normalize(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; const p = new THREE.Vector3();
  for (const X of [box.min.x, box.max.x]) for (const Y of [box.min.y, box.max.y]) for (const Z of [box.min.z, box.max.z]) { p.set(X, Y, Z).sub(c); const u = p.dot(x), v = p.dot(y); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const cam = sun.shadow.camera; Object.assign(cam, { left: u0 - pad, right: u1 + pad, bottom: v0 - pad, top: v1 + pad, near: 1, far: 2 * r + 60 }); cam.updateProjectionMatrix();
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  sun.shadow.mapSize.set(tier.shadow, tier.shadow); const texel = Math.max(u1 - u0, v1 - v0 + 0) / tier.shadow;
  sun.shadow.bias = -0.00012; sun.shadow.normalBias = Math.max(.012, texel * 1.6); sun.shadow.radius = tier.shadow >= 4096 ? 2.2 : 1.6; sun.castShadow = true;
}

/** زجاج معماري: لون خفيف وشفافية جزئية، لكن الانعكاس يُضاف بكامل قوته (لا يُضرب في الشفافية). */
export function glassMaterial(THREE, { night = false } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: night ? '#1a2226' : '#222d31', metalness: 0, roughness: .03, ior: 1.95, specularIntensity: 1, envMapIntensity: night ? .5 : 1.5, transparent: true, opacity: night ? .2 : .34, depthWrite: false, premultipliedAlpha: true });
  m.name = 'glass';
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader
    .replace('#include <opaque_fragment>', 'float gA = diffuseColor.a; vec3 gS = min( totalSpecular, vec3( 24.0 ) ); gl_FragColor = vec4( ( totalDiffuse + totalEmissiveRadiance ) * gA + gS, clamp( gA + dot( gS, vec3( .2126, .7152, .0722 ) ) * 1.4, 0., 1. ) );')
    .replace('#include <premultiplied_alpha_fragment>', ''); };
  m.customProgramCacheKey = () => 'photo-glass';
  return m;
}

/** داخل دافئ خلف الزجاج: ستائر على الجانبين، جدار خلفي بإضاءة سقفية ومصباح، وأرضية أغمق. القماش 4.8×3.2 م ويتكرر، فتأخذ كل نافذة جزءًا مختلفًا. */
function roomTexture(THREE, tier, night) {
  const W = tier.tex >= 1024 ? 1024 : 512, H = W * 2 / 3 | 0, [c, x] = canvas(W, H), r = rnd(57);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#4a3c2e'); g.addColorStop(.5, '#2e261f'); g.addColorStop(1, '#17130f'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 4; k++) { // غرف متجاورة: كل 1.2 م تقريبًا مشهد مختلف — داخل معتم في أغلبه (ليظهر انعكاس السماء على الزجاج) مع بقع إنارة دافئة
    const x0 = k * W / 4, w = W / 4, cx = x0 + w * (.3 + r() * .4), cy = H * (.16 + r() * .2), lit = r() > .25;
    if (lit) { const lg = x.createRadialGradient(cx, cy, 2, cx, cy, w * .62); lg.addColorStop(0, 'rgba(255,226,170,.95)'); lg.addColorStop(.18, 'rgba(255,196,120,.55)'); lg.addColorStop(.6, 'rgba(200,130,70,.16)'); lg.addColorStop(1, 'rgba(160,100,50,0)'); x.fillStyle = lg; x.fillRect(x0, 0, w, H); }
    x.fillStyle = 'rgba(14,10,8,.7)'; const fw = w * (.25 + r() * .3), fx = x0 + r() * (w - fw); x.fillRect(fx, H * (.66 + r() * .1), fw, H * .4); // قطعة أثاث معتمة
    if (lit && r() > .4) { x.fillStyle = 'rgba(255,232,190,.95)'; x.fillRect(fx + fw * .4, H * .52, fw * .14, H * .1); } // أباجورة
    const cw = w * (.14 + r() * .12); for (let i = 0; i < cw; i++) { const f = .5 + .5 * Math.sin(i / cw * 22 + k), v = .26 + .22 * f; x.fillStyle = `rgba(${225 * v | 0},${208 * v | 0},${180 * v | 0},.94)`; x.fillRect(x0 + i, 0, 1, H); } // ستارة بطيات
  }
  const t = canvasTex(THREE, c, { tile: 1, aniso: 2 }); return t;
}

// ---------------------------------------------------------------- تفصيل الخامات بمقياس العالم (إسقاط ثلاثي)
const KIND = {
  stone:   { scale: 1 / 2.4, amp: .11, ampL: .07, bump: .0035, rough: .22, ground: .86 },
  plaster: { scale: 1 / 1.5, amp: .05, ampL: .06, bump: .0016, rough: .12, ground: .84 },
  mud:     { scale: 1 / 1.3, amp: .10, ampL: .09, bump: .0045, rough: .10, ground: .80 },
  wood:    { scale: 1 / 1.0, amp: .16, ampL: .05, bump: .0012, rough: .25, ground: .95 },
};
/** تصنيف الخامة من اسمها وخواصها. null = لا تُمَسّ (زجاج، معدن، مضيء، شفاف، نبات). */
export function classifyMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData?.pd === false) return null;
  const n = (m.name || '').toLowerCase();
  if (m.transparent || m.metalness > .4 || (m.emissiveIntensity > .5 && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > .2) || m.alphaMap || m.alphaTest > 0) return null;
  if (/glass|interior|alu|steel|bronze|metal|iron|brass|led|lamp|foliage|leaf|water|screen|site-/.test(n)) return null;
  if (/timber|wood|door|teak|walnut|oak|cedar|slat/.test(n)) return 'wood';
  if (/plinth|limestone|travertine|stone|marble|coral|terrazzo|concrete|joint/.test(n)) return 'stone';
  if (/plaster|render|stucco|gyps/.test(n)) return 'plaster';
  if (/najdi|mud|adobe|clay/.test(n)) return 'mud';
  // بلا اسم: خشب إن كان بنيًّا داكنًا مشبعًا، وإلا لياسة
  const c = m.color, mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
  if (!m.map && mx < .22 && mx - mn > .03 && c.r > c.b * 1.5) return 'wood';
  return 'plaster';
}
function detailTexture(THREE, kind, S) {
  const n = tileNoise({ stone: 3, plaster: 5, mud: 7, wood: 9 }[kind]), r = rnd(kind.length * 13 + 1);
  if (kind === 'stone') { // ترافرتين: تعريق أفقي طبقي + مسام صغيرة ممدودة أفقيًا
    const pits = Array.from({ length: S * S / 900 | 0 }, () => [r(), r(), .002 + r() * .006, .4 + r() * .6]);
    const pit = new Float32Array(S * S); for (const [pu, pv, pr, pd] of pits) { const rx = pr * 2.6 * S, ry = pr * S; for (let dy = -Math.ceil(ry); dy <= ry; dy++) for (let dx = -Math.ceil(rx); dx <= rx; dx++) { const e = (dx / rx) ** 2 + (dy / ry) ** 2; if (e > 1) continue; const X = ((pu * S + dx | 0) % S + S) % S, Y = ((pv * S + dy | 0) % S + S) % S; pit[Y * S + X] = Math.max(pit[Y * S + X], pd * (1 - e)); } }
    return dataTex(THREE, S, (u, v, X, Y) => { const band = n(u, v, 2, 24, 4), w = n(u, v, 4, 4, 3), vein = Math.abs(Math.sin((v * 21 + w * 2.2 + band * 1.5) * Math.PI)) ** .6, p = pit[Y * S + X];
      const a = clamp(.5 + (band - .5) * .9 + (vein - .6) * .18 - p * .55), h = clamp(.6 + (band - .5) * .25 + n(u, v, 32, 32, 2) * .12 - p * .6); return [a, h, clamp(.5 + p * .5 - (vein - .5) * .2), 1]; });
  }
  if (kind === 'wood') { // عروق طولية (على محور v) مع عقد قليلة
    return dataTex(THREE, S, (u, v) => { const warp = n(u, v, 3, 2, 3), g1 = n(u + warp * .06, v, 48, 2, 3), g2 = n(u, v, 128, 4, 2), ring = .5 + .5 * Math.sin((u * 26 + warp * 5) * Math.PI * 2);
      const a = clamp(.5 + (g1 - .5) * .9 + (ring - .5) * .22 + (g2 - .5) * .25), h = clamp(.5 + (g1 - .5) * .7 + (g2 - .5) * .3); return [a, h, clamp(.5 + (g1 - .5) * .8), 1]; });
  }
  if (kind === 'mud') { // طين: خشونة حبيبية، تموّج يدوي، وقشّ (شرطات فاتحة قصيرة)
    const straw = new Float32Array(S * S); for (let k = 0; k < S * S / 500; k++) { let X = r() * S, Y = r() * S; const a = r() * 6.28, L = 4 + r() * 9, dx = Math.cos(a), dy = Math.sin(a); for (let i = 0; i < L; i++) { straw[((Y | 0) % S + S) % S * S + ((X | 0) % S + S) % S] = 1; X += dx; Y += dy; } }
    return dataTex(THREE, S, (u, v, X, Y) => { const lo = n(u, v, 3, 3, 4), hi = n(u, v, 48, 48, 3), s = straw[Y * S + X]; return [clamp(.5 + (lo - .5) * .8 + (hi - .5) * .45 + s * .22), clamp(.5 + (lo - .5) * .5 + (hi - .5) * .6 + s * .25), clamp(.5 + (hi - .5) * .6), 1]; });
  }
  // لياسة: حبيبات ناعمة وأثر مالج واسع
  return dataTex(THREE, S, (u, v) => { const lo = n(u, v, 4, 4, 3), hi = n(u, v, 96, 96, 2), mid = n(u, v, 20, 12, 2); return [clamp(.5 + (lo - .5) * .7 + (mid - .5) * .3), clamp(.5 + (hi - .5) * .7 + (mid - .5) * .4), clamp(.5 + (hi - .5) * .5), 1]; });
}

/**
 * يضيف لكل خامة غير لامعة تفصيلًا بمقياس العالم: تباين لوني، خشونة، ونتوء (من مشتقة الارتفاع)، وتعتيمًا خفيفًا عند ملامسة الأرض.
 * إسقاط ثلاثي على موضع العالم فلا تتمطط الخامة أيًّا كانت إحداثيات UV للقطعة. يعيد عدد الخامات المعدّلة.
 */
export function upgradeMaterials(THREE, scene, state) {
  const tier = state.tier, tex = {}, seen = new Set(); let count = 0;
  scene.traverse(o => { if (!o.isMesh && !o.isInstancedMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    if (!m || seen.has(m)) continue; seen.add(m);
    if (m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && m.metalness < .4 && m.name !== 'interior') m.envMapIntensity = Math.min(m.envMapIntensity ?? 1, 1) * state.envRough;
    const kind = tier.detail ? classifyMaterial(m) : null; if (!kind) continue;
    const K = KIND[kind]; if (!tex[kind]) { tex[kind] = detailTexture(THREE, kind, tier.tex >= 1024 ? 512 : 256); state.disposables.push(tex[kind]); }
    const U = { pdMap: { value: tex[kind] }, pdK: { value: new THREE.Vector4(K.scale, K.amp, K.ampL, K.bump * (m.bumpMap ? .5 : 1)) }, pdR: { value: new THREE.Vector2(K.rough, K.ground) } };
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPdPos; varying vec3 vPdNrm;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 pdW = vec4( transformed, 1.0 ); vec3 pdN = objectNormal;\n#ifdef USE_INSTANCING\n pdW = instanceMatrix * pdW; pdN = mat3( instanceMatrix ) * pdN;\n#endif\n vPdPos = ( modelMatrix * pdW ).xyz; vPdNrm = mat3( modelMatrix ) * pdN; }');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPdPos; varying vec3 vPdNrm; uniform sampler2D pdMap; uniform vec4 pdK; uniform vec2 pdR;')
        .replace('#include <map_fragment>', `#include <map_fragment>
  vec3 pdB = pow( abs( normalize( vPdNrm ) ), vec3( 6.0 ) ); pdB /= ( pdB.x + pdB.y + pdB.z ); vec3 pdP = vPdPos * pdK.x;
  vec4 pdS = texture2D( pdMap, pdP.zy ) * pdB.x + texture2D( pdMap, pdP.xz ) * pdB.y + texture2D( pdMap, pdP.xy ) * pdB.z;
  float pdL = texture2D( pdMap, vec2( vPdPos.x + vPdPos.z, vPdPos.y * 1.3 ) * .043 ).r;
  diffuseColor.rgb *= ( 1.0 + pdK.y * ( pdS.r - .5 ) * 2.0 ) * ( 1.0 + pdK.z * ( pdL - .5 ) * 2.0 ) * mix( pdR.y, 1.0, smoothstep( .0, .7, vPdPos.y ) );`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp( roughnessFactor + pdR.x * ( pdS.b - .5 ), .08, 1.0 );')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec2 pdH = vec2( dFdx( pdS.g ), dFdy( pdS.g ) ) * pdK.w; vec3 pdSx = dFdx( - vViewPosition ), pdSy = dFdy( - vViewPosition ); vec3 pdR1 = cross( pdSy, normal ), pdR2 = cross( normal, pdSx );
    float pdD = dot( pdSx, pdR1 ) * faceDirection; normal = normalize( abs( pdD ) * normal - sign( pdD ) * ( pdH.x * pdR1 + pdH.y * pdR2 ) ); }`); };
    m.customProgramCacheKey = () => 'photo-detail'; m.needsUpdate = true; count++; } });
  return count;
}
