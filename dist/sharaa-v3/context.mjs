// Context hints are qualitative design advice, never municipal or energy certification.
import { cityById, REGIONS, normalizeGeo } from '../geo-land.mjs';
const clone = value => JSON.parse(JSON.stringify(value));
const SIDES = ['n', 'e', 's', 'w'];
const CITIES = {
  riyadh: ['الرياض', 'dry'], diriyah: ['الدرعية', 'dry'], qassim: ['القصيم', 'dry'], buraydah: ['بريدة', 'dry'], hail: ['حائل', 'dry'],
  jeddah: ['جدة', 'humid'], dammam: ['الدمام', 'humid'], khobar: ['الخبر', 'humid'], dhahran: ['الظهران', 'humid'], jubail: ['الجبيل', 'humid'], jazan: ['جازان', 'humid'],
  abha: ['أبها', 'mountain'], albaha: ['الباحة', 'mountain'], taif: ['الطائف', 'mountain'], khamis: ['خميس مشيط', 'mountain'],
};
export function normalizeV3Land(raw) {
  if (!raw || typeof raw !== 'object') throw Error('بيانات الأرض مطلوبة.');
  const widthM = raw.widthM ?? raw.width, depthM = raw.depthM ?? raw.length;
  if (![widthM, depthM].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1000)) throw Error('أبعاد الأرض يجب أن تكون أرقامًا موجبة ومحدودة بالمتر.');
  const streets = (raw.streets || []).map(side => typeof side === 'string' ? { side } : side);
  if (!Array.isArray(raw.entries) || !raw.entries.length || !raw.entries.every(s => SIDES.includes(s)) || !streets.length || !streets.every(s => SIDES.includes(s?.side)) || raw.entries.some(s => !streets.some(t => t.side === s))) throw Error('المداخل يجب أن تطل على الشوارع المسجلة للأرض.');
  const floors = raw.floors ?? 1;
  if (!Number.isInteger(floors) || floors < 1 || floors > 2) throw Error('المتاح في محرك الموقع دور أو دوران.');
  return clone({ ...raw, widthM, depthM, floors, streets, entries: [...new Set(raw.entries)], city: raw.city || raw.geo?.city || null, climate: raw.climate || null });
}
export function productionLand(land) {
  const l = normalizeV3Land(land);
  return { width: l.widthM, length: l.depthM, floors: l.floors, streets: l.streets.map(s => s.side), entries: [...l.entries], ...(l.geo ? { geo: clone(l.geo) } : {}), ...(l.streetWidths ? { streetWidths: clone(l.streetWidths) } : {}), ...(l.floorsExplicit ? { floorsExplicit: true } : {}) };
}
export function environmentalContext(land, facts = {}) {
  const l = normalizeV3Land(land), confirmed = id => facts[id]?.verification === 'confirmed' && !facts[id].recheck ? facts[id].value : null;
  const city = confirmed('site.city') || l.city;
  const known = CITIES[city] || Object.values(CITIES).find(([name]) => name === city);
  const cityName = known?.[0] || cityById(city)?.ar || city || null;
  const climate = confirmed('environment.climate') || l.climate || null;
  const frontage = l.entries[0], sides = l.streets.map(s => s.side);
  return {
    city, cityName, climate, suggestedClimate: known?.[1] || null,
    climateSource: climate ? (confirmed('environment.climate') ? 'client_confirmed' : 'land_step') : 'needs_confirmation',
    // A west street is relevant even when the main entrance is north.
    westExposed: sides.includes('w'), streets: sides,
    frontageM: ['e', 'w'].includes(frontage) ? l.depthM : l.widthM,
    depthM: ['e', 'w'].includes(frontage) ? l.widthM : l.depthM,
    notes: [
      ...(sides.includes('w') ? ['تُدرس حماية الواجهة الغربية من شمس العصر دون إغلاق التهوية والإضاءة.'] : []),
      ...(climate === 'dry' ? ['تُدرس الظلال وحماية الفتحات من الغبار والفناء المظلل.'] : []),
      ...(climate === 'humid' ? ['تُدرس الرطوبة والتهوية والصيانة المناسبة لبيئة ساحلية.'] : []),
      ...(climate === 'mountain' ? ['تُراجع ميول الموقع وتصريف المطر والعزل بعد الرفع المساحي.'] : []),
    ],
    verification: 'design_context', disclaimer: 'توجيه بيئي أولي؛ لا يثبت اشتراطات بلدية أو كفاءة طاقة أو نتائج محاكاة مناخية.',
  };
}
export function factsForSite(land, facts = {}) {
  const l = normalizeV3Land(land), context = environmentalContext(l, facts), sides = context.streets;
  const polygon = l.engineLand?.polygon || l.geo?.polygon;
  return {
    '@corner': sides.some(a => sides.some(b => ['n', 's'].includes(a) !== ['n', 's'].includes(b))),
    '@narrow': context.depthM / context.frontageM >= 1.7, '@wide': context.frontageM / context.depthM >= 1.2,
    '@irregular': Array.isArray(polygon) && polygon.length > 2,
    '@multi': l.floors > 1, '@west': context.westExposed,
    // Missing in the inherited land: answering must not make the question
    // inapplicable to its own saved answer or prevent a later correction.
    '@cityMissing': !l.city, '@climateMissing': !l.climate || l.climate === 'unknown',
    '@dry': context.climate === 'dry', '@humid': context.climate === 'humid', '@mountain': context.climate === 'mountain',
  };
}
export function landWithConfirmedCity(land,facts){
 const out=productionLand(land),f=facts['site.city'];
 if(f?.verification!=='confirmed'||f.recheck)return out;
 const city=cityById(f.value)||REGIONS.flatMap(r=>r.cities).find(c=>c.ar===f.value);
 if(city)out.geo=normalizeGeo({...out.geo,city:city.id,source:out.geo?.source==='map'?'map':'city'});
 return out;
}
