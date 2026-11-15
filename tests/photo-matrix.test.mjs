import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildPhotoPrompt, PHOTO_STYLES, PHOTO_LIGHTING, GEOMETRY_RULES, FLOORS_RULE, PRESERVE_RULES, AVOID_COMMON, PHOTO_AVOID, PHOTO_LOOK, PHOTO_YARD } from '../worker/photo.mjs';
import { MATRIX_ROWS, MATRIX_STYLES, MAX_IMAGES, shotKey, shotKeys, rowName, countByTier, coverage, parseRows, parseConf, STYLE_AR, MATRIX_TOKEN } from '../scripts/photo-live-matrix.mjs';
import { aggregate, reportHtml, costEstimate } from '../scripts/photo-live-report.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

// ------------------------------------------------------------------------------------------------ بنية البرومبت الخارجي
test('برومبت الواجهة: ترتيب الأهمية (الطراز ← عدد الأدوار ← قيود الهندسة ← الإضاءة ← المظهر ← السلبيات) وحدّ الطول', () => {
  for (const style of Object.keys(PHOTO_STYLES)) for (const lighting of Object.keys(PHOTO_LIGHTING)) for (const floors of [1, 2, 3]) {
    const p = buildPhotoPrompt({ style, floors, lighting }), at = s => { const i = p.indexOf(s); assert.ok(i >= 0, `${style}/${lighting}/${floors}: ${s.slice(0, 40)}`); return i; };
    const iStyle = at(PHOTO_STYLES[style].text), iFloors = at(FLOORS_RULE[floors]), iGeo = at(GEOMETRY_RULES), iKeep = at(PRESERVE_RULES), iLight = at(PHOTO_LIGHTING[lighting]), iLook = at(PHOTO_LOOK), iAvoid = at(AVOID_COMMON), iStyleAvoid = at(PHOTO_AVOID[style]);
    assert.ok(iStyle < iFloors && iFloors < iGeo && iGeo < iKeep && iKeep < iLight && iLight < iLook && iLook < iAvoid && iAvoid < iStyleAvoid, 'ترتيب البنية');
    assert.ok(p.length <= 3700, `الطول ${p.length}`); assert.ok(/^[\x20-\x7E]+$/.test(p));
  }
  const all = buildPhotoPrompt({ style: 'J', floors: 2, lighting: 'night', tone: 'dark', openings: 'wide', screen: 'yes', entrance: 'grand', night: 'lit', yard: Object.keys(PHOTO_YARD) });
  assert.ok(all.length <= 4300, 'أطول تركيبة ممكنة ' + all.length);
});
test('برومبت الواجهة: حارس عدد الأدوار صريح لكل عدد، وحفظ الفتحات والتراس والمدخل، وسلبيات لكل طراز', () => {
  assert.match(FLOORS_RULE[1], /exactly one floor.*no upper floor.*no rooftop room/); assert.match(FLOORS_RULE[2], /exactly two floors.*no third floor.*no attic/); assert.match(FLOORS_RULE[3], /exactly three floors.*no fourth floor/);
  assert.match(PRESERVE_RULES, /same number of windows on every floor/); assert.match(PRESERVE_RULES, /balconies or terraces and no new ones/); assert.match(PRESERVE_RULES, /one main entrance door/);
  assert.match(AVOID_COMMON, /extra floor/); assert.match(AVOID_COMMON, /extra or missing windows/);
  assert.deepEqual(Object.keys(PHOTO_AVOID).sort(), Object.keys(PHOTO_STYLES).sort());
  assert.equal(new Set(Object.values(PHOTO_AVOID)).size, 6);
  assert.ok(!buildPhotoPrompt({ style: 'S' }).includes('exactly'), 'بلا عدد أدوار لا قاعدة أدوار مختلقة');
  assert.ok(buildPhotoPrompt({ style: 'S', floors: 2 }).includes(FLOORS_RULE[2]) && !buildPhotoPrompt({ style: 'S', floors: 2 }).includes(FLOORS_RULE[1]));
});
test('برومبت الواجهة: مواد سعودية محلية لكل طراز، وإضاءة كل توقيت بدرجتها', () => {
  const need = { N: [/mud plaster/, /sandy-ochre/, /palm-trunk/, /gypsum/], H: [/coral-stone/, /rawasheen/, /mashrabiya/, /teak/], S: [/Riyadh limestone/, /coursing/, /bronze/], C: [/Saudi limestone/, /ashlar/, /columns/], M: [/mineral plaster/, /limestone plinth/], J: [/travertine/, /bronze-anodized/] };
  for (const [s, res] of Object.entries(need)) for (const re of res) assert.match(PHOTO_STYLES[s].text, re, s + ' ' + re);
  assert.match(PHOTO_LIGHTING.golden, /slight warmth/); assert.match(PHOTO_LIGHTING.golden, /no orange cast/); assert.match(PHOTO_LIGHTING.golden, /sand-colored walls keep their true tone/);
  assert.match(PHOTO_LIGHTING.day, /neutral white balance/); assert.match(PHOTO_LIGHTING.day, /shaded sides/);
  assert.match(PHOTO_LIGHTING.night, /2700K/); assert.match(PHOTO_LIGHTING.night, /deep blue sky that is not black/); assert.match(PHOTO_LIGHTING.night, /only where the reference shows windows/); assert.match(PHOTO_LIGHTING.night, /no neon/);
  for (const l of Object.values(PHOTO_LIGHTING)) assert.ok(!/glowing|dramatic|vivid|high dynamic range|raking|golden glow|orange sky/i.test(l), l);
  assert.equal(new Set(Object.keys(PHOTO_STYLES).flatMap(s => Object.keys(PHOTO_LIGHTING).map(l => buildPhotoPrompt({ style: s, floors: 2, lighting: l })))).size, 24);
});

// ------------------------------------------------------------------------------------------------ مصفوفة الفحص الحي
test('المصفوفة: ≤16 صورة، 15 قياسية + 1 ممتازة، وتغطي الطرازات الخمسة × الإضاءات الثلاث × الدورين بتوازن', () => {
  assert.ok(MATRIX_ROWS.length <= MAX_IMAGES && MATRIX_ROWS.length === 16); assert.deepEqual(countByTier(), { standard: 15, premium: 1 });
  assert.deepEqual([...MATRIX_STYLES].sort(), ['C', 'H', 'M', 'N', 'S']); assert.ok(MATRIX_STYLES.every(s => STYLE_AR[s]));
  const c = coverage();
  for (const s of MATRIX_STYLES) { const p = c.perStyle[s]; assert.deepEqual([...p.lightings].sort(), ['day', 'golden', 'night'], s); assert.deepEqual([...p.floors].sort(), [1, 2], s); }
  assert.equal(Object.keys(c.cells).length, 6); for (const [k, n] of Object.entries(c.cells)) assert.ok(n >= 2, `الخلية ${k}: ${n} طرز`);
  assert.equal(new Set(MATRIX_ROWS.filter(r => r.tier === 'standard').map(r => r.style + r.lighting + r.floors)).size, 15, 'لا تكرار في القياسي');
  assert.equal(new Set(MATRIX_ROWS.map((r, i) => rowName(r, i))).size, 16);
  assert.equal(MATRIX_ROWS.find(r => r.tier === 'premium').style, 'H');
  for (const r of MATRIX_ROWS) assert.doesNotThrow(() => buildPhotoPrompt({ style: r.style, floors: r.floors, lighting: r.lighting }), JSON.stringify(r));
});
test('المصفوفة: لقطات المدخلات الخمس عشرة موجودة وسليمة، ولقطات الليل مصيَّرة بوضع الليل', () => {
  const keys = shotKeys(); assert.equal(keys.length, 15); const man = JSON.parse(read('./fixtures/photo-matrix/manifest.json'));
  for (const k of keys) {
    assert.ok(existsSync(new URL(`./fixtures/photo-matrix/${k}.jpg`, import.meta.url)), k); const b = readFileSync(new URL(`./fixtures/photo-matrix/${k}.jpg`, import.meta.url));
    assert.ok(b[0] === 0xFF && b[1] === 0xD8 && b.length > 60_000 && b.length < 600_000, `${k} ${b.length}`);
    const m = man[k]; assert.ok(m && m.width === 1536 && m.height === 960 && m.bytes === b.length, k); assert.equal(m.night, /night$/.test(k)); assert.equal(m.floors, +/-f(\d)-/.exec(k)[1]);
    if (m.floorsRendered != null) assert.equal(m.floorsRendered, m.floors, `${k}: عدد الأدوار المصيَّر`);
  }
  assert.ok(MATRIX_ROWS.every(r => keys.includes(shotKey(r))));
});
test('المصفوفة: الإعداد والتحليل — matrix أو قائمة صريحة، وحد 16، وقيم غير صالحة ترفض', () => {
  assert.equal(parseRows('matrix').length, 16); assert.equal(parseRows('').length, 16); assert.equal(MATRIX_TOKEN, 'matrix');
  assert.deepEqual(parseRows('N:golden:2, H:night:1:premium').map(r => [r.style, r.lighting, r.floors, r.tier]), [['N', 'golden', 2, 'standard'], ['H', 'night', 1, 'premium']]);
  for (const bad of ['X:golden:1', 'N:dusk:1', 'N:day:3', 'N:day:1:ultra']) assert.throws(() => parseRows(bad), /غير صالح/);
  assert.throws(() => parseRows(Array(17).fill('N:day:1').join(',')), /أكثر من 16/);
  assert.deepEqual(parseConf('# تعليق\nVARIANTS=matrix\nSTYLE = C \n'), { VARIANTS: 'matrix', STYLE: 'C' });
  const conf = parseConf(read('../.github/photo-live-check.conf')); assert.equal(conf.VARIANTS, 'matrix'); assert.equal(parseRows(conf.VARIANTS).length, 16);
  const wf = read('../.github/workflows/photo-live-check.yml'); assert.match(wf, /branches: \[photo-live-check\]/); assert.match(wf, /photo-live-check\.mjs/); assert.doesNotMatch(wf, /\bschedule:/, 'لا تشغيل تلقائي مجدول');
});
test('التقرير: التجميع حسب الطراز والإضاءة والأدوار، والتكلفة التقريبية بوضوح أنها تقدير، وHTML آمن وفيه الدرجات', () => {
  const results = MATRIX_ROWS.map((r, i) => i === 3 ? { name: rowName(r, i), ...r, ok: false, http: 502, error: 'x<script>' } : { name: rowName(r, i), ...r, ok: true, ms: 40000 + i, file: rowName(r, i) + '.jpg', width: 1536, height: 960, fidelity: { score: i % 2 ? .82 : .64, ok: i % 2 === 1, vertical: .9, horizontal: .8, massing: .9, roof: 1, added: 0 } });
  const a = aggregate(results); assert.equal(a.total, 16); assert.equal(a.generated, 15); assert.equal(a.failed, 1); assert.ok(a.byStyle.N && a.byLighting.night && a.byFloors[2]); assert.ok(a.byStyle.N.avg > 0);
  assert.equal(a.pass + a.below, a.scored);
  const cost = costEstimate({ standard: 15, premium: 1 }); assert.match(cost.note, /تقدير/); assert.ok(cost.total > .1 && cost.total < 2, String(cost.total)); assert.ok(cost.standardEach > .01 && cost.standardEach < .05); assert.ok(cost.premiumEach > cost.standardEach * 3);
  const html = reportHtml({ site: 'https://x.example', at: '2026-11-15T00:00:00Z', results, status: {} , fidelitySource: 'client' });
  assert.ok(html.includes('dir="rtl"') && html.includes('نجدي') && html.includes('حجازي') && html.includes('0.82') && html.includes('فشل'));
  assert.ok(!html.includes('<script>x') && html.includes('x&lt;script&gt;'), 'الخطأ يُهرَّب');
  assert.match(html, /fidelityScore/, 'حساب الأمانة داخل التقرير عند الفتح'); assert.match(html, /غير متحقق/);
});
