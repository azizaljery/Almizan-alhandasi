import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeoInput as P, parsePlusCode, resolveShortPlus, normalizeShortLink, coordsFromUrl, cityFromText, SHORT_LINK_RULES } from '../dist/geo-input.mjs';
import { encode } from '../dist/open-location-code.mjs';

const near = (a, b, e = 1e-5, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} ≠ ${b}`);
const ok = (t, lat, lng, extra = {}, opts) => { const r = P(t, opts); assert.equal(r.ok, true, t + ' ← ' + JSON.stringify(r)); near(r.lat, lat, 1e-5, t); near(r.lng, lng, 1e-5, t); for (const [k, v] of Object.entries(extra)) assert.equal(r[k], v, `${t} ${k}`); assert.match(r.understood, /فهمت|قرأت/); return r; };
const okc = (t, lat, lng, extra = {}, opts) => { const r = P(t, opts); assert.equal(r.ok, true, t + JSON.stringify(r)); near(r.lat, lat, 2e-4, t); near(r.lng, lng, 2e-4, t); for (const [k, v] of Object.entries(extra)) assert.equal(r[k], v, t + k); return r; };
const bad = (t, reason, opts) => { const r = P(t, opts); assert.equal(r.ok, false, t); assert.equal(r.reason, reason, t + ' ← ' + JSON.stringify(r)); return r; };
const needs = (t, n, opts) => { const r = P(t, opts); assert.equal(r.ok, false, t); assert.equal(r.needs, n, t + ' ← ' + JSON.stringify(r)); return r; };

test('إحداثيات عشرية بكل الفواصل والأشكال', () => {
  for (const t of ['24.7136, 46.6753', '24.7136,46.6753', '24.7136 46.6753', '24.7136;46.6753', '(24.7136, 46.6753)', '  24.7136 ,  46.6753  ', '24.7136°, 46.6753°', 'lat: 24.7136 lng: 46.6753', 'lat=24.7136, lon=46.6753']) ok(t, 24.7136, 46.6753, { kind: 'coords', inSaudi: true });
  ok('24,7136 46,6753', 24.7136, 46.6753);
});
test('أرقام عربية-هندية وفاصلة عربية', () => {
  ok('٢٤٫٧١٣٦، ٤٦٫٦٧٥٣', 24.7136, 46.6753);
  ok('٢٤٫٧١٣٦ ٤٦٫٦٧٥٣', 24.7136, 46.6753);
  ok('۲۴.۷۱۳۶, ۴۶.۶۷۵۳', 24.7136, 46.6753); // فارسية
  ok('https://www.google.com/maps/@٢٤٫٧١٣٦,٤٦٫٦٧٥٣,17z', 24.7136, 46.6753);
});
test('اتجاهات N/S/E/W وبالعربية', () => {
  ok('24.7136 N 46.6753 E', 24.7136, 46.6753); ok('24.7136N, 46.6753E', 24.7136, 46.6753); ok('N24.7136 E46.6753', 24.7136, 46.6753);
  ok('46.6753 E 24.7136 N', 24.7136, 46.6753); // الطول أولًا بحرفي الاتجاه
  ok('33.8688 S 151.2093 E', -33.8688, 151.2093); ok('34.6 S 58.38 W', -34.6, -58.38);
  ok('24.7136° شمالا 46.6753° شرقا', 24.7136, 46.6753); ok('24.7136 شمال 46.6753 شرق', 24.7136, 46.6753);
  bad('24.7136 N 46.6753 N', 'ambiguous'); bad('24.7136 N 46.6753', 'unknown');
});
test('درجات ودقائق وثوانٍ', () => {
  ok('24°42\'49.0"N 46°40\'31.1"E', 24.713611, 46.675306, { kind: 'dms' });
  ok('24°42′49″N 46°40′31″E', 24.713611, 46.675278, { kind: 'dms' });
  ok('٢٤°٤٢\'٤٩"N ٤٦°٤٠\'٣١"E', 24.713611, 46.675278);
  ok('24 42 49 N 46 40 31 E', 24.713611, 46.675278, { kind: 'dms' });
  ok('24°42.8\'N 46°40.5\'E', 24 + 42.8 / 60, 46 + 40.5 / 60);
  ok('33°52\'7"S 151°12\'33"E', -(33 + 52 / 60 + 7 / 3600), 151 + 12 / 60 + 33 / 3600);
});
test('ترتيب (الطول، العرض) داخل المملكة يُصحَّح ويُعلن، وخارجها لا يُغيَّر', () => {
  ok('46.6753, 24.7136', 24.7136, 46.6753, { swapped: true });
  const r = ok('48.8566, 2.3522', 48.8566, 2.3522, { inSaudi: false, swapped: false }); assert.ok(r);
});
test('إحداثيات خاطئة وحدودية', () => {
  bad('95, 46', 'range'); bad('24.7, 200', 'range'); bad('0, 0', 'zero'); bad('0.0 0.0', 'zero');
  bad('24.7136 +', 'unknown'); bad('24.71.36, 46.67', 'unknown'); bad('', 'empty'); bad('   ', 'empty'); bad('x'.repeat(700), 'too-long'); bad('ش', 'unknown');
  ok('85, 46', 85, 46); ok('-85, 0.5', -85, 0.5); ok('24.7, -180', 24.7, -180, { inSaudi: false });
});
test('روابط جوجل بكل صيغها', () => {
  ok('https://www.google.com/maps/@24.7136,46.6753,17z', 24.7136, 46.6753, { kind: 'google-view', approx: true });
  ok('https://www.google.com/maps?q=24.7136,46.6753', 24.7136, 46.6753, { kind: 'google-query' });
  ok('https://maps.google.com/?q=24.7136,46.6753&z=17', 24.7136, 46.6753);
  ok('https://www.google.com/maps/place/24.7136,46.6753', 24.7136, 46.6753, { kind: 'google-place' });
  ok('https://www.google.com/maps/place/' + encodeURIComponent('24°42\'49.0"N 46°40\'31.1"E').replace(/'/g, '%27') + '/@24.7,46.6,17z', 24.7, 46.6); // اسم يحمل درجات + مركز العرض
  ok('https://www.google.com/maps/place/Kingdom+Centre/@24.7114,46.6743,17z/data=!3m1!4b1!4m6!3m5!1s0x3e2f03!8m2!3d24.7113!4d46.6744!16s', 24.7113, 46.6744, { kind: 'google-pin', approx: undefined }); // الدبوس يغلب مركز العرض
  ok('https://www.google.com/maps/search/24.7136,46.6753', 24.7136, 46.6753);
  ok('https://www.google.com/maps/dir/?api=1&destination=24.7136,46.6753', 24.7136, 46.6753);
  ok('https://www.google.com/maps?ll=24.7136,46.6753&z=16', 24.7136, 46.6753);
  ok('https://www.google.com.sa/maps/@24.7136,46.6753,17z', 24.7136, 46.6753);
  ok('شوف موقع الأرض https://www.google.com/maps?q=24.7136,46.6753 شكرا', 24.7136, 46.6753); // رابط داخل جملة
  ok('www.google.com/maps/@24.7136,46.6753,17z', 24.7136, 46.6753); // بلا بروتوكول
  const nm = P('https://www.google.com/maps/place/%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6/@24.7,46.6,15z'); assert.equal(nm.name, 'الرياض');
});
test('روابط جوجل بلا إحداثيات: اسم المكان يُبحث عنه', () => {
  const r = needs('https://www.google.com/maps/place/Kingdom+Centre', 'search'); assert.equal(r.query, 'Kingdom Centre');
  assert.equal(needs('https://www.google.com/maps?q=Kingdom+Centre+Riyadh', 'search').query, 'Kingdom Centre Riyadh');
  bad('https://www.google.com/maps', 'no-coords');
});
test('Apple Maps وOSM وgeo:', () => {
  ok('https://maps.apple.com/?ll=24.7136,46.6753&q=Home', 24.7136, 46.6753, { kind: 'apple' });
  ok('https://maps.apple.com/place?coordinate=24.7136,46.6753&name=x', 24.7136, 46.6753, { kind: 'apple' });
  assert.equal(needs('https://maps.apple.com/?address=Olaya+St,+Riyadh', 'search').query, 'Olaya St, Riyadh');
  ok('https://www.openstreetmap.org/?mlat=24.7136&mlon=46.6753#map=17/24.7/46.6', 24.7136, 46.6753, { kind: 'osm' });
  ok('https://www.openstreetmap.org/#map=17/24.7136/46.6753', 24.7136, 46.6753, { approx: true });
  ok('geo:24.7136,46.6753', 24.7136, 46.6753, { kind: 'geo' });
  bad('https://www.openstreetmap.org/node/123', 'no-coords');
});
test('الروابط القصيرة: النطاقات الثلاثة فقط', () => {
  assert.equal(SHORT_LINK_RULES.length, 3);
  for (const u of ['https://maps.app.goo.gl/AbCdEf123', 'https://goo.gl/maps/xyz123', 'https://g.co/kgs/abc123', 'maps.app.goo.gl/AbCdEf']) { const r = needs(u, 'resolve'); assert.match(r.url, /^https:\/\//); }
  for (const u of ['https://goo.gl/foo', 'https://g.co/other', 'https://maps.app.goo.gl/', 'https://evil.maps.app.goo.gl/x', 'https://maps.app.goo.gl.evil.com/x', 'https://user:pw@maps.app.goo.gl/x', 'https://maps.app.goo.gl:8443/x', 'http://127.0.0.1/maps', 'https://[::1]/x', 'https://169.254.169.254/latest', 'ftp://maps.app.goo.gl/x', 'https://bit.ly/abc']) assert.equal(normalizeShortLink(u), null, u);
  assert.equal(normalizeShortLink('http://maps.app.goo.gl/x#frag'), 'https://maps.app.goo.gl/x');
  assert.equal(coordsFromUrl('https://www.google.com/maps/place/x/@24.7,46.6,15z').approx, true);
  assert.equal(coordsFromUrl('https://example.com/x'), null);
});
test('Plus Code: كامل وقصير مع مدينة أو مرجع', () => {
  const full = encode(24.7136, 46.6753); // 7HP8PM7G+C4
  const r = okc(full, 24.7136, 46.6753, { kind: 'plus-code' }); assert.ok(r.precisionM <= 15 && r.precisionM >= 10);
  okc('7hp8pm7g+c4', 24.7136, 46.6753, {}, undefined);
  okc('PM7G+C4 الرياض', 24.7136, 46.6753, { kind: 'plus-code' }, undefined);
  okc('PM7G+C4 Riyadh', 24.7136, 46.6753); okc('PM7G+C4، الرياض، السعودية'.replace('، السعودية', ''), 24.7136, 46.6753);
  okc('PM7G+C4', 24.7136, 46.6753, {}, { ref: { lat: 24.70, lng: 46.68 } }); // مرجع = مركز الخريطة
  okc('8FVC2222+22 Zurich', 47.00006, 8.00006, {}, undefined);
  assert.equal(P('PM7G+C4').reason, 'plus-short');
  const loc = needs('PM7G+C4 حي النرجس', 'locality'); assert.equal(loc.code, 'PM7G+C4'); assert.match(loc.locality, /النرجس/);
  const rec = resolveShortPlus('PM7G+C4', { lat: 24.8, lng: 46.7, label: 'حي النرجس' }); assert.equal(rec.ok, true); near(rec.lat, 24.7136, 1e-3);
  assert.equal(parsePlusCode('hello world'), null);
  bad('PM7G+C', 'plus-invalid'); needs('7HP8PM7G+C4C4C4C4', 'search');
});
test('العنوان الوطني المختصر يُتعرَّف عليه ويُعاد برسالة «غير مفعّل»', () => {
  for (const t of ['RRRD2929', 'rrrd2929', 'RRRD 2929', '  RRRD-2929 ', 'RRRD٢٩٢٩']) { const r = needs(t, 'national-address'); assert.equal(r.code, 'RRRD2929'); assert.match(r.message, /غير مفعّلة حاليًا/); assert.match(r.message, /رابط الموقع/); assert.match(r.message, /الإحداثيات/); }
  assert.notEqual(P('RRR2929').needs, 'national-address'); assert.notEqual(P('RRRD29291').needs, 'national-address');
});
test('نص حر ← بحث، وأسماء المدن المرجعية', () => {
  const r = needs('حي النرجس الرياض', 'search'); assert.equal(r.query, 'حي النرجس الرياض'); assert.match(r.understood, /اسم مكان/);
  assert.equal(needs('  King   Fahd Road  Riyadh ', 'search').query, 'King Fahd Road Riyadh');
  assert.equal(cityFromText('الرياض').id, 'riyadh'); assert.equal(cityFromText('مدينة جدة').id, 'jeddah'); assert.equal(cityFromText('Mecca').id, 'makkah'); assert.equal(cityFromText('xyz'), null);
});
test('الروابط غير الخريطية أو الغريبة لا تُفسَّر خطأً', () => {
  bad('https://example.com/page', 'no-coords');
  const x = P('https://example.com/?q=24.7136,46.6753'); assert.equal(x.ok, true); // رابط عام بإحداثيات صريحة يُقبل بتسمية عامة
  assert.match(x.understood, /فهمت الرابط/);
});
