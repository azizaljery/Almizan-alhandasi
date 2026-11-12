// خدمات تحديد موقع الأرض من الوركر (بلا مفاتيح):
//   GET /api/geo/providers          ما المفعّل فعلًا (بلا أسرار)
//   GET /api/geo/search?q=&scope=sa|world   بحث بالاسم عبر وكيل Nominatim (سياسته: ≤1 طلب/ث للتطبيق، تعريف التطبيق، كاش، بلا إكمال تلقائي)
//   GET /api/geo/resolve?u=         يحلّ رابط خرائط مختصرًا خادميًا: قائمة سماح من ثلاثة نطاقات، ≤5 تحويلات، مهلة، ولا يعيد إلا الإحداثيات
// لا يُخزَّن شيء عن العميل: عدّاد المعدل في ذاكرة النسخة (مفتاحه عنوان العميل، مؤقت وقصير)، والكاش للنصوص العامة فقط.
import { normalizeShortLink, coordsFromUrl } from '../dist/geo-input.mjs';
import { activeProviders, NOMINATIM } from './geo-providers.mjs';

export const GEO_LIMITS = Object.freeze({
  perClientMs: 1000, maxClients: 5000, cacheMs: 10 * 60_000, cacheMax: 500, resolveCacheMs: 60 * 60_000,
  maxHops: 5, hopTimeoutMs: 3500, searchTimeoutMs: 6000, maxQuery: 120, minQuery: 2, maxQueue: 3,
});
const DEFAULT_ALLOWED_ORIGINS = ['https://almizan-handasi.aljeryabod.workers.dev', 'https://al-mizan-al-handasi.aljeryabod.chatgpt.site'];
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Cache-Control': 'no-store', ...extra } });
const MSG = {
  method: 'هذا المسار يقبل GET فقط.', origin: 'طلب غير مسموح.', fast: 'انتظر لحظة ثم أعد المحاولة (طلب واحد في الثانية).',
  query: 'اكتب اسم الحي أو المدينة (حرفان على الأقل) ثم اضغط «ابحث».', off: 'البحث بالاسم متوقف مؤقتًا. الصق الإحداثيات أو رابط الموقع.',
  busy: 'خدمة البحث مشغولة الآن. أعد المحاولة بعد لحظات.', upstream: 'تعذّر البحث بالاسم الآن. الصق الإحداثيات أو رابط الموقع.',
  link: 'هذا الرابط غير مدعوم. المسموح فقط روابط maps.app.goo.gl وgoo.gl/maps وg.co/kgs.', noCoords: 'فتحت الرابط لكنه لا يحمل إحداثيات. افتح الموقع في خرائط Google وانسخ رابطه الطويل أو إحداثياته.',
  resolveFail: 'تعذّر فتح الرابط المختصر الآن. انسخ الرابط الطويل من خرائط Google أو الصق الإحداثيات.',
};

export function createGeo({ now = Date.now, fetchImpl = (...a) => fetch(...a), sleep = ms => new Promise(r => setTimeout(r, ms)), limits = GEO_LIMITS } = {}) {
  const L = limits, clients = new Map(), cache = new Map();
  let lastUpstream = 0, queued = 0, gate = Promise.resolve();

  const takeClient = ip => {
    const t = now(), last = clients.get(ip);
    if (last !== undefined && t - last < L.perClientMs) return Math.max(1, Math.ceil((L.perClientMs - (t - last)) / 1000));
    if (clients.size >= L.maxClients) for (const [k, v] of clients) if (t - v > L.perClientMs) clients.delete(k);
    if (clients.size >= L.maxClients) return 1;
    clients.set(ip, t); return 0;
  };
  const cacheGet = key => { const e = cache.get(key); if (!e) return null; if (now() > e.until) { cache.delete(key); return null; } return e.value; };
  const cachePut = (key, value, ms) => { if (cache.size >= L.cacheMax) cache.delete(cache.keys().next().value); cache.set(key, { value, until: now() + ms }); };
  /** يسلسل الطلبات إلى Nominatim بفاصل ≥ ثانية بين أي طلبين من التطبيق كله (حد السياسة)، وبطابور صغير. */
  const upstreamSlot = () => {
    if (queued >= L.maxQueue) return null;
    queued++;
    const run = gate.then(async () => { const wait = lastUpstream + NOMINATIM.minIntervalMs - now(); if (wait > 0) await sleep(wait); lastUpstream = now(); });
    gate = run.catch(() => {});
    return run.finally(() => { queued--; });
  };

  async function search(request, env, url, ip) {
    const providers = activeProviders(env);
    if (!providers.length) return json({ error: MSG.off, code: 'SEARCH_OFF' }, 503);
    const q = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim(), scope = url.searchParams.get('scope') === 'world' ? 'world' : 'sa';
    // eslint-disable-next-line no-control-regex
    if (q.length < L.minQuery || q.length > L.maxQuery || /[\u0000-\u001f]/.test(q)) return json({ error: MSG.query, code: 'BAD_QUERY' }, 400);
    const key = `s|${scope}|${q.toLowerCase()}`, hit = cacheGet(key);
    if (hit) return json({ ...hit, cached: true }, 200, { 'Cache-Control': 'private, max-age=300' });
    const wait = takeClient(ip); if (wait) return json({ error: MSG.fast, code: 'RATE' }, 429, { 'Retry-After': String(wait) });
    const slot = upstreamSlot(); if (!slot) return json({ error: MSG.busy, code: 'BUSY' }, 503, { 'Retry-After': '2' });
    try {
      await slot;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), L.searchTimeoutMs);
      let results = null, used = null;
      try {
        for (const p of providers) { try { results = await p.search(q, { scope, env, fetchImpl, origin: new URL(request.url).origin, signal: ctl.signal }); used = p; break; } catch { /* المزوّد التالي */ } }
      } finally { clearTimeout(timer); }
      if (!results) return json({ error: MSG.upstream, code: 'UPSTREAM' }, 502);
      const body = { results, scope, source: used.id, attribution: 'نتائج البحث من Nominatim — © مساهمو OpenStreetMap' };
      cachePut(key, body, L.cacheMs);
      return json(body, 200, { 'Cache-Control': 'private, max-age=300' });
    } catch { return json({ error: MSG.upstream, code: 'UPSTREAM' }, 502); }
  }

  async function resolve(request, env, url, ip) {
    const start = normalizeShortLink(url.searchParams.get('u') || '');
    if (!start) return json({ error: MSG.link, code: 'LINK_NOT_ALLOWED' }, 400);
    const hit = cacheGet('r|' + start); if (hit) return hit.ok ? json(hit.body, 200) : json(hit.body, hit.status);
    const wait = takeClient(ip); if (wait) return json({ error: MSG.fast, code: 'RATE' }, 429, { 'Retry-After': String(wait) });
    const fail = (status, body) => { cachePut('r|' + start, { ok: false, status, body }, 60_000); return json(body, status); };
    let cur = start;
    for (let hop = 0; hop <= L.maxHops; hop++) {
      if (!normalizeShortLink(cur)) return fail(422, { error: MSG.noCoords, code: 'NO_COORDINATES' }); // لا يُطلب أي نطاق خارج القائمة أبدًا
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), L.hopTimeoutMs);
      let res;
      try { res = await fetchImpl(cur, { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlMizanAlHandasi-LinkResolver/1.0)', Accept: 'text/html' } }); }
      catch { return json({ error: MSG.resolveFail, code: 'RESOLVE_FAILED' }, 502); }
      finally { clearTimeout(timer); }
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      try { res.body?.cancel?.(); } catch { /* لا يهم */ }
      if (!loc) return fail(422, { error: MSG.noCoords, code: 'NO_COORDINATES' });
      let next; try { next = new URL(loc, cur); } catch { return fail(422, { error: MSG.noCoords, code: 'NO_COORDINATES' }); }
      if (next.protocol !== 'https:' && next.protocol !== 'http:') return fail(422, { error: MSG.noCoords, code: 'NO_COORDINATES' });
      // نقرأ الإحداثيات من عنوان الهدف نفسه دون فتحه: لا نطلب نطاقات جوجل ولا غيرها
      const c = coordsFromUrl(next.toString());
      if (c) { const body = { lat: c.lat, lng: c.lng, ...(c.approx ? { approx: true } : {}) }; cachePut('r|' + start, { ok: true, body }, L.resolveCacheMs); return json(body, 200); }
      cur = next.toString();
    }
    return fail(422, { error: MSG.noCoords, code: 'TOO_MANY_REDIRECTS' });
  }

  function originOk(request, env) {
    const origin = request.headers.get('Origin'); if (!origin) return true;
    if (origin === new URL(request.url).origin) return true;
    const list = typeof env?.ALLOWED_ORIGIN === 'string' && env.ALLOWED_ORIGIN.trim() ? env.ALLOWED_ORIGIN.split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
    return list.includes(origin);
  }

  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: MSG.method }, 405, { Allow: 'GET, HEAD' });
      if (!originOk(request, env)) return json({ error: MSG.origin }, 403);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown-client';
      if (path === '/api/geo/providers') {
        const act = activeProviders(env);
        return json({ providers: act.map(p => ({ id: p.id, label: p.label, sendsTo: p.sendsTo, kind: 'search' })), nationalAddress: false, satellite: false, scopes: ['sa', 'world'] });
      }
      if (path === '/api/geo/search') return search(request, env, url, ip);
      if (path === '/api/geo/resolve') return resolve(request, env, url, ip);
      return json({ error: 'مسار غير معروف.' }, 404);
    },
  };
}
export default createGeo();
