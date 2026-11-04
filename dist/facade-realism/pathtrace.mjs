// (اختبار جدوى، لا يدخل حزمة العميل) تتبّع مسار الضوء بـWebGL2 بلا اعتماديات خارجية.
// يأخذ مثلثات مشهد العينة نفسها (بعد تحويل الجهات)، يبني BVH على المعالج، ثم يرسم عبر مظلل بعينة واحدة لكل مرور ويجمّع المتوسط.
// الهدف: قياس الجودة والزمن على جدار ونافذة. افتراضات التصوير (ألوان الخامات وشدة الشمس) تصورية وليست مواصفة منتج.

/** رقم الخامة في المصيّر من اسم مادة المشهد. -1 لما يُهمل (الأرض تُعالَج تحليليًا). */
export function matIdFor(name = '') {
  if (name === 'ground') return -1;
  if (name === 'glass') return 1;
  if (name === 'aluminium') return 2;
  if (name === 'interior') return 3;
  if (name === 'render') return 4;
  if (name === 'timberLook') return 5;
  if (/^limestoneBeige/.test(name)) return 6;
  if (/^limestone/.test(name)) return 0;
  return 2;
}

/** مثلثات العالم ضمن نصف قطر حول مركز. يُعيد { data: Float32Array(12 لكل مثلث), count } (v0+mat، e1، e2). */
export function extractTriangles(THREE, meshes, { center, radius }) {
  const c = new THREE.Vector3(...center), v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], out = [];
  for (const mesh of meshes) {
    const m = matIdFor(mesh.material && mesh.material.name); if (m < 0) continue;
    mesh.updateWorldMatrix(true, false);
    const g = mesh.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld);
      const cx = (v[0].x + v[1].x + v[2].x) / 3, cy = (v[0].y + v[1].y + v[2].y) / 3, cz = (v[0].z + v[1].z + v[2].z) / 3;
      if (Math.hypot(cx - c.x, cy - c.y, cz - c.z) > radius) continue;
      out.push(v[0].x, v[0].y, v[0].z, m, v[1].x - v[0].x, v[1].y - v[0].y, v[1].z - v[0].z, 0, v[2].x - v[0].x, v[2].y - v[0].y, v[2].z - v[0].z, 0);
    }
  }
  return { data: Float32Array.from(out), count: out.length / 12 };
}

/** BVH ثنائي بتقسيم الوسيط على المحور الأطول. الأخوان متجاوران في المصفوفة (الابن الأيمن = الأيسر + 1). */
export function buildBVH(tri, leafSize = 4) {
  const n = tri.count, d = tri.data, cent = new Float32Array(n * 3), lo = new Float32Array(n * 3), hi = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 12, x0 = d[o], y0 = d[o + 1], z0 = d[o + 2];
    const xs = [x0, x0 + d[o + 4], x0 + d[o + 8]], ys = [y0, y0 + d[o + 5], y0 + d[o + 9]], zs = [z0, z0 + d[o + 6], z0 + d[o + 10]];
    lo[i * 3] = Math.min(...xs); lo[i * 3 + 1] = Math.min(...ys); lo[i * 3 + 2] = Math.min(...zs);
    hi[i * 3] = Math.max(...xs); hi[i * 3 + 1] = Math.max(...ys); hi[i * 3 + 2] = Math.max(...zs);
    cent[i * 3] = (lo[i * 3] + hi[i * 3]) / 2; cent[i * 3 + 1] = (lo[i * 3 + 1] + hi[i * 3 + 1]) / 2; cent[i * 3 + 2] = (lo[i * 3 + 2] + hi[i * 3 + 2]) / 2;
  }
  const order = new Uint32Array(n); for (let i = 0; i < n; i++) order[i] = i;
  const nodes = []; // { min[3], max[3], a (يسار أو بداية)، cnt }
  const build = (ni, s, e) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = s; k < e; k++) { const t = order[k]; for (let a = 0; a < 3; a++) { if (lo[t * 3 + a] < mn[a]) mn[a] = lo[t * 3 + a]; if (hi[t * 3 + a] > mx[a]) mx[a] = hi[t * 3 + a]; } }
    if (e - s <= leafSize) { nodes[ni] = { mn, mx, a: s, cnt: e - s }; return; }
    let ax = 0; const ex = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]; if (ex[1] > ex[ax]) ax = 1; if (ex[2] > ex[ax]) ax = 2;
    order.subarray(s, e).sort((p, q) => cent[p * 3 + ax] - cent[q * 3 + ax]);
    const mid = (s + e) >> 1, left = nodes.length; nodes.push(null, null);
    nodes[ni] = { mn, mx, a: left, cnt: 0 };
    build(left, s, mid); build(left + 1, mid, e);
  };
  nodes.push(null); build(0, 0, n);
  return { nodes, order, count: nodes.length };
}

const FRAG = /* glsl */`
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uTri, uNode, uPrev;
uniform int uTriW, uNodeW, uBounces;
uniform vec2 uRes;
uniform vec3 uCamPos, uRight, uUp, uFwd, uSunDir;
uniform float uTanHalf, uAspect, uN, uFrame, uSunE, uSunR;
uniform vec4 uMatA[8];
uniform vec4 uMatB[8];

uint rs;
uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(){ rs = pcg(rs); return float(rs) * (1.0 / 4294967295.0); }
vec4 fetchTri(int i){ return texelFetch(uTri, ivec2(i % uTriW, i / uTriW), 0); }
vec4 fetchNode(int i){ return texelFetch(uNode, ivec2(i % uNodeW, i / uNodeW), 0); }

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i.xy + i.z * 17.0), b = hash21(i.xy + vec2(1,0) + i.z * 17.0), c = hash21(i.xy + vec2(0,1) + i.z * 17.0), d = hash21(i.xy + vec2(1,1) + i.z * 17.0);
  float a2 = hash21(i.xy + (i.z + 1.0) * 17.0), b2 = hash21(i.xy + vec2(1,0) + (i.z + 1.0) * 17.0), c2 = hash21(i.xy + vec2(0,1) + (i.z + 1.0) * 17.0), d2 = hash21(i.xy + vec2(1,1) + (i.z + 1.0) * 17.0);
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(a2, b2, f.x), mix(c2, d2, f.x), f.y), f.z);
}

vec3 skyColor(vec3 d){
  vec3 zen = vec3(0.30, 0.52, 0.85), hor = vec3(0.82, 0.88, 0.94), gnd = vec3(0.34, 0.30, 0.25);
  return d.y > 0.0 ? mix(hor, zen, pow(d.y, 0.5)) : mix(hor, gnd, min(1.0, -d.y * 4.0));
}

// أقرب تقاطع: BVH للمثلثات، ومستوى الأرض التحليلي (y = -0.001) بالخامة 7.
bool trace(vec3 ro, vec3 rd, inout float tBest, out vec3 n, out int mat){
  bool hit = false; n = vec3(0.0, 1.0, 0.0); mat = 7;
  vec3 inv = 1.0 / (rd + vec3(1e-9) * sign(rd + vec3(1e-12)));
  int stack[40]; int sp = 0; stack[sp++] = 0;
  while (sp > 0) {
    int ni = stack[--sp];
    vec4 a = fetchNode(2 * ni), b = fetchNode(2 * ni + 1);
    vec3 t0 = (a.xyz - ro) * inv, t1 = (b.xyz - ro) * inv, tmn = min(t0, t1), tmx = max(t0, t1);
    float tn = max(max(tmn.x, tmn.y), max(tmn.z, 0.0)), tf = min(min(tmx.x, tmx.y), min(tmx.z, tBest));
    if (tn > tf) continue;
    int cnt = int(b.w + 0.5);
    if (cnt > 0) {
      int s = int(a.w + 0.5);
      for (int k = 0; k < cnt; k++) {
        int ti = s + k; vec4 v0 = fetchTri(3 * ti); vec3 e1 = fetchTri(3 * ti + 1).xyz, e2 = fetchTri(3 * ti + 2).xyz;
        vec3 pv = cross(rd, e2); float det = dot(e1, pv);
        if (abs(det) < 1e-12) continue;
        float id = 1.0 / det; vec3 tv = ro - v0.xyz; float u = dot(tv, pv) * id;
        if (u < 0.0 || u > 1.0) continue;
        vec3 qv = cross(tv, e1); float v = dot(rd, qv) * id;
        if (v < 0.0 || u + v > 1.0) continue;
        float t = dot(e2, qv) * id;
        if (t > 1e-4 && t < tBest) { tBest = t; hit = true; n = normalize(cross(e1, e2)); mat = int(v0.w + 0.5); }
      }
    } else { int l = int(a.w + 0.5); stack[sp++] = l; stack[sp++] = l + 1; }
  }
  if (rd.y < -1e-6) { float tg = (-0.001 - ro.y) / rd.y; if (tg > 1e-4 && tg < tBest) { tBest = tg; hit = true; n = vec3(0.0, 1.0, 0.0); mat = 7; } }
  return hit;
}

// لون الخامة (تصوري): الحجر بتباين لكل بلاطة (60×30 سم بإزاحة نصف بلاطة لكل مدماك) وتبقّع ناعم بالضوضاء.
vec3 albedoOf(int mat, vec3 p, vec3 n){
  vec3 base = uMatA[mat].rgb;
  if (mat == 0 || mat == 6) {
    vec2 uv = abs(n.z) > 0.5 ? p.xy : vec2(p.z, p.y);
    float row = floor(uv.y / 0.30), col = floor((uv.x - 0.30 * mod(row, 2.0)) / 0.60);
    float tint = 0.90 + 0.14 * hash21(vec2(col, row)), warm = (hash21(vec2(col + 7.0, row + 3.0)) - 0.5) * 0.05;
    float mott = 0.94 + 0.10 * vnoise(p * 6.0) + 0.05 * vnoise(p * 23.0);
    return base * tint * mott + vec3(warm, warm * 0.8, 0.0);
  }
  if (mat == 5) { float g = vnoise(vec3(p.x * 40.0, p.y * 2.0, p.z * 40.0)); return base * (0.80 + 0.40 * g); }
  if (mat == 4) return base * (0.95 + 0.08 * vnoise(p * 30.0));
  return base;
}

vec3 sampleCos(vec3 n){
  float u1 = rnd(), u2 = rnd(), r = sqrt(u1), phi = 6.2831853 * u2;
  vec3 up = abs(n.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0), t = normalize(cross(up, n)), b = cross(n, t);
  return normalize(t * r * cos(phi) + b * r * sin(phi) + n * sqrt(max(0.0, 1.0 - u1)));
}
vec3 sampleSun(){
  vec3 up = abs(uSunDir.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0), t = normalize(cross(up, uSunDir)), b = cross(uSunDir, t);
  float r = uSunR * sqrt(rnd()), phi = 6.2831853 * rnd();
  return normalize(uSunDir + t * r * cos(phi) + b * r * sin(phi));
}

vec3 radiance(vec3 ro, vec3 rd){
  vec3 L = vec3(0.0), thr = vec3(1.0); bool spec = true;
  for (int bnc = 0; bnc < 8; bnc++) {
    if (bnc >= uBounces) break;
    float t = 1e9; vec3 n; int mat;
    if (!trace(ro, rd, t, n, mat)) {
      vec3 s = skyColor(rd);
      if (spec && dot(rd, uSunDir) > cos(uSunR)) s += vec3(1.0, 0.93, 0.80) * uSunE / (3.14159 * uSunR * uSunR) * 0.02;
      L += thr * s; break;
    }
    vec3 p = ro + rd * t; if (dot(n, rd) > 0.0) n = -n;
    float type = uMatA[mat].a, rough = uMatB[mat].x;
    float cosi = clamp(dot(-rd, n), 0.0, 1.0);
    if (type > 0.5 && type < 1.5) { // زجاج رقيق: انعكاس فرنل، وإلا ينفذ
      float F = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
      if (rnd() < F) { rd = normalize(reflect(rd, n) + rough * (vec3(rnd(), rnd(), rnd()) - 0.5)); ro = p + n * 1e-3; spec = true; }
      else { thr *= vec3(0.78, 0.86, 0.88); ro = p - n * 1e-3; spec = true; }
      continue;
    }
    vec3 alb = albedoOf(mat, p, n);
    if (type > 1.5) { // طلاء/معدن لامع: انعكاس جزئي بخشونة
      float F = 0.05 + 0.95 * pow(1.0 - cosi, 5.0);
      if (rnd() < F) { rd = normalize(reflect(rd, n) + rough * (vec3(rnd(), rnd(), rnd()) - 0.5)); if (dot(rd, n) < 0.0) rd = reflect(rd, n); ro = p + n * 1e-3; spec = true; continue; }
    }
    // ضوء الشمس المباشر (NEE) مع ظل ناعم
    vec3 sd = sampleSun(); float cs = dot(n, sd);
    if (cs > 0.0) { float ts = 1e9; vec3 nn; int mm; if (!trace(p + n * 1e-3, sd, ts, nn, mm)) L += thr * alb * (1.0 / 3.14159) * uSunE * cs; }
    thr *= alb; rd = sampleCos(n); ro = p + n * 1e-3; spec = false;
    if (bnc > 2) { float q = max(max(thr.r, thr.g), thr.b); if (rnd() > q) break; thr /= q; }
  }
  return L;
}

void main(){
  vec2 px = gl_FragCoord.xy;
  rs = pcg(uint(px.x) + uint(px.y) * uint(uRes.x) + uint(uFrame) * 9781u);
  vec2 ndc = (px + vec2(rnd(), rnd())) / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight * (ndc.x * uTanHalf * uAspect) + uUp * (ndc.y * uTanHalf));
  vec3 s = radiance(uCamPos, rd);
  s = min(s, vec3(20.0));
  vec3 prev = texelFetch(uPrev, ivec2(px), 0).rgb;
  gl_FragColor = vec4(mix(prev, s, 1.0 / (uN + 1.0)), 1.0);
}`;

const FRAG_SHOW = /* glsl */`
precision highp float; precision highp sampler2D;
uniform sampler2D uAcc; uniform float uExposure;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){ vec3 c = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0).rgb * uExposure; gl_FragColor = vec4(toSrgb(aces(c)), 1.0); }`;
const VERT = `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const MAT_A = [[.80, .77, .70, 0], [.10, .13, .15, 1], [.16, .17, .19, 2], [.04, .04, .045, 0], [.82, .79, .72, 0], [.38, .22, .11, 0], [.70, .58, .40, 0], [.55, .50, .40, 0]];
const MAT_B = [[.7], [.01], [.30], [.9], [.9], [.6], [.7], [.9]];

/** يُنشئ المصيّر. يُعيد { pass(), show(), info }. */
export function createPathTracer(THREE, renderer, { tris, bvh, camera, sunDir, sunE = 5.5, sunR = .03, bounces = 5, exposure = 1.0 }) {
  const gl = renderer.getContext();
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('الجهاز لا يدعم أهدافًا عائمة (EXT_color_buffer_float)');
  const W = renderer.domElement.width, H = renderer.domElement.height;
  // بيانات المثلثات مرتبة بترتيب الأوراق، ثم العقد
  const TW = 2048, tRows = Math.ceil(tris.count * 3 / TW), triArr = new Float32Array(TW * tRows * 4);
  for (let i = 0; i < tris.count; i++) { const src = bvh.order[i] * 12; for (let k = 0; k < 12; k++) triArr[i * 12 + k] = tris.data[src + k]; }
  const NW = 1024, nRows = Math.ceil(bvh.count * 2 / NW), nodeArr = new Float32Array(NW * nRows * 4);
  bvh.nodes.forEach((nd, i) => { const o = i * 8; nodeArr.set([nd.mn[0], nd.mn[1], nd.mn[2], nd.a, nd.mx[0], nd.mx[1], nd.mx[2], nd.cnt], o); });
  const tex = (arr, w, h) => { const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  const triTex = tex(triArr, TW, tRows), nodeTex = tex(nodeArr, NW, nRows);
  const mkRT = () => new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  let rtA = mkRT(), rtB = mkRT();
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const sd = new THREE.Vector3(...sunDir).normalize();
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      uTri: { value: triTex }, uNode: { value: nodeTex }, uPrev: { value: null }, uTriW: { value: TW }, uNodeW: { value: NW }, uBounces: { value: bounces },
      uRes: { value: new THREE.Vector2(W, H) }, uCamPos: { value: camera.position.clone() }, uRight: { value: right }, uUp: { value: up }, uFwd: { value: fwd },
      uSunDir: { value: sd }, uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) }, uAspect: { value: W / H }, uN: { value: 0 }, uFrame: { value: 0 }, uSunE: { value: sunE }, uSunR: { value: sunR },
      uMatA: { value: MAT_A.map(a => new THREE.Vector4(...a)) }, uMatB: { value: MAT_B.map(b => new THREE.Vector4(b[0], 0, 0, 0)) },
    },
  });
  const showMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG_SHOW, depthTest: false, depthWrite: false, uniforms: { uAcc: { value: null }, uExposure: { value: exposure } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new THREE.Scene(); scene.add(quad);
  let n = 0;
  return {
    info: { triangles: tris.count, nodes: bvh.count, width: W, height: H, bounces },
    pass() {
      quad.material = mat; mat.uniforms.uPrev.value = rtA.texture; mat.uniforms.uN.value = n; mat.uniforms.uFrame.value = n + 1;
      renderer.setRenderTarget(rtB); renderer.render(scene, cam); renderer.setRenderTarget(null);
      const t = rtA; rtA = rtB; rtB = t; n++; return n;
    },
    show() { quad.material = showMat; showMat.uniforms.uAcc.value = rtA.texture; renderer.setRenderTarget(null); renderer.render(scene, cam); },
    get samples() { return n; },
    /** ينتظر انتهاء عمل GPU (قياس دقيق للزمن). */
    sync() { const px = new Float32Array(4); renderer.readRenderTargetPixels(rtA, 0, 0, 1, 1, px); return px[0]; },
  };
}
export default { matIdFor, extractTriangles, buildBVH, createPathTracer };
