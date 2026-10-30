// الجولة 21 — حياد أدوات التشخيص (قرار المالك، الضابط الثاني): السجل مطفأ افتراضيًا، والنتيجة بالسجل وبدونه متطابقة حرفيًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements } from '../dist/requirements.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { HELDOUT2 } from '../scripts/heldout2-cases.mjs';
const req = (text, counts) => { const r = extractRequirements(text, { counts }); r.counts = { ...r.counts, ...counts }; return r; };
test('حياد التشخيص: السجل مطفأ افتراضيًا، والنتيجة بسجل التشخيص وبدونه متطابقة حرفيًا (بصمة المخططات والنتيجة دون الزمن)', { timeout: 900000 }, async () => {
  const { serialize } = await import('../dist/draw/doc.mjs'), { createHash } = await import('node:crypto');
  const C = HELDOUT2.find(c => c.id === 'H9'), r = req(C.text, C.counts);
  const fp = () => { const o = V3.generateVillaDesigns({ land: { floors: 1, ...C.land }, counts: r.counts, requirements: JSON.parse(JSON.stringify(r)), keep: 3 });
    return createHash('sha256').update(JSON.stringify(o.designs.map(d => [d.pat, d.presentation?.status, serialize(d.doc), d.notes]))).digest('hex'); };
  assert.equal(globalThis.__v2dbg, undefined, 'السجل مطفأ افتراضيًا'); const off = fp(); assert.equal(globalThis.__v2dbg, undefined, 'المحرك لا يشغّل السجل بنفسه');
  globalThis.__v2dbg = {}; globalThis.__v2keepDocs = true; globalThis.__v2keepRejDocs = true;
  try { assert.equal(fp(), off); } finally { delete globalThis.__v2dbg; delete globalThis.__v2keepDocs; delete globalThis.__v2keepRejDocs; delete globalThis.__v2pool; delete globalThis.__v2poolDocs; delete globalThis.__v2rej; delete globalThis.__v2rejDocs; }
});
