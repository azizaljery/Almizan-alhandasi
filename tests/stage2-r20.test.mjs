// الجولة العشرون (توجيه المالك r20): المحرك الثالث القائم على العلاقات والقيود، وكشف الاستحالة قبل التوليد، وحارس التغيير الشامل،
// وقياسات المراجعة العمياء r19، وإشعار العميل بالعدد وسببه، وإثبات أن الشيفرة لا تعتمد على أرقام الحالات ولا أسمائها، واختبارات خواص
// على أراضٍ وبرامج عشوائية (شوارع شمالية وشرقية وغربية وجنوبية وزوايا، ودور ودوران).
// المراجع المستقل وكيل ذكاء اصطناعي (Claude) — ليس معماريًا مرخّصًا؛ ولا يُعدّ أي حكم آلي هنا اعتمادًا هندسيًا أو إنشائيًا.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseDoc } from '../dist/draw/doc.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { programV2, siteOf, TREE_KIT } from '../dist/villa-layout-v2.mjs';
import { unitsOf, enumerateLayouts, synthTrees, gridShapes, guillotine } from '../dist/villa-layout-v3.mjs';
import * as V3 from '../dist/villa-layout-v3.mjs';
import { analyzeFeasibility } from '../dist/feasibility.mjs';
import { measureR20, R20_MANDATORY } from '../dist/r20-checks.mjs';
import { MANDATORY_R16 } from '../dist/privacy-defects.mjs';
import { presentationStatus } from '../dist/presentation-status.mjs';
import { invariants, regressions, guardChange, guarded } from '../dist/change-guard.mjs';
import { parseEdit, applyEdits } from '../dist/plan-edit.mjs';
import { polishR16 } from '../dist/r16-polish.mjs';
import { shortfallNotice, internalLeaks } from '../dist/client-text.mjs';
import { extractRequirements } from '../dist/requirements.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';
import { HELDOUT } from '../scripts/heldout-cases.mjs';
import { DEV } from '../scripts/dev-cases-r20.mjs';

const root = new URL('../', import.meta.url).pathname;
const doc19 = (stage, id, f) => parseDoc(readFileSync(`${root}evidence/acceptance/${stage}/${id}/${f}`, 'utf8'));
const have19 = existsSync(`${root}evidence/acceptance/after-19/C9/alt-4.json`);
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ------------------------------------------------------------------------------------------------ لا حالات في الشيفرة
test('التعميم: شيفرة المحرك الثالث وكشف الاستحالة والقياسات الجديدة لا تذكر معرّفات الحالات ولا أسماءها ولا أبعاد أراضيها', () => {
  const files = ['dist/villa-layout-v3.mjs', 'dist/feasibility.mjs', 'dist/r20-checks.mjs', 'dist/change-guard.mjs'];
  // نصوص الحالات وأسماؤها (أطول من 6 أحرف) وأزواج أبعاد أراضيها «عرض×طول»
  const all = [...CASES, ...HELDOUT, ...DEV];
  const names = all.map(c => c.name).filter(n => n.length > 6);
  const dims = [...new Set(all.map(c => `${c.land.width}×${c.land.length}`))];
  for (const f of files) {
    // الشيفرة دون التعليقات (التعليقات تشرح ما رآه المراجع في حالات بعينها، ولا أثر لها في السلوك)
    const code = readFileSync(root + f, 'utf8').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /['"`][CHD]\d{1,2}(?:-\d)?['"`]|\b(?:case|C|H|D)\.id\s*===/, `${f}: معرّف حالة في الشيفرة`);
    for (const n of names) assert.ok(!code.includes(n), `${f}: اسم حالة «${n}»`);
    for (const d of dims) assert.ok(!code.includes(d) && !code.includes(d.replace('×', 'x')), `${f}: أبعاد أرض حالة ${d}`);
  }
});

// ------------------------------------------------------------------------------------------------ كشف الاستحالة
test('كشف الاستحالة قبل التوليد: البرنامج أكبر من الأرض، ومقاس أطول من الأرض، وبندان متعارضان — تقرير عربي بالتعارض والخيارات؛ والطلب الممكن يمر', () => {
  const big = analyzeFeasibility({ land: { width: 12, length: 20, streets: ['s'], entries: ['s'], floors: 1 }, counts: { bedrooms: 6, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 }, requirements: extractRequirements('6 غرف نوم ومجلسين') });
  assert.equal(big.feasible, false); assert.ok(big.hard.some(h => h.id === 'AREA'));
  assert.ok(big.options_ar.some(o => /دوران/.test(o)) && big.options_ar.some(o => /تقليل/.test(o)));
  assert.match(big.report_ar, /لا يمكن تحقيق الطلب كما هو/); assert.equal(internalLeaks(big.report_ar).length, 0);
  const req = extractRequirements('دور واحد، 3 غرف، مجلس 6×22', { counts: { bedrooms: 3, majlis: 1 } });
  const dim = analyzeFeasibility({ land: { width: 20, length: 20, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, requirements: req });
  assert.equal(dim.feasible, false); assert.ok(dim.hard.some(h => h.id.startsWith('DIM_')), JSON.stringify(dim.hard));
  const ok = analyzeFeasibility({ land: { width: 20, length: 30, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }, requirements: extractRequirements('4 غرف ومجلسين') });
  assert.equal(ok.feasible, true, ok.report_ar);
  // بندان متعارضان من العميل نفسه (المطبخ أمامًا وخلفًا) ليسا استحالة على الأرض: ملاحظة معلنة بالاسم العربي، والحوار يسأل أيهما يريد
  const cf = analyzeFeasibility({ land: { width: 22, length: 30, streets: ['s'], entries: ['s'] }, counts: { bedrooms: 3, majlis: 1, baths: 4, kitchens: 1, halls: 1, dining: 1 }, requirements: extractRequirements('3 غرف ومجلس، المطبخ في الأمام، والمطبخ في الخلف') });
  assert.equal(cf.feasible, true); const w = cf.warnings.find(x => x.id === 'PLACE_CONFLICT'); assert.ok(w, JSON.stringify(cf.warnings));
  assert.match(w.ar, /«المطبخ» في الأمام وفي الخلف/); assert.equal(internalLeaks(w.ar).length, 0);
});
test('المحرك الثالث لا يعيد نتيجة فارغة بلا تفسير: الطلب المستحيل خطأ بتقرير عربي (VILLA_INFEASIBLE) قبل أي رسم', () => {
  const land = { width: 12, length: 18, streets: ['s'], entries: ['s'], floors: 1 }, counts = { bedrooms: 6, majlis: 2, baths: 8, kitchens: 1, halls: 1, dining: 1 };
  assert.throws(() => V3.generateVillaDesigns({ land, counts, requirements: extractRequirements('6 غرف نوم ومجلسين', { counts }), keep: 4 }), e => e.code === 'VILLA_INFEASIBLE' && /الخيارات المتاحة/.test(e.message) && e.feasibility?.hard?.length > 0);
});

// ------------------------------------------------------------------------------------------------ بحث القيود
const program = (counts, text = '') => { const req = extractRequirements(text, { counts }); req.counts = { ...req.counts, ...counts }; return { P: programV2(req.counts, req), req }; };
test('بحث القيود على الشبكة: كل توزيع ناتج يحقق القيود الصلبة (المدخل على الشارع، الصالة تلامسه أو رواقًا منه، الطعام يلامس المطبخ والمجلس، النوم يلامس الصالة، الضوء، المطبخ لا يطل على الشارع)، ومقصلي', () => {
  const { P } = program({ bedrooms: 4, majlis: 2, baths: 6, kitchens: 1, halls: 1, dining: 1 }, '4 غرف ومجلس رجال ومجلس نساء');
  const { units, rel } = unitsOf(P);
  const keys = units.map(u => u.key);
  for (const k of ['M', 'W', 'DN', 'KS', 'F', 'H']) assert.ok(keys.includes(k), k);
  const adj = (a, b) => (a.x1 === b.x0 || b.x1 === a.x0 ? Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) : a.y1 === b.y0 || b.y1 === a.y0 ? Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) : 0) > 0;
  const e = enumerateLayouts(units, rel, 3, 4, { W: 17, D: 25 });
  assert.ok(e.layouts.length > 10, 'توزيعات صالحة متعددة');
  for (const L of e.layouts.slice(0, 200)) {
    const R = L.R;
    assert.equal(R.F.y0, 0); assert.ok(adj(R.H, R.F) || (R.LK && adj(R.LK, R.F) && adj(R.LK, R.H)));
    assert.ok(adj(R.DN, R.KS)); assert.ok(adj(R.M, R.DN), 'وصلة الضيافة بالبناء'); assert.ok(R.KS.y0 > 0, 'المطبخ لا يطل على الشارع');
    for (const s of keys.filter(k => k[0] === 'S')) assert.ok(adj(R[s], R.H));
    assert.ok(guillotine(Object.values(R), { x0: 0, y0: 0, x1: L.nc, y1: L.nr }));
  }
});
test('اختبار خواص (60 برنامجًا وأرضًا عشوائية): الأشجار المركّبة تضم كل فراغ من البرنامج مرة واحدة ولا شيئًا من خارجه، وتتسع بأدنى أبعادها في الأرض', () => {
  const R = rng(20261024); let withTrees = 0;
  for (let i = 0; i < 60; i++) {
    const counts = { bedrooms: 3 + Math.floor(R() * 4), majlis: 1 + Math.floor(R() * 2), baths: 0, kitchens: 1, halls: 1, dining: 1 }; counts.baths = counts.bedrooms + counts.majlis + Math.floor(R() * 2);
    const extra = (R() < .4 ? '، غرفة خادمة' : '') + (R() < .25 ? '، غرفة سائق' : '');
    const { P } = program(counts, `${counts.bedrooms} غرف نوم${extra}`);
    const W = 10 + R() * 22, D = 14 + R() * 18, st = ['s', 'n', 'e', 'w'][Math.floor(R() * 4)];
    const { trees } = synthTrees(P, { W, D, nFirst: 3, nLate: 2 });
    if (trees.length) withTrees++;
    for (const t of trees) {
      const ids = []; (function walk(n) { if (!n) return; if (n.t === 'zone') ids.push(...n.b.map(b => b.id)); if (n.k) n.k.forEach(walk); })(t.tree);
      const prog = P.blocks.map(b => b.id), extraIds = ids.filter(x => !prog.includes(x));
      assert.deepEqual(extraIds.filter(x => x !== 'wcDay'), [], 'لا فراغ من خارج البرنامج (عدا دورة مياه العائلة الافتراضية)');
      for (const b of prog) assert.equal(ids.filter(x => x === b).length, 1, `«${b}» مرة واحدة (${st})`);
      assert.ok(TREE_KIT.minExt(t.tree, 'x') <= W + 1e-6 && TREE_KIT.minExt(t.tree, 'y') <= D + 1e-6);
    }
  }
  assert.ok(withTrees >= 30, `أشجار مركّبة في ${withTrees} من 60`);
});
test('اختبار خواص بالتوليد الكامل (أراضٍ عشوائية بشوارع شمالية وشرقية وغربية وجنوبية وزاوية، ودور ودوران): بديل أو أكثر، أو خطأ يحمل تقريرًا عربيًا — لا نتيجة صامتة، ولا بديل «جاهز» فيه مخالفة إلزامية', { timeout: 900000 }, () => {
  const R = rng(777); let produced = 0, reported = 0;
  for (let i = 0; i < 4; i++) {
    const streets = [['n'], ['e'], ['w', 's'], ['w']][i], floors = i === 3 ? 2 : 1;
    const land = { width: Math.round(16 + R() * 14), length: Math.round(20 + R() * 14), streets, entries: [streets[0]], floors };
    const counts = { bedrooms: 3 + (i % 3), majlis: 1 + (i % 2), baths: 0, kitchens: 1, halls: 1, dining: 1 }; counts.baths = counts.bedrooms + counts.majlis;
    const req = extractRequirements(`${floors === 2 ? 'دورين: ' : ''}${counts.bedrooms} غرف نوم`, { counts }); req.counts = { ...req.counts, ...counts };
    try {
      const out = (floors === 2 ? V3.generateVillaTwoFloors : V3.generateVillaDesigns)({ land, counts: req.counts, requirements: req, keep: 3 });
      assert.ok(out.designs.length > 0); produced++;
      for (const d of out.designs) if (d.presentation?.status === 'ready') assert.ok(!(d.r16 || []).some(id => MANDATORY_R16.includes(id)), 'جاهز بلا مخالفة إلزامية');
      if (out.designs.length < 3) assert.ok(out.shortfall_ar && out.shortfall_ar.length > 20, 'سبب النقص مكتوب');
    } catch (e) { assert.ok((e.report_ar || e.message || '').length > 20, 'تقرير عربي'); assert.match(e.report_ar || e.message, /[؀-ۿ]/); reported++; }
  }
  assert.equal(produced + reported, 4);
});

// ------------------------------------------------------------------------------------------------ قياسات المراجعة العمياء r19
test('قياسات r20 على مستندات after-19 كما رآها المراجع الأعمى: C9-4 نافذة المجلس على حوش العائلة (إلزامي)، وC6 وC4 الصالة أصغر من المجلس، وC5-3 نوافذ الصالة علوية وحدها، وC9-3 بلا دورة مياه للعائلة', { skip: !have19 }, () => {
  const ids = (id, f) => measureR20(doc19('after-19', id, f)).filter(g => g.applicable && !g.pass).map(g => g.id);
  assert.ok(ids('C9', 'alt-4.json').includes('COURT_OVERLOOK'));
  assert.ok(ids('C6', 'alt-1.json').includes('HALL_LT_MAJLIS'));
  assert.ok(ids('C4', 'alt-1.json').includes('HALL_LT_MAJLIS'));
  assert.ok(ids('C5', 'alt-3.json').includes('HALL_DAYLIGHT'));
  assert.ok(ids('C9', 'alt-3.json').includes('FAMILY_WC'));
  for (const id of ['C1', 'C10']) assert.ok(!ids(id, 'alt-1.json').some(x => ['COURT_OVERLOOK', 'MAJLIS_ISOLATED', 'HALL_LT_MAJLIS', 'HALL_DAYLIGHT'].includes(x)), id + ' بلا إنذار كاذب');
  for (const id of R20_MANDATORY) assert.ok(MANDATORY_R16.includes(id), id + ' إلزامي يحجب');
});
test('المجلس المعزول (المراجع r19: H1 وH5 بلا باب داخلي) مخالفة إلزامية تحجب البديل', { skip: !existsSync(`${root}evidence/acceptance/after-19-heldout/H1/alt-1.json`) }, () => {
  for (const id of ['H1', 'H5']) {
    const doc = doc19('after-19-heldout', id, 'alt-1.json');
    assert.ok(measureR20(doc).some(g => g.id === 'MAJLIS_ISOLATED' && !g.pass), id);
    assert.equal(presentationStatus({ doc, ledger: [], review: null }, { text: '' }).status, 'hidden', id);
  }
});

// ------------------------------------------------------------------------------------------------ حارس التغيير الشامل
test('حارس التغيير: إصلاح الخصوصية لا يُفقد الصالة ضوءها — نافذة الصالة العادية الوحيدة لا تصير علوية بالصقل', { skip: !have19 }, () => {
  const doc = doc19('after-19', 'C5', 'alt-3.json'), hall = analyzeDoc(doc).levels[0].rooms.find(r => r.type === 'living' && r.name === 'الصالة');
  // نعيد نوافذ الصالة إلى جلسة عادية (كما قبل الصقل) ثم نصقل
  const G = analyzeDoc(doc).levels[0];
  for (const op of G.openings.filter(o => o.window && o.sides.some(s => s.room.id === hall.id))) { const o = doc.openings.find(q => q.id === op.o.id); o.sill = 1.0; o.h = 1.4; }
  assert.ok(measureR20(doc).find(g => g.id === 'HALL_DAYLIGHT').pass);
  polishR16(doc);
  assert.ok(measureR20(doc).find(g => g.id === 'HALL_DAYLIGHT').pass, 'بقيت للصالة نافذة عادية');
});
test('حارس التغيير: تغيير يُسقط شرطًا كان متحققًا يُرفض ويعود المستند كما كان (الصالة تصغر عن المجلس، دورة مياه العائلة تُحذف، غرفة تفقد نافذتها)', { skip: !have19 }, () => {
  const doc = doc19('after-19', 'C1', 'alt-1.json'), before = JSON.stringify(doc);
  // (أ) حذف كل نوافذ الصالة = فقدان الضوء
  const g1 = guarded(doc, d => { const hall = analyzeDoc(d).levels[0].rooms.find(r => r.type === 'living' && r.name === 'الصالة'); const ids = new Set(analyzeDoc(d).levels[0].openings.filter(o => o.window && o.sides.some(s => s.room.id === hall.id)).map(o => o.o.id)); d.openings = d.openings.filter(o => !ids.has(o.id)); });
  assert.equal(g1.applied, false); assert.ok(g1.regressions.some(r => r.id === 'DAYLIGHT' || r.id === 'NO_WINDOW')); assert.equal(JSON.stringify(doc), before);
  // (ب) حذف باب دورة مياه العائلة = فقدان دورة المياه المطلوبة
  const inv = invariants(doc);
  if (inv.checks.FAMILY_WC?.pass) {
    const g2 = guarded(doc, d => { const G = analyzeDoc(d).levels[0], wc = G.rooms.find(r => r.type === 'bath' && r.name === 'دورة مياه'); const ids = new Set(G.openings.filter(o => o.door && o.sides.some(s => s.room.id === wc.id)).map(o => o.o.id)); d.openings = d.openings.filter(o => !ids.has(o.id)); });
    assert.equal(g2.applied, false); assert.ok(g2.regressions.some(r => r.id === 'FAMILY_WC' || r.id === 'REACH'));
  }
  // (ج) تغيير لا يمس شرطًا يُقبل
  const g3 = guarded(doc, d => { d.title = (d.title || '') + ' '; });
  assert.equal(g3.applied, true);
  assert.deepEqual(regressions(invariants(doc), invariants(doc)), []);
  assert.equal(guardChange(doc, doc).ok, true);
});
// (توجيه المالك r20، رابعًا) فحص شامل بعد كل تعديل من العميل على مخططات حقيقية: تكبير المطبخ لا يصغّر الصالة عن المجلس، وتعديل الخصوصية
// لا يُفقد الصالة ضوءها، ولا تعديل يُسقط دورة مياه العائلة — إما يُنفَّذ والشروط التي كانت متحققة باقية، وإما يُرفض موضعيًا بسببه المذكور
test('حارس التغيير على تعديلات العميل (مطبخ أكبر، نوافذ المجلس عالية، مطبخ أكبر بكثير): لا شرط متحقق يسقط في نتيجة «local»', { skip: !have19 }, () => {
  const REQ = { counts: { bedrooms: 4, majlis: 1, kitchens: 1, dining: 1 }, entry: 's' };
  let local = 0, refused = 0;
  for (const id of ['C1', 'C2', 'C4', 'C6', 'C8', 'C9', 'C10']) for (const t of ['كبر المطبخ', 'خل نوافذ المجلس عالية', 'كبر المطبخ 4 متر']) {
    const doc = doc19('after-19', id, 'alt-1.json'), before = invariants(doc, {});
    const more = extractRequirements(t, { counts: {} }), p = parseEdit(t, doc, { more });
    const r = applyEdits(doc, p, { req: REQ, history: [] });
    if (r.status === 'local' && !r.unchanged) { local++; const reg = regressions(before, invariants(r.doc, {})); assert.deepEqual(reg.map(x => x.id), [], `${id} «${t}»`); }
    if (r.status === 'fallback' && r.guard) { refused++; assert.ok(r.guard.length > 0 && /يُفسد شروطًا/.test(r.why_ar)); }
  }
  assert.ok(local >= 3 && local + refused > 0, `نُفّذ ${local} ورُفض بسبب مذكور ${refused}`);
});
test('لا بديل «جاهز» بلا دورة مياه للعائلة ولا بصالة أصغر من المجلس (حالة العرض)', { skip: !have19 }, () => {
  assert.notEqual(presentationStatus({ doc: doc19('after-19', 'C9', 'alt-3.json'), ledger: [], review: null }, { text: '' }).status, 'ready');
  assert.notEqual(presentationStatus({ doc: doc19('after-19', 'C6', 'alt-1.json'), ledger: [], review: null }, { text: '' }).status, 'ready');
});

// ------------------------------------------------------------------------------------------------ إشعار العميل
test('إشعار العميل: العدد صريحًا وسببه حين يقل المعروض، وتقرير حين لا يُنتج مخطط — بلا لغة داخلية', () => {
  const n1 = shortfallNotice({ requested: 5, shown: 1, shortfall_ar: 'عُرض 1 من 5 مطلوبة؛ المرشحون المبنيون من أنماط تنظيمية مختلفة 9، اجتاز البوابات منهم 3؛ 2 نسخة معدّلة من بديل معروض. لا يُكمَّل العدد بنسخ معكوسة (قرار المالك).' });
  assert.match(n1.title_ar, /عُرض 1 من 5/); assert.ok(n1.lines_ar.some(l => /السبب/.test(l)));
  for (const t of [n1.title_ar, ...n1.lines_ar]) assert.deepEqual(internalLeaks(t), [], t);
  const n0 = shortfallNotice({ requested: 4, shown: 0, report_ar: 'لا يمكن تحقيق الطلب كما هو على هذه الأرض:\n— البرنامج يحتاج 300 م²\nالخيارات المتاحة: دوران.' });
  assert.match(n0.title_ar, /لم أُعدّ مخططًا/); assert.ok(n0.lines_ar.length >= 3);
  assert.equal(shortfallNotice({ requested: 3, shown: 3 }), null);
});
