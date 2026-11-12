import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, isValid, isShort, isFull, recoverNearest, shorten } from '../dist/open-location-code.mjs';

// قيم مرجعية من مستودع المواصفة google/open-location-code (test_data/validityTests.csv و shortCodeTests.csv) ومن توثيقها.
test('Plus Code: الصلاحية والقصير والكامل (validityTests.csv)', () => {
  const rows = `8FWC2345+G6,true,false,true
8FWC2345+G6G,true,false,true
8fwc2345+,true,false,true
8FWCX400+,true,false,true
84000000+,true,false,true
WC2345+G6g,true,true,false
2345+G6,true,true,false
45+G6,true,true,false
+G6,true,true,false
G+,false,false,false
+,false,false,false
8FWC2345+G,false,false,false
8FWC2_45+G6,false,false,false
8FWC2η45+G6,false,false,false
8FWC2345+G6+,false,false,false
8FWC2345G6+,false,false,false
8FWC2300+G6,false,false,false
WC2300+G6g,false,false,false
WC2345+G,false,false,false`.split('\n');
  for (const row of rows) { const [c, v, s, f] = row.split(','); assert.deepEqual([isValid(c), isShort(c), isFull(c)], [v === 'true', s === 'true', f === 'true'], row); }
});
test('Plus Code: التقصير والاستعادة (shortCodeTests.csv)', () => {
  const rows = `9C3W9QCJ+2VX,51.3701125,-1.217765625,+2VX,B
9C3W9QCJ+2VX,51.3708675,-1.217765625,CJ+2VX,B
9C3W9QCJ+2VX,51.3701125,-1.217010625,CJ+2VX,B
9C3W9QCJ+2VX,51.3852125,-1.217765625,9QCJ+2VX,B
9C3W9QCJ+2VX,51.3701125,-1.202665625,9QCJ+2VX,B
8FJFW222+,42.899,9.012,22+,B
796RXG22+,14.95125,-23.5001,22+,B
8FVC2GGG+GG,46.976,8.526,2GGG+GG,B
8FRCXGGG+GG,47.026,8.526,XGGG+GG,B
8FR9GXGG+GG,46.526,8.026,GXGG+GG,B
8FRCG2GG+GG,46.526,7.976,G2GG+GG,B
CFX22222+22,89.6,0.0,2222+22,R
2CXXXXXX+XX,-81.0,0.0,XXXXXX+XX,R
8FRCG2GG+GG,46.526,7.976,8frCG2GG+gG,R`.split('\n');
  for (const row of rows) {
    const [full, lat, lng, short, kind] = row.split(',');
    if (kind !== 'S') assert.equal(recoverNearest(short, +lat, +lng), full.toUpperCase(), 'recover ' + row);
    if (kind !== 'R') assert.equal(shorten(full, +lat, +lng), short, 'shorten ' + row);
  }
});
test('Plus Code: الترميز بأمثلة معروفة', () => {
  assert.equal(encode(20.375, 2.775, 6), '7FG49Q00+'); // مثال التوثيق الرسمي
  assert.equal(encode(37.4220, -122.0841), '849VCWC8+R9'); // مقر Google (المثال المنشور)
  assert.equal(encode(47.0000625, 8.0000625), '8FVC2222+22');
  assert.equal(encode(24.7136, 46.6753), '7HP8PM7G+C4'); // الرياض
  assert.match(encode(24.7136, 46.6753, 12), /^7HP8PM7G\+C4[23456789CFGHJMPQRVWX]{2}$/);
  assert.throws(() => encode(NaN, 1)); assert.throws(() => encode(1, 1, 7)); assert.throws(() => encode(1, 1, 16));
});
test('Plus Code: الفك يحيط بالنقطة ويقلب الترميز (ذهاب وإياب) وحافة القطب', () => {
  for (const [lat, lng] of [[24.7136, 46.6753], [21.4858, 39.1925], [-33.8688, 151.2093], [0.00001, -0.00001], [89.99999, 179.9999], [-89.9999, -179.9999]]) {
    const a = decode(encode(lat, lng, 12));
    assert.ok(a.latLo <= lat + 1e-9 && lat <= a.latHi + 1e-9 && a.lngLo <= lng + 1e-9 && lng <= a.lngHi + 1e-9, `${lat},${lng}`);
  }
  const a = decode('7FG49QCJ+2VX'); assert.equal(a.length, 11);
  assert.ok(Math.abs(a.latLo - 20.3701) < 1e-9 && Math.abs(a.lngLo - 2.7822187) < 1e-6);
  assert.equal(decode(encode(90, 10)).latHi <= 90, true);
  assert.throws(() => decode('+2VX'));
});
