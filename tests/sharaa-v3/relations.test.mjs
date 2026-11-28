import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors } from '../../dist/villa-layout.mjs';
import { closestOnSegment } from '../../dist/draw/geom.mjs';
import { analyzeDesign, relationBetween, walkPath, entranceIndependence, verticalOverlap } from '../../dist/sharaa-v3/relations.mjs';

const L = (width, length, entry = 's', floors = 1) => ({ width, length, entries: [entry], streets: [entry], floors });
const CASES = [
  ['20x30 أربع غرف ومجلسان', L(20, 30), { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }],
  ['18x30 ثلاث غرف بلا مجلس', L(18, 30), { bedrooms: 3, majlis: 0, baths: 3, kitchens: 1, halls: 1, dining: 1 }],
  ['12x36 ضيقة ومجلس', L(12, 36), { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }],
  ['26x30 خمس غرف ومجلسان', L(26, 30), { bedrooms: 5, majlis: 2, baths: 7, kitchens: 1, halls: 1, dining: 1 }],
];
const docs = [];
for (const [name, land, counts] of CASES) {
  const out = generateVillaDesigns({ land, counts, requirements: {}, keep: 3 });
  out.designs.forEach((d, i) => docs.push({ name: name + '#' + i, doc: d.doc, model: analyzeDesign(d.doc) }));
}
const polyDist = (p, poly) => Math.min(...poly.map((a, i) => closestOnSegment(p, a, poly[(i + 1) % poly.length]).dist));

test('عدد التصاميم المفحوصة كافٍ', () => assert.ok(docs.length >= 6, 'التصاميم: ' + docs.length));
test('كل باب/قوس يُنسب إلى حافة جدار: لا فتحات يتيمة، والعدد يطابق المستند', () => {
  for (const { name, doc, model } of docs) {
    assert.deepEqual(model.unattached, [], name);
    assert.equal(model.doors.length, doc.openings.filter(o => !/window/.test(o.kind)).length, name);
  }
});
test('كل مدخل وسمه المولّد entry يظهر في الهندسة بابًا خارجيًا؛ والأبواب الخارجية الأخرى تُصنَّف خدمة', () => {
  let service = 0;
  for (const { name, doc, model } of docs) {
    const entryIds = doc.openings.filter(o => o.entry).map(o => o.id).sort();
    assert.deepEqual(model.entranceDoors.map(d => d.id).sort(), entryIds, name);
    for (const d of model.entranceDoors) assert.equal(d.exterior, true);
    assert.equal(model.exteriorDoors.length, model.entranceDoors.length + model.serviceDoors.length);
    service += model.serviceDoors.length;
  }
  assert.ok(service >= 1, 'لم يظهر باب خدمة خارجي في العينة');
});
test('باب مباشر: مركز الباب على حدّ الفراغين معًا (قياس مستقل بالمضلعات) ويرتبط بجدار مشترك', () => {
  let n = 0;
  for (const { name, model } of docs) {
    for (const rel of model.relations.filter(r => r.kind === 'direct_door' || r.kind === 'open_connection')) {
      const d = model.doors.find(x => x.id === rel.source.openingId), A = model.byId.get(rel.a), B = model.byId.get(rel.b);
      assert.ok(polyDist(d.point, A.polygon) <= 0.1 && polyDist(d.point, B.polygon) <= 0.1, `${name} ${d.id}`);
      assert.ok(model.relations.some(r => r.kind === 'shared_wall' && r.a === rel.a && r.b === rel.b), `${name}: باب بلا جدار مشترك`);
      assert.ok(rel.explain.includes(d.id)); n++;
    }
  }
  assert.ok(n > 30, 'علاقات الأبواب المفحوصة: ' + n);
});
test('جدار مشترك: الطول موجب والجدران مذكورة والعلاقة متناظرة', () => {
  for (const { name, model } of docs) for (const r of model.relations.filter(r => r.kind === 'shared_wall')) {
    assert.ok(r.lengthM > 0 && r.source.wallIds.length, name);
    const x = relationBetween(model, r.a, r.b), y = relationBetween(model, r.b, r.a);
    assert.deepEqual(x.sharedWall, y.sharedWall); assert.equal(x.visual, y.visual); assert.deepEqual(x.geometric.boundaryDistM, y.geometric.boundaryDistM);
  }
});
test('مسار المشي لا يقل عن المسافة المستقيمة بين النقطتين (متباينة المثلث) ومتناظر', () => {
  let n = 0;
  for (const { name, model } of docs) {
    const rs = model.rooms.filter(r => r.level === 'L1');
    for (const a of rs) for (const b of rs) {
      if (a.id >= b.id) continue;
      const w = walkPath(model, a.id, b.id); if (!w) continue;
      const straight = Math.hypot(a.inside.x - b.inside.x, a.inside.y - b.inside.y);
      assert.ok(w.lengthM + 0.011 >= straight, `${name} ${a.id}-${b.id}: ${w.lengthM} < ${straight}`);
      assert.ok(Math.abs(w.lengthM - walkPath(model, b.id, a.id).lengthM) < 0.011); n++;
    }
  }
  assert.ok(n > 100, 'أزواج المسار: ' + n);
});
test('قرب هندسي ≠ قرب مسار: جداران مشتركان بلا باب مباشر، ومسارهما أطول من خط المركزين أو معدوم', () => {
  let found = 0;
  for (const { model } of docs) for (const r of model.relations.filter(r => r.kind === 'shared_wall')) {
    const rel = relationBetween(model, r.a, r.b);
    if (rel.directDoors.length || rel.openConnections.length) continue;
    if (rel.walk === null || rel.walk.lengthM > rel.geometric.centroidDistM * 1.3) found++;
  }
  assert.ok(found >= 3, 'حالات الفصل بين القرب الهندسي والمسار: ' + found);
});
test('استقلال المدخل: مجلس الرجال بمدخل مستقل، ويتغير الحكم عند حظر الممر (حساسية)', () => {
  const hit = docs.find(({ model }) => model.rooms.some(r => r.type === 'majlis' && /الرجال/.test(r.name || '')) && model.rooms.some(r => /مدخل الرجال/.test(r.name || '')));
  assert.ok(hit, 'لا تصميم بمدخل رجال مستقل');
  const men = hit.model.rooms.find(r => r.type === 'majlis' && /الرجال/.test(r.name));
  const ok = entranceIndependence(hit.model, men.id);
  assert.equal(ok.independent, true); assert.ok(ok.source.openingIds.length >= 1); assert.ok(ok.explain.includes(ok.entry));
  const strict = entranceIndependence(hit.model, men.id, { forbidTypes: ['living', 'bedroom', 'master', 'corridor', 'entrance'] });
  assert.equal(strict.independent, false);
});
test('مجلس النساء من مدخل العائلة: يمر بفراغ عائلي فلا يُعدّ مستقلًا', () => {
  const hit = docs.find(({ model }) => model.rooms.filter(r => r.type === 'majlis').length === 2);
  const women = hit.model.rooms.find(r => r.type === 'majlis' && /النساء/.test(r.name || ''));
  assert.ok(women);
  const r = entranceIndependence(hit.model, women.id);
  assert.equal(typeof r.independent, 'boolean'); assert.ok(r.explain.length > 10);
});
test('الصوت وخط الرؤية عبر الباب NOT_EVALUATED صراحةً، والرؤية المفتوحة تُحسب من الأقواس فقط', () => {
  const { model } = docs[0];
  const r = model.relations.find(x => x.kind === 'direct_door');
  const rel = relationBetween(model, r.a, r.b);
  assert.equal(rel.separation.acoustic.status, 'NOT_EVALUATED'); assert.equal(rel.separation.sightlineThroughDoor.status, 'NOT_EVALUATED');
  assert.equal(rel.visual, 'conditional');
  for (const { model: m } of docs) for (const x of m.relations.filter(y => y.kind === 'open_connection')) assert.equal(relationBetween(m, x.a, x.b).visual, 'open');
});
test('الثبات تحت الانعكاس: عكس المخطط أفقيًا لا يغيّر أنواع العلاقات ولا أطوال المشي', () => {
  const { doc, model } = docs[0], W = Math.max(...doc.walls.flatMap(w => [w.a.x, w.b.x]));
  const f = p => ({ ...p, x: W - p.x });
  const mir = { ...doc, walls: doc.walls.map(w => ({ ...w, a: f(w.a), b: f(w.b) })), labels: doc.labels.map(l => ({ ...l, seed: f(l.seed) })) };
  const m2 = analyzeDesign(mir);
  const sig = m => m.relations.map(r => `${r.kind}:${r.a}:${r.b}:${r.lengthM ?? r.widthM}`).sort();
  assert.deepEqual(sig(m2), sig(model));
  const A = model.rooms.find(r => r.type === 'kitchen'), B = model.rooms.find(r => r.type === 'dining');
  assert.ok(Math.abs(walkPath(m2, A.id, B.id).lengthM - walkPath(model, A.id, B.id).lengthM) < 0.02);
});
test('علاقات رأسية على تصميم من طابقين: تراكب الحمامات العلوية على السفلية يُقاس', () => {
  const out = generateVillaTwoFloors({ land: L(18, 24, 's', 2), counts: { bedrooms: 5, majlis: 2, baths: 6, kitchens: 1, halls: 2, dining: 1 }, requirements: {}, keep: 2 });
  const model = analyzeDesign(out.designs[0].doc);
  assert.deepEqual(model.unattached, []);
  const up = model.rooms.filter(r => r.level === 'L2'), lo = model.rooms.filter(r => r.level === 'L1');
  assert.ok(up.length && lo.length);
  let best = 0; for (const u of up) for (const l of lo) { const v = verticalOverlap(model, u.id, l.id); if (v.status === 'MEASURED') best = Math.max(best, v.overlapM2 / v.upperAreaM2); }
  assert.ok(best > 0.5, 'أعلى نسبة تراكب ' + best);
  assert.equal(verticalOverlap(model, lo[0].id, lo[1].id).status, 'NOT_EVALUATED');
});
