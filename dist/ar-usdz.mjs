// مصدّر USDZ نقي من نموذج الواقع المعزز: ملف USDA نصي (UsdPreviewSurface) داخل أرشيف zip غير مضغوط (method 0)
// تبدأ بيانات كل ملف فيه عند إزاحة من مضاعفات 64 بايت كما تشترط مواصفة USDZ. بلا خادم ولا مراجع خارجية.
// الوحدة المتر (metersPerUnit = 1) والمحور الرأسي Y: يفتح Quick Look بالمقياس الحقيقي.
// لم يُجرَّب على جهاز iOS داخل هذا المستودع؛ البنية تُفحص بنيويًا في tests/ar-export.test.mjs فقط.

let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) { CRC_TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const f = v => { const r = Math.round(v * 1e4) / 1e4; return Object.is(r, -0) ? '0' : String(r); };
const tri3 = (a, i) => `(${f(a[i])}, ${f(a[i + 1])}, ${f(a[i + 2])})`;

export function buildUsda(model) {
  const L = [];
  L.push('#usda 1.0', '(', '    customLayerData = {', '        string creator = "Mizan AR export"', '    }', '    defaultPrim = "Root"', '    metersPerUnit = 1', '    upAxis = "Y"', ')', '');
  L.push('def Xform "Root"', '{');
  L.push('    def Scope "Scenes" (', '        kind = "sceneLibrary"', '    )', '    {');
  L.push('        def Xform "Scene" (', '            customData = {', '                bool preliminary_collidesWithEnvironment = 0', '                string sceneName = "Scene"', '            }', '            sceneName = "Scene"', '        )', '        {');
  L.push('            token preliminary:anchoring:type = "plane"', '            token preliminary:planeAnchoring:alignment = "horizontal"', '');
  L.push('            def Xform "Building"', '            {');
  model.meshes.forEach((m, i) => {
    const n = m.positions.length / 3, name = `Mesh_${m.material}`;
    L.push(`                def Mesh "${name}" (`, '                    prepend apiSchemas = ["MaterialBindingAPI"]', '                )', '                {');
    L.push(`                    int[] faceVertexCounts = [${new Array(m.indices.length / 3).fill(3).join(', ')}]`);
    L.push(`                    int[] faceVertexIndices = [${Array.from(m.indices).join(', ')}]`);
    const pts = [], nrm = [];
    for (let k = 0; k < n; k++) { pts.push(tri3(m.positions, k * 3)); nrm.push(tri3(m.normals, k * 3)); }
    L.push(`                    point3f[] points = [${pts.join(', ')}]`);
    L.push(`                    normal3f[] normals = [${nrm.join(', ')}] (`, '                        interpolation = "vertex"', '                    )');
    L.push('                    uniform token subdivisionScheme = "none"');
    L.push('                    uniform bool doubleSided = 0');
    L.push(`                    rel material:binding = </Root/Materials/${m.material}>`);
    L.push('                }');
  });
  L.push('            }', '        }', '    }', '');
  L.push('    def Scope "Materials"', '    {');
  for (const m of model.materials) {
    L.push(`        def Material "${m.id}"`, '        {');
    L.push(`            token outputs:surface.connect = </Root/Materials/${m.id}/Surface.outputs:surface>`);
    L.push('            def Shader "Surface"', '            {', '                uniform token info:id = "UsdPreviewSurface"');
    L.push(`                color3f inputs:diffuseColor = (${m.color.map(f).join(', ')})`, `                float inputs:opacity = ${f(m.alpha)}`, `                float inputs:roughness = ${f(m.roughness)}`, '                float inputs:metallic = 0', '                token outputs:surface', '            }', '        }');
  }
  L.push('    }', '}', '');
  return L.join('\n');
}

/** zip غير مضغوط بمحاذاة 64 بايت لبيانات كل ملف (حشو في حقل extra). files: [{name, data:Uint8Array}] */
export function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const DT = 0, DD = ((2026 - 1980) << 9) | (1 << 5) | 1; // تاريخ ثابت: ناتج حتمي
  for (const { name, data } of files) {
    const nb = enc.encode(name), crc = crc32(data), base = 30 + nb.length;
    let extra = (64 - ((off + base) % 64)) % 64; if (extra > 0 && extra < 4) extra += 64; // حقل extra أدنى 4 بايت
    const h = new Uint8Array(base + extra), dv = new DataView(h.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, DT, true); dv.setUint16(12, DD, true); dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, nb.length, true); dv.setUint16(28, extra, true); h.set(nb, 30);
    if (extra) { dv.setUint16(base, 0x1986, true); dv.setUint16(base + 2, extra - 4, true); } // معرّف حشو (بياناته أصفار)
    parts.push(h, data);
    const c = new Uint8Array(46 + nb.length), cd = new DataView(c.buffer);
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, DT, true); cd.setUint16(14, DD, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, nb.length, true); cd.setUint32(42, off, true); c.set(nb, 46); central.push(c);
    off += h.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0)); let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

export function encodeUsdz(model) { return zipStore([{ name: 'model.usda', data: new TextEncoder().encode(buildUsda(model)) }]); }

export default { crc32, buildUsda, zipStore, encodeUsdz };
