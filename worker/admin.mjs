// الإدارة: مصادقة بكلمة سر يُنشئها المالك عند أول دخول، جلسات، تصاميم العملاء المؤرشفة، مفاتيح التحكم، سجل التدقيق.
//   صفحة:  /admin   (ملف dist/admin.html بترويسات صارمة)       واجهة: /api/admin/*  (كلها 401 بلا جلسة عدا /state)
// جداولها في db/admin.sql (يشغّلها المالك مرة واحدة). بغياب الجدول: حالة no_db وصفحة إعداد فقط، ولا وضع مفتوح أبدًا.
import { hashPassword, verifyPassword, burnTime, passwordStrength, randomToken, sha256Hex, safeEqual, SESSION_TTL_MS, SESSION_ABS_MS } from './admin-auth.mjs';
import { readSettings, invalidateSettings, normalizeSetting, SETTING_DEFS, effectiveEnv, defaults } from './site-settings.mjs';
import { dailyCap } from './photo.mjs';
import { activeProviders } from './geo-providers.mjs';
import { designNumber } from './client-archive.mjs';

export const COOKIE = '__Host-mz_admin';
export const ADMIN_LIMITS = Object.freeze({ clientFails: 5, windowMs: 15 * 60_000, globalFreeFails: 20, globalMaxLockMs: 15 * 60_000, perPage: 100, bulkMax: 20, deleteMax: 200 });
export const PAGE_HEADERS = Object.freeze({
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-robots-tag': 'noindex, nofollow, noarchive', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
  'content-type': 'text/html; charset=utf-8', 'cross-origin-opener-policy': 'same-origin',
});
const API_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });
const fail = (code, message, status = 400, extra) => Object.assign(new Error(message), { code, status, extra });
const MSG = {
  unauth: 'يلزم تسجيل الدخول.', closed: 'الإدارة مغلقة.', badLogin: 'بيانات الدخول غير صحيحة.', locked: 'محاولات كثيرة؛ انتظر قليلًا ثم أعد المحاولة.',
  noDb: 'جداول الإدارة غير موجودة بعد.', origin: 'طلب غير مسموح.', csrf: 'انتهت صلاحية الطلب؛ أعد تحميل الصفحة.',
};
const rec = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const cookieOf = (request, name) => { for (const part of (request.headers.get('cookie') || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); } return ''; };
const csvCell = v => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export function createAdmin({ now = Date.now } = {}) {
  const iso = () => new Date(now()).toISOString();

  async function readBody(request) {
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw fail('json_required', 'أرسل JSON.', 415);
    if (Number(request.headers.get('content-length')) > 20_000) throw fail('too_large', 'الطلب كبير.', 413);
    try { const t = await request.text(); if (t.length > 20_000) throw 0; const v = JSON.parse(t); if (!rec(v)) throw 0; return v; } catch { throw fail('bad_json', 'بيانات غير صالحة.', 400); }
  }
  const sameOrigin = request => { if (request.headers.get('origin') !== new URL(request.url).origin) throw fail('origin', MSG.origin, 403); };
  async function audit(db, action, detail = '') { try { await db.prepare('INSERT INTO admin_audit (at, action, detail) VALUES (?,?,?)').bind(iso(), action, String(detail).slice(0, 300)).run(); } catch { /* السجل لا يوقف العملية */ } }

  async function loadAuth(db) {
    try { return { row: await db.prepare('SELECT id, hash, salt, params, disabled, epoch FROM admin_auth WHERE id = 1').first(), ok: true }; }
    catch { return { row: null, ok: false }; }
  }
  const clientKey = async request => 'c:' + (await sha256Hex('admin-client|' + (request.headers.get('CF-Connecting-IP') || 'unknown'))).slice(0, 32);

  // ---------------------------------------------------------------- محاولات الدخول
  async function lockState(db, request) {
    const t = now(), key = await clientKey(request);
    const c = await db.prepare('SELECT window_start, fails, locked_until FROM admin_attempts WHERE key = ?').bind(key).first();
    const g = await db.prepare("SELECT window_start, fails, locked_until FROM admin_attempts WHERE key = 'global'").first();
    let wait = 0;
    if (c && t - c.window_start < ADMIN_LIMITS.windowMs && c.fails >= ADMIN_LIMITS.clientFails) wait = Math.max(wait, c.window_start + ADMIN_LIMITS.windowMs - t);
    if (g && g.locked_until > t) wait = Math.max(wait, g.locked_until - t);
    return { key, wait };
  }
  async function recordFail(db, key) {
    const t = now(), w = ADMIN_LIMITS.windowMs;
    for (const k of [key, 'global']) {
      await db.prepare('INSERT INTO admin_attempts (key, window_start, fails, locked_until) VALUES (?,?,1,0) ON CONFLICT(key) DO UPDATE SET fails = CASE WHEN window_start < ? THEN 1 ELSE fails + 1 END, window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END')
        .bind(k, t, t - w, t - w, t).run();
    }
    const g = await db.prepare("SELECT fails FROM admin_attempts WHERE key = 'global'").first();
    if (g && g.fails > ADMIN_LIMITS.globalFreeFails) {
      const lock = Math.min(ADMIN_LIMITS.globalMaxLockMs, 1000 * 2 ** Math.min(20, g.fails - ADMIN_LIMITS.globalFreeFails));
      await db.prepare("UPDATE admin_attempts SET locked_until = ? WHERE key = 'global'").bind(t + lock).run();
    }
  }
  const recordOk = (db, key) => db.prepare('DELETE FROM admin_attempts WHERE key = ?').bind(key).run();

  // ---------------------------------------------------------------- الجلسات
  async function newSession(db, auth) {
    const token = randomToken(32), csrf = await csrfOf(token), t = now();
    await db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(t).run();
    await db.prepare('INSERT INTO admin_sessions (token_hash, csrf_hash, epoch, created_at, last_seen, expires_at) VALUES (?,?,?,?,?,?)')
      .bind(await sha256Hex('sess|' + token), await sha256Hex('csrf|' + csrf), auth.epoch, t, t, t + SESSION_TTL_MS).run();
    return { token, csrf, cookie: `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}` };
  }
  // رمز CSRF مشتق من رمز الجلسة (HttpOnly) فلا يُخزَّن؛ يقرؤه JS الصفحة من /session فقط (لا يقرؤه موقع آخر: SOP).
  const csrfOf = async token => (await sha256Hex('csrfd|' + token)).slice(0, 40);
  const clearCookie = `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
  async function sessionOf(db, request, auth) {
    const token = cookieOf(request, COOKIE); if (!token || token.length < 20 || token.length > 100) return null;
    const hash = await sha256Hex('sess|' + token), t = now();
    const s = await db.prepare('SELECT token_hash, csrf_hash, epoch, created_at, last_seen, expires_at FROM admin_sessions WHERE token_hash = ?').bind(hash).first();
    if (!s || s.epoch !== auth.epoch || s.expires_at <= t || t - s.created_at > SESSION_ABS_MS) return null;
    if (t - s.last_seen > 5 * 60_000) { await db.prepare('UPDATE admin_sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').bind(t, t + SESSION_TTL_MS, hash).run(); s.last_seen = t; }
    return { ...s, hash };
  }
  async function needCsrf(request, session) {
    sameOrigin(request);
    const h = request.headers.get('x-csrf-token') || '';
    if (!h || !(await safeEqual(h, await csrfOf(cookieOf(request, COOKIE))))) throw fail('csrf', MSG.csrf, 403);
  }

  // ---------------------------------------------------------------- نقاط الدخول
  async function setup(request, env, db, auth) {
    sameOrigin(request);
    if (request.headers.get('x-admin-request') !== '1') throw fail('csrf', MSG.csrf, 403);
    const reopen = auth.row?.disabled === 1 && String(env.ADMIN_REOPEN || '') === '1';
    if (auth.row && !reopen) throw fail('setup_closed', auth.row.disabled ? MSG.closed : 'تمّ إنشاء كلمة السر سابقًا.', auth.row.disabled ? 503 : 409);
    const body = await readBody(request), pw = body.password;
    if (typeof pw !== 'string' || typeof body.confirm !== 'string') throw fail('bad_input', 'أدخل كلمة السر وتأكيدها.');
    if (pw !== body.confirm) throw fail('mismatch', 'كلمتا السر غير متطابقتين.');
    const st = passwordStrength(pw); if (!st.ok) throw fail('weak', st.problems.join(' '), 400, { strength: st });
    const h = await hashPassword(pw), t = iso();
    let epoch = 1;
    if (!auth.row) {
      try { await db.prepare('INSERT INTO admin_auth (id, hash, salt, params, disabled, epoch, created_at, updated_at) VALUES (1,?,?,?,0,1,?,?)').bind(h.hash, h.salt, h.params, t, t).run(); }
      catch { throw fail('setup_closed', 'تمّ إنشاء كلمة السر سابقًا.', 409); } // سباق: الحساب الأول فقط ينجح
    } else {
      const r = await db.prepare('UPDATE admin_auth SET hash=?, salt=?, params=?, disabled=0, epoch=epoch+1, updated_at=? WHERE id=1 AND disabled=1').bind(h.hash, h.salt, h.params, t).run();
      if (!r.meta?.changes) throw fail('setup_closed', 'تمّ إنشاء كلمة السر سابقًا.', 409);
      epoch = auth.row.epoch + 1;
    }
    await db.prepare('DELETE FROM admin_sessions').run();
    await audit(db, reopen ? 'reopen_setup' : 'setup', 'إنشاء كلمة سر الإدارة');
    const s = await newSession(db, { epoch });
    return json({ ok: true, csrf: s.csrf }, 201, { 'set-cookie': s.cookie });
  }
  async function login(request, env, db, auth) {
    sameOrigin(request);
    if (request.headers.get('x-admin-request') !== '1') throw fail('csrf', MSG.csrf, 403);
    const body = await readBody(request), lock = await lockState(db, request);
    if (lock.wait > 0) throw fail('locked', MSG.locked, 429, { retryAfter: Math.ceil(lock.wait / 1000) });
    const pw = typeof body.password === 'string' ? body.password.slice(0, 300) : '';
    const ok = pw && auth.row?.hash ? await verifyPassword(pw, auth.row) : (await burnTime(pw), false);
    if (!ok) { await recordFail(db, lock.key); throw fail('bad_login', MSG.badLogin, 401); }
    await recordOk(db, lock.key);
    const s = await newSession(db, auth.row); await audit(db, 'login', 'دخول ناجح');
    return json({ ok: true, csrf: s.csrf }, 200, { 'set-cookie': s.cookie });
  }

  // ---------------------------------------------------------------- الواجهات المحمية
  const clampInt = (v, lo, hi, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  function designFilter(url) {
    const where = [], args = [];
    const q = (url.searchParams.get('q') || '').trim().slice(0, 40);
    if (q) { const m = /^(?:D-?)?0*(\d{1,12})$/i.exec(q); if (m) { where.push('id = ?'); args.push(Number(m[1])); } else { where.push('style LIKE ?'); args.push('%' + q.replace(/[%_]/g, '') + '%'); } }
    const style = url.searchParams.get('style'); if (style && /^[A-Za-z0-9_-]{1,20}$/.test(style)) { where.push('style = ?'); args.push(style); }
    const fl = clampInt(url.searchParams.get('floors'), 0, 3, 0); if (fl) { where.push('floors = ?'); args.push(fl); }
    const from = url.searchParams.get('from'); if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('created_at >= ?'); args.push(from); }
    const to = url.searchParams.get('to'); if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('created_at < ?'); args.push(to + 'T99'); }
    return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', args };
  }
  const LIST_COLS = 'id, created_at, updated_at, style, floors, plot_width, plot_length, plot_area, bedrooms, bytes';
  const shapeRow = r => ({ ...r, number: designNumber(r.id) });

  async function overview(env, db) {
    const t = now(), day = new Date(t).toISOString().slice(0, 10), week = new Date(t - 6 * 86400_000).toISOString().slice(0, 10);
    let designs = null;
    try { designs = await db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= ?),0) AS today, COALESCE(SUM(created_at >= ?),0) AS week FROM client_designs').bind(day, week).first(); } catch { designs = null; }
    const settings = await readSettings(env, now), eff = effectiveEnv(env, settings.values), cap = dailyCap(eff);
    let photoUsed = null, photoStore = 'غير متاح';
    try { const r = await db.prepare("SELECT count FROM photo_usage WHERE day = ? AND key = 'total'").bind(day).first(); photoUsed = r?.count || 0; photoStore = 'D1'; } catch { photoUsed = null; photoStore = 'جدول photo_usage غير موجود (العدّاد في ذاكرة النسخة)'; }
    let version = { commit: 'غير متحقق', builtAt: null };
    try { const r = await env.ASSETS?.fetch(new Request(new URL('/version.json', 'https://assets.invalid'))); if (r?.ok) { const v = await r.json(); if (typeof v.commit === 'string' && v.commit !== 'unknown') version = { commit: v.commit.slice(0, 12), builtAt: v.builtAt || null }; } } catch { /* غير متحقق */ }
    const aiBound = !!env.AI && typeof env.AI.run === 'function';
    return {
      designs, version,
      photo: { usedToday: photoUsed, cap, store: photoStore },
      services: {
        photo: { label: 'الصورة الاحترافية', configured: aiBound, on: aiBound && cap > 0, note: aiBound ? (cap > 0 ? 'مفعّلة' : 'موقوفة (سقف صفر أو إيقاف من الإدارة)') : 'ربط Workers AI غير موجود' },
        geo: { label: 'البحث الجغرافي (Nominatim)', configured: true, on: activeProviders(eff).length > 0, note: activeProviders(eff).length ? 'مفعّل' : 'موقوف (من الإدارة أو GEO_NOMINATIM_OFF)' },
        ai: { label: 'Workers AI', configured: aiBound, on: aiBound, note: aiBound ? 'الربط موجود (لا يُختبر النموذج من هنا)' : 'غير مربوط' },
        d1: { label: 'قاعدة D1', configured: true, on: true, note: settings.available ? 'جداول الإدارة موجودة' : 'جدول مفاتيح التحكم غير موجود' },
      },
    };
  }

  async function protectedApi(request, env, db, auth, session, sub) {
    const url = new URL(request.url), m = request.method;
    if (m !== 'GET') await needCsrf(request, session);
    if (sub === '/overview' && m === 'GET') return json(await overview(env, db));
    if (sub === '/designs' && m === 'GET') {
      const f = designFilter(url), per = clampInt(url.searchParams.get('per'), 1, ADMIN_LIMITS.perPage, 25), page = clampInt(url.searchParams.get('page'), 1, 100000, 1);
      const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
      const total = (await db.prepare('SELECT COUNT(*) AS n FROM client_designs' + f.sql).bind(...f.args).first()).n;
      const { results } = await db.prepare(`SELECT ${LIST_COLS} FROM client_designs${f.sql} ORDER BY id ${order} LIMIT ? OFFSET ?`).bind(...f.args, per, (page - 1) * per).all();
      return json({ total, page, per, order: order.toLowerCase(), rows: results.map(shapeRow) });
    }
    if (sub === '/designs.csv' && m === 'GET') {
      const f = designFilter(url), order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
      const { results } = await db.prepare(`SELECT id, created_at, style, floors, plot_width, plot_length, plot_area, bedrooms, geo_lat, geo_lng, bytes FROM client_designs${f.sql} ORDER BY id ${order} LIMIT 20000`).bind(...f.args).all();
      const head = ['الرقم', 'التاريخ', 'الطراز', 'الأدوار', 'عرض الأرض', 'طول الأرض', 'المساحة', 'غرف النوم', 'خط العرض (مقرّب)', 'خط الطول (مقرّب)', 'الحجم بالبايت'];
      const lines = [head.map(csvCell).join(',')].concat(results.map(r => [designNumber(r.id), r.created_at, r.style, r.floors, r.plot_width, r.plot_length, r.plot_area, r.bedrooms, r.geo_lat, r.geo_lng, r.bytes].map(csvCell).join(',')));
      return new Response('﻿' + lines.join('\r\n'), { headers: { ...API_HEADERS, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="mizan-designs-index.csv"' } });
    }
    if (sub === '/designs/bulk' && m === 'GET') {
      const ids = (url.searchParams.get('ids') || '').split(',').map(x => Number(x)).filter(n => Number.isInteger(n) && n > 0).slice(0, ADMIN_LIMITS.bulkMax);
      let rows;
      if (ids.length) rows = (await db.prepare(`SELECT id, created_at, payload FROM client_designs WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all()).results;
      else { const after = clampInt(url.searchParams.get('after'), 0, 1e12, 0); rows = (await db.prepare('SELECT id, created_at, payload FROM client_designs WHERE id > ? ORDER BY id LIMIT ?').bind(after, ADMIN_LIMITS.bulkMax).all()).results; }
      return json({ rows: rows.map(r => ({ id: r.id, number: designNumber(r.id), created_at: r.created_at, design: JSON.parse(r.payload) })) });
    }
    let mm = /^\/designs\/(\d+)$/.exec(sub);
    if (mm && m === 'GET') {
      const r = await db.prepare(`SELECT ${LIST_COLS}, geo_lat, geo_lng, payload FROM client_designs WHERE id = ?`).bind(Number(mm[1])).first();
      if (!r) throw fail('not_found', 'التصميم غير موجود.', 404);
      const { payload, ...meta } = r; return json({ ...shapeRow(meta), design: JSON.parse(payload) });
    }
    if (mm && m === 'DELETE') {
      const r = await db.prepare('DELETE FROM client_designs WHERE id = ?').bind(Number(mm[1])).run();
      await audit(db, 'design_delete', designNumber(mm[1])); return json({ ok: true, deleted: r.meta?.changes || 0 });
    }
    if (sub === '/designs/delete' && m === 'POST') {
      const b = await readBody(request), ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(Number).filter(n => Number.isInteger(n) && n > 0))] : [];
      if (!ids.length || ids.length > ADMIN_LIMITS.deleteMax) throw fail('bad_input', `اختر من 1 إلى ${ADMIN_LIMITS.deleteMax} تصميمًا.`);
      const r = await db.prepare(`DELETE FROM client_designs WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
      await audit(db, 'design_delete_batch', `${r.meta?.changes || 0} تصميم`); return json({ ok: true, deleted: r.meta?.changes || 0 });
    }
    if (sub === '/settings' && m === 'GET') {
      invalidateSettings(env); const s = await readSettings(env, now);
      return json({ values: s.values, available: s.available, defs: Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, d]) => [k, { type: d.type, label: d.label, min: d.min, max: d.max, def: d.def }])), defaults: defaults() });
    }
    if (sub === '/settings' && m === 'PUT') {
      const b = await readBody(request); let value;
      if (typeof b.key !== 'string' || !Object.hasOwn(SETTING_DEFS, b.key)) throw fail('bad_key', 'مفتاح غير معروف.');
      try { value = normalizeSetting(b.key, b.value); } catch (e) { throw fail('bad_value', e.message); }
      try { await db.prepare('INSERT INTO site_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(b.key, value, iso()).run(); }
      catch { throw fail('no_table', 'جدول site_settings غير موجود؛ شغّل db/admin.sql.', 503); }
      invalidateSettings(env); await audit(db, 'setting', `${b.key}=${b.key === 'maintenance_message' ? value.slice(0, 80) : value}`);
      return json({ ok: true, key: b.key, value });
    }
    if (sub === '/audit' && m === 'GET') {
      const { results } = await db.prepare('SELECT id, at, action, detail FROM admin_audit ORDER BY id DESC LIMIT ?').bind(clampInt(url.searchParams.get('limit'), 1, 500, 100)).all();
      return json({ rows: results });
    }
    if (sub === '/sessions' && m === 'GET') {
      const { results } = await db.prepare('SELECT token_hash, created_at, last_seen, expires_at FROM admin_sessions WHERE expires_at > ? AND epoch = ? ORDER BY last_seen DESC').bind(now(), auth.row.epoch).all();
      return json({ rows: results.map(r => ({ created_at: r.created_at, last_seen: r.last_seen, expires_at: r.expires_at, current: r.token_hash === session.hash })) });
    }
    if (sub === '/sessions/revoke-others' && m === 'POST') {
      const r = await db.prepare('DELETE FROM admin_sessions WHERE token_hash != ?').bind(session.hash).run(); await audit(db, 'sessions_revoke_others', `${r.meta?.changes || 0}`);
      return json({ ok: true, revoked: r.meta?.changes || 0 });
    }
    if (sub === '/logout' && m === 'POST') {
      await db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(session.hash).run(); await audit(db, 'logout', '');
      return json({ ok: true }, 200, { 'set-cookie': clearCookie });
    }
    if (sub === '/sessions/revoke-all' && m === 'POST') {
      await db.prepare('DELETE FROM admin_sessions').run(); await audit(db, 'sessions_revoke_all', '');
      return json({ ok: true }, 200, { 'set-cookie': clearCookie });
    }
    if (sub === '/password/change' && m === 'POST') {
      const b = await readBody(request), lock = await lockState(db, request);
      if (lock.wait > 0) throw fail('locked', MSG.locked, 429, { retryAfter: Math.ceil(lock.wait / 1000) });
      if (typeof b.current !== 'string' || typeof b.password !== 'string' || typeof b.confirm !== 'string') throw fail('bad_input', 'أكمل الحقول الثلاثة.');
      if (!(await verifyPassword(b.current.slice(0, 300), auth.row))) { await recordFail(db, lock.key); throw fail('bad_current', 'كلمة السر الحالية غير صحيحة.', 403); }
      await recordOk(db, lock.key);
      if (b.password !== b.confirm) throw fail('mismatch', 'كلمتا السر الجديدتان غير متطابقتين.');
      if (b.password === b.current) throw fail('same', 'اختر كلمة سر مختلفة عن الحالية.');
      const st = passwordStrength(b.password); if (!st.ok) throw fail('weak', st.problems.join(' '), 400, { strength: st });
      const h = await hashPassword(b.password), epoch = auth.row.epoch + 1;
      await db.prepare('UPDATE admin_auth SET hash=?, salt=?, params=?, epoch=?, updated_at=? WHERE id=1 AND disabled=0').bind(h.hash, h.salt, h.params, epoch, iso()).run();
      await db.prepare('DELETE FROM admin_sessions').run(); await audit(db, 'password_change', 'تغيير كلمة السر وإبطال كل الجلسات');
      const s = await newSession(db, { epoch }); return json({ ok: true, csrf: s.csrf }, 200, { 'set-cookie': s.cookie });
    }
    if (sub === '/password/disable' && m === 'POST') {
      const b = await readBody(request), lock = await lockState(db, request);
      if (lock.wait > 0) throw fail('locked', MSG.locked, 429, { retryAfter: Math.ceil(lock.wait / 1000) });
      if (b.confirmText !== 'احذف') throw fail('confirm', 'اكتب كلمة «احذف» للتأكيد.');
      if (typeof b.password !== 'string' || !(await verifyPassword(b.password.slice(0, 300), auth.row))) { await recordFail(db, lock.key); throw fail('bad_current', 'كلمة السر غير صحيحة.', 403); }
      await recordOk(db, lock.key);
      await db.prepare('UPDATE admin_auth SET hash=NULL, salt=NULL, params=NULL, disabled=1, epoch=epoch+1, updated_at=? WHERE id=1').bind(iso()).run();
      await db.prepare('DELETE FROM admin_sessions').run(); await audit(db, 'admin_disabled', 'حذف كلمة السر وإغلاق الإدارة');
      return json({ ok: true, closed: true }, 200, { 'set-cookie': clearCookie });
    }
    if (sub === '/export' && m === 'GET') {
      const q = async (sql, ...a) => { try { return (await db.prepare(sql).bind(...a).all()).results; } catch { return []; } };
      const out = {
        exportedAt: iso(), note: 'لا يحوي كلمة السر ولا تجزئتها ولا رموز الجلسات.',
        settings: await q('SELECT key, value, updated_at FROM site_settings'), audit: await q('SELECT id, at, action, detail FROM admin_audit ORDER BY id DESC LIMIT 2000'),
        sessions: (await q('SELECT created_at, last_seen, expires_at FROM admin_sessions WHERE epoch = ?', auth.row.epoch)),
        designsIndex: (await q(`SELECT ${LIST_COLS} FROM client_designs ORDER BY id`)).map(shapeRow),
      };
      await audit(db, 'export', 'تصدير بيانات الإدارة');
      return new Response(JSON.stringify(out, null, 2), { headers: { ...API_HEADERS, 'content-disposition': 'attachment; filename="mizan-admin-export.json"' } });
    }
    throw fail('not_found', 'مسار غير معروف.', 404);
  }

  async function api(request, env, sub) {
    const db = env?.DB;
    if (!db?.prepare) return json({ state: 'no_db', error: 'no_db', message: MSG.noDb }, sub === '/state' ? 200 : 503);
    const auth = await loadAuth(db);
    if (!auth.ok) return json({ state: 'no_db', error: 'no_db', message: MSG.noDb }, sub === '/state' ? 200 : 503);
    const reopen = auth.row?.disabled === 1 && String(env.ADMIN_REOPEN || '') === '1';
    if (auth.row?.disabled === 1 && !reopen) return json({ state: 'closed', error: 'closed', message: MSG.closed }, 503);
    try {
      if (!auth.row || reopen) {
        if (sub === '/state' && request.method === 'GET') return json({ state: 'setup', reopen });
        if (sub === '/setup' && request.method === 'POST') return await setup(request, env, db, auth);
        return json({ error: 'unauthorized', message: MSG.unauth }, 401);
      }
      if (sub === '/setup') { sameOrigin(request); throw fail('setup_closed', 'تمّ إنشاء كلمة السر سابقًا.', 409); }
      if (sub === '/login' && request.method === 'POST') return await login(request, env, db, auth);
      const session = await sessionOf(db, request, auth.row);
      if (sub === '/state' && request.method === 'GET') return json({ state: session ? 'authed' : 'login' });
      if (!session) return json({ error: 'unauthorized', message: MSG.unauth }, 401);
      if (sub === '/session' && request.method === 'GET') return json({ ok: true, expiresAt: session.expires_at, csrf: await csrfOf(cookieOf(request, COOKIE)) });
      return await protectedApi(request, env, db, auth, session, sub);
    } catch (e) {
      if (e.status) return json({ error: e.code, message: e.message, ...(e.extra || {}) }, e.status || 400, e.extra?.retryAfter ? { 'retry-after': String(e.extra.retryAfter) } : {});
      return json({ error: 'server', message: 'تعذّر تنفيذ الطلب.' }, 500);
    }
  }

  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/';
      if (path === '/admin' || path === '/admin.html') {
        if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
        const r = env.ASSETS?.fetch ? await env.ASSETS.fetch(new Request(new URL('/admin.html', url), { method: 'GET', redirect: 'follow' })) : null;
        if (!r || !r.ok) return new Response('Not found', { status: 404, headers: PAGE_HEADERS });
        return new Response(request.method === 'HEAD' ? null : r.body, { status: 200, headers: PAGE_HEADERS });
      }
      if (path === '/api/admin' || path.startsWith('/api/admin/')) return api(request, env, path.slice('/api/admin'.length) || '/state');
      return new Response('Not found', { status: 404 });
    },
  };
}
export default createAdmin();
