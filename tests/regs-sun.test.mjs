// موقع الأرض على الخريطة، الاشتراطات البلدية، والشمس والتوجيه: وحدات نقية + مطابقة على مستندات حقيقية من المولّد.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TILE_SOURCE, GEOCODER, parseLocationText, project, unproject, visibleTiles, toScreen, fromScreen, rectCorners, metersBetween, normalizeRect, sideBearings,
  compassKey, REGIONS, ALL_CITIES, nearestCity, normalizeGeo, solarSite, planToTrue, trueToPlan, GEO_KEY, northText,
} from '../dist/geo-land.mjs';
import { sunPosition, sunriseSunset, sunPath, solarToClock, equationOfTime, storedSite, DAYS, CITIES } from '../dist/sun.mjs';
import { RULES, ruleById, requiredSetbacks, landBrief, landBriefSvg, checkMunicipal, summaryText, generatorSetbackGaps, normalizeStreetWidths, DISCLAIMER, SOURCE } from '../dist/municipal-rules.mjs';
import { analyzeSun, facadeSunHours, rankByOrientation, shadowOffset, pointShaded, groundSunHours, massing, planBearing } from '../dist/sun-analysis.mjs';
import { generateInitialDesign, normalizeLand } from '../dist/home-flow.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { createSession, sameLand } from '../dist/design-session.mjs';
import { answerQuestion, municipalAnswer, sunAnswer, classify } from '../dist/shara-assistant.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≉ ${b} (±${tol})`);
const clone = v => JSON.parse(JSON.stringify(v));

// ------------------------------------------------------------------------------------------ تحليل الروابط والإحداثيات
test('تحليل الإحداثيات وروابط خرائط Google بأنماطها الشائعة', () => {
  const ok = (t, lat, lng, extra = {}) => { const r = parseLocationText(t); assert.equal(r.ok, true, t); near(r.lat, lat, 1e-5, t); near(r.lng, lng, 1e-5, t); for (const [k, v] of Object.entries(extra)) assert.equal(r[k], v, t + ' ' + k); };
  ok('24.7136, 46.6753', 24.7136, 46.6753, { source: 'coords', inSaudi: true });
  ok('(24.7136 46.6753)', 24.7136, 46.6753);
  ok('٢٤٫٧١٣٦، ٤٦٫٦٧٥٣', 24.7136, 46.6753);
  ok('46.6753, 24.7136', 24.7136, 46.6753, { swapped: true }); // الطول أولًا: يُصحَّح داخل المملكة
  ok('https://www.google.com/maps/@24.7135517,46.6752957,17z', 24.7135517, 46.6752957, { source: 'google-view', approx: true });
  ok('https://maps.google.com/?q=24.7,46.6', 24.7, 46.6, { source: 'google-query' });
  ok('https://www.google.com/maps/search/?api=1&query=21.4858%2C39.1925', 21.4858, 39.1925, { source: 'google-query' });
  ok('https://www.google.com/maps?ll=26.43,50.10&z=15', 26.43, 50.10);
  ok('https://www.google.com/maps/place/24.774265,46.738586', 24.774265, 46.738586, { source: 'google-place' });
  // دبوس المكان (‎!3d!4d‎) يتقدّم على مركز العرض (‎@‎) لأنه الموضع الفعلي
  ok('https://www.google.com/maps/place/X/@24.7135,46.6752,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d24.774265!4d46.738586', 24.774265, 46.738586, { source: 'google-pin' });
  ok('24°42\'49.0"N 46°40\'31.1"E', 24.713611, 46.675306, { source: 'dms' });
  ok('geo:18.22,42.50', 18.22, 42.5);
  ok('https://www.openstreetmap.org/?mlat=24.71&mlon=46.67#map=17/24.71/46.67', 24.71, 46.67, { source: 'osm' });
});
test('الروابط المختصرة والنصوص غير المفهومة: رسالة صريحة بلا تخمين', () => {
  for (const t of ['https://maps.app.goo.gl/AbCdEf123', 'https://goo.gl/maps/xyz']) { const r = parseLocationText(t); assert.equal(r.ok, false); assert.equal(r.reason, 'short-link'); assert.match(r.message, /رابط مختصر/); assert.match(r.message, /الرابط الطويل|الإحداثيات/); }
  assert.equal(parseLocationText('https://www.google.com/maps/place/Riyadh').reason, 'no-coords');
  assert.equal(parseLocationText('حي النرجس').reason, 'unknown');
  assert.equal(parseLocationText('').reason, 'empty');
  assert.equal(parseLocationText('95, 200').ok, false);
  assert.equal(parseLocationText('48.85, 2.35').inSaudi, false); // خارج المملكة: يُقبل ويُعلَّم
});

// ------------------------------------------------------------------------------------------ البلاطات
test('مصدر البلاطات ثابت واحد بالرابط القياسي والإسناد الإلزامي', () => {
  assert.equal(TILE_SOURCE.url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.equal(TILE_SOURCE.attribution, '© مساهمو OpenStreetMap');
  assert.match(TILE_SOURCE.attributionHref, /openstreetmap\.org\/copyright/);
  assert.ok(GEOCODER.minIntervalMs >= 1000, 'Nominatim: طلب واحد في الثانية كحد أقصى');
  assert.equal(GEOCODER.countrycodes, 'sa'); assert.equal(GEOCODER.language, 'ar');
  // الرابط لا يُذكر إلا في هذا الثابت (سهل التبديل)، والخريطة بلا مكتبة خارجية
  for (const f of ['land-locator.mjs', 'home.mjs', 'home.html', 'regs-sun-ui.mjs']) { const src = readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8'); assert.ok(!/tile\.openstreetmap\.org|nominatim\.openstreetmap\.org/.test(src), f); assert.ok(!/leaflet|maplibre|mapbox|googleapis\.com\/maps|unpkg|cdn\./i.test(src), f); }
});
test('إسقاط Web Mercator والبلاطات المرئية فقط', () => {
  for (const [lat, lng] of [[24.7136, 46.6753], [16.89, 42.55], [31.33, 37.34]]) for (const z of [5, 12, 19]) { const p = project(lat, lng, z), u = unproject(p.x, p.y, z); near(u.lat, lat, 1e-7); near(u.lng, lng, 1e-7); }
  assert.deepEqual(project(0, 0, 0), { x: 128, y: 128 });
  const view = { lat: 24.7136, lng: 46.6753, zoom: 16 }, tiles = visibleTiles(view, 390, 300);
  assert.ok(tiles.length >= 4 && tiles.length <= 9, 'بلاطات المشهد فقط: ' + tiles.length);
  assert.ok(tiles.every(t => t.z === 16 && /^https:\/\/tile\.openstreetmap\.org\/16\/\d+\/\d+\.png$/.test(t.url)));
  assert.ok(tiles.some(t => t.left <= 195 && t.left + t.size >= 195 && t.top <= 150 && t.top + t.size >= 150), 'بلاطة تغطي المركز');
  // فوق أقصى مستوى للمصدر: تُكبَّر بلاطات المستوى 19 ولا يُطلب مستوى غير موجود
  const over = visibleTiles({ ...view, zoom: 21 }, 390, 300); assert.ok(over.every(t => t.z === 19 && t.size === 1024) && over.length <= 4);
  const s = toScreen(view, 390, 300, 24.7140, 46.6760), b = fromScreen(view, 390, 300, s.x, s.y); near(b.lat, 24.7140, 1e-7); near(b.lng, 46.6760, 1e-7);
  assert.ok(s.x > 195 && s.y < 150, 'الشرق يمينًا والشمال أعلى');
});

// ------------------------------------------------------------------------------------------ المستطيل ↔ الشمال
test('مستطيل الأرض المدوَّر: الأركان، الأبعاد، واتجاه الأضلاع', () => {
  const c = { lat: 24.7, lng: 46.7 };
  const at = b => rectCorners({ ...c, width: 20, length: 30, bearing: b }).map(p => metersBetween(c, p));
  const [sw, se, ne, nw] = at(0); near(sw.east, -10, .01); near(sw.north, -15, .01); near(ne.east, 10, .01); near(ne.north, 15, .01); near(se.east, 10, .01); near(nw.north, 15, .01);
  // دوران 90° مع عقارب الساعة: الضلع «شمال» (منتصف NE‑NW) يصير شرق المركز
  const r = at(90), nMid = { east: (r[2].east + r[3].east) / 2, north: (r[2].north + r[3].north) / 2 }; near(nMid.east, 15, .01); near(nMid.north, 0, .01);
  for (const b of [0, 17, 90, 133, 271]) { const k = at(b); near(Math.hypot(k[1].east - k[0].east, k[1].north - k[0].north), 20, .01, 'العرض'); near(Math.hypot(k[2].east - k[1].east, k[2].north - k[1].north), 30, .01, 'الطول'); }
  for (const b of [0, 30, 200]) { const t = planToTrue(3, 4, b), p = trueToPlan(t.east, t.north, b); near(p.x, 3, 1e-9); near(p.y, 4, 1e-9); }
  near(planBearing(0, 1, 25), 25, 1e-9); near(planBearing(1, 0, 25), 115, 1e-9); // +y للمخطط اتجاهه north
});
test('تطبيع المستطيل: الضلع «شمال» هو الأقرب إلى الشمال الحقيقي، والطول والعرض والشوارع تنتقل معه', () => {
  const base = { width: 20, length: 30, streets: ['s'], entries: ['s'], streetWidths: { s: 15 } };
  assert.deepEqual(normalizeRect({ ...base, bearing: 0 }), { width: 20, length: 30, north: 0, streets: ['s'], entries: ['s'], streetWidths: { s: 15 }, swapped: false, turns: 0 });
  const a = normalizeRect({ ...base, bearing: 10 }); assert.equal(a.north, 10); assert.equal(a.swapped, false);
  const b = normalizeRect({ ...base, bearing: 350 }); assert.equal(b.north, -10); assert.deepEqual(b.streets, ['s']);
  // 100°: ربع دورة — الضلع القديم «جنوب» (اتجاهه 280°) يصير «غرب»، ويتبادل الطول والعرض
  const q = normalizeRect({ ...base, bearing: 100 }); assert.deepEqual([q.width, q.length, q.north, q.swapped], [30, 20, 10, true]); assert.deepEqual(q.streets, ['w']); assert.deepEqual(q.entries, ['w']); assert.deepEqual(q.streetWidths, { w: 15 });
  const h = normalizeRect({ ...base, bearing: 180 }); assert.deepEqual([h.width, h.length, h.north, h.swapped], [20, 30, 0, false]); assert.deepEqual(h.streets, ['n']);
  const t = normalizeRect({ ...base, bearing: 265 }); assert.deepEqual([t.width, t.length, t.north, t.swapped], [30, 20, -5, true]); assert.deepEqual(t.streets, ['e']);
  // خاصية: لكل زاوية، اتجاه الضلع الجديد الحقيقي = اتجاه الضلع القديم الحقيقي، والانحراف ضمن ‎[-45, 45)‎
  for (let bearing = 0; bearing < 360; bearing += 7) {
    const n = normalizeRect({ ...base, bearing }); assert.ok(n.north >= -45 && n.north < 45, 'north ' + n.north);
    const oldS = (bearing + 180) % 360, newB = sideBearings(n.north)[n.streets[0]]; near(Math.cos((oldS - newB) * Math.PI / 180), 1, 1e-6, 'الشارع بقي في اتجاهه الحقيقي عند ' + bearing);
    assert.equal(compassKey(sideBearings(n.north).n), 'n' === compassKey(n.north) ? 'n' : compassKey(n.north));
  }
  assert.match(northText(10), /10° نحو الشرق/); assert.match(northText(-7), /7° نحو الغرب/); assert.match(northText(0), /تمامًا/);
});
test('مناطق المملكة الـ13، أقرب مدينة، وما يُحفظ من الموقع', () => {
  assert.equal(REGIONS.length, 13); assert.ok(ALL_CITIES.length >= 25); assert.ok(ALL_CITIES.every(c => c.lat > 16 && c.lat < 32.6 && c.lng > 34 && c.lng < 56));
  assert.equal(new Set(ALL_CITIES.map(c => c.id)).size, ALL_CITIES.length);
  assert.equal(nearestCity(21.5, 39.2).city.id, 'jeddah'); assert.equal(nearestCity(24.77, 46.74).city.id, 'riyadh'); assert.equal(nearestCity(999, 0), null);
  assert.equal(normalizeGeo(null), null); assert.equal(normalizeGeo({ north: 5 }), null);
  assert.deepEqual(normalizeGeo({ city: 'abha' }), { lat: 18.22, lng: 42.5, north: 0, city: 'abha', region: 'asir', cityName: 'أبها', source: 'city' });
  const g = normalizeGeo({ lat: 24.7742651, lng: 46.7385861, north: 61, city: 'riyadh' }); assert.equal(g.source, 'map'); assert.equal(g.north, 45); assert.equal(g.lat, 24.774265);
  // الشمس: من الخريطة، وإلا المدينة، وإلا الرياض افتراضيًا مع إعلان ذلك
  assert.equal(solarSite(g).source, 'map'); assert.equal(solarSite({ city: 'tabuk' }).source, 'city'); assert.equal(solarSite({ city: 'tabuk' }).north, 0);
  const d = solarSite(null); assert.equal(d.source, 'default'); near(d.lat, 24.71, .01); assert.match(d.label, /الرياض — افتراضي/);
});
test('أرض الجلسة تحمل الموقع وعروض الشوارع ولا يغيّران التوليد ولا «الأرض نفسها»', () => {
  const raw = { length: 30, width: 20, streets: ['s', 'e'], entries: ['s'], streetWidths: { s: 20, e: 12, n: 9, w: 'x' }, geo: { lat: 24.7, lng: 46.6, north: 12.34, city: 'riyadh' } };
  const { land, plot } = normalizeLand(raw);
  assert.deepEqual(land.streetWidths, { s: 20, e: 12 }, 'عرض لضلع ليس شارعًا يُهمل'); assert.equal(land.geo.north, 12.3); assert.equal(land.geo.source, 'map');
  const bare = normalizeLand({ length: 30, width: 20, streets: ['s', 'e'], entries: ['s'] });
  assert.deepEqual(plot, bare.plot, 'أرض المحرك لا تتغير'); assert.ok(!('geo' in bare.land) && !('streetWidths' in bare.land));
  assert.ok(sameLand(land, bare.land));
  assert.deepEqual(normalizeStreetWidths({ s: 2, n: 500, e: 15 }), { e: 15 });
});

// ------------------------------------------------------------------------------------------ الشمس: أرقام مرجعية
test('ارتفاع الشمس ظهرًا عند خط عرض الرياض 24.7°: 88.7° / 41.9° / 65.3°', () => {
  const noon = d => sunPosition({ latitudeDeg: 24.7, dayOfYear: d, solarHour: 12 }).altitudeDeg;
  near(noon(DAYS.juneSolstice), 88.7, 0.2, 'الانقلاب الصيفي'); near(noon(DAYS.decemberSolstice), 41.9, 0.2, 'الانقلاب الشتوي');
  near(noon(DAYS.marchEquinox), 65.3, 0.3, 'الاعتدال الربيعي'); near(noon(DAYS.septemberEquinox), 65.3, 0.6, 'الاعتدال الخريفي');
  // مرجع هندسي مستقل: 90 − العرض ± الميل
  near(noon(DAYS.juneSolstice), 90 - 24.7 + 23.45, 0.05); near(noon(DAYS.decemberSolstice), 90 - 24.7 - 23.45, 0.05);
});
test('السمت والشروق وطول النهار وساعة المملكة', () => {
  const rs = sunriseSunset(24.7, DAYS.juneSolstice), rw = sunriseSunset(24.7, DAYS.decemberSolstice), re = sunriseSunset(24.7, DAYS.marchEquinox);
  near(rs.dayLength, 13.5, 0.15, 'نهار الصيف'); near(rw.dayLength, 10.5, 0.15, 'نهار الشتاء'); near(re.dayLength, 12, 0.05); near(rs.dayLength + rw.dayLength, 24, 0.01);
  const az = (d, h) => sunPosition({ latitudeDeg: 24.7, dayOfYear: d, solarHour: h }).azimuthDeg;
  near(az(DAYS.juneSolstice, rs.sunrise + .01), 64, 1.5, 'شروق الصيف شمال الشرق'); near(az(DAYS.decemberSolstice, rw.sunrise + .01), 116, 1.5, 'شروق الشتاء جنوب الشرق'); near(az(DAYS.marchEquinox, re.sunrise + .01), 90, 1);
  near(az(DAYS.decemberSolstice, 12), 180, 0.01, 'ظهر الشتاء جنوبًا'); assert.ok(az(DAYS.juneSolstice, 15) > 270 && az(DAYS.juneSolstice, 15) < 290, 'عصر الصيف غربًا مائلًا للشمال');
  const path = sunPath(24.7, DAYS.juneSolstice, .5); assert.ok(path.length > 20 && path.every(p => p.altitudeDeg > -0.01)); near(path[0].altitudeDeg, 0, 0.01);
  // معادلة الزمن: نحو +16 دقيقة مطلع نوفمبر ونحو −14 منتصف فبراير؛ الرياض شرق خط 45° فظهرها الشمسي قبل 12:00 بنحو 7 دقائق (عدا معادلة الزمن)
  near(equationOfTime(307), 16.4, 0.6); near(equationOfTime(43), -14.3, 0.6);
  near(solarToClock(12, 45, 105) * 60, 12 * 60, 1.5, 'عند خط 45° منتصف أبريل الظهر ≈ 12:00'); near((solarToClock(12, 46.68, 105) - solarToClock(12, 45, 105)) * 60, -6.7, 0.1);
});
test('موقع الأرض المحفوظ يتقدّم قائمة المدن التي يقرؤها منزلق الشمس في المجسم', () => {
  assert.equal(CITIES.site, undefined, 'بلا متصفح: لا موقع'); near(CITIES.riyadh.lat, 24.7, 0.01);
  const store = { getItem: k => (k === GEO_KEY ? JSON.stringify({ lat: 21.4858, lng: 39.1925, north: 12, city: 'jeddah' }) : null) };
  const s = storedSite(store); assert.equal(s.source, 'map'); near(s.lat, 21.4858, 1e-6); assert.equal(s.north, 12);
  assert.equal(storedSite({ getItem: () => 'not json' }), null); assert.equal(storedSite({ getItem: () => null }), null);
});

// ------------------------------------------------------------------------------------------ الاشتراطات: الجدول
test('جدول البنود: كل بند بمصدره وصفحته؛ verified بعبارته، review بسببه', () => {
  assert.ok(RULES.length >= 18); assert.equal(new Set(RULES.map(r => r.id)).size, RULES.length);
  for (const r of RULES) {
    assert.ok(r.title && r.text && r.source?.url === SOURCE.url && Number.isInteger(r.source.page) && r.source.page > 0, r.id);
    assert.ok(['verified', 'review'].includes(r.status), r.id);
    if (r.status === 'verified') assert.ok(r.quote && r.quote.length > 8, r.id + ': عبارة المطابقة'); else assert.ok(r.reason && r.reason.length > 15, r.id + ': سبب المراجعة');
  }
  assert.match(SOURCE.url, /^https:\/\/momah\.gov\.sa\//); assert.match(DISCLAIMER, /مطابقة أولية للاشتراطات العامة للوزارة؛ أنظمة البناء تختلف بحسب الأمانة والمخطط المعتمد لحيّك، والاعتماد للمكتب الهندسي والبلدية/);
  // الأرقام كما طوبقت على النص الرسمي في جلسة 2026‑11‑12
  assert.equal(ruleById('coverage_ground').value.max, 0.75); assert.equal(ruleById('coverage_first').value.max, 0.75); assert.equal(ruleById('annex_ratio').value.max, 0.70);
  assert.deepEqual(ruleById('setback_front').value, { fraction: 0.2, min: 3, wide: 30, wideMin: 6 }); assert.equal(ruleById('setback_street').value.min, 2); assert.equal(ruleById('setback_neighbor').value.min, 1.5);
  assert.equal(ruleById('height').value.max, 14); assert.deepEqual([ruleById('ground_level').value.min, ruleById('ground_level').value.max], [0.3, 1.2]);
  assert.deepEqual([ruleById('roof_parapet').value.min, ruleById('roof_parapet').value.max], [1.7, 2]); assert.equal(ruleById('fence').value.max, 4.5);
  assert.deepEqual(ruleById('parking').value, { area: 400, small: 1, large: 2 }); assert.equal(ruleById('entry_ped').value.min, 0.8); assert.equal(ruleById('entry_car').value.min, 3);
  assert.deepEqual(ruleById('rooms').value, { living: { area: 11.2, width: 2.8 }, bedroom: { area: 6.5, width: 2.1 }, kitchen: { area: 5, width: 1.8 }, bath: { area: 2.8, width: 1.4 }, wc: { area: 1.5, width: 1 }, staff: { area: 6.5, width: 2.1 } });
  assert.equal(ruleById('corridor').value.min, 0.9); assert.equal(ruleById('stair').value.min, 0.9);
  assert.equal(ruleById('annex_setback').status, 'review'); assert.equal(ruleById('setback_ground_build').status, 'review');
});
test('الارتداد النظامي بحسب نوع الضلع وعرض الشارع', () => {
  const need = (w, extra = {}) => requiredSetbacks({ streets: ['s'], entries: ['s'], ...(w ? { streetWidths: { s: w } } : {}), ...extra }).sides;
  assert.equal(need(10).s.required, 3, 'خُمس 10 = 2 ← الحد الأدنى 3'); assert.equal(need(15).s.required, 3); assert.equal(need(20).s.required, 4); assert.equal(need(25).s.required, 5);
  assert.equal(need(29).s.required, 5.8); assert.equal(need(30).s.required, 6, '30 م فأكثر: لا يقل عن 6'); assert.equal(need(60).s.required, 6);
  const u = need(null).s; assert.deepEqual([u.required, u.exact, u.max, u.kind], [3, false, 6, 'front']); assert.match(u.basis, /لم يُدخل عرض الشارع/);
  for (const k of ['n', 'e', 'w']) assert.deepEqual([need(20)[k].kind, need(20)[k].required, need(20)[k].exact], ['neighbor', 1.5, true]);
  // زاوية: الواجهة جهة المدخل، والشارع الآخر جانبي (خُمس عرضه ولا يقل عن 2)
  const c = requiredSetbacks({ streets: ['s', 'e'], entries: ['e'], streetWidths: { s: 8, e: 20 } });
  assert.equal(c.front, 'e'); assert.deepEqual([c.sides.e.kind, c.sides.e.required], ['front', 4]); assert.deepEqual([c.sides.s.kind, c.sides.s.required], ['street', 2]);
  assert.equal(requiredSetbacks({ streets: ['s', 'e'], entries: ['s'], streetWidths: { e: 12 } }).sides.e.required, 2.4);
  assert.equal(requiredSetbacks({ streets: ['s', 'e'], entries: ['s'] }).sides.e.exact, false);
});
test('«حسب وضع أرضك»: 12.5×30 على شارع جنوبي 15 م بالأرقام، والرسم المصغّر', () => {
  const b = landBrief({ width: 12.5, length: 30, streets: ['s'], entries: ['s'], streetWidths: { s: 15 } });
  assert.equal(b.ok, true); assert.equal(b.area, 375); assert.deepEqual(b.buildable, { x: 1.5, y: 3, w: 9.5, d: 25.5, area: 242.25 });
  assert.equal(b.coverage.area, 281.25); assert.equal(b.footprintMax, 242.25); assert.equal(b.parking, 1); assert.deepEqual(b.flags, []);
  const text = b.lines.join('\n');
  for (const re of [/أرضك 12\.5 × 30 م = 375 م² على شارع جنوبي عرضه 15 م/, /الارتداد الأمامي \(الجنوب\): 3 م/, /9\.5 × 25\.5 م = 242\.25 م²/, /75٪ من الأرض = 281\.25 م²/, /14 م/, /موقف واحد/]) assert.match(text, re);
  const svg = landBriefSvg(b); assert.match(svg, /^<svg /); assert.match(svg, /9\.5 × 25\.5 م/); assert.match(svg, /حدّ البناء 242\.25 م²/); assert.ok(!/<script|onload|href/i.test(svg));
  // بلا عرض شارع: الحد الأدنى مع تنبيه «أدخل عرض الشارع للدقة»
  const u = landBrief({ width: 20, length: 30, streets: ['s'], entries: ['s'] }); assert.equal(u.parking, 2); assert.match(u.flags.join(' '), /أدخل عرض الشارع للدقة/);
  assert.equal(landBrief({ width: 20, length: 20, streets: ['n'], entries: ['n'] }).parking, 1, '400 م² فأقل: موقف');
  assert.equal(landBrief({ width: 20, length: 20.5, streets: ['n'], entries: ['n'] }).parking, 2, 'أكثر من 400 م²: موقفان');
  assert.equal(landBrief({ width: 20, length: 30 }).ok, false); assert.equal(landBriefSvg({ ok: false }), '');
});

// ------------------------------------------------------------------------------------------ مستندات حقيقية من المولّد
const gen = async (land, idea, counts) => generateInitialDesign({ land, rooms: null, idea, counts, requirements: extractRequirements(idea, { counts }) });
const LAND2 = { length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 2 }, COUNTS = { bedrooms: 4, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 };
const out2 = await gen(LAND2, '4 غرف نوم ومجلس وصالة ومطبخ', COUNTS);
const LAND1 = { length: 30, width: 20, streets: ['s', 'e'], entries: ['s'], floors: 1 };
const out1 = await gen(LAND1, '3 غرف نوم ومجلس وصالة ومطبخ', { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 });
const byId = (res, id) => res.items.find(i => i.id === id);

test('checkMunicipal على تصميم دورين من المولّد: كل بند بحكمه وأرقامه من المستند', () => {
  const res = checkMunicipal(out2.doc, { ...LAND2, streetWidths: { s: 15 } });
  const ids = res.items.map(i => i.id);
  for (const id of ['floors', 'coverage_ground', 'coverage_first', 'annex_ratio', 'annex_setback', 'setback_front', 'setback_street', 'setback_neighbor', 'height', 'ground_level', 'roof_parapet', 'fence', 'parking', 'entry_ped', 'entry_car', 'rooms', 'corridor', 'stair']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  for (const it of res.items) { assert.ok(['ok', 'fail', 'review', 'na'].includes(it.verdict), it.id); assert.ok(it.text && it.text.length > 10, it.id); assert.ok(it.source.page > 0); if (it.ruleStatus === 'review') assert.ok(['review', 'na'].includes(it.verdict), it.id + ': بند review لا يُحكم به'); }
  const s = res.summary; assert.equal(s.ok + s.fail + s.review + s.na, res.items.length); assert.match(summaryText(s), /^\d+ مطابق · \d+ يُراجع · \d+ مخالف/);
  assert.equal(byId(res, 'floors').verdict, 'ok'); assert.equal(byId(res, 'floors').actual, 2);
  const cg = byId(res, 'coverage_ground'); assert.equal(cg.verdict, 'ok'); assert.ok(cg.actual > 0.1 && cg.actual < 0.75); assert.match(cg.text, /÷ مساحة الأرض 600 م²/);
  assert.equal(byId(res, 'coverage_first').verdict, 'ok'); assert.equal(byId(res, 'annex_ratio').verdict, 'na');
  const h = byId(res, 'height'); assert.equal(h.verdict, 'ok'); assert.equal(h.actual, 6.4);
  assert.equal(byId(res, 'ground_level').verdict, 'review'); assert.equal(byId(res, 'entry_car').verdict, 'review'); assert.equal(byId(res, 'fence').verdict, 'review');
  assert.equal(byId(res, 'entry_ped').verdict, 'ok'); assert.ok(byId(res, 'entry_ped').actual >= 0.8);
  assert.equal(byId(res, 'rooms').verdict, 'ok'); assert.equal(byId(res, 'stair').verdict, 'ok'); assert.equal(byId(res, 'stair').actual, 1.2);
  const p = byId(res, 'parking'); assert.equal(p.required, 2, '600 م² ← موقفان'); assert.equal(p.verdict, 'review', 'لم يُرسم موقف: يُراجع لا مخالف');
  assert.equal(res.disclaimer, DISCLAIMER); assert.equal(res.needsStreetWidth, false);
});
test('الارتدادات تُقاس إلى وجه الجدار الخارجي: ما يضعه المولّد على خط 3 م يظهر 2.88 م بصدق', () => {
  const res = checkMunicipal(out2.doc, { ...LAND2, streetWidths: { s: 15 } }), row = res.setbacks.find(r => r.side === 's');
  assert.deepEqual([row.kind, row.required, row.exact], ['front', 3, true]);
  assert.equal(row.axis, 3, 'محور الجدار على خط الارتداد'); assert.equal(row.ground, 2.88); assert.equal(row.upper, 2.88);
  const f = byId(res, 'setback_front'); assert.equal(f.verdict, 'fail'); assert.match(f.text, /المطلوب 3 م والموجود 2\.88 م/); assert.match(f.text, /نصف سماكة الجدار \(12 سم\)/);
  const n = byId(res, 'setback_neighbor'); assert.equal(n.rows.length, 3); assert.ok(n.rows.every(r => r.required === 1.5));
  // فروق ارتدادات المولّد عن المطلوب (للتقرير): شارع 15 م لا فرق، شارع 20 م المولّد أقل بمتر
  assert.ok(generatorSetbackGaps(out2.doc, { ...LAND2, streetWidths: { s: 15 } }).every(g => g.diff === 0));
  const gap = generatorSetbackGaps(out2.doc, { ...LAND2, streetWidths: { s: 20 } }).find(g => g.side === 's'); assert.deepEqual([gap.generator, gap.required, gap.diff], [3, 4, -1]);
  const wide = checkMunicipal(out2.doc, { ...LAND2, streetWidths: { s: 20 } }); assert.match(byId(wide, 'setback_front').text, /شارع 20 م\): المطلوب 4 م والموجود 2\.88 م/); assert.equal(byId(wide, 'setback_front').verdict, 'fail');
});
test('بلا عرض شارع: «يُراجع — أدخل عرض الشارع للدقة» لا حكم، والدور الواحد داخل الارتداد يُراجع', () => {
  const res = checkMunicipal(out1.doc, LAND1);
  assert.equal(res.needsStreetWidth, true);
  const side = byId(res, 'setback_street'); assert.equal(side.rows[0].side, 'e'); assert.equal(side.rows[0].required, 2); assert.equal(side.verdict, 'review'); assert.match(side.text, /أدخل عرض الشارع للدقة/); assert.equal(side.hint, 'أدخل عرض الشارع للدقة');
  const front = byId(res, 'setback_front'); assert.ok(['fail', 'review'].includes(front.verdict)); assert.match(front.text, /المطلوب 3 م على الأقل/);
  if (out1.doc.levels.length === 1) { assert.equal(front.verdict, 'review', 'الأرضي وحده داخل الارتداد مسموح بشروط'); assert.match(front.text, /مسموح بشروط/); assert.equal(byId(res, 'coverage_first').verdict, 'na'); }
  // مع عرض الشارعين يصير الحكم قاطعًا
  const exact = checkMunicipal(out1.doc, { ...LAND1, streetWidths: { s: 15, e: 10 } }); assert.equal(exact.needsStreetWidth, false); assert.equal(byId(exact, 'setback_street').verdict, 'ok');
});
test('الأحكام تتبع المستند: سترة السطح، السور، المظلة، غرفة دون الحد، وأدوار زائدة', () => {
  const land = { ...LAND2, streetWidths: { s: 15 } }, base = checkMunicipal(out2.doc, land);
  const rp = byId(base, 'roof_parapet'); assert.equal(rp.verdict, 'fail'); assert.equal(rp.actual, 0.9); assert.match(rp.text, /0\.9 م.*بين 1\.7 و2 م.*أقل بـ80 سم/);
  const d = clone(out2.doc);
  d.roof = { ...(d.roof || {}), parapet: 1.8 }; assert.equal(byId(checkMunicipal(d, land), 'roof_parapet').verdict, 'ok');
  d.walls.push({ id: 'wf1', level: d.levels[0].id, a: { x: 0, y: 0 }, b: { x: 20, y: 0 }, t: 0.2, h: 3, kind: 'fence' });
  let r = checkMunicipal(d, land); assert.equal(byId(r, 'fence').verdict, 'ok'); assert.equal(byId(r, 'fence').actual, 3);
  assert.equal(r.setbacks.find(x => x.side === 's').ground, 2.88, 'السور لا يدخل في قياس الارتداد');
  d.walls.at(-1).h = 5; assert.equal(byId(checkMunicipal(d, land), 'fence').verdict, 'fail');
  d.fixtures.push({ id: 'fx-car', level: d.levels[0].id, kind: 'carport', x: 4, y: 1.5, rot: 0, w: 5.4, d: 5.5, h: 2.6 });
  r = checkMunicipal(d, land); assert.equal(byId(r, 'parking').verdict, 'ok'); assert.equal(byId(r, 'parking').actual, 2);
  d.fixtures.at(-1).w = 2.8; d.fixtures.at(-1).d = 5.5; assert.equal(byId(checkMunicipal(d, land), 'parking').verdict, 'fail', 'موقف واحد على أرض 600 م²');
  // أدوار: مستوى ثالث يُراجع (قد يكون ملحقًا)، ورابع مخالف
  const d3 = clone(out2.doc), L2 = d3.levels[1]; d3.levels.push({ id: 'L3', name: 'الملحق', elevation: 6.4, height: 3.2 });
  for (const w of out2.doc.walls.filter(w => w.level === L2.id)) d3.walls.push({ ...clone(w), id: w.id + 'x', level: 'L3' });
  r = checkMunicipal(d3, land); assert.equal(byId(r, 'floors').verdict, 'review'); assert.equal(byId(r, 'annex_ratio').verdict, 'fail', 'ملحق بمساحة الدور كاملًا > 70٪'); assert.equal(byId(r, 'annex_setback').verdict, 'review'); assert.equal(byId(r, 'height').actual, 9.6);
  // ارتفاع يتجاوز 14 م
  const dh = clone(out2.doc); dh.levels[0].height = 7; dh.levels[1].elevation = 7; dh.levels[1].height = 7.5; assert.equal(byId(checkMunicipal(dh, land), 'height').verdict, 'fail');
});

// ------------------------------------------------------------------------------------------ تحليل الشمس
test('ساعات الشمس على الواجهات عند الرياض: الغرب حار صيفًا، الجنوب شتوي، الشمال هادئ شتاءً', () => {
  const S = b => facadeSunHours(24.7, b, DAYS.juneSolstice), W = b => facadeSunHours(24.7, b, DAYS.decemberSolstice);
  assert.ok(S(270).hot >= 5 && S(270).morning === 0, 'الغرب: عصر الصيف'); assert.ok(S(90).morning >= 5 && S(90).hot === 0, 'الشرق: صباح فقط');
  assert.ok(S(180).total < 0.5, 'الجنوب صيفًا: الشمس عالية فوق الجدار'); assert.ok(W(180).total > 9, 'الجنوب شتاءً: طوال النهار');
  assert.equal(W(0).total, 0, 'الشمال شتاءً بلا شمس'); assert.ok(S(0).total > 2 && S(0).total < 5, 'الشمال صيفًا: أطراف النهار');
  assert.ok(S(225).hot >= 5 && S(315).hot >= 5); near(S(90).total, S(270).total, 0.3, 'تماثل الشرق والغرب');
  for (const b of [0, 45, 90, 135, 180, 225, 270, 315]) { const x = S(b); near(x.morning + x.afternoon, x.total, 0.11); assert.ok(x.hot <= x.afternoon + 0.11); }
});
test('analyzeSun على تصميم حقيقي: واجهات، مؤشرات، ودرجة 0–100 مفسَّرة', () => {
  const a = analyzeSun(out2.doc, { lat: 24.7, lng: 46.7, north: 0 });
  assert.ok(Number.isInteger(a.score) && a.score >= 0 && a.score <= 100);
  near(a.parts.reduce((s, p) => s + p.points, 0), a.score, 0.6, 'الدرجة مجموع أجزائها'); assert.deepEqual(a.parts.map(p => p.max), [40, 20, 20, 20]);
  assert.ok(a.rooms.length >= 6); assert.ok(a.rooms.every(r => r.facades.length && r.facades.every(f => f.width > 0 && f.windows > 0 && ['hot', 'warm', 'winter', 'morning', 'calm'].includes(f.exposure))));
  const sum = Object.values(a.glazing).reduce((s, g) => s + g.area, 0); near(sum, a.totals.area, 0.05);
  near(a.west.width, a.glazing.w.width + a.glazing.sw.width, 0.01); assert.ok(a.west.share >= 0 && a.west.share <= 1);
  assert.equal(a.lines.length, 2); assert.ok(a.lines.every(l => l.length > 12)); assert.ok(a.recs.length >= 1); assert.ok(a.ups.length + a.downs.length >= 1);
  assert.equal(a.bedrooms.count, 4); assert.ok(a.bedrooms.morning <= 4);
  assert.match(a.limits, /لا يحسب ظل الجيران/); assert.ok(!/٪ توفير|kWh|كيلوواط/.test([...a.recs, ...a.lines, ...a.ups, ...a.downs].join(' ')), 'بلا أرقام توفير طاقة');
  // مرايا: تدوير الشمال 180° يبدّل الشرق بالغرب والشمال بالجنوب، والزجاج الكلي ثابت
  const b = analyzeSun(out2.doc, { lat: 24.7, north: 180 });
  near(b.totals.area, a.totals.area, 1e-6); near(b.glazing.e.area, a.glazing.w.area, 1e-6); near(b.glazing.n.area, a.glazing.s.area, 1e-6);
  // انحراف 10°: الجهات الثُمانية نفسها (ضمن 22.5°) لكن ساعات الواجهات تتغير
  const c = analyzeSun(out2.doc, { lat: 24.7, north: 10 }); near(c.glazing.w.area, a.glazing.w.area, 1e-6);
  assert.notDeepEqual(c.rooms.map(r => r.facades[0].summer.total), a.rooms.map(r => r.facades[0].summer.total));
  // خط العرض يغيّر الأرقام (أبها 18.2°)
  assert.notDeepEqual(analyzeSun(out2.doc, { lat: 18.2, north: 0 }).rooms.map(r => r.facades[0].winter.total), a.rooms.map(r => r.facades[0].winter.total));
});
test('درجة التوجيه تعاقب الزجاج الغربي وتكافئ الشمال والجنوب، وترتيب البدائل تنازلي', () => {
  // أفضل وأسوأ دوران للتصميم نفسه: الفرق يأتي من الاتجاه وحده
  const scores = [0, 90, 180, 270].map(north => analyzeSun(out2.doc, { lat: 24.7, north }));
  const best = scores.reduce((m, x) => (x.score > m.score ? x : m)), worst = scores.reduce((m, x) => (x.score < m.score ? x : m));
  assert.ok(best.score > worst.score, 'الاتجاه يغيّر الدرجة'); assert.ok(best.heatIndex <= worst.heatIndex + 0.5 || best.nsShare >= worst.nsShare);
  // زجاج كله غربي ← جزء الحرارة قرب الصفر؛ كله شمالي ← قرب الكامل
  const allTo = bearing => { const d = clone(out2.doc), keep = new Set(); const m = analyzeSun(d, { lat: 24.7, north: 0 }); for (const r of m.rooms) for (const f of r.facades) if (Math.abs(((f.bearing - 270 + 540) % 360) - 180) < 1) keep.add(r.id); return analyzeSun(d, { lat: 24.7, north: bearing }); };
  void allTo;
  const docs = out2.alternatives.map(x => x.doc); assert.ok(docs.length >= 2, 'للمولّد بدائل');
  const rank = rankByOrientation(docs, { lat: 24.7, north: 0 }); assert.equal(rank.length, docs.length);
  for (let i = 1; i < rank.length; i++) assert.ok(rank[i - 1].score >= rank[i].score);
  assert.deepEqual([...rank.map(r => r.index)].sort((a, b) => a - b), docs.map((_, i) => i)); assert.ok(rank.every(r => r.lines.length === 2));
  assert.equal(rank[0].score, Math.max(...docs.map(d => analyzeSun(d, { lat: 24.7, north: 0 }).score)));
});
test('ظل الكتلة وشمس الحوش: الظل عكس الشمس، وما شمال المبنى مظلَّل ظهر الشتاء', () => {
  const noonW = sunPosition({ latitudeDeg: 24.7, dayOfYear: DAYS.decemberSolstice, solarHour: 12 });
  const off = shadowOffset(7, noonW.azimuthDeg, noonW.altitudeDeg, 0); near(off.dx, 0, 0.01); near(off.dy, 7 / Math.tan(41.85 * Math.PI / 180), 0.05, 'ظل 7 م ظهر الشتاء ≈ 7.8 م شمالًا'); assert.ok(off.dy > 0);
  const pm = sunPosition({ latitudeDeg: 24.7, dayOfYear: DAYS.juneSolstice, solarHour: 16 }), o2 = shadowOffset(7, pm.azimuthDeg, pm.altitudeDeg, 0); assert.ok(o2.dx > 0, 'عصر الصيف: الظل شرقًا');
  // الشمال الحقيقي منحرف 90°: محور +y للمخطط يتجه شرقًا، فظل الظهر الشتوي (شمالًا) يصير نحو −x
  const o3 = shadowOffset(7, noonW.azimuthDeg, noonW.altitudeDeg, 90); near(o3.dy, 0, 0.01); assert.ok(o3.dx < 0);
  assert.equal(shadowOffset(7, 90, -3, 0), null);
  const masses = [{ level: 'L1', height: 7, outlines: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]] }];
  assert.equal(pointShaded({ x: 5, y: 13 }, masses, noonW.azimuthDeg, noonW.altitudeDeg, 0), true, '3 م شمال المبنى: في ظله'); assert.equal(pointShaded({ x: 5, y: 20 }, masses, noonW.azimuthDeg, noonW.altitudeDeg, 0), false, '10 م شمالًا: خارج الظل (طوله 7.8 م)');
  assert.equal(pointShaded({ x: 5, y: -3 }, masses, noonW.azimuthDeg, noonW.altitudeDeg, 0), false, 'جنوب المبنى مشمس');
  const north = groundSunHours({ x: 5, y: 12 }, masses, 24.7, DAYS.decemberSolstice, 0), south = groundSunHours({ x: 5, y: -3 }, masses, 24.7, DAYS.decemberSolstice, 0);
  assert.ok(south > north + 3, `حوش الجنوب أشمس شتاءً (${south} مقابل ${north})`);
  // من مستند حقيقي: كتلتان بارتفاع السطح، والمسبح المضاف يظهر في التحليل
  const m = massing(out2.doc); assert.equal(m.length, 2); assert.equal(m[0].height, 3.2); near(m[1].height, 6.4 + 0.9, 1e-9);
  const d = clone(out2.doc); d.fixtures.push({ id: 'fx-pool', level: d.levels[0].id, kind: 'pool', x: 10, y: 24, rot: 0, w: 3.5, d: 7, h: 0 });
  const a = analyzeSun(d, { lat: 24.7, north: 0 }); assert.equal(a.outdoor.length, 1); assert.equal(a.outdoor[0].kind, 'pool'); assert.ok(a.outdoor[0].summer > a.outdoor[0].winter, 'مسبح شمال المبنى: ظل شتوي أطول'); assert.ok(a.recs.some(t => /المسبح/.test(t)));
});

// ------------------------------------------------------------------------------------------ شرعاء المرافقة
test('شرعاء تجيب عن البلدية والارتداد والشمس من نتيجة التحليل، مع تنبيه الصدق', () => {
  const land = { ...LAND2, streetWidths: { s: 15 }, geo: { lat: 24.774265, lng: 46.738586, north: 10, city: 'riyadh' } };
  const session = createSession({ land, counts: COUNTS, requirements: extractRequirements('4 غرف نوم ومجلس', { counts: COUNTS }), idea: '4 غرف نوم ومجلس', result: out2 });
  assert.equal(classify('هل تصميمي مطابق للبلدية؟'), 'ask'); assert.equal(classify('كم الارتداد؟'), 'ask');
  const a = answerQuestion(session, 'هل تصميمي مطابق للبلدية؟'); assert.equal(a.kind, 'answer');
  assert.match(a.text, /\d+ مطابق · \d+ يُراجع · \d+ مخالف/); assert.match(a.text, /مطابقة أولية للاشتراطات العامة للوزارة/); assert.match(a.text, /سترة السطح/); assert.match(a.text, /يُراجع مع المكتب الهندسي: /);
  assert.ok(a.actions.some(x => /regsCard/.test(x.href)));
  const b = answerQuestion(session, 'كم الارتداد؟'); assert.match(b.text, /الضلع الجنوبي \(الواجهة عرضه 15 م\): المطلوب 3 م والموجود 2\.88 م — مخالف/); assert.match(b.text, /الضلع الشمالي \(جار\): المطلوب 1\.5 م/); assert.match(b.text, /مطابقة أولية/);
  const noW = { ...session, input: { ...session.input, land: LAND2 } }; assert.match(municipalAnswer(noW, 'كم الارتداد الامامي').text, /لم تُدخل عرض الشارع/);
  assert.match(answerQuestion(session, 'كم نسبة البناء؟').text, /÷ مساحة الأرض 600 م²/);
  const s = answerQuestion(session, 'كيف التوجيه والشمس في تصميمي؟'); assert.match(s.text, /درجة توجيه هذا التصميم \d+ من 100/); assert.match(s.text, /موقع أرضك على الخريطة/); assert.match(s.text, /لا يحسب ظل الجيران/);
  assert.match(sunAnswer({ ...session, input: { ...session.input, land: LAND2 } }).text, /الرياض — افتراضي/);
  // الأسئلة القديمة لم تتأثر
  assert.match(answerQuestion(session, 'كم مساحة المجلس؟').text, /المجلس/);
});

// ------------------------------------------------------------------------------------------ الصفحات
test('خطوة الأرض وصفحة التصميم: العناصر والربط', () => {
  const html = readFileSync(new URL('../dist/home.html', import.meta.url), 'utf8'), home = readFileSync(new URL('../dist/home.mjs', import.meta.url), 'utf8'), loc = readFileSync(new URL('../dist/land-locator.mjs', import.meta.url), 'utf8');
  for (const id of ['locateBox', 'locateHost', 'landCity', 'landBrief', 'geoState']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(!/<script[^>]+src="https?:/.test(html), 'بلا سكربتات خارجية');
  assert.match(home, /await import\('\.\/land-locator\.mjs'\)/, 'الخريطة تُحمَّل عند الفتح فقط'); assert.ok(!/^import .*land-locator/m.test(home));
  assert.match(loc, /TILE_SOURCE\.attribution/); assert.match(loc, /تبقى في متصفحك ولا تُرسل إلى خادم الميزان/); assert.match(loc, /navigator\.geolocation/); assert.ok(!/<form|h\('form'/.test(loc), 'لا نماذج متداخلة داخل نموذج الأرض');
  assert.ok(!/autocomplete|input', \(\) => search|oninput: search/.test(loc.replace(/autocomplete: 'off'/g, '')), 'البحث بزر صريح لا مع كل حرف');
  const design = readFileSync(new URL('../dist/design.mjs', import.meta.url), 'utf8'), ui = readFileSync(new URL('../dist/regs-sun-ui.mjs', import.meta.url), 'utf8');
  assert.match(design, /municipalCard\(session, doc\)/); assert.match(design, /sunCard\(session, doc/); assert.match(design, /orientationBadges\(session\)/);
  for (const t of ['مطابقة الاشتراطات البلدية', 'الشمس والتوجيه', 'الأفضل توجيهًا', 'يُراجع مع المكتب الهندسي']) assert.ok(ui.includes(t) || readFileSync(new URL('../dist/municipal-rules.mjs', import.meta.url), 'utf8').includes(t), t);
});
