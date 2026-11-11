// عرض «الصورة المعمارية» للواجهة: المحيط يُشتق من مخطط العميل (حدود الأرض، المدخل، قطع الحوش) بعشوائية مبذورة ثابتة، ولا يحجب المدخل ولا يدخل المبنى.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSite, frontSouthDoc, frontOpenings, heroSide } from '../dist/facade-j/facade-realism/photo/site-plan.mjs';
import { designHash } from '../dist/facade-j/facade-realism/variation.mjs';
import { generateVillaDesigns, generateVillaTwoFloors } from '../dist/villa-layout.mjs';

const mk = (f, b, o = {}) => (f === 2 ? generateVillaTwoFloors : generateVillaDesigns)({ land: { width: 20, length: 30, streets: [o.e || 's'], entries: [o.e || 's'], floors: f }, counts: { bedrooms: b, majlis: 1, baths: b, kitchens: 1, halls: 1, dining: 1 }, requirements: o.req || {}, keep: 1 }).designs[0].doc;
const D1 = mk(1, 3), D2 = mk(2, 4);

test('المحيط حتمي: المخطط نفسه يعطي المحيط نفسه، ومخطط آخر يعطي محيطًا آخر', () => {
  const a = planSite(D1, { seed: designHash(D1), style: 'N' }), b = planSite(D1, { seed: designHash(D1), style: 'N' }), c = planSite(D2, { seed: designHash(D2), style: 'N' });
  assert.deepEqual(a, b); assert.notDeepEqual(a.plants, c.plants);
});

test('حدود الأرض من المخطط، وبوابة المشاة على محور باب المدخل، والسور لا يسدّ البوابات', () => {
  for (const d of [D1, D2]) { const p = planSite(d, { seed: 3 }), xs = d.plot.polygon.map(q => q.x), ys = d.plot.polygon.map(q => q.y);
    assert.deepEqual([p.plot.x0, p.plot.x1, p.plot.y0, p.plot.y1], [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]);
    const main = frontOpenings(d).doors.slice().sort((a, b) => a.x0 - b.x0).find(o => o.entry); assert.ok(main, 'للمخطط باب مدخل أمامي');
    assert.ok(Math.abs(p.gates.ped.x - (main.x0 + main.x1) / 2) < .01, 'بوابة المشاة أمام باب المدخل');
    for (const g of Object.values(p.gates)) for (const s of p.frontSegs) assert.ok(s.x1 <= g.x - g.w / 2 + 1e-6 || s.x0 >= g.x + g.w / 2 - 1e-6, 'جزء سور داخل فتحة بوابة');
    assert.equal(p.landings.length, frontOpenings(d).doors.length, 'عتبة أمام كل باب أمامي'); }
});

test('لا نبات داخل المبنى ولا في مجرى البوابات ولا على عتبات الأبواب؛ والنخيل والزيتون موجودان', () => {
  for (const d of [D1, D2]) { const p = planSite(d, { seed: designHash(d), style: 'M' }), B = p.B;
    for (const t of p.plants) { assert.ok(!(t.x > B.x0 + .05 && t.x < B.x1 - .05 && t.y > B.y0 + .05 && t.y < B.y1 - .05), `${t.kind} داخل المبنى`);
      if (t.kind === 'palm' || t.kind === 'olive') { for (const g of Object.values(p.gates)) assert.ok(!(Math.abs(t.x - g.x) < g.w / 2 && t.y > p.plot.y0 - 2.4 && t.y < B.y0), `${t.kind} في مجرى بوابة`);
        for (const l of p.landings) assert.ok(!(t.x > l.x0 && t.x < l.x1 && t.y > l.y0 - .3 && t.y < l.y1), `${t.kind} على عتبة باب`); } }
    assert.ok(p.plants.filter(t => t.kind === 'palm').length >= 3 && p.plants.some(t => t.kind === 'olive')); }
});

test('قطع الحوش التي في المخطط (مسبح، مظلة سيارات…) تظهر في المحيط ولا تُزرع فوقها أشجار ولا يُخترع عشب فوقها', () => {
  const d = mk(2, 4, { req: { prefs: { outdoor: { pool: true, carport: true, pergola: true, planters: true } } } }), kinds = d.fixtures.map(f => f.kind);
  const p = planSite(d, { seed: designHash(d) });
  for (const k of ['pool', 'carport', 'pergola']) if (kinds.includes(k)) assert.ok(p.fixtures.some(f => f.kind === k), k + ' من المخطط يظهر');
  assert.ok(p.fixtures.some(f => f.kind === 'pool'), 'المثال يحوي مسبحًا');
  for (const f of p.fixtures) for (const t of p.plants) if (!t.outside && (t.kind === 'palm' || t.kind === 'olive')) assert.ok(!(t.x > f.rect.x0 && t.x < f.rect.x1 && t.y > f.rect.y0 && t.y < f.rect.y1), `${t.kind} فوق ${f.kind}`);
  assert.ok(!p.paving.some(v => v.kind === 'lawn' && v.illustrative && p.fixtures.some(f => f.rect.x0 < v.x1 && f.rect.x1 > v.x0 && f.rect.y0 < v.y1 && f.rect.y1 > v.y0)));
});

test('مخطط مدخله ليس جنوبيًا يُدار دورانًا صِرفًا حتى يصير المدخل في الواجهة الأمامية: الأبعاد والعدد كما هي', () => {
  for (const e of ['n', 'e', 'w']) { let d; try { d = mk(1, 3, { e }); } catch { continue; } if (d.entry !== e) continue;
    const r = frontSouthDoc(d); assert.equal(r.entry, 's'); assert.deepEqual(r.streets, ['s']); assert.equal(r.walls.length, d.walls.length); assert.equal(r.openings, d.openings);
    const len = w => +Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y).toFixed(3); assert.deepEqual(r.walls.map(len), d.walls.map(len));
    const area = q => { const xs = q.map(v => v.x), ys = q.map(v => v.y); return +((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))).toFixed(2); }; assert.equal(area(r.plot.polygon), area(d.plot.polygon));
    assert.ok(Math.min(...r.plot.polygon.map(v => v.x)) >= -1e-6 && Math.min(...r.plot.polygon.map(v => v.y)) >= -1e-6);
    const f = frontOpenings(r); assert.ok(f.doors.some(o => o.entry), `باب المدخل (${e}) صار في الواجهة الأمامية`); assert.ok(['e', 'w'].includes(heroSide(r))); }
  assert.equal(frontSouthDoc(D1), D1, 'المدخل الجنوبي كما هو');
});
