// أرشيف تصاميم العملاء بموافقتهم الصريحة (مستقل عن أرشيف الحسابات /api/archive).
//   POST   /api/archive-consent/designs        ← إنشاء (يتطلب consent:true حرفيًا) ويعيد { id, number }
//   PUT    /api/archive-consent/designs/{id}   ← تحديث بنفس الرمز
//   DELETE /api/archive-consent/designs/{id}   ← سحب الموافقة وحذف النسخة (ترويسة X-Archive-Token)
//   GET    /api/archive-consent/status         ← هل الاستقبال مفتوح؟ (بلا بيانات)
// الرمز يولّده متصفح العميل ويحتفظ به؛ الخادم يخزّن تجزئته فقط. لا IP ولا اسم ولا نص حر: القوائم بيضاء صارمة.
// الإحداثيات تُقرَّب إلى منزلتين عشريتين (~1 كم). أي حقل غير معروف يُسقَط لا يُخزَّن.
import { parseDoc } from '../dist/draw/doc.mjs';
import { sha256Hex } from './admin-auth.mjs';
import { readSettings } from './site-settings.mjs';

export const LIMITS = Object.freeze({ maxBody: 600_000, maxPayload: 450_000, perHourPerClient: 6, perDayTotal: 1000, maxRows: 50_000, tokenMin: 32, tokenMax: 128 });
const SIDES = ['n', 's', 'e', 'w'];
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra } });
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const rec = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
export const round2 = v => Math.round(v * 100) / 100;
export const designNumber = id => 'D-' + String(id).padStart(6, '0');

/** يقيّم الخريطة بقيم قياسية فقط: منطقي، رقم، أو معرّف ASCII قصير. النص العربي الحر يُسقَط. */
export function cleanScalars(v, depth = 0) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return /^[A-Za-z0-9_.\-]{1,40}$/.test(v) ? v : undefined;
  if (depth >= 3) return undefined;
  if (Array.isArray(v)) return v.slice(0, 24).map(x => cleanScalars(x, depth + 1)).filter(x => x !== undefined);
  if (rec(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v).slice(0, 60)) { if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k) || k === '__proto__') continue; const c = cleanScalars(x, depth + 1); if (c !== undefined) out[k] = c; }
    return out;
  }
  return undefined;
}
export function cleanLand(raw) {
  if (!rec(raw)) throw fail('invalid_land', 'بيانات الأرض غير صالحة.');
  const length = num(raw.length, 3, 500), width = num(raw.width, 3, 500);
  if (length === null || width === null) throw fail('invalid_land', 'أبعاد الأرض غير صالحة.');
  const list = v => (Array.isArray(v) ? [...new Set(v.filter(s => SIDES.includes(s)))] : []);
  const floors = Number.isInteger(raw.floors) && raw.floors >= 1 && raw.floors <= 3 ? raw.floors : 1;
  const land = { length, width, streets: list(raw.streets), entries: list(raw.entries), floors };
  if (rec(raw.streetWidths)) { const sw = {}; for (const s of SIDES) { const n = num(raw.streetWidths[s], 1, 200); if (n !== null) sw[s] = n; } if (Object.keys(sw).length) land.streetWidths = sw; }
  // الموقع: تقريب إلى ~1 كم، وبلا أي حقل نصي (لا اسم مدينة مكتوب ولا مصدر)
  const g = raw.geo; let geo = null;
  if (rec(g)) { const lat = num(g.lat, -90, 90), lng = num(g.lng, -180, 180); if (lat !== null && lng !== null) geo = { lat: round2(lat), lng: round2(lng), ...(num(g.north, -45, 45) !== null ? { north: Math.round(g.north) } : {}) }; }
  if (geo) land.geo = geo;
  return land;
}
export function cleanDoc(raw) {
  let doc; try { doc = parseDoc(structuredClone(raw)); } catch (e) { throw fail('invalid_design', 'نموذج التصميم غير صالح: ' + String(e.message || '').slice(0, 120)); }
  doc.title = 'تصميم'; doc.texts = []; delete doc.geo; delete doc.location;
  if (doc.plot && typeof doc.plot === 'object') delete doc.plot.geo;
  return doc;
}
/** يبني السجل النظيف من جسم الطلب. يرمي fail عند أي مخالفة. */
export function sanitizeSubmission(body) {
  if (!rec(body)) throw fail('invalid_request', 'بيانات الطلب غير صالحة.');
  if (body.consent !== true) throw fail('consent_required', 'لا يُحفظ شيء دون موافقتك الصريحة.', 403);
  const token = body.token;
  if (typeof token !== 'string' || token.length < LIMITS.tokenMin || token.length > LIMITS.tokenMax || !/^[A-Za-z0-9_-]+$/.test(token)) throw fail('invalid_token', 'رمز الحذف غير صالح.');
  const land = cleanLand(body.land), doc = cleanDoc(body.doc);
  const program = cleanScalars(rec(body.program) ? body.program : {}) || {};
  const exterior = cleanScalars(rec(body.exterior) ? body.exterior : {}) || {};
  const style = typeof exterior.style === 'string' ? exterior.style.slice(0, 20) : '';
  const floors = Math.max(1, Math.min(3, doc.levels.length || land.floors));
  const bedrooms = Number.isInteger(program.counts?.bedrooms) ? Math.max(0, Math.min(50, program.counts.bedrooms)) : null;
  const payload = JSON.stringify({ v: 1, doc, land, program, exterior });
  const bytes = new TextEncoder().encode(payload).byteLength;
  if (bytes > LIMITS.maxPayload) throw fail('payload_too_large', 'التصميم أكبر من الحد المسموح للأرشيف.', 413);
  return { token, style, floors, bedrooms, land, payload, bytes, area: Math.round(land.length * land.width * 100) / 100 };
}

async function readBody(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw fail('json_required', 'أرسل JSON.', 415);
  if (Number(request.headers.get('content-length')) > LIMITS.maxBody) throw fail('request_too_large', 'حجم الطلب أكبر من المسموح.', 413);
  const reader = request.body?.getReader(), parts = []; let n = 0;
  if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.byteLength; if (n > LIMITS.maxBody) { await reader.cancel(); throw fail('request_too_large', 'حجم الطلب أكبر من المسموح.', 413); } parts.push(value); }
  const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); } catch { throw fail('invalid_json', 'تعذرت قراءة الطلب.', 400); }
}

export function createClientArchive({ now = Date.now } = {}) {
  const hits = new Map(); // عنوان العميل → أوقات (في الذاكرة فقط، لا تُخزَّن في D1)
  const rate = ip => {
    const t = now(), arr = (hits.get(ip) || []).filter(x => t - x < 3600_000);
    if (arr.length >= LIMITS.perHourPerClient) { hits.set(ip, arr); return true; }
    arr.push(t); hits.set(ip, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(x => t - x < 3600_000)) hits.delete(k);
    return false;
  };
  const dbOf = env => { if (!env?.DB?.prepare) throw fail('archive_unavailable', 'الأرشيف غير متاح حاليًا.', 503); return env.DB; };
  const sameOrigin = request => { const o = request.headers.get('origin'); if (!o || o !== new URL(request.url).origin) throw fail('same_origin_required', 'طلب غير مسموح.', 403); };
  const iso = () => new Date(now()).toISOString();

  async function create(request, env) {
    sameOrigin(request);
    const settings = await readSettings(env, now);
    if (settings.values.archive_intake_closed === '1') throw fail('intake_closed', 'استقبال الأرشيف متوقف مؤقتًا.', 503);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rate(ip)) throw fail('rate_limited', 'محاولات كثيرة؛ أعد المحاولة لاحقًا.', 429);
    const s = sanitizeSubmission(await readBody(request)), db = dbOf(env);
    try {
      const day = iso().slice(0, 10);
      const c = await db.prepare('SELECT (SELECT COUNT(*) FROM client_designs WHERE created_at >= ?) AS today, (SELECT COUNT(*) FROM client_designs) AS total').bind(day).first();
      if ((c?.today || 0) >= LIMITS.perDayTotal || (c?.total || 0) >= LIMITS.maxRows) throw fail('archive_full', 'بلغ الأرشيف حده الآن؛ لم يُحفظ شيء.', 503);
      const th = await sha256Hex('archive-token|' + s.token), t = iso();
      const row = await db.prepare('INSERT INTO client_designs (token_hash, created_at, updated_at, style, floors, plot_width, plot_length, plot_area, bedrooms, geo_lat, geo_lng, bytes, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
        .bind(th, t, t, s.style, s.floors, s.land.width, s.land.length, s.area, s.bedrooms, s.land.geo?.lat ?? null, s.land.geo?.lng ?? null, s.bytes, s.payload).first();
      return json({ ok: true, id: row.id, number: designNumber(row.id) }, 201);
    } catch (e) { if (e.status) throw e; throw fail('archive_unavailable', 'الأرشيف غير متاح حاليًا؛ لم يُحفظ شيء.', 503); }
  }
  async function owned(request, env, id) {
    const token = request.headers.get('x-archive-token') || '';
    if (!/^\d{1,12}$/.test(id) || token.length < LIMITS.tokenMin || token.length > LIMITS.tokenMax) throw fail('not_found', 'غير موجود.', 404);
    const row = await dbOf(env).prepare('SELECT id, token_hash FROM client_designs WHERE id = ?').bind(Number(id)).first();
    const th = await sha256Hex('archive-token|' + token);
    if (!row || row.token_hash !== th) throw fail('not_found', 'غير موجود.', 404);
    return row;
  }
  async function update(request, env, id) {
    sameOrigin(request);
    const settings = await readSettings(env, now);
    if (settings.values.archive_intake_closed === '1') throw fail('intake_closed', 'استقبال الأرشيف متوقف مؤقتًا.', 503);
    if (rate(request.headers.get('CF-Connecting-IP') || 'unknown')) throw fail('rate_limited', 'محاولات كثيرة؛ أعد المحاولة لاحقًا.', 429);
    const body = await readBody(request); const tok = request.headers.get('x-archive-token') || '';
    const s = sanitizeSubmission({ ...body, token: tok.length >= LIMITS.tokenMin ? tok : body?.token });
    await owned(request, env, id);
    await dbOf(env).prepare('UPDATE client_designs SET updated_at=?, style=?, floors=?, plot_width=?, plot_length=?, plot_area=?, bedrooms=?, geo_lat=?, geo_lng=?, bytes=?, payload=? WHERE id=?')
      .bind(iso(), s.style, s.floors, s.land.width, s.land.length, s.area, s.bedrooms, s.land.geo?.lat ?? null, s.land.geo?.lng ?? null, s.bytes, s.payload, Number(id)).run();
    return json({ ok: true, id: Number(id), number: designNumber(id) });
  }
  async function remove(request, env, id) {
    sameOrigin(request);
    await owned(request, env, id);
    await dbOf(env).prepare('DELETE FROM client_designs WHERE id = ?').bind(Number(id)).run();
    return json({ ok: true, deleted: true });
  }
  return { async fetch(request, env = {}) {
    const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
    try {
      if (path === '/api/archive-consent/status' && request.method === 'GET') {
        const s = await readSettings(env, now);
        return json({ open: s.values.archive_intake_closed !== '1' && !!env?.DB?.prepare });
      }
      if (path === '/api/archive-consent/designs' && request.method === 'POST') return await create(request, env);
      const m = /^\/api\/archive-consent\/designs\/(\d+)$/.exec(path);
      if (m && request.method === 'PUT') return await update(request, env, m[1]);
      if (m && request.method === 'DELETE') return await remove(request, env, m[1]);
      return json({ error: 'not_found', message: 'مسار غير معروف.' }, 404);
    } catch (e) { return json({ error: e.status ? e.code : 'error', message: e.status ? e.message : 'تعذّر تنفيذ الطلب.' }, e.status || 500); }
  } };
}
export default createClientArchive();
