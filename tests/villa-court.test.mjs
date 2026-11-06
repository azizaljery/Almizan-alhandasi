// نمط الفناء (مبنى U حول حديقة داخلية)، والبدائل المختلفة جذريًا، والدور العلوي بغرفة في مقدمة المحور.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVillaDesigns, generateVillaTwoFloors, checkDoc, patOverlap } from '../dist/villa-layout.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { buildBrief } from '../dist/shara/brief-engine.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { reviewDoc } from '../dist/draw/review.mjs';
import { analyzeWalls } from '../dist/draw/topology.mjs';
import { pointInPolygon } from '../dist/draw/geom.mjs';

const L = (width, length, floors = 1) => ({ width, length, floors, streets: ['s'], entries: ['s'] });
const C = (o = {}) => ({ bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0, ...o });
const court = doc => doc.labels.find(l => l.type === 'courtyard' && l.level === 'L1');
const sound = doc => { const c = checkDoc(doc); assert.ok(c.ok, c.problems.join(' | ')); assert.ok(!reviewDoc(doc).some(i => i.code === 'UNREACHABLE_ROOM'), 'كل فراغ موصول'); };

test('النص الحر: «على شكل U والمنتصف حديقة» يُفهم فناءً، و«بدون فناء» يمنعه', () => {
  assert.equal(extractRequirements('ابي مبنى على شكل U بحيث يكون المنتصف حديقة', { counts: {} }).prefs.courtyard, true);
  assert.equal(extractRequirements('بيت فيه فناء داخلي', { counts: {} }).prefs.courtyard, true);
  assert.equal(extractRequirements('ابي بيت بدون فناء', { counts: {} }).prefs.courtyard, false);
  assert.equal(extractRequirements('ما ابي فناء', { counts: {} }).prefs.courtyard, false);
  const b = buildBrief('ابي مبنى على شكل U والمنتصف حديقة، 4 غرف نوم ومجلس ومطبخ وصالة', { land: L(20, 30) });
  assert.equal(b.requirements.prefs.courtyard, true);
  assert.ok(!b.unsupported.some(u => u.includes('الفناء الداخلي')), 'الفناء لم يعد ضمن غير المدعوم');
});

test('طلب الفناء: التصميم الأول U بحديقة داخلية مغلقة بسور، تطل عليها الصالة بباب، وغرف الجناحين بنوافذ عليها', () => {
  const out = generateVillaDesigns({ land: L(20, 30), counts: C({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }), requirements: { prefs: { courtyard: true } } });
  const d = out.designs[0];
  assert.equal(d.mode, 'court');
  const doc = d.doc; sound(doc);
  const c = court(doc); assert.ok(c, 'تسمية الحديقة الداخلية');
  const an = analyzeWalls(doc.walls.filter(w => w.level === 'L1'));
  const sp = an.spaces.find(s => s.net && pointInPolygon(c.seed, s.net)); assert.ok(sp && sp.area >= 25, 'حديقة ≥ 25 م²: ' + sp?.area);
  assert.ok(doc.walls.some(w => w.kind === 'fence'), 'سور الحديقة من الخلف');
  assert.ok(doc.fixtures.some(f => f.kind === 'tree'), 'شجرة في الحديقة');
  // نوافذ على الحديقة: فتحات نافذة على جدران تحد فراغ الحديقة
  const courtWalls = new Set(sp.edges.flatMap(e => e.wallIds || []));
  const winsOnCourt = doc.openings.filter(o => /window/.test(o.kind) && courtWalls.has(o.wall));
  assert.ok(winsOnCourt.length >= 4, 'نوافذ على الحديقة: ' + winsOnCourt.length);
  assert.ok(d.notes.some(n => n.includes('شكل U')), 'ملاحظة الشكل');
  assert.ok(out.designs.every(x => x.mode === 'court'), 'كل البدائل بالفناء عند طلبه');
});

test('بدون طلب الفناء: لا يظهر عند «بدون فناء»، ويبقى بديلًا مختلفًا عند «تصميم آخر»', async () => {
  const out = generateVillaDesigns({ land: L(20, 30), counts: C({ bedrooms: 4, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }), requirements: { prefs: { courtyard: false } } });
  assert.ok(out.designs.every(d => d.mode !== 'court'));
  const text = '4 غرف نوم ومجلس رجال ومقلط ومطبخ وصالة وغرفة خادمة';
  const b = buildBrief(text, { land: L(20, 30) });
  const base = { land: L(20, 30), rooms: [], discovery: b.discovery, idea: text, counts: b.counts, requirements: b.requirements };
  const first = await generateInitialDesign(base);
  const shown = [first.pat];
  const modes = new Set([first.strategy]);
  for (let i = 0; i < 3; i++) { const nx = await generateInitialDesign({ ...base, exclude: shown }); for (const p of shown) assert.ok(patOverlap(nx.pat, p) <= .6, 'مختلف جذريًا عمّا عُرض: ' + patOverlap(nx.pat, p)); shown.push(nx.pat); modes.add(nx.strategy); }
  assert.ok(modes.size >= 3, 'أنماط مختلفة عبر «تصميم آخر»: ' + [...modes].join(','));
});

test('البدائل الأولى ليست نسخًا متقاربة ولا بديلًا أضعف بوضوح', () => {
  const out = generateVillaDesigns({ land: L(20, 30), counts: C({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }), requirements: {} });
  assert.ok(out.designs.length >= 2);
  const best = out.designs[0];
  for (let i = 1; i < out.designs.length; i++) {
    const d = out.designs[i];
    assert.equal(d.fails, best.fails);
    assert.ok(d.quality <= best.quality * 1.6 + 40, 'لا بديل أضعف بوضوح');
    assert.ok(patOverlap(d.pat, best.pat) < 1, 'ليس نسخة');
  }
  assert.ok(new Set(out.designs.map(d => d.mode)).size >= 2 || out.designs.every((d, i) => i === 0 || patOverlap(d.pat, best.pat) <= .6), 'تنوع في النمط أو التوزيع');
});

test('دوران بفناء: U في الدورين، الحديقة أرضية وفراغها مفتوح فوقها', () => {
  const out = generateVillaTwoFloors({ land: L(20, 30, 2), counts: C({ bedrooms: 5, majlis: 2, baths: 7, kitchens: 1, halls: 1, dining: 1 }), requirements: { prefs: { courtyard: true } } });
  const d = out.designs[0]; assert.equal(d.mode, 'court'); sound(d.doc);
  assert.ok(court(d.doc), 'حديقة أرضية');
  const L2 = d.doc.levels[1].id;
  assert.ok(!d.doc.labels.some(l => l.type === 'courtyard' && l.level === L2), 'لا تسمية حديقة في العلوي');
  assert.ok(d.doc.labels.filter(l => l.level === L2 && ['bedroom', 'master'].includes(l.type)).length >= 4);
});

test('الدور العلوي: الصالة العلوية لا تبتلع المحور كله حين تتسع غرفة في مقدمته', () => {
  const out = generateVillaTwoFloors({ land: L(20, 30, 2), counts: C({ bedrooms: 5, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 }), requirements: { prefs: { allEnsuite: true } } });
  const d = out.designs[0]; sound(d.doc);
  const L2 = d.doc.levels[1].id, an = analyzeWalls(d.doc.walls.filter(w => w.level === L2));
  const hall = d.doc.labels.find(l => l.level === L2 && l.type === 'living');
  const sp = an.spaces.find(s => s.net && pointInPolygon(hall.seed, s.net));
  assert.ok(sp.area <= 56, 'الصالة العلوية ≤ 56 م²: ' + sp.area);
  const beds = d.doc.labels.filter(l => l.level === L2 && ['bedroom', 'master'].includes(l.type));
  assert.equal(beds.length, 5);
});

test('المجلس لا يُقبل أصغر من 70٪ من مقاسه التصميمي', () => {
  const out = generateVillaDesigns({ land: L(15, 25), counts: C({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }), requirements: {} });
  for (const d of out.designs) {
    const an = analyzeWalls(d.doc.walls.filter(w => w.level === 'L1'));
    for (const l of d.doc.labels.filter(x => x.type === 'majlis')) { const sp = an.spaces.find(s => s.net && pointInPolygon(l.seed, s.net)); assert.ok(sp.area >= 15, l.name + ' ' + sp.area); }
  }
});
