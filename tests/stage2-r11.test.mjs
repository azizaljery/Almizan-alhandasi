// الجولة الحادية عشرة: البوابات الثقيلة في المراجع المستقل (المراجعة الإنشائية المبدئية، والحركة الفعلية، والتطابق 2D/3D)،
// والاختلاف الوظيفي v2 حاكمًا في الاختيار وفي بوابة DISTINCT، وإصلاحات المولّد (فتحات لا تعبر التقاطعات، وباب دورة مياه الضيوف،
// والأثاث الذي لا يسد الحركة، ومجلس النساء ≥ 4.2 م)، ودرابزين فتحة السلم مع دوره، وطلبات طويلة متعارضة يُسأل عنها ثم تُحسم.
import './_gen-cache.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { miniDoc, rect } from './_mini-docs.mjs';
import { buildWallSolids, openingConsistency, clearOpeningsOfJunctions } from '../dist/draw/wall-geometry.mjs';
import { circulationProof, circulationGate, CIRC_GATE_LIMITS } from '../dist/circulation-proof.mjs';
import { reviewDesign, reviewDesigns, HEAVY_GATES, GATE_TIER, TIER_AR, evaluateGates } from '../dist/plan-review.mjs';
import { archDifferenceV2 } from '../dist/arch-difference.mjs';
import { generateVillaDesigns } from '../dist/villa-layout-v2.mjs';
import { extractRequirements, detectConflicts } from '../dist/requirements.mjs';
import { generateInitialDesign } from '../dist/home-flow.mjs';
import { createSession, redesign } from '../dist/design-session.mjs';
import { analyzeDoc } from '../dist/draw/digest.mjs';
import { CASES } from '../scripts/acceptance-cases.mjs';
import { LONG } from '../scripts/dialog-cases.mjs';
import { mirrorX } from '../scripts/defect-corpus.mjs';

// غرفتان 4×4 بجدار داخلي عند x=4، ونافذة الواجهة الجنوبية (الجدار 0) تُوضع على التقاطع أو بعيدًا عنه
const twoRooms = (winAt, extra = {}) => miniDoc({ levels: [{
  walls: [...rect(0, 0, 8, 4), [4, 0, 4, 4, 0.12]],
  openings: [[0, 'window', winAt, 1.4], [4, 'door', 2, 0.9], [0, 'door', 6, 1.0, { entry: true }]],
  labels: [['غرفة نوم 1', 'bedroom', 2, 2], ['الصالة', 'living', 6, 2]], ...extra }] });

test('wall-geometry: فتحة على تقاطع جدار داخلي لا تُحذف بصمت — تُعلن، وstrict يرمي، والإصلاح يزلقها إلى موضع سليم', () => {
  const bad = twoRooms(4), ok = twoRooms(2);
  const s = buildWallSolids(bad.walls, bad.openings, {});
  assert.ok(s.issues.some(i => i.id === 'o1' && ['CROSSES_JUNCTION', 'SHIFTED', 'DROPPED', 'RESIZED'].includes(i.code)), JSON.stringify(s.issues));
  assert.equal(openingConsistency(bad).ok, false);
  assert.equal(openingConsistency(ok).ok, true, JSON.stringify(openingConsistency(ok).issues));
  // ثلاث فتحات متراكبة: المجسّم يُسقط المتأخرة — والإسقاط مُعلن لا صامت، وstrict يرمي
  const over = twoRooms(2); over.openings.push({ ...over.openings[0], id: 'o9', at: 2.3 });
  assert.ok(buildWallSolids(over.walls, over.openings, {}).issues.some(i => i.code === 'DROPPED' && i.id === 'o9'));
  assert.throws(() => buildWallSolids(over.walls, over.openings, { strict: true }), e => e.code === 'OPENING_DROPPED');
  const fx = clearOpeningsOfJunctions(bad);
  assert.equal(fx.moved.length, 1); assert.ok(Math.abs(fx.moved[0].to - 4) >= 0.7 + 0.06 + 0.15 - 1e-6, JSON.stringify(fx));
  assert.equal(openingConsistency(bad).ok, true);
});

test('plan-review: البوابات الثقيلة الثلاث بطبقاتها، وCONSISTENCY_2D3D ترسب للفتحة على التقاطع', () => {
  for (const id of HEAVY_GATES) assert.ok(GATE_TIER[id], id);
  const rv = reviewDesign(twoRooms(4), {}, { external: false });
  const g = rv.gates.find(x => x.id === 'CONSISTENCY_2D3D');
  assert.ok(g && !g.ok && g.tier === 'functional' && g.tier_ar === TIER_AR.functional, JSON.stringify(g));
  assert.ok(rv.gates.find(x => x.id === 'STRUCTURAL') && rv.gates.find(x => x.id === 'CIRCULATION'));
  // evaluateGates بلا heavy (المسار السريع للتعديلات) لا يحسبها
  assert.ok(!evaluateGates(twoRooms(4), {}).some(x => HEAVY_GATES.includes(x.id)));
});

test('الحركة الفعلية: المرحاض في منطقة فتح باب دورة المياه، وكنبة أمام الباب، وباب دورة مياه الضيوف 0.75 م — رسوب بطبقته', () => {
  // ممر الضيوف 3×1.6 ودورة مياه الرجال 1.6×1.9 خلفه بباب 0.75 م والمرحاض أمام الباب مباشرة؛ مجلس بكنبة أمام فتحته
  const doc = miniDoc({ levels: [{
    walls: [...rect(0, 0, 9, 5), [3, 0, 3, 5, 0.12], [0, 1.9, 3, 1.9, 0.12]],
    openings: [[0, 'door', 1.5, 0.9, { entry: true }], [5, 'door', 1.5, 0.75], [4, 'arch', 3.5, 1.2]],
    labels: [['مدخل الرجال', 'corridor', 1.5, 3.5], ['دورة مياه الرجال', 'bath', 1.5, 1], ['مجلس الرجال', 'majlis', 6, 2.5]],
    fixtures: [{ kind: 'wc', x: 1.5, y: 1.4, w: 0.4, d: 0.7 }, { kind: 'majlis-sofa', x: 3.6, y: 3.5, w: 2.0, d: 0.8, rot: Math.PI / 2 }],
  }] });
  const g = circulationGate(doc);
  const codes = g.fails.map(f => f.code);
  assert.ok(codes.includes('WC_DOOR_CLASH') && codes.includes('GUEST_WC_DOOR') && codes.includes('FURNITURE_AT_DOOR'), JSON.stringify(g.fails));
  assert.equal(g.fails.find(f => f.code === 'WC_DOOR_CLASH').tier, 'functional');
  assert.equal(g.fails.find(f => f.code === 'GUEST_WC_DOOR').tier, 'mizan-default');
  assert.equal(CIRC_GATE_LIMITS.body * 2, 0.6);
});

test('DISTINCT v2: النسخة المعكوسة «نسخة معدّلة» ترسب، والرسوب يذكر الأبعاد الجوهرية ويرفق الشرح العربي', () => {
  const j = JSON.parse(readFileSync(new URL('../evidence/acceptance/after-10/C8/alt-1.json', import.meta.url), 'utf8'));
  const a = j.doc || j, b = mirrorX(a);
  const rows = reviewDesigns([a, b], {}, { external: false, heavy: false, distinct: true });
  const r = rows.find(x => x.failedGates.includes('DISTINCT'));
  assert.ok(r, JSON.stringify(rows.map(x => x.failedGates)));
  const g = r.gates.find(x => x.id === 'DISTINCT');
  assert.equal(g.value.verdict, 'variant'); assert.match(g.explanation_ar, /الحكم: نسخة معدّلة/); assert.match(g.reasons_ar[0], /المطلوب بعدان/);
});

const caseOut = new Map();
const gen = id => {
  if (!caseOut.has(id)) {
    const C = CASES.find(c => c.id === id), r = extractRequirements(C.text, { counts: C.counts }); r.counts = { ...r.counts, ...C.counts };
    caseOut.set(id, { C, r, out: generateVillaDesigns({ land: { floors: 1, ...C.land }, counts: r.counts, requirements: r, keep: C.want || 4 }) });
  }
  return caseOut.get(id);
};

test('المولّد (C1، C10): كل بديل معروض يجتاز البوابات الثقيلة، وكل زوج «مختلف معماريًا» بالمقياس v2، والنقص مسبَّب', () => {
  for (const id of ['C1', 'C10']) {
    const { C, out } = gen(id);
    for (const d of out.designs) {
      const heavy = d.review.gates.filter(g => HEAVY_GATES.includes(g.id));
      assert.equal(heavy.length, 3, `${id} ${d.pat}`); assert.ok(heavy.every(g => g.ok), `${id} ${d.pat}: ${JSON.stringify(heavy.filter(g => !g.ok))}`);
      assert.ok(openingConsistency(d.doc).ok, `${id} ${d.pat}: فتحة على تقاطع`);
    }
    for (let i = 0; i < out.designs.length; i++) for (let j = i + 1; j < out.designs.length; j++) assert.equal(archDifferenceV2(out.designs[i].doc, out.designs[j].doc).verdict, 'distinct', `${id} ${i + 1}↔${j + 1}`);
    if (out.designs.length < (C.want || 4)) assert.ok(out.shortfall_ar && out.shortfall_ar.length > 40, id);
  }
});

test('المولّد: أبواب دورات مياه الضيوف ≥ 0.8 م والمرحاض خارج منطقة فتحها، ومجلس النساء عرضه الصافي ≥ 4.2 م (افتراضي الميزان)', () => {
  for (const id of ['C1', 'C10']) {
    const { out } = gen(id);
    for (const d of out.designs) {
      const m = analyzeDoc(d.doc), G = m.levels[0];
      for (const op of G.openings.filter(o => o.door && o.sides.some(s => s.room.type === 'bath' && /الضيوف|الرجال|النساء/.test(s.room.name)))) assert.ok(op.w >= 0.8 - 1e-6, `${id} ${d.pat}: ${op.id} ${op.w}`);
      const cp = circulationProof(d.doc, { limits: CIRC_GATE_LIMITS });
      assert.ok(!cp.findings.some(f => ['WC_DOOR_CLASH', 'FURNITURE_AT_DOOR', 'BLOCKED_BY_FURNITURE'].includes(f.code)), `${id} ${d.pat}: ${cp.findings.filter(f => f.severity !== 'info').map(f => f.code)}`);
      for (const r of G.rooms.filter(x => x.type === 'majlis')) assert.ok(Math.min(r.rect.w, r.rect.l) >= 4.2 - 0.06, `${id} ${d.pat} ${r.name} ${r.rect.w}`);
    }
  }
});

test('المجسّم: درابزين فتحة السلم العلوية ينتمي إلى الدور العلوي (عزل الأرضي لا يُظهره معلّقًا)', async () => {
  const THREE = await import('../dist/vendor/three.module.js');
  const { buildBuildingScene } = await import('../dist/draw/scene3d.mjs');
  const j = JSON.parse(readFileSync(new URL('../evidence/acceptance/after-10/C7/alt-1.json', import.meta.url), 'utf8'));
  const built = buildBuildingScene(j.doc || j, THREE, { textures: false });
  try {
    const [g, u] = built.levels, box = o => new THREE.Box3().setFromObject(o);
    const gs = box(g.parts.stairs), us = box(u.parts.stairs);
    // الأرضي: الدرج ودرابزينه الخاص فقط (أعلاه نحو 0.8 م فوق آخر درجة)، لا درابزين الفتحة (0.96 م فوق أرضية العلوي)
    assert.ok(gs.max.y < u.elevation + 0.96 - 0.01, `أرضي ${gs.max.y} علوي ${u.elevation}`);
    assert.ok(!us.isEmpty() && us.max.y >= u.elevation + 0.9, `درابزين العلوي ${us.max.y}`);
    assert.equal(built.stats.openingsDropped, built.stats.openingsDropped); // الحقل موجود
  } finally { built.dispose?.(); }
});

// ---- طلبات طويلة متعارضة: التعارض داخل الطلب الواحد يُسأل عنه (لا يُختار طرف بصمت)، والجواب التالي يحسمه في الطلب نفسه
const CONFLICTING = [
  { id: 'K1', text: LONG.find(x => x.id === 'L4').text, land: { width: 22, length: 30, streets: ['s'], entries: ['s'] }, types: ['place-opposite', 'relation-contradiction'],
    answer: 'خلاص: المطبخ في الخلف، والمجلس بعيد عن المطبخ', after: ['place:kitchen:back', 'far:majlis:kitchen'], gone: ['place:kitchen:front', 'adjacent:majlis:kitchen'] },
  { id: 'K2', text: 'أبي أربع غرف نوم ومجلس وصالة ومطبخ وطعام. المجلس أبيه على يمين الداخل عشان قريب من الشارع، والمطبخ في الخلف. أهلي يقولون المجلس يكون يسار المدخل عشان ما يطل على الجيران، وأنا أشوفه أحسن يمين، شوفوا الأنسب. الماستر بعيدة عن المجلس، وغرف العيال جنب الماستر، ودورات المياه ما تفتح على الطعام.',
    counts: { bedrooms: 4, majlis: 1, kitchens: 1, halls: 1, dining: 1, baths: 5 }, land: { width: 20, length: 30, streets: ['s'], entries: ['s'] }, types: ['place-opposite'],
    answer: 'المجلس على يمين الداخل', after: ['place:majlis:right'], gone: ['place:majlis:left'] },
];
const rk = r => `${r.kind}:${r.a}:${r.side || r.b}`;
for (const K of CONFLICTING) test(`طلب طويل متعارض ${K.id}: يُسأل عن ${K.types.join(' و')}، والجواب يحسمه في الطلب ويرفع السؤال`, async () => {
  const land = { floors: 1, ...K.land }, req = extractRequirements(K.text, { counts: K.counts || {} });
  if (K.counts) req.counts = { ...req.counts, ...K.counts };
  const types = detectConflicts(req, land).map(c => c.type);
  for (const t of K.types) assert.ok(types.includes(t), `${t} ∉ ${types}`);
  const first = await generateInitialDesign({ land, counts: req.counts, requirements: req });
  const s0 = createSession({ land, counts: req.counts, requirements: req, result: first });
  assert.ok(s0.reply?.questions?.length >= K.types.length, 'السؤال مرفق بالتصميم الأول');
  const { session, reply } = await redesign(s0, { text: K.answer });
  const rules = session.input.requirements.rules.map(rk);
  for (const r of K.after) assert.ok(rules.includes(r), `${r} ∉ ${rules}`);
  for (const r of K.gone) assert.ok(!rules.includes(r), `${r} باقٍ: ${rules}`);
  assert.equal((session.conflicts || []).filter(c => K.types.includes(c.type)).length, 0, 'التعارض حُسم');
  assert.ok(reply.resolved?.length >= 1 && /سجّلت اختيارك/.test(reply.summary_ar), JSON.stringify(reply).slice(0, 300));
});
