// مصدّر GLB (glTF 2.0 ثنائي) صغير ونقي من نموذج الواقع المعزز: بلا مكتبات ولا خادم ولا مراجع خارجية (لا uri).
// الوحدة المتر، المحور الرأسي Y، المواد PBR بسيطة، الزجاج alphaMode=BLEND. min/max لموضع الرؤوس إلزاميان ومكتوبان.
const MAGIC = 0x46546C67, JSON_CHUNK = 0x4E4F534A, BIN_CHUNK = 0x004E4942; // 'glTF' · 'JSON' · 'BIN\0'
const pad4 = n => (n + 3) & ~3;

export function encodeGlb(model) {
  const bufferViews = [], accessors = [], primitives = [], materials = [], chunks = [];
  let offset = 0;
  const addView = (bytes, target) => { // bytes: Uint8Array؛ يُحاذى كل مقطع على 4 بايت
    const start = pad4(offset), pad = start - offset; if (pad) chunks.push(new Uint8Array(pad));
    chunks.push(bytes); offset = start + bytes.byteLength;
    bufferViews.push({ buffer: 0, byteOffset: start, byteLength: bytes.byteLength, target }); return bufferViews.length - 1;
  };
  const matIndex = new Map();
  for (const m of model.materials) {
    matIndex.set(m.id, materials.length);
    materials.push({ name: m.name, doubleSided: false, alphaMode: m.alpha < 1 ? 'BLEND' : 'OPAQUE', pbrMetallicRoughness: { baseColorFactor: [...m.color, m.alpha], metallicFactor: 0, roughnessFactor: m.roughness } });
  }
  for (const mesh of model.meshes) {
    const pos = mesh.positions, nor = mesh.normals, idx = mesh.indices, nv = pos.length / 3;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
    const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const vp = addView(bytes(pos), 34962), vn = addView(bytes(nor), 34962);
    const small = nv <= 65535, idxArr = small ? Uint16Array.from(idx) : Uint32Array.from(idx), vi = addView(bytes(idxArr), 34963);
    accessors.push({ bufferView: vp, componentType: 5126, count: nv, type: 'VEC3', min: mn, max: mx }); const ap = accessors.length - 1;
    accessors.push({ bufferView: vn, componentType: 5126, count: nv, type: 'VEC3' }); const an = accessors.length - 1;
    accessors.push({ bufferView: vi, componentType: small ? 5123 : 5125, count: idx.length, type: 'SCALAR' }); const ai = accessors.length - 1;
    primitives.push({ attributes: { POSITION: ap, NORMAL: an }, indices: ai, material: matIndex.get(mesh.material), mode: 4 });
  }
  const json = {
    asset: { version: '2.0', generator: 'Mizan AR export' },
    scene: 0, scenes: [{ name: 'Scene', nodes: [0], extras: { units: 'metre', scale: '1:1', bboxSizeMetres: model.size, note: 'approximate massing, not a construction drawing' } }],
    nodes: [{ name: model.name, mesh: 0 }],
    meshes: [{ name: model.name, primitives }], materials, accessors, bufferViews, buffers: [{ byteLength: pad4(offset) }],
  };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jl = pad4(js.length);
  if (jl !== js.length) { const t = new Uint8Array(jl).fill(0x20); t.set(js); js = t; } // الحشو بمسافات للـJSON
  const binLen = pad4(offset), total = 12 + 8 + jl + 8 + binLen, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, JSON_CHUNK, true); out.set(js, 20);
  const bo = 20 + jl; dv.setUint32(bo, binLen, true); dv.setUint32(bo + 4, BIN_CHUNK, true);
  let p = bo + 8; for (const c of chunks) { out.set(c, p); p += c.byteLength; }
  return out;
}

export default { encodeGlb };
