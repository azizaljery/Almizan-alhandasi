// كاتب ZIP صغير بلا مكتبات (نقي: بلا DOM): ضغط deflate عبر CompressionStream('deflate-raw') إن توفر، وإلا تخزين بلا ضغط.
// CRC32 صحيح لكل ملف، وأسماء الملفات UTF-8 (علم البت 11 = 0x0800) فتظهر الأسماء العربية سليمة في Windows/macOS/Linux.
// الحدود: بلا ZIP64 (حجم كلي أقل من 4 جيجابايت وأقل من 65535 ملفًا) وبلا تشفير — يكفي حزمة التسليم.
const enc = new TextEncoder();
let TABLE = null;
export function crc32(bytes) {
  if (!TABLE) { TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export const toBytes = v => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : enc.encode(String(v)));
/** deflate خام؛ يعيد null إن لم يتوفر CompressionStream بهذه الصيغة (متصفح قديم) فيُخزَّن الملف بلا ضغط. */
export async function deflateRaw(bytes) {
  try {
    if (typeof CompressionStream !== 'function') return null;
    const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter();
    w.write(bytes).catch(() => {}); w.close().catch(() => {});
    const parts = []; let n = 0;
    for (const r = cs.readable.getReader(); ;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; }
    const out = new Uint8Array(n); let p = 0; for (const c of parts) { out.set(c, p); p += c.length; }
    return out;
  } catch { return null; }
}
const PACKED = /\.(?:jpe?g|png|webp|gif|zip|xlsx|docx|pdf)$/i; // مضغوطة أصلًا
/**
 * entries: [{ name, bytes|text }] → Uint8Array لملف ZIP. الأسماء بمسارات «/».
 * @param {{date?: Date, compress?: boolean, onProgress?: (done:number,total:number,name:string)=>void}} [opts]
 */
export async function zipBuild(entries, { date = new Date(), compress = true, onProgress = null } = {}) {
  if (entries.length > 65535) throw new Error('ZIP: عدد الملفات يتجاوز الحد');
  const seen = new Set();
  const dt = ((Math.max(1980, date.getFullYear()) - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate()) & 0xffff;
  const tm = (date.getHours() << 11 | date.getMinutes() << 5 | (date.getSeconds() >> 1)) & 0xffff;
  const u16 = (a, v) => a.push(v & 255, (v >>> 8) & 255), u32 = (a, v) => { u16(a, v & 0xffff); u16(a, v >>> 16); };
  const chunks = [], central = []; let offset = 0, i = 0;
  for (const e of entries) {
    const path = String(e.name).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path || path.split('/').includes('..')) throw new Error('ZIP: اسم ملف غير صالح: ' + e.name);
    if (seen.has(path)) throw new Error('ZIP: اسم مكرر: ' + path); seen.add(path);
    const name = enc.encode(path), raw = toBytes(e.bytes ?? e.text ?? ''), crc = crc32(raw);
    let data = raw, method = 0;
    if (compress && raw.length > 64 && !PACKED.test(path)) { const z = await deflateRaw(raw); if (z && z.length < raw.length) { data = z; method = 8; } }
    const h = []; u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, method); u16(h, tm); u16(h, dt); u32(h, crc); u32(h, data.length); u32(h, raw.length); u16(h, name.length); u16(h, 0);
    chunks.push(Uint8Array.from(h), name, data);
    const c = []; u32(c, 0x02014b50); u16(c, 20); u16(c, 20); u16(c, 0x0800); u16(c, method); u16(c, tm); u16(c, dt); u32(c, crc); u32(c, data.length); u32(c, raw.length); u16(c, name.length); u16(c, 0); u16(c, 0); u16(c, 0); u16(c, 0); u32(c, 0); u32(c, offset);
    central.push(Uint8Array.from(c), name);
    offset += h.length + name.length + data.length;
    if (offset > 0xfffffff0) throw new Error('ZIP: الحجم يتجاوز الحد');
    if (onProgress) onProgress(++i, entries.length, path);
  }
  const csize = central.reduce((a, c) => a + c.length, 0), end = [];
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, entries.length); u16(end, entries.length); u32(end, csize); u32(end, offset); u16(end, 0);
  const all = [...chunks, ...central, Uint8Array.from(end)], out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
export default { crc32, deflateRaw, zipBuild, toBytes };
