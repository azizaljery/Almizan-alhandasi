// معايرة مقياس الاختلاف المعماري (dist/arch-difference.mjs) على أدلة القبول، وكتابة مصفوفات البدائل لكل حالة.
//  - الأزواج المعكوسة (كل بديل مع نسخته المعكوسة يمينًا ويسارًا) يجب أن تكون ≈ 0.
//  - مصفوفة كل حالة في «قبل» (المولّد الأول) و«after-4» (المولّد الثاني)، مع المقياس القديم difference() من result.json للمقارنة.
//  - الأزواج «الشكلية فقط» (أقل من عتبة cosmetic) تُرسم جنبًا إلى جنب في evidence/review-proof/arch-*.png (مع --png).
// الاستعمال: node scripts/arch-difference-run.mjs [--png]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { loadBase, mirrorX } from './defect-corpus.mjs';
import { archDifference, archMatrix, WEIGHTS, THRESHOLDS, ARCH_DIFF_VERSION, archMatrixV2, archDifferenceV2, archSignatureV2, explainDifference, SUBSTANTIVE_V2, ARCH_DIFF_V2_VERSION } from '../dist/arch-difference.mjs';

const ROOT = new URL('../', import.meta.url).pathname, OUT = ROOT + 'evidence/review-proof/';
mkdirSync(OUT, { recursive: true });
const r3 = v => Math.round(v * 1000) / 1000;

// --stage <مرحلة>: مصفوفات الاختلاف المعماري لبدائل كل حالة في تلك المرحلة فقط → evidence/acceptance/<مرحلة>/arch-difference.json
// (مع المقياس القديم للمراكز من result.json للمقارنة). بلا هذا العلم: المعايرة كما كانت (قبل وafter-4).
{ const si = process.argv.indexOf('--stage');
  if (si >= 0) {
    const stage = process.argv[si + 1], base = loadBase(stage), cases = {};
    for (const id of [...new Set(base.map(b => b.case))]) {
      const docs = base.filter(b => b.case === id), m = archMatrix(docs.map(d => d.doc));
      const resPath = ROOT + `evidence/acceptance/${stage}/${id}/result.json`, res = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : null, old = res?.diversity || null;
      cases[id] = { files: docs.map(d => d.file), requested: res?.requestedAlternatives ?? null, produced: docs.length, matrix: m.matrix, min: m.min, mean: m.mean,
        pairs: m.pairs.map(p => ({ pair: [p.i + 1, p.j + 1], total: p.total, adjacency: p.adjacency, circulation: p.circulation, zoning: p.zoning, verdict: p.verdict, oldCentroid: old ? old[p.i][p.j] : null })),
        cosmeticPairs: m.cosmeticPairs.map(p => [p.i + 1, p.j + 1]), shortfallReason: res?.shortfallReason || null };
      // (الجولة الحادية عشرة) المقياس الوظيفي v2 الحاكم مع الشرح العربي لكل زوج
      const sg = docs.map(d => archSignatureV2(d.doc)), v2 = [];
      for (let i = 0; i < sg.length; i++) for (let j = i + 1; j < sg.length; j++) { const dd = archDifferenceV2(sg[i], sg[j]); v2.push({ pair: [i + 1, j + 1], verdict: dd.verdict, substantive: dd.substantive, zoning: dd.zoning, circulation: dd.circulation, privacy: dd.privacy, relations: dd.relations, total: dd.total, explanation_ar: explainDifference(dd).text }); }
      cases[id].v2 = { version: ARCH_DIFF_V2_VERSION, thresholds: SUBSTANTIVE_V2, pairs: v2, matrix: sg.map((a, i) => sg.map((b, j) => (i === j ? 0 : v2.find(p => (p.pair[0] === i + 1 && p.pair[1] === j + 1) || (p.pair[0] === j + 1 && p.pair[1] === i + 1)).total))) };
    }
    const all = Object.values(cases).flatMap(c => c.pairs);
    const all2 = Object.values(cases).flatMap(c => c.v2.pairs);
    const summary = { pairs: all.length, cosmetic: all.filter(p => p.verdict === 'cosmetic').length, partial: all.filter(p => p.verdict === 'partial').length, distinct: all.filter(p => p.verdict === 'distinct').length,
      v2: { pairs: all2.length, variant: all2.filter(p => p.verdict === 'variant').length, partial: all2.filter(p => p.verdict === 'partial').length, distinct: all2.filter(p => p.verdict === 'distinct').length } };
    writeFileSync(ROOT + `evidence/acceptance/${stage}/arch-difference.json`, JSON.stringify({ version: ARCH_DIFF_VERSION, weights: WEIGHTS, thresholds: THRESHOLDS, stage, summary, cases }, null, 1));
    console.log(stage, JSON.stringify(summary));
    for (const [id, c] of Object.entries(cases)) console.log(id, `${c.produced}/${c.requested}`, 'v2', c.v2.pairs.map(p => `${p.pair.join('-')}:${p.verdict}(${p.substantive.join('+')})`).join('  '));
    process.exit(0);
  } }

// أحكام بشرية من قراءة المساقط (evidence/acceptance/*/alt-*.png) لأزواج المعايرة: same = نفس التنظيم، diff = تنظيم مختلف
const HUMAN = [
  { stage: 'before', case: 'C4', pair: [1, 2], human: 'same', why: 'المخطط نفسه تمامًا بعمق كلي مختلف قليلًا (26.3 م مقابل 27.45 م)؛ المقياس القديم 0 أيضًا' },
  { stage: 'before', case: 'C6', pair: [2, 3], human: 'same', why: 'نفس التنظيم تمامًا: جناح نوم خلفي بممر، مجلس ومدخل رجال يسارًا، طعام يمينًا؛ بُدّلت الماستر وغرفة 3 وتغيّرت الأبعاد فقط (المقياس القديم 0.09)' },
  { stage: 'before', case: 'C2', pair: [1, 2], human: 'same', why: 'المخطط نفسه معكوسًا بأبعاد مختلفة: صالة-ممر وسطى 3.48 م وجناح نوم على جانب وماستر وكبار السن ومطبخ على الآخر (المقياس القديم 0.05)' },
  { stage: 'after-4', case: 'C1', pair: [1, 3], human: 'same', why: 'عمود خدمة يسار + صالة وسط + جناح نوم يمين بممر طولي؛ بُدّل مجلس الرجال والنساء بين الركنين الأماميين وتحركت الخادمة' },
  { stage: 'after-4', case: 'C2', pair: [1, 2], human: 'same', why: 'عمود مطبخ/طعام/مجلس يسار + صالة وسط + ممر نوم كامل العمق يمين؛ غرفة كبار السن انتقلت من الأمام إلى الخلف ومجلس بممر رجال' },
  { stage: 'after-4', case: 'C8', pair: [2, 4], human: 'same', why: 'شريط نوم خلفي بممر وصالة وسطى في الاثنين؛ تبادل المجلس والخدمة الجانبين في النصف الأمامي (شبه انعكاس للنصف الأمامي)' },
  { stage: 'after-4', case: 'C6', pair: [1, 2], human: 'same', why: 'عمود مطبخ/طعام/مجلس يسار + صالة ومدخل عائلة وسط + جناح نوم بممر طولي يمين في الاثنين؛ تغيّرت الأبعاد ومكان الماستر ومخزن' },
  { stage: 'after-4', case: 'C7', pair: [1, 2], human: 'same', why: 'الدور الأرضي متطابق حرفيًا في البديلين؛ الاختلاف في العلوي فقط (ممر أجنحة عرضي في 1 مقابل غرف تفتح على الصالة العلوية في 2) — ليس تنظيمًا مختلفًا للبيت' },
  { stage: 'after-4', case: 'C8', pair: [1, 3], human: 'diff', why: 'جناح النوم جانبي بطول المبنى في 1 وشريط خلفي عرضي في 3 (الحركة نفسها: مدخل ← صالة ← ممر)' },
  { stage: 'after-4', case: 'C10', pair: [1, 3], human: 'diff', why: 'جناح نوم جانبي شرقي في 1، وشريط نوم خلفي عرضي مع مطبخ أمامي يمين في 3' },
  { stage: 'after-4', case: 'C10', pair: [3, 4], human: 'diff', why: 'شريط النوم الخلفي نفسه، لكن المجلسان متراكبان يسارًا بمدخل جانبي للرجال في 4 مقابل مجلسين في الركنين في 3، والخدمة انتقلت' },
  { stage: 'after-4', case: 'C10', pair: [1, 5], human: 'diff', why: 'جناح جانبي في 1 مقابل كتلة نوم خلفية بعمود ممر مركزي في 5؛ تسلسل الحركة نفسه' },
];

const out = { version: ARCH_DIFF_VERSION, weights: WEIGHTS, thresholds: THRESHOLDS, stages: {}, mirror: {}, human: [] };
for (const stage of ['before', 'after-4']) {
  const base = loadBase(stage);
  const mir = base.map(b => ({ id: `${b.case}/${b.file}`, ...pick(archDifference(b.doc, mirrorX(b.doc))) }));
  out.mirror[stage] = { n: mir.length, max: Math.max(...mir.map(m => m.total)), mean: r3(mir.reduce((s, m) => s + m.total, 0) / mir.length), rows: mir };
  const cases = {};
  for (const id of [...new Set(base.map(b => b.case))]) {
    const docs = base.filter(b => b.case === id), m = archMatrix(docs.map(d => d.doc));
    const resPath = ROOT + `evidence/acceptance/${stage}/${id}/result.json`;
    const old = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')).diversity || null : null;
    cases[id] = { files: docs.map(d => d.file), matrix: m.matrix, oldCentroidDifference: old, min: m.min, mean: m.mean,
      pairs: m.pairs.map(p => ({ pair: [p.i + 1, p.j + 1], total: p.total, adjacency: p.adjacency, circulation: p.circulation, zoning: p.zoning, verdict: p.verdict, oldCentroid: old ? old[p.i][p.j] : null })),
      cosmeticPairs: m.cosmeticPairs.map(p => [p.i + 1, p.j + 1]) };
  }
  out.stages[stage] = cases;
}
for (const h of HUMAN) {
  const p = out.stages[h.stage][h.case].pairs.find(x => x.pair[0] === h.pair[0] && x.pair[1] === h.pair[1]);
  out.human.push({ ...h, total: p.total, verdict: p.verdict, oldCentroid: p.oldCentroid, agrees: h.human === 'same' ? p.verdict === 'cosmetic' : p.verdict !== 'cosmetic' });
}
const all = st => Object.values(out.stages[st]).flatMap(c => c.pairs);
out.summary = Object.fromEntries(['before', 'after-4'].map(st => [st, { pairs: all(st).length, cosmetic: all(st).filter(p => p.verdict === 'cosmetic').length, partial: all(st).filter(p => p.verdict === 'partial').length, distinct: all(st).filter(p => p.verdict === 'distinct').length,
  cosmeticList: Object.entries(out.stages[st]).flatMap(([id, c]) => c.cosmeticPairs.map(p => `${id}: alt-${p[0]} ↔ alt-${p[1]}`)) }]));
out.summary.humanAgreement = `${out.human.filter(h => h.agrees).length}/${out.human.length}`;
writeFileSync(OUT + 'arch-difference.json', JSON.stringify(out, null, 1));
function pick(d) { return { total: d.total, adjacency: d.adjacency, circulation: d.circulation, zoning: d.zoning }; }

console.log('المعكوسات: قبل max', out.mirror.before.max, '| after-4 max', out.mirror['after-4'].max);
for (const st of ['before', 'after-4']) {
  console.log(`\n== ${st}`, JSON.stringify((({ cosmeticList, ...x }) => x)(out.summary[st])));
  for (const [id, c] of Object.entries(out.stages[st])) console.log(id, c.pairs.map(p => `${p.pair.join('-')}:${p.total}${p.verdict === 'cosmetic' ? '*' : ''}(قديم ${p.oldCentroid})`).join('  '));
}
console.log('\nالأحكام البشرية:', out.summary.humanAgreement); for (const h of out.human) console.log(' ', h.agrees ? '✓' : '✗', h.stage, h.case, h.pair.join('-'), h.human, h.total, h.verdict, 'قديم', h.oldCentroid);

if (process.argv.includes('--png')) {
  const { chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 2000, height: 820 } })).newPage();
  const shots = [...out.human.map(h => ({ stage: h.stage, case: h.case, pair: h.pair, note: `حكم بشري: ${h.human === 'same' ? 'نفس التنظيم' : 'تنظيم مختلف'} — ${h.why}` }))];
  for (const s of shots) {
    const p = out.stages[s.stage][s.case].pairs.find(x => x.pair[0] === s.pair[0] && x.pair[1] === s.pair[1]);
    const dir = ROOT + `evidence/acceptance/${s.stage}/${s.case}/`;
    const pngs = n => (existsSync(dir + `alt-${n}.png`) ? [`alt-${n}.png`] : [`alt-${n}-L1.png`, `alt-${n}-L2.png`].filter(f => existsSync(dir + f)));
    const img = n => pngs(n).map(f => `<img src="data:image/png;base64,${readFileSync(dir + f).toString('base64')}">`).join('');
    const VER = { cosmetic: 'نفس التنظيم (شكلي)', partial: 'اختلاف جزئي', distinct: 'مختلف معماريًا' };
    await page.setContent(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{margin:0;font-family:Tahoma;background:#fff}h1{font-size:24px;margin:10px 16px 2px}p{margin:2px 16px;font-size:16px;color:#444}.r{display:flex;gap:8px;padding:6px}img{width:992px;display:block}.b{color:${p.verdict === 'cosmetic' ? '#a3161c' : '#1f6b3a'}}</style></head><body>
<h1>${s.stage} / ${s.case}: alt-${s.pair[0]} ↔ alt-${s.pair[1]} — <span class="b">${VER[p.verdict]} (${p.total})</span></h1>
<p>التجاور ${p.adjacency} · الحركة ${p.circulation} · النطاقات ${p.zoning} · المقياس القديم (مراكز الغرف بالاسم) ${p.oldCentroid ?? '—'}</p><p>${s.note}</p>
<div class="r"><div>${img(s.pair[0])}</div><div>${img(s.pair[1])}</div></div></body></html>`);
    await page.screenshot({ path: OUT + `arch-${s.stage}-${s.case}-alt${s.pair[0]}-alt${s.pair[1]}.png`, fullPage: true });
  }
  await b.close();
  console.log('صور المقارنة:', shots.length);
}
