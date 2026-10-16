// «استوديو التصدير» (نقي: بلا DOM). يجمع حزمة تصدير من مستند المرسم:
//   plan-<الدور>.svg لكل دور · plan.dxf · document.mizan.json · quantities.csv · manifest.json
// manifest.json يحمل بصمة الهندسة وsha256 لكل ملف وإصدار المخطط ووقت التوليد؛ لا يُذكر رقم بلا مصدر.
// لا يوجد مُصيّر SVG في render2d (هو canvas فقط)، لذا يُولَّد SVG هنا من الهندسة نفسها (wallRect/fixtureRect).
import { SCHEMA, serialize } from './doc.mjs';
import { wallRect, fixtureRect } from './review.mjs';
import { docBounds } from './editor/render2d.mjs';
import { toDxf } from './dxf.mjs';
import { computeDocQuantities, GRADES } from './quantities-doc.mjs';
import { geometryFingerprint } from '../design-dna.mjs';
import { computeStructure } from './structure.mjs';
import { structureSheetSvg, structureCsv } from './structure-sheet.mjs';

export const BUNDLE_SCHEMA = 'mizan-export-bundle/1';
const enc = new TextEncoder();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => String(s ?? '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || 'mizan';
const n3 = v => (Math.round(v * 1000) / 1000).toString();

export async function sha256Hex(bytes) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** مسقط SVG لدور واحد: الجدران والفتحات والأثاث والتسميات. المحور y مقلوب (الشمال لأعلى) والوحدة متر. */
export function planSvg(doc, level) {
  const b = docBounds(doc, level.id), pad = 1, W = b.x1 - b.x0 + pad * 2, H = b.y1 - b.y0 + pad * 2;
  const X = x => n3(x - b.x0 + pad), Y = y => n3(b.y1 - y + pad);
  const pts = p => p.map(q => X(q.x) + ',' + Y(q.y)).join(' ');
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n3(W)} ${n3(H)}" width="${n3(W * 50)}" height="${n3(H * 50)}" direction="rtl" font-family="Tahoma,Arial,sans-serif">`,
    `<title>${esc(doc.title)} — ${esc(level.name)}</title>`, `<rect width="100%" height="100%" fill="#fbf9f4"/>`];
  for (const w of doc.walls) if (w.level === level.id) out.push(`<polygon class="wall" points="${pts(wallRect(w))}" fill="#2a2a2e"/>`);
  for (const f of doc.fixtures) if (f.level === level.id) out.push(`<polygon class="fixture" points="${pts(fixtureRect(f))}" fill="#fffdf8" stroke="#6b6559" stroke-width="0.02"/>`);
  for (const o of doc.openings) {
    if (o.level !== level.id) continue; const w = doc.walls.find(x => x.id === o.wall); if (!w) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    const p = k => ({ x: w.a.x + u.x * (o.at + k * o.w / 2), y: w.a.y + u.y * (o.at + k * o.w / 2) });
    const win = String(o.kind).startsWith('window'), a = p(-1), c = p(1);
    out.push(`<line class="${win ? 'window' : 'door'}" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(c.x)}" y2="${Y(c.y)}" stroke="${win ? '#7fb7d6' : '#c6a15b'}" stroke-width="${n3(Math.max(w.t * 0.6, 0.06))}"/>`);
  }
  for (const l of doc.labels) if (l.level === level.id && l.seed) out.push(`<text x="${X(l.seed.x)}" y="${Y(l.seed.y)}" font-size="0.35" text-anchor="middle" fill="#3a3631">${esc(l.name)}</text>`);
  out.push('</svg>');
  return out.join('\n');
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/** جدول الكميات CSV: كل صف يحمل «الدرجة»؛ الصفوف «غير قابل للحساب» تبقى بقيمة فارغة ولا تُحذف. */
export function quantitiesCsv(res) {
  const rows = [['البند', 'القيمة', 'الوحدة', 'الدرجة', 'الأساس']];
  for (const r of res.rows) rows.push([r.label, r.value === null ? '' : r.value, r.unit, GRADES[r.grade] || r.grade, r.basis]);
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * يبني الحزمة. يعيد { files:[{name,mime,bytes:Uint8Array,sha256,size}], manifest }، وmanifest نفسه أول عنصر لا يُحسب له sha256 (لا يمكن أن يحتوي بصمة نفسه).
 * options: { now: Date, app: {commit, builtAt} }
 */
export async function buildExportBundle(doc, { now = new Date(), app = null } = {}) {
  const base = slug(doc.title), parts = [];
  const add = (name, mime, text, kind) => parts.push({ name, mime, kind, bytes: enc.encode(text) });
  for (const lv of doc.levels) add(`plan-${slug(lv.id)}.svg`, 'image/svg+xml', planSvg(doc, lv), 'plan-svg');
  add('plan.dxf', 'application/dxf', toDxf(doc), 'dxf');
  add(`${base}.mizan.json`, 'application/json', serialize(doc), 'document-json');
  let res = null, qtyError = null; try { res = computeDocQuantities(doc); } catch (e) { qtyError = e.message; }
  if (res) add('quantities.csv', 'text/csv;charset=utf-8', quantitiesCsv(res), 'quantities-csv');
  // المخطط الإنشائي المبدئي لكل دور له جدران، وجدول الأعمدة والجسور؛ يُولَّد من الرسم نفسه فيطابق ما يُعرض في المرسم
  let structNote = null;
  try {
    const st = computeStructure(doc), fp = geometryFingerprint(doc), day = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
    doc.levels.forEach((lv, i) => { const L = st.levels.find(x => x.id === lv.id); if (L?.columns) add(`structure-${slug(lv.id)}.svg`, 'image/svg+xml', structureSheetSvg(doc, st, { levelId: lv.id, fingerprint: fp, date: day, sheetNo: 'S-' + String(i + 1).padStart(2, '0') }), 'structure-svg'); });
    if (st.levels.some(l => l.columns)) add('structure.csv', 'text/csv;charset=utf-8', structureCsv(st), 'structure-csv');
  } catch (e) { structNote = 'تعذّر المخطط الإنشائي: ' + e.message; }
  const files = [];
  for (const p of parts) files.push({ name: p.name, mime: p.mime, kind: p.kind, bytes: p.bytes, size: p.bytes.length, sha256: await sha256Hex(p.bytes) });
  const manifest = {
    schema: BUNDLE_SCHEMA,
    docSchema: doc.schema || SCHEMA,
    createdAt: now instanceof Date ? now.toISOString() : String(now),
    title: doc.title,
    geometryFingerprint: geometryFingerprint(doc),
    app: { commit: app?.commit ?? null, builtAt: app?.builtAt ?? null },
    files: files.map(f => ({ name: f.name, kind: f.kind, mime: f.mime, bytes: f.size, sha256: f.sha256 })),
    notes: [...(qtyError ? ['تعذّر حساب الكميات: ' + qtyError] : []), ...(structNote ? [structNote] : []), 'المخطط الإنشائي تحجيم أولي لا تصميم إنشائي معتمد.'],
  };
  const mbytes = enc.encode(JSON.stringify(manifest, null, 2) + '\n');
  files.push({ name: 'manifest.json', mime: 'application/json', kind: 'manifest', bytes: mbytes, size: mbytes.length, sha256: null });
  return { files, manifest };
}

// ---------------------------------------------------------------------------------------------- ZIP «stored» (بلا ضغط، بلا مكتبات)
let CRC_T = null;
export function crc32(bytes) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** entries: [{name, bytes}] → Uint8Array لملف ZIP بطريقة stored؛ الأسماء UTF-8 (علم البت 11). */
export function zipStore(entries, date = new Date()) {
  const dt = ((date.getFullYear() - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate()) & 0xffff;
  const tm = (date.getHours() << 11 | date.getMinutes() << 5 | (date.getSeconds() >> 1)) & 0xffff;
  const chunks = [], central = []; let offset = 0;
  const u16 = (a, v) => a.push(v & 255, (v >>> 8) & 255), u32 = (a, v) => { u16(a, v & 0xffff); u16(a, v >>> 16); };
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.bytes), size = e.bytes.length, h = [];
    u32(h, 0x04034b50); u16(h, 20); u16(h, 0x0800); u16(h, 0); u16(h, tm); u16(h, dt); u32(h, crc); u32(h, size); u32(h, size); u16(h, name.length); u16(h, 0);
    chunks.push(Uint8Array.from(h), name, e.bytes);
    const c = []; u32(c, 0x02014b50); u16(c, 20); u16(c, 20); u16(c, 0x0800); u16(c, 0); u16(c, tm); u16(c, dt); u32(c, crc); u32(c, size); u32(c, size); u16(c, name.length); u16(c, 0); u16(c, 0); u16(c, 0); u16(c, 0); u32(c, 0); u32(c, offset);
    central.push(Uint8Array.from(c), name);
    offset += h.length + name.length + size;
  }
  const csize = central.reduce((a, c) => a + c.length, 0), end = [];
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, entries.length); u16(end, entries.length); u32(end, csize); u32(end, offset); u16(end, 0);
  const all = [...chunks, ...central, Uint8Array.from(end)], out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
export const bundleZip = (bundle, date) => zipStore(bundle.files.map(f => ({ name: f.name, bytes: f.bytes })), date);
export default { BUNDLE_SCHEMA, planSvg, quantitiesCsv, buildExportBundle, zipStore, bundleZip, crc32, sha256Hex };
