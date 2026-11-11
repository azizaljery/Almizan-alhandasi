// أدوات مشتركة لعرض «الصورة المعمارية»: عشوائية مبذورة، ضجيج قابل للتكرار، وخامات إجرائية (بلا صور ولا شبكة).
export function rnd(seed) { let a = (seed | 0) || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** ضجيج قيمة دوري مع fbm: نسيج يُبلَّط بلا درز. u,v في [0,1)؛ fx,fy عدد الخلايا في البلاطة (صحيح، وأعلى تردد ≤ 256). */
export function tileNoise(seed) {
  const r = rnd(seed), N = 256, g = new Float32Array(N * N); for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y, px, py) => g[((((y % py) + py) % py) & 255) * N + ((((x % px) + px) % px) & 255)];
  const one = (x, y, px, py) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(at(x0, y0, px, py), at(x0 + 1, y0, px, py), sx), lerp(at(x0, y0 + 1, px, py), at(x0 + 1, y0 + 1, px, py), sx), sy); };
  return (u, v, fx = 8, fy = fx, oct = 4) => { let s = 0, a = .5, n = 0; for (let o = 0; o < oct; o++) { const px = Math.min(256, fx << o), py = Math.min(256, fy << o); s += a * one(u * px + o * 17, v * py + o * 31, px, py); n += a; a *= .5; } return s / n; };
}

/** نسيج بيانات RGBA من دالة لكل بكسل (u,v) ← [r,g,b,a] في 0..1. */
export function dataTex(THREE, S, fn, { srgb = false, aniso = 4 } = {}) {
  const d = new Uint8Array(S * S * 4); let i = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = fn(x / S, y / S, x, y); d[i++] = clamp(c[0]) * 255; d[i++] = clamp(c[1]) * 255; d[i++] = clamp(c[2]) * 255; d[i++] = clamp(c[3] ?? 1) * 255; }
  return texFromData(THREE, d, S, S, { srgb, aniso });
}
export function texFromData(THREE, d, W, H, { srgb = false, aniso = 4, repeat = true } = {}) {
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
export function canvas(W, H = W) { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d', { willReadFrequently: true })]; }
export function canvasTex(THREE, c, { srgb = true, aniso = 4, tile = 1 } = {}) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / tile, 1 / tile); t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }

/** إحداثيات UV بالأمتار من موضع الرأس (إسقاط صندوقي): لا تمطيط مهما كان مقاس القطعة. تُستدعى بعد وضع الهندسة في موضعها العالمي. */
export function metricUV(THREE, g) {
  const p = g.attributes.position, n = g.attributes.normal, out = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) { out[i * 2] = p.getX(i); out[i * 2 + 1] = -p.getZ(i); } else if (ax >= az) { out[i * 2] = p.getZ(i); out[i * 2 + 1] = p.getY(i); } else { out[i * 2] = p.getX(i); out[i * 2 + 1] = p.getY(i); } }
  g.setAttribute('uv', new THREE.BufferAttribute(out, 2)); return g;
}
/** صندوق في موضعه العالمي (x0..x1, y0..y1, z0..z1) بإحداثيات UV مترية. */
export function boxGeo(THREE, x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return metricUV(THREE, g); }
/** دمج هندسات (مفهرسة أو لا) في هندسة واحدة غير مفهرسة بالمواضع والأعمدة و UV. */
export function mergeGeos(THREE, geos) {
  const list = geos.filter(Boolean).map(g => g.index ? g.toNonIndexed() : g), n = list.reduce((t, g) => t + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of list) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; }
  for (const g of geos) g?.dispose?.();
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
}
