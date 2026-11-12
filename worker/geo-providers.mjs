// مزوّدو البحث الجغرافي: واجهة بسيطة قابلة للتوسعة، وفيها اليوم مزوّد واحد مجاني بلا مفتاح (Nominatim العام عبر وكيل الوركر).
// مزوّد جديد (العنوان الوطني، Google، Mapbox…) يُضاف لاحقًا كائنًا بالشكل نفسه في PROVIDERS دون لمس المسارات:
//   { id, label, enabled(env) → bool, sendsTo (نص للعميل عمّن يستلم نص بحثه), search(q, { scope, env, fetchImpl, origin, signal }) → [{lat,lng,name,city,type}] }
// ومن اختياريّ: geocode / reverse / resolveShortAddress (غير مستعملة الآن). الأولوية = ترتيب PROVIDERS؛ ومن غاب سرّه يُتخطّى بصمت.
// سياسة Nominatim العامة (قرأناها في 2026-11-13 من operations.osmfoundation.org/policies/nominatim): حد أقصى طلب واحد في الثانية للتطبيق كله،
// ترويسة User-Agent/Referer تعرّف التطبيق، لا إكمال تلقائي أثناء الكتابة، تخزين النتائج مؤقتًا، إسناد ظاهر، وقدرة على إيقاف الخدمة دون نشر (GEO_NOMINATIM_OFF).

export const NOMINATIM = Object.freeze({ url: 'https://nominatim.openstreetmap.org/search', limit: 5, language: 'ar', minIntervalMs: 1000 });

const str = (v, n) => String(v ?? '').slice(0, n);
export const nominatim = Object.freeze({
  id: 'nominatim', label: 'Nominatim (OpenStreetMap)', sendsTo: 'خدمة Nominatim التابعة لـ OpenStreetMap',
  enabled: env => !/^(1|true|yes|on)$/i.test(String(env?.GEO_NOMINATIM_OFF ?? '').trim()),
  async search(q, { scope = 'sa', env = {}, fetchImpl = fetch, origin = '', signal } = {}) {
    const url = new URL(NOMINATIM.url);
    url.searchParams.set('format', 'jsonv2'); url.searchParams.set('addressdetails', '1'); url.searchParams.set('limit', String(NOMINATIM.limit));
    url.searchParams.set('accept-language', NOMINATIM.language); url.searchParams.set('q', q);
    if (scope !== 'world') url.searchParams.set('countrycodes', 'sa');
    const contact = str(env.GEO_CONTACT, 80).replace(/[^\w@.:/+-]/g, '');
    const res = await fetchImpl(url.toString(), { signal, headers: { Accept: 'application/json', 'User-Agent': `AlMizanAlHandasi-GeoProxy/1.0 (${origin || 'almizan-handasi'}${contact ? '; ' + contact : ''})`, ...(origin ? { Referer: origin + '/' } : {}) } });
    if (!res.ok) throw Object.assign(new Error('upstream_' + res.status), { status: res.status });
    const data = await res.json(); if (!Array.isArray(data)) throw new Error('upstream_shape');
    return data.map(x => ({ lat: Number(x?.lat), lng: Number(x?.lon), name: str(x?.display_name || x?.name, 140), city: str(x?.address?.city || x?.address?.town || x?.address?.village || x?.address?.state, 60), type: str(x?.type, 30) }))
      .filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng) && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180 && x.name).slice(0, NOMINATIM.limit);
  },
});
export const PROVIDERS = Object.freeze([nominatim]);
export const activeProviders = env => PROVIDERS.filter(p => p.enabled(env));
export default { PROVIDERS, activeProviders, nominatim };
