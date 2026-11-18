import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { designSignature, signatureSimilarity, SIGNATURE_POLICY } from '../dist/design-signature.mjs';
import { checkDoc } from '../dist/villa-layout.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { sha256Hex } from './admin-auth.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const fault = (code, message, status = 400) => Object.assign(Error(message), { code, status });
const MAX_CLAIMS = 5000, PAGE = 100;
const receipt = row => ({ id: row.id, geometryHash: row.geometry_hash, documentHash: row.document_hash, policy: row.policy, deliveredAt: row.created_at });

async function payload(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw fault('json_required', 'أرسل بيانات المشروع بصيغة JSON.', 415);
  const reader = request.body?.getReader(), chunks = []; let size = 0;
  if (reader) for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.byteLength; if (size > 450000) { await reader.cancel(); throw fault('too_large', 'المشروع أكبر من حد توثيق التسليم.', 413); } chunks.push(r.value); }
  const bytes = new Uint8Array(size); let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.length; }
  let b; try { b = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw fault('invalid_json', 'بيانات المشروع غير صالحة.'); }
  if (!b || typeof b !== 'object' || Array.isArray(b) || !Object.hasOwn(b, 'doc')) throw fault('invalid_project', 'لم يصل ملف مخطط صالح للفحص.');
  let doc;
  try { doc = parseDoc(typeof b.doc === 'string' ? b.doc : JSON.stringify(b.doc)); }
  catch { throw fault('invalid_geometry', 'ملف المخطط غير صالح؛ افتح نسخة سليمة قبل التسليم.', 422); }
  if (doc.walls.length > 600 || doc.labels.length > 100 || doc.levels.length > 3) throw fault('too_complex', 'هذا المشروع يتجاوز حد فحص التسليم الحالي.');
  const check = checkDoc(doc);
  if (!check.ok || reviewDoc(doc, { only: ['NO_ENTRY', 'UNREACHABLE_ROOM', 'INVALID_OPENING'] }).length) throw fault('invalid_geometry', 'لا يمكن تسليم مخطط به خلل هندسي؛ راجع الغرف واتصالها أولًا.', 422);
  const signature = designSignature(doc);
  return { doc, signature, geometry: await sha256Hex(signature.key), document: await sha256Hex(serialize(doc)) };
}

export function createDeliveryRegistry({ now = Date.now } = {}) {
  const hits = new Map();
  return { async fetch(request, env = {}) {
    const path = new URL(request.url).pathname;
    try {
      if (!env.DB?.prepare || !env.DB?.batch) throw fault('registry_unavailable', 'سجل التسليم غير جاهز؛ المعاينة متاحة لكن لم يُحجز التصميم.', 503);
      if (path === '/api/delivery/verify' && request.method === 'GET') {
        const url = new URL(request.url), id = url.searchParams.get('id') || '', hash = url.searchParams.get('hash') || '';
        if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(hash)) return json({ valid: false });
        const r = await env.DB.prepare('SELECT c.policy, r.created_at FROM delivery_receipts r JOIN delivery_claims c ON c.id=r.claim_id WHERE r.id=? AND r.document_hash=?').bind(id, hash).first();
        return json(r ? { valid: true, policy: r.policy, deliveredAt: r.created_at } : { valid: false });
      }
      if (path === '/api/delivery/status' && request.method === 'GET') {
        const schema = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('delivery_registry_state','delivery_claims','delivery_receipts')").first();
        const state = await env.DB.prepare('SELECT revision FROM delivery_registry_state WHERE id=1').first();
        if (Number(schema?.n) !== 3 || !state) throw fault('registry_unavailable', 'سجل التسليم غير جاهز بعد.', 503);
        return json({ ready: true, policy: SIGNATURE_POLICY });
      }
      if (!['/api/delivery/check', '/api/delivery/claim'].includes(path) || request.method !== 'POST') return json({ error: 'not_found' }, 404);
      if (request.headers.get('origin') !== new URL(request.url).origin) throw fault('same_origin_required', 'يجب تنفيذ التسليم من الموقع نفسه.', 403);
      const token = request.headers.get('x-delivery-key') || '';
      if (!/^[a-f0-9]{64}$/.test(token)) throw fault('owner_required', 'تعذر قراءة مفتاح العميل؛ احتفظ به لاستعادة حجزك.', 401);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown', t = now();
      const rate = (hits.get(ip) || []).filter(x => t - x < 60000);
      if (rate.length >= 15) throw fault('rate_limited', 'محاولات كثيرة؛ أعد المحاولة بعد دقيقة.', 429);
      hits.set(ip, [...rate, t]); if (hits.size > 5000) for (const [k, v] of hits) if (t - v.at(-1) > 60000) hits.delete(k);
      const p = await payload(request), owner = await sha256Hex('delivery-owner|' + token), db = env.DB;
      for (let attempt = 0; attempt < 4; attempt++) {
        const state = await db.prepare('SELECT revision FROM delivery_registry_state WHERE id=1').first();
        if (!state) throw fault('registry_unavailable', 'سجل التسليم غير جاهز بعد.', 503);
        let own = null, count = 0;
        for (let offset = 0; ; offset += PAGE) {
          const page = await db.prepare('SELECT * FROM delivery_claims ORDER BY id LIMIT ? OFFSET ?').bind(PAGE, offset).all();
          const rows = page.results || [];
          count += rows.length;
          if (count > MAX_CLAIMS) throw fault('registry_full', 'سجل التسليم يحتاج توسعة؛ لم يُصدر حجز جديد.', 503);
          for (const row of rows) {
            if (row.owner_hash === owner) { if (row.geometry_hash === p.geometry) own = row; continue; }
            if (row.policy !== SIGNATURE_POLICY) throw fault('registry_policy', 'يلزم تحديث سجل البصمات قبل تسليم جديد.', 503);
            if (row.geometry_hash === p.geometry || signatureSimilarity(p.signature, JSON.parse(row.signature)).copy) throw fault('design_reserved', 'هذا التوزيع مطابق أو شديد التشابه مع تصميم مسلّم لعميل آخر. اختر توزيعًا معماريًا مختلفًا؛ تغيير الاسم أو اللون أو عكس المخطط لا يحرره.', 409);
          }
          if (rows.length < PAGE) break;
        }
        if (path.endsWith('/check')) return json({ available: true, policy: SIGNATURE_POLICY });
        if (own) {
          const previous = await db.prepare('SELECT * FROM delivery_receipts WHERE claim_id=? AND document_hash=?').bind(own.id, p.document).first();
          if (previous) return json({ ok: true, receipt: receipt({ ...own, ...previous }) });
        }
        if (!own && count >= MAX_CLAIMS) throw fault('registry_full', 'سجل التسليم يحتاج توسعة.', 503);
        const receipts = await db.prepare('SELECT COUNT(*) AS n FROM delivery_receipts').first();
        if (Number(receipts.n) >= 20000) throw fault('registry_full', 'سجل إيصالات التسليم يحتاج توسعة.', 503);
        const nonce = crypto.randomUUID(), id = crypto.randomUUID(), created = new Date(now()).toISOString();
        // D1 batch is an atomic transaction. The CAS nonce is essential: another
        // isolate cannot commit an unchecked near-copy between this scan and insert.
        const result = await db.batch([
          db.prepare('UPDATE delivery_registry_state SET revision=revision+1, nonce=? WHERE id=1 AND revision=?').bind(nonce, state.revision),
          db.prepare('INSERT INTO delivery_claims (id,owner_hash,geometry_hash,document_hash,policy,signature,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM delivery_registry_state WHERE id=1 AND nonce=?) ON CONFLICT(geometry_hash) DO NOTHING').bind(id, owner, p.geometry, p.document, SIGNATURE_POLICY, JSON.stringify({ ...p.signature, variants: [p.signature.variants[0]] }), created, nonce),
          db.prepare('INSERT INTO delivery_receipts (id,claim_id,document_hash,created_at) SELECT ?,c.id,?,? FROM delivery_claims c WHERE c.geometry_hash=? AND c.owner_hash=? AND EXISTS (SELECT 1 FROM delivery_registry_state WHERE id=1 AND nonce=?) ON CONFLICT(claim_id,document_hash) DO NOTHING').bind(crypto.randomUUID(), p.document, created, p.geometry, owner, nonce),
        ]);
        if (Number(result[0]?.meta?.changes) !== 1 || Number(result[2]?.meta?.changes) !== 1) continue;
        const saved = await db.prepare('SELECT c.geometry_hash,c.policy,r.id,r.document_hash,r.created_at FROM delivery_receipts r JOIN delivery_claims c ON c.id=r.claim_id WHERE c.geometry_hash=? AND c.owner_hash=? AND r.document_hash=?').bind(p.geometry, owner, p.document).first();
        return json({ ok: true, receipt: receipt(saved) }, 201);
      }
      throw fault('retry_delivery', 'تزامنت عمليات تسليم؛ أعد المحاولة للتحقق من الحجز.', 409);
    } catch (e) { return json({ error: e.status ? e.code : 'registry_unavailable', message: e.status ? e.message : 'تعذر توثيق الحجز الآن؛ بقي مشروعك ولم يُؤكَّد التسليم.' }, e.status || 503); }
  } };
}
export default createDeliveryRegistry();
