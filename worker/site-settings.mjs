// مفاتيح التحكم بالموقع (جدول site_settings في db/admin.sql). يقرؤها الـ Worker بكاش قصير (10 ثوانٍ لكل نسخة).
// غياب الجدول أو تعذّر D1 = القيم الافتراضية الحالية بلا تغيير (آمن).
export const SETTING_DEFS = Object.freeze({
  photo_enabled: { type: 'bool', def: '1', label: 'خدمة الصورة الاحترافية' },
  geo_search_enabled: { type: 'bool', def: '1', label: 'بحث الخريطة بالاسم' },
  archive_intake_closed: { type: 'bool', def: '0', label: 'إغلاق استقبال الأرشيف' },
  photo_daily_cap: { type: 'int', min: 0, max: 500, def: '', label: 'سقف الصور اليومي' },
  maintenance_message: { type: 'text', max: 200, def: '', label: 'رسالة الصيانة' },
});
export const CACHE_MS = 10_000;
const cache = new WeakMap(); // DB → { at, values }

export function defaults() { return Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, d]) => [k, d.def])); }
/** يتحقق من قيمة مفتاح؛ يعيد النص المخزَّن أو يرمي Error بالعربية. */
export function normalizeSetting(key, raw) {
  const d = SETTING_DEFS[key]; if (!d) throw new Error('مفتاح غير معروف.');
  if (d.type === 'bool') { if (raw === true || raw === '1' || raw === 1) return '1'; if (raw === false || raw === '0' || raw === 0) return '0'; throw new Error('قيمة منطقية غير صالحة.'); }
  if (d.type === 'int') {
    if (raw === '' || raw === null) return '';
    const n = Number(raw); if (!Number.isInteger(n) || n < d.min || n > d.max) throw new Error(`اكتب عددًا صحيحًا بين ${d.min} و${d.max}.`);
    return String(n);
  }
  const t = String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if ([...t].length > d.max) throw new Error(`الرسالة أطول من ${d.max} حرفًا.`);
  return t;
}
export async function readSettings(env, now = Date.now) {
  const db = env?.DB; if (!db?.prepare) return { values: defaults(), available: false };
  const hit = cache.get(db); if (hit && now() - hit.at < CACHE_MS) return hit.value;
  let value;
  try {
    const { results } = await db.prepare('SELECT key, value FROM site_settings').all();
    const values = defaults();
    for (const r of results || []) if (Object.hasOwn(SETTING_DEFS, r.key)) { try { values[r.key] = normalizeSetting(r.key, r.value); } catch { /* قيمة تالفة: الافتراضي */ } }
    value = { values, available: true };
  } catch { value = { values: defaults(), available: false }; }
  cache.set(db, { at: now(), value });
  return value;
}
export function invalidateSettings(env) { if (env?.DB) cache.delete(env.DB); }
/** env فعّال: الإعداد أو المتغير، أيهما يوقف يوقف. */
export function effectiveEnv(env, values) {
  const out = { ...env };
  if (values.photo_enabled === '0') out.PHOTO_DAILY_CAP = '0';
  else if (values.photo_daily_cap !== '') out.PHOTO_DAILY_CAP = values.photo_daily_cap;
  if (values.geo_search_enabled === '0') out.GEO_NOMINATIM_OFF = '1';
  return out;
}
