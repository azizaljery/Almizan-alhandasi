// D1 محلي (SQLite في الذاكرة) لاختبارات الإدارة والأرشيف بموافقة: يشغّل db/admin.sql و db/photo-usage.sql كما سيفعل المالك.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
class Prepared {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...v) { this.values = v; return this; }
  async first() { return this.db.sqlite.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: this.db.sqlite.prepare(this.sql).all(...this.values) }; }
  async run() { const r = this.db.sqlite.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid || 0) } }; }
}
export class LocalD1 {
  constructor({ withTables = true } = {}) {
    this.sqlite = new DatabaseSync(':memory:');
    if (withTables) for (const f of ['db/admin.sql', 'db/photo-usage.sql']) this.sqlite.exec(readFileSync(f, 'utf8'));
  }
  prepare(sql) { return new Prepared(this, sql); }
  async batch(st) { const out = []; for (const s of st) out.push(await s.run()); return out; }
}
export const assetsStub = files => ({ async fetch(req) { const p = new URL(req.url).pathname; return files[p] !== undefined ? new Response(files[p], { headers: { 'content-type': p.endsWith('.json') ? 'application/json' : 'text/html' } }) : new Response('nf', { status: 404 }); } });
export const ORIGIN = 'https://site.test';
/** عميل HTTP صغير فوق معالج Worker مع جرة كوكي. */
export function client(handler, env) {
  let cookie = '', csrf = '';
  const call = async (path, { method = 'GET', body, headers = {}, origin = ORIGIN, useCookie = true, ip = '1.1.1.1', raw = false } = {}) => {
    const h = { 'CF-Connecting-IP': ip, ...headers };
    if (origin && method !== 'GET') h.origin = origin;
    if (body !== undefined && !raw) { h['content-type'] = 'application/json'; h['x-admin-request'] = '1'; }
    if (useCookie && cookie) h.cookie = cookie;
    if (csrf && method !== 'GET' && h['x-csrf-token'] === undefined) h['x-csrf-token'] = csrf;
    const res = await handler.fetch(new Request(ORIGIN + path, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }), env);
    const sc = res.headers.get('set-cookie'); if (sc) { const m = /^([^=]+)=([^;]*)/.exec(sc); cookie = m[2] ? `${m[1]}=${m[2]}` : ''; }
    const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch { /* ليس JSON */ }
    if (data?.csrf) csrf = data.csrf;
    return { status: res.status, data, text, headers: res.headers };
  };
  return { call, get cookie() { return cookie; }, set cookie(v) { cookie = v; }, get csrf() { return csrf; }, set csrf(v) { csrf = v; } };
}
