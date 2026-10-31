// (طلب المالك 2026-10-31) مولّد الواجهات بالطراز: الحتمية، احترام فتحات المسقط، الدروة، تمايز الطرز، تمايز التصاميم، المجسّم،
// وملف الاحتياجات (شرعاء). المستندات في tests/fixtures/facade من مخرجات المحرك عند f8e1844 (C1 وC4 دور واحد، C7 دوران).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { parseDoc, serialize } from '../dist/draw/doc.mjs';
import { analyzeWalls, exteriorWallIds } from '../dist/draw/topology.mjs';
import { buildBuildingScene } from '../dist/draw/scene3d.mjs';
import * as F from '../dist/facade-styles.mjs';
import { facadeStyleFromText, facadeChoiceRecord, FACADE_CHOICES } from '../dist/facade-choice.mjs';
import { normalizeLand } from '../dist/home-flow.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import * as B from '../dist/sharaa/brief.mjs';
import { toEngineInput } from '../dist/sharaa/adapter.mjs';
import { SharaFlow } from '../dist/sharaa/flow.mjs';

const load = id => parseDoc(readFileSync(new URL(`./fixtures/facade/${id}.json`, import.meta.url), 'utf8'));
const C1 = load('C1'), C4 = load('C4'), C7 = load('C7');
const MAIN = ['classic', 'neoclassic', 'modern'];
const allSides = (doc, spec) => { const g = F.facadeGeometry(doc); return Object.fromEntries(F.SIDES.map(s => [s, F.composeElevation(doc, s, spec, g)])); };
const ornament = (doc, spec) => Object.values(allSides(doc, spec)).reduce((n, E) => n + F.elevationMetrics(E).ornament, 0);
const roles = (doc, spec) => { const r = {}; for (const E of Object.values(allSides(doc, spec))) for (const p of E.prims) r[p.role] = (r[p.role] || 0) + 1; return r; };

test('الحتمية: نفس المدخلات = نفس الواجهة حرفيًا، والمصدر بلا Math.random ولا زمن', () => {
  for (const doc of [C1, C7]) for (const style of [...F.STYLE_IDS, 'auto']) {
    const a = F.resolveFacade(doc, { style, clientKey: 42 }), b = F.resolveFacade(doc, { style, clientKey: 42 });
    assert.deepEqual(a, b);
    for (const s of F.SIDES) assert.equal(F.elevationSvg(doc, s, a), F.elevationSvg(doc, s, b));
  }
  const src = readFileSync(new URL('../dist/facade-styles.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /Math\.random|Date\.now|new Date|performance\.now/);
  // البذرة محفوظة في المستند عند التسليم: تعديل يدوي لاحق في المرسم لا يغيّر اللوحة
  const d = F.withFacade(C1, { style: 'classic' }, 42), moved = JSON.parse(JSON.stringify(d)); moved.walls[0].a.x += .3;
  assert.equal(F.resolveFacade(moved).paletteName, F.resolveFacade(d).paletteName);
});

test('احترام الفتحات: كل فتحة مرسومة من المسقط وفي موضعها، ولا فتحة وهمية، ولا فتحة خارجية مفقودة', () => {
  for (const doc of [C1, C4, C7]) {
    const ids = new Set(doc.openings.map(o => o.id)), byId = new Map(doc.openings.map(o => [o.id, o]));
    const extWalls = new Set(); for (const L of doc.levels) for (const w of exteriorWallIds(analyzeWalls(doc.walls.filter(x => x.level === L.id)))) extWalls.add(w);
    const spec = F.resolveFacade(doc, { style: 'classic', ornament: 'high' }), g = F.facadeGeometry(doc), drawn = new Set();
    for (const s of F.SIDES) {
      const E = F.composeElevation(doc, s, spec, g), ops = E.prims.filter(p => p.role === 'opening');
      assert.equal(ops.length, g.sides[s].openings, `جهة ${s}: عدد الفتحات المرسومة = فتحات المسقط على هذه الجهة`);
      for (const p of ops) { assert.ok(ids.has(p.opening), 'فتحة بلا أصل في المسقط: ' + p.opening); assert.ok(extWalls.has(byId.get(p.opening).wall), 'فتحة على جدار غير خارجي'); assert.ok(!drawn.has(p.opening), 'فتحة مرسومة مرتين'); drawn.add(p.opening); }
      const svgIds = [...F.elevationSvg(doc, s, spec, { geom: g }).matchAll(/data-opening="([^"]+)"/g)].map(m => m[1]);
      assert.deepEqual(svgIds.sort(), ops.map(p => p.opening).sort());
    }
    // كل فتحة على جدار خارجي محوري تُرسم في جهة واحدة
    const axisExt = doc.openings.filter(o => { const w = doc.walls.find(x => x.id === o.wall); return extWalls.has(o.wall) && (Math.abs(w.a.x - w.b.x) < 1e-6 || Math.abs(w.a.y - w.b.y) < 1e-6); });
    for (const o of axisExt) if (!drawn.has(o.id)) { // قد تكون على قطعة داخلية من جدار خارجي (تطل على فناء داخلي) — لا تظهر في الواجهات الأربع
      const g2 = F.facadeGeometry(doc); assert.ok(!g2.exteriorOpenings.includes(o.id), 'فتحة خارجية غير مرسومة: ' + o.id);
    }
  }
  // الموضع: الواجهة الجنوبية لـC1 — u = x للنقطة الوسطى ناقص أقصى يسار المبنى، والارتفاع من منسوب التشطيب + الجلسة
  const g = F.facadeGeometry(C1), spec = F.resolveFacade(C1, { style: 'modern' }), E = F.composeElevation(C1, 's', spec, g);
  const offs = [];
  for (const p of E.prims.filter(q => q.role === 'opening' && q.t === 'rect')) {
    const o = C1.openings.find(x => x.id === p.opening), w = C1.walls.find(x => x.id === o.wall), L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), cx = w.a.x + (w.b.x - w.a.x) * o.at / L;
    offs.push(p.x + p.w / 2 - cx); // الواقف جنوبًا: يساره الغرب، فالفرق ثابت لكل الفتحات
    assert.ok(Math.abs(p.w - o.w) < 1e-6 && Math.abs(p.h - o.h) < 1e-6, 'المقاس من المسقط');
    assert.ok(Math.abs(p.z - (.45 + (o.sill || 0))) < 1e-6, 'الجلسة من المسقط');
  }
  assert.ok(offs.length >= 3); for (const v of offs) assert.ok(Math.abs(v - offs[0]) < 1e-3, 'الموضع الأفقي من المسقط: ' + offs.join(','));
});

test('الدروة/الساتر لا تقل عمّا في المستند، والشرفات النجدية فوقها لا بدلها ولا تتجاوز 14 م', () => {
  for (const doc of [C1, C7]) for (const style of F.STYLE_IDS) {
    const spec = F.resolveFacade(doc, { style }), P = doc.roof.parapet;
    for (const E of Object.values(allSides(doc, spec))) {
      const par = E.prims.filter(p => p.role === 'parapet'); assert.ok(par.length > 0);
      for (const p of par) assert.ok(p.h >= P - 1e-9, `${style}: دروة ${p.h} < ${P}`);
      assert.ok(E.top <= F.MAX_VILLA_HEIGHT + 1e-9);
      const tops = par.map(p => p.z + p.h);
      for (const c of E.prims.filter(p => p.role === 'crenel')) { const z = c.t === 'rect' ? c.z : Math.min(...c.pts.map(q => q[1])); assert.ok(tops.some(t => z >= t - 1e-6), 'الشرفة فوق الدروة لا داخلها'); }
    }
  }
});

test('تمايز الطرز الثلاثة بمقاييس واضحة (C1، كثافة متوسطة)', () => {
  const sp = Object.fromEntries([...MAIN, 'najdi'].map(s => [s, F.resolveFacade(C1, { style: s, clientKey: 1 })]));
  const orn = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, ornament(C1, v)]));
  const R = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, roles(C1, v)]));
  // كثافة الزخرفة: الكلاسيكي > النيوكلاسيكي > الحديث
  assert.ok(orn.classic > orn.neoclassic && orn.neoclassic > orn.modern, JSON.stringify(orn));
  assert.ok(orn.classic >= 2 * orn.neoclassic, 'الكلاسيكي أغنى بوضوح');
  // مفردات حصرية
  assert.ok(R.classic.quoin > 0 && R.classic.dentil > 0 && R.classic.pediment > 0 && R.classic.balustrade > 0, 'الكلاسيكي: زوايا وأسنان وتيجان ودرابزين');
  assert.ok(!R.neoclassic.quoin && !R.neoclassic.dentil && R.neoclassic.cornice > 0 && R.neoclassic.groove > 0, 'النيوكلاسيكي: كرنيش بسيط وحزوز بلا أسنان ولا زوايا');
  assert.ok(!R.modern.cornice && !R.modern.quoin && !R.modern.pediment && !R.modern.surround && R.modern.canopy > 0 && R.modern.frame > 0 && R.modern.panel > 0, 'الحديث: بلا كرانيش، كاسرات وإطار بارز ولوح بمادة مختلفة');
  assert.ok(R.najdi.crenel > 0 && R.najdi.frieze > 0 && !R.najdi.cornice, 'النجدي: شرفات وشريط مثلثات');
  // اللوحات لا تتداخل بين الطرز (لون الجدار)
  const walls = Object.values(sp).map(s => s.palette.wall); assert.equal(new Set(walls).size, walls.length);
  // الكثافة: غنية > متوسطة > هادئة
  const by = k => ornament(C1, F.resolveFacade(C1, { style: 'classic', clientKey: 1, ornament: k }));
  assert.ok(by('high') > by('medium') && by('medium') > by('low'));
});

test('تمايز تصميمين بالطراز نفسه، وعميلين بالتصميم نفسه', () => {
  for (const style of MAIN) {
    const a = F.resolveFacade(C1, { style, clientKey: 9 }), b = F.resolveFacade(C4, { style, clientKey: 9 });
    assert.notEqual(a.seed, b.seed);
    assert.notEqual(F.elevationSvg(C1, 's', a), F.elevationSvg(C4, 's', b));
    const ma = F.elevationMetrics(F.composeElevation(C1, 's', a)), mb = F.elevationMetrics(F.composeElevation(C4, 's', b));
    assert.notDeepEqual([ma.width, ma.openings.length, ma.ornament], [mb.width, mb.openings.length, mb.ornament]);
  }
  // عملاء مختلفون على التصميم نفسه: بذور مختلفة، ويختلف اختيار الطراز (لوحة/تيجان/إطار) في معظمهم
  const variants = new Set(); for (let k = 0; k < 12; k++) { const s = F.resolveFacade(C1, { style: 'classic', clientKey: k * 7919 }); variants.add(JSON.stringify([s.palIndex, s.params.head, s.params.plinthH])); }
  assert.ok(variants.size >= 6, 'تنوع العملاء: ' + variants.size);
});

test('withFacade لا يغيّر المسقط، و«اختر لي» حتمي ضمن الطرز الثلاثة ومعلن أنه اختيار الميزان', () => {
  const d = F.withFacade(C7, { style: 'auto', source: 'design_default' }, 5);
  for (const k of ['walls', 'openings', 'labels', 'levels', 'stairs', 'plot', 'roof']) assert.deepEqual(d[k], C7[k]);
  assert.equal(F.geometryKey(d), F.geometryKey(C7));
  assert.ok(MAIN.includes(d.finish.facade.style)); assert.equal(d.finish.facade.styleChosenBy, 'mizan-auto');
  const again = F.withFacade(C7, { style: 'auto' }, 5).finish.facade; assert.equal(again.style, d.finish.facade.style); assert.equal(again.seed, d.finish.facade.seed);
  assert.equal(serialize(F.withFacade(C7, null, 5)), serialize(C7));
});

test('المجسّم: بلا طراز كما كان حرفيًا، وبطراز تتغير المواد والتفاصيل دون فتحات جديدة', () => {
  const tris = b => { let n = 0; b.group.traverse(o => { if (o.geometry?.index) n += o.geometry.index.count / 3; }); return n; };
  const base = buildBuildingScene(C1, THREE, { textures: false }), again = buildBuildingScene(C1, THREE, { textures: false });
  assert.equal(tris(base), tris(again)); assert.equal(base.facadeDetails, undefined);
  const res = {};
  for (const style of F.STYLE_IDS) {
    const d = F.withFacade(C1, { style }, 3), b = buildBuildingScene(d, THREE, { textures: false }), spec = F.resolveFacade(d);
    res[style] = { tris: tris(b), det: b.facadeDetails[0], render: '#' + b.lib.m.render.color.getHexString() };
    // نفس الجدران ونفس الفتحات (المجسّم يقرأ المسقط نفسه)
    assert.equal(b.levels[0].solids.segments.reduce((n, s) => n + s.openings.length, 0), base.levels[0].solids.segments.reduce((n, s) => n + s.openings.length, 0));
    assert.equal(res[style].render, style === 'classic' ? spec.palette.accent : spec.palette.wall);
  }
  assert.ok(res.classic.det.columns > 0 && res.classic.det.hoods > 0);
  assert.equal(res.modern.det.columns + res.modern.det.hoods + res.modern.det.crenels, 0);
  assert.ok(res.najdi.det.crenels > 0 && res.classic.det.crenels === 0);
  assert.equal(new Set(Object.values(res).map(r => r.tris)).size, 4, 'أربعة مجسّمات مختلفة');
  // اختيار العميل الصريح للون يتقدم على لوحة الطراز
  const d = F.withFacade(C1, { style: 'modern' }, 3); d.finish.facade.color = '#123456';
  assert.equal(buildBuildingScene(d, THREE, { textures: false }).lib.m.render.color.getHexString(), '123456');
});

test('ملف الاحتياجات: الطراز من كلام العميل ومن سؤال شرعاء بمصدره، ولا يغيّر مدخلات المحرك ولا يحجب التصميم', () => {
  assert.equal(facadeStyleFromText('ابي الواجهة نيو كلاسيك')?.style, 'neoclassic');
  assert.equal(facadeStyleFromText('أبغى واجهة كلاسيكية فخمة')?.style, 'classic');
  assert.equal(facadeStyleFromText('طراز الواجهة مودرن')?.style, 'modern');
  assert.equal(facadeStyleFromText('مطبخ حديث مفتوح'), null, 'لا يُفهم «مطبخ حديث» طرازًا للواجهة');
  const land = normalizeLand({ length: 30, width: 20, streets: ['s'], entries: ['s'], floors: 1 }).land;
  const t = 'أبي 4 غرف نوم ومجلس ومطبخ وصالة، والواجهة نيوكلاسيك';
  const plain = 'أبي 4 غرف نوم ومجلس ومطبخ وصالة';
  const b1 = B.applyExtraction(B.createBrief({ land }), extractRequirements(t, { counts: {} }), t).brief;
  const b0 = B.applyExtraction(B.createBrief({ land }), extractRequirements(plain, { counts: {} }), plain).brief;
  assert.equal(b1.preferences.facadeStyle, 'neoclassic'); assert.equal(b1.provenance['preferences.facadeStyle'].source, 'client_free_text');
  const e1 = toEngineInput(b1), e0 = toEngineInput(b0), b2 = B.setField(b0, 'preferences.facadeStyle', 'modern', { source: 'client_answer', priority: 'flexible', verification: 'confirmed' });
  assert.equal(JSON.stringify(toEngineInput(b2).requirements), JSON.stringify(e0.requirements), 'الطراز لا يدخل requirements');
  assert.deepEqual(toEngineInput(b2).counts, e0.counts);
  assert.equal(e1.facade.style, 'neoclassic'); assert.equal(toEngineInput(b2).facade.source, 'client_answer'); assert.equal(e0.facade, null);
  assert.throws(() => B.setField(b0, 'preferences.facadeStyle', 'gothic', { source: 'client_answer' }));
  // سؤال شرعاء: يظهر في المسار الموجّه، وجوابه يُحفظ بمصدره، ولا يغيّر الجاهزية
  const f = new SharaFlow({ land, mode: 'guided' }); f.answer('counts', { bedrooms: 3, majlis: 1, baths: 3, kitchens: 1, halls: 1, dining: 1 });
  const before = f.readiness().state; let q = null;
  for (let i = 0; i < 20; i++) { const c = f.candidates().find(x => x.key === 'facade_style'); if (c) { q = c.build(); break; } const n = f.log.at(-1); if (!n?.key) break; try { f.answer('ask', { key: n.key, value: n.kind === 'multi' ? [] : n.options?.[0]?.id }); } catch { break; } }
  assert.ok(q, 'سؤال الطراز متاح'); assert.deepEqual(q.options.map(o => o.id), ['classic', 'neoclassic', 'modern', 'auto']);
  const st0 = f.readiness().state; f.answer('ask', { key: 'facade_style', value: 'classic' }); assert.equal(f.readiness().state, st0, 'الطراز لا يغيّر الجاهزية');
  assert.equal(f.brief.preferences.facadeStyle, 'classic'); assert.equal(f.brief.provenance['preferences.facadeStyle'].source, 'client_answer');
  assert.ok(!f.candidates().some(x => x.key === 'facade_style'), 'لا يُكرر');
  void before;
  // سجل الاختيار في صفحة التصميم: التاريخ محفوظ
  const r1 = facadeChoiceRecord('classic', { source: 'client_answer' }), r2 = facadeChoiceRecord('modern', { source: 'client_confirmed' }, r1);
  assert.deepEqual(r2.history, [{ style: 'classic', source: 'client_answer' }]); assert.ok(FACADE_CHOICES.includes('auto'));
});
