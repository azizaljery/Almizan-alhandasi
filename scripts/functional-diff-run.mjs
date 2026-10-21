// معايرة مقياس الاختلاف الوظيفي v2 (dist/arch-difference.mjs: archDifferenceV2) على أدلة القبول after-6..after-9.
//  - الأحكام البشرية (HUMAN_V2) كُتبت من قراءة المساقط evidence/acceptance/<مرحلة>/<حالة>/alt-*.png قبل النظر في أرقام v2.
//      same    = نسخة معدّلة من التنظيم نفسه (انعكاس، موضع سلم، غلاف، أبعاد، تبديل غرفتين)
//      partial = يتغير بُعد واحد فقط من الأربعة (مثلًا جناح النوم وحده، أو علاقة المجلس بالطعام وحدها)
//      diff    = حل معماري آخر: يختلف توزيع الوظائف والحركة/الخصوصية/العلاقات معًا
//  - الأزواج المعكوسة (كل بديل مع نسخته المعكوسة) والممطوطة (تمديد الغلاف 25% عرضًا) يجب أن تكون ≈ 0.
//  - --grid: بحث شبكي عن عتبات الأبعاد الأربعة (للتقرير فقط؛ العتبات المعتمدة في SUBSTANTIVE_V2).
// الاستعمال: node scripts/functional-diff-run.mjs [--grid] [--no-write]
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadBase, mirrorX } from './defect-corpus.mjs';
import { archSignatureV2, archDifferenceV2, archMatrixV2, explainDifference, archDifference, verdictV2, SUBSTANTIVE_V2, WEIGHTS_V2, FLOOR_WEIGHTS_V2, DIMENSIONS_V2, ARCH_DIFF_V2_VERSION } from '../dist/arch-difference.mjs';

const ROOT = new URL('../', import.meta.url).pathname, OUT = ROOT + 'evidence/review-proof/';
const STAGES = ['after-6', 'after-7', 'after-8', 'after-9'];
const r3 = v => Math.round(v * 1000) / 1000;

/** أحكام بشرية من المساقط (انظر رأس الملف). why: سبب الحكم كما يُرى في الرسم. */
export const HUMAN_V2 = [
  // ---------------- after-9
  { stage: 'after-9', case: 'C1', pair: [1, 2], human: 'diff', why: 'صالة مركزية موزِّعة وغرف النوم على جانبيها والخدمة شريط خلفي في 1، مقابل شكل U: عمود خدمة يسار وجناح نوم يمين بممر طولي ومجلس رجال بمدخل خاص في 2' },
  { stage: 'after-9', case: 'C3', pair: [1, 2], human: 'diff', why: 'جناح نوم يسار كامل العمق بممر في 1، مقابل صالة موزِّعة مباشرة على غرف النوم وشريط مجلسين أمامي في 2؛ والمطبخ يخدم مجلس الرجال مباشرة في 1 فقط' },
  { stage: 'after-9', case: 'C3', pair: [1, 3], human: 'diff', why: 'شكل U في 3 يفصل الرئيسية (عمود يسار مع الخدمة) عن غرف الأبناء (جناح يمين بممر)، مقابل جناح نوم واحد في 1' },
  { stage: 'after-9', case: 'C3', pair: [2, 3], human: 'diff', why: 'صالة موزِّعة في 2 مقابل ممرين وجناحين منفصلين في 3، والخدمة انتقلت إلى عمود جانبي مع مجلس النساء' },
  { stage: 'after-9', case: 'C4', pair: [1, 2], human: 'partial', why: 'الثلثان الأماميان متطابقان (مجلس ومدخلان، صالة مع مطبخ وطعام)؛ الاختلاف في جناح النوم وحده: ممر وسطي بغرف على جانبيه مقابل جناح منفصل برواق وممر جانبي' },
  { stage: 'after-9', case: 'C5', pair: [1, 2], human: 'diff', why: 'ثلاثة أشرطة (ضيافة/معيشة/نوم) بممر خلفي عرضي في 1، مقابل حوش داخلي وعمود خدمة وجناح أبناء جانبي على الصالة والرئيسية خلف الحوش في 2' },
  { stage: 'after-9', case: 'C5', pair: [1, 3], human: 'diff', why: 'أشرطة عرضية في 1 مقابل أعمدة طولية في 3 (خدمة | معيشة | مجلس + جناح نوم بممر طولي)، والمجلس صار ملاصقًا لجناح النوم' },
  { stage: 'after-9', case: 'C5', pair: [1, 4], human: 'diff', why: 'شريط النوم الخلفي واحد، لكن المجلس انتقل من الأمام إلى الوسط بمدخل جانبي، والخدمة من يسار الوسط إلى عمود يمين أمامي، وانقطعت صلة المجلس بالطعام' },
  { stage: 'after-9', case: 'C5', pair: [2, 3], human: 'diff', why: 'حوش وجناح أبناء على الصالة مع رئيسية منفصلة في 2، مقابل جناح نوم واحد بممر طولي ومجلس بجانبه في 3' },
  { stage: 'after-9', case: 'C5', pair: [2, 4], human: 'diff', why: 'حوش وجناح جانبي في 2، مقابل شريط نوم خلفي بممر عرضي ومجلس بمدخل جانبي وخدمة يمين في 4' },
  { stage: 'after-9', case: 'C5', pair: [3, 4], human: 'partial', why: 'كتلة النوم جناح طولي جانبي في 3 وشريط خلفي عرضي في 4، والمجلس انتقل من الأمام إلى الوسط بمدخل جانبي؛ لكن الحركة واحدة (صالة ← ممر محوري ← الغرف)، والخدمة عمود جانبي بجوار الصالة، والعلاقات نفسها — يتغير توزيع الوظائف وحده (حكم مراجَع بقائمة الأبعاد الأربعة بعد أن كان «مختلف» بالانطباع العام)' },
  { stage: 'after-9', case: 'C6', pair: [1, 2], human: 'same', why: 'الخدمة عمود يسار، وجناح النوم يمين بممر طولي، والمجلس أمام يمين، والصالة وسط في الاثنين؛ تغيّر الغلاف (رقبة ضيقة) وانتقل الطعام للخلف وسقط مدخل الرجال' },
  { stage: 'after-9', case: 'C6', pair: [1, 3], human: 'partial', why: 'الهيكل نفسه (خدمة يسار، جناح نوم يمين بممر، صالة وسط)؛ تغيّر موضع المجلس فقط: من أمام جهة النوم بمدخل رجال إلى وسط جهة الخدمة بمدخل جانبي' },
  { stage: 'after-9', case: 'C6', pair: [2, 3], human: 'partial', why: 'الهيكل نفسه؛ المجلس انتقل إلى جهة الخدمة بمدخل جانبي والمطبخ والطعام عمود كامل' },
  { stage: 'after-9', case: 'C7', pair: [1, 2], human: 'same', why: 'دوران؛ الأرضي: 2 هو 1 معكوسًا (مجلس ومعه كبار السن في جهة، مطبخ وطعام في الأخرى، صالة خلف المدخل) مع نقل السلم من الركن الخلفي إلى ما بين المدخل والصالة وممر قصير لكبار السن؛ العلوي صالة علوية موزِّعة في الاثنين' },
  { stage: 'after-9', case: 'C7', pair: [1, 3], human: 'partial', why: 'الترتيب نفسه تقريبًا (ضيافة أمام، صالة خلف وسط، كبار السن خلف على الصالة، علوي بصالة موزِّعة)، مع غلاف L وسلم جانبي؛ الجديد الحقيقي الوحيد: باب بين المجلس والطعام والمطبخ إلى الخلف' },
  { stage: 'after-9', case: 'C7', pair: [2, 3], human: 'partial', why: 'كالسابق: موضع السلم والغلاف تغيّرا، والجديد الحقيقي صلة المجلس بالطعام ووصول كبار السن من الصالة مباشرة بدل الممر' },
  { stage: 'after-9', case: 'C8', pair: [1, 2], human: 'partial', why: 'الحوش وعمود الخدمة والمجلس كما هي؛ تغيّر تنظيم النوم وحده: أبناء في جناح جانبي على الصالة مقابل شريط خلفي بممر عرضي مع الرئيسية' },
  { stage: 'after-9', case: 'C8', pair: [1, 3], human: 'diff', why: 'حوش وجناح جانبي في 1 مقابل L بلا حوش: خدمة يسار، ومجلس بمدخل رجال أمام يمين، وجناح نوم طولي بممر في 3' },
  { stage: 'after-9', case: 'C8', pair: [1, 4], human: 'diff', why: 'حوش وجناح جانبي في 1 مقابل شريط نوم خلفي ومجلس بمدخل جانبي وخدمة يمين في 4' },
  { stage: 'after-9', case: 'C8', pair: [2, 3], human: 'diff', why: 'حوش وشريط نوم خلفي في 2 مقابل جناح نوم طولي ومجلس بجهة النوم في 3' },
  { stage: 'after-9', case: 'C8', pair: [2, 4], human: 'diff', why: 'شريط النوم الخلفي مشترك، لكن الخدمة انتقلت من جهة المجلس إلى الجهة المقابلة، وسقط الحوش، والمجلس صار بمدخل جانبي' },
  { stage: 'after-9', case: 'C8', pair: [3, 4], human: 'partial', why: 'النمط نفسه في C5 3–4: جناح طولي جانبي ومجلس أمامي بمدخل رجال في 3، مقابل شريط خلفي عرضي ومجلس وسط بمدخل جانبي في 4؛ الحركة (ممر محوري من الصالة) والعلاقات واحدة — يتغير التوزيع وحده (حكم مراجَع كسابقه)' },
  { stage: 'after-9', case: 'C9', pair: [1, 2], human: 'diff', why: 'أشرطة عرضية بممر نوم خلفي في 1 مقابل U: عمود خدمة ومجلس يسار وجناح نوم يمين بممر طولي في 2' },
  { stage: 'after-9', case: 'C9', pair: [1, 3], human: 'diff', why: 'أشرطة عرضية في 1 مقابل L: خدمة يسار، ومجلس بمدخل رجال وجناح نوم طولي يمين في 3' },
  { stage: 'after-9', case: 'C9', pair: [1, 4], human: 'diff', why: 'شريط نوم خلفي واحد في 1 مقابل جناحين منفصلين (الأبناء يسار مع المجلس، الرئيسية يمين مع الخدمة) في 4' },
  { stage: 'after-9', case: 'C9', pair: [2, 3], human: 'partial', why: 'الهيكل نفسه (خدمة يسار، جناح نوم يمين بممر، صالة وسط)؛ المجلس فقط انتقل من جهة الخدمة إلى جهة النوم بمدخل رجال' },
  { stage: 'after-9', case: 'C9', pair: [2, 4], human: 'diff', why: 'جناح نوم واحد في 2 مقابل رئيسية منفصلة عن الأبناء بممرين، والخدمة انتقلت إلى جهة الرئيسية في 4' },
  { stage: 'after-9', case: 'C9', pair: [3, 4], human: 'diff', why: 'جناح نوم واحد ومجلس بجهته في 3 مقابل جناحين منفصلين والمجلس مع الأبناء والخدمة مع الرئيسية في 4' },
  { stage: 'after-9', case: 'C10', pair: [1, 2], human: 'diff', why: 'صالة موزِّعة وخدمة شريط خلفي ومجلسان في الركنين في 1، مقابل حوش وعمود خدمة وشريط نوم خلفي بممر في 2' },
  { stage: 'after-9', case: 'C10', pair: [1, 3], human: 'diff', why: 'صالة موزِّعة في 1 مقابل U: عمود خدمة مع مجلس النساء، وجناح نوم بممر طولي مع مجلس الرجال في 3' },
  { stage: 'after-9', case: 'C10', pair: [1, 4], human: 'diff', why: 'صالة موزِّعة في 1 مقابل جناح نوم منفصل خلفي يوصل إليه رواق، والمطبخ يخدم مجلس الرجال في 4' },
  { stage: 'after-9', case: 'C10', pair: [1, 5], human: 'diff', why: 'صالة موزِّعة في 1 مقابل شريط نوم خلفي، والمجلسان متراكبان يسارًا بمدخل جانبي للرجال، والخدمة عمود يمين في 5' },
  { stage: 'after-9', case: 'C10', pair: [2, 3], human: 'diff', why: 'حوش وشريط نوم خلفي في 2 مقابل جناح نوم طولي بلا حوش في 3' },
  { stage: 'after-9', case: 'C10', pair: [2, 4], human: 'diff', why: 'شريط النوم الخلفي مشترك، لكن الخدمة انتقلت من جهة مجلس النساء إلى جهة مجلس الرجال (يخدمه المطبخ)، والحوش صار رواقًا' },
  { stage: 'after-9', case: 'C10', pair: [2, 5], human: 'diff', why: 'شريط النوم الخلفي مشترك، لكن المجلسين اجتمعا يسارًا ومدخل الرجال جانبي، والخدمة عمود يمين، وسقط الحوش' },
  { stage: 'after-9', case: 'C10', pair: [3, 4], human: 'diff', why: 'جناح نوم طولي جانبي في 3 مقابل جناح خلفي منفصل برواق في 4، والخدمة انتقلت إلى جهة مجلس الرجال' },
  { stage: 'after-9', case: 'C10', pair: [3, 5], human: 'diff', why: 'جناح نوم طولي في 3 مقابل شريط نوم خلفي ومجلسين متراكبين في 5' },
  { stage: 'after-9', case: 'C10', pair: [4, 5], human: 'partial', why: 'شريط النوم الخلفي والصالة الوسطى والخدمة يمين في الاثنين؛ يتغير ترتيب الضيافة فقط (مجلسان في الركنين بمدخل رجال أمامي مقابل متراكبين يسارًا بمدخل جانبي)' },
  // ---------------- after-6
  { stage: 'after-6', case: 'C2', pair: [1, 2], human: 'diff', why: 'حوش طولي بممرين حوله (حلقة) والرئيسية خلف يسار وكبار السن خلف يمين في 1، مقابل L: جناح نوم بممر واحد ومجلس بمدخل رجال وكبار السن أمام يسار في 2' },
  { stage: 'after-6', case: 'C4', pair: [1, 2], human: 'partial', why: 'كالجولة التاسعة: الثلثان الأماميان متطابقان، وجناح النوم وحده تغيّر (ممر وسطي مقابل جناح منفصل برواق)' },
  { stage: 'after-6', case: 'C7', pair: [1, 2], human: 'partial', why: 'العلوي متطابق النوع (صالة علوية وغرف حولها والسلم وسط)؛ الأرضي مختلف: المطبخ والطعام والصالة صف خلفي متصل في 2 مقابل عمود جانبي في 1، وكبار السن من بسطة السلم أمامًا مقابل ممر خلفي، ومدخل رجال' },
];

const human = (verdict, h) => (h === 'same' ? verdict === 'variant' : h === 'partial' ? verdict === 'partial' : verdict === 'distinct');
const lenient = (verdict, h) => (h === 'same' ? verdict !== 'distinct' : h === 'diff' ? verdict !== 'variant' : true);

/** تمديد الغلاف عرضيًا بنسبة k (الجدران والتسميات والسلالم والأثاث، ومواضع الفتحات على الجدران الأفقية). */
export function stretchX(doc, k = 1.25) {
  const d = JSON.parse(JSON.stringify(doc)), sx = p => p && { ...p, x: r3(p.x * k) };
  const horiz = new Set(d.walls.filter(w => Math.abs(w.a.y - w.b.y) < 1e-6).map(w => w.id));
  for (const w of d.walls) { w.a = sx(w.a); w.b = sx(w.b); }
  for (const o of d.openings) if (horiz.has(o.wall)) o.at = r3(o.at * k);
  for (const l of d.labels) l.seed = sx(l.seed);
  for (const f of d.fixtures) f.x = r3(f.x * k);
  for (const s of d.stairs) s.x = r3(s.x * k);
  for (const c of d.columns || []) c.x = r3(c.x * k);
  d.dimensions = [];
  d.plot.polygon = d.plot.polygon.map(sx);
  return d;
}

const data = {}, sigs = {};
for (const st of STAGES) {
  const base = loadBase(st);
  data[st] = base; sigs[st] = new Map(base.map(b => [`${b.case}/${b.file}`, archSignatureV2(b.doc)]));
}
const sigOf = (st, c, n) => sigs[st].get(`${c}/alt-${n}.json`);
const docOf = (st, c, n) => data[st].find(b => b.case === c && b.file === `alt-${n}.json`).doc;

// --- الثوابت: الانعكاس والتمديد
const invariance = { mirror: [], stretch: [] };
for (const b of data['after-9']) {
  const s = sigs['after-9'].get(`${b.case}/${b.file}`);
  invariance.mirror.push({ id: `${b.case}/${b.file}`, total: archDifferenceV2(s, archSignatureV2(mirrorX(b.doc))).total });
  invariance.stretch.push({ id: `${b.case}/${b.file}`, total: archDifferenceV2(s, archSignatureV2(stretchX(b.doc))).total });
}
const mx = a => Math.max(...a.map(x => x.total));

// --- المصفوفات لكل مرحلة
const stages = {};
for (const st of STAGES) {
  const cases = {};
  for (const id of [...new Set(data[st].map(b => b.case))]) {
    const docs = data[st].filter(b => b.case === id);
    if (docs.length < 2) { cases[id] = { produced: docs.length, pairs: [] }; continue; }
    const m = archMatrixV2(docs.map(d => sigs[st].get(`${d.case}/${d.file}`)));
    cases[id] = { produced: docs.length, pairs: m.pairs.map(p => {
      const a = docs[p.i].doc, b = docs[p.j].doc, v1 = archDifference(a, b), h = HUMAN_V2.find(x => x.stage === st && x.case === id && x.pair[0] === p.i + 1 && x.pair[1] === p.j + 1);
      const ex = explainDifference(archDifferenceV2(sigs[st].get(`${id}/${docs[p.i].file}`), sigs[st].get(`${id}/${docs[p.j].file}`)));
      return { pair: [p.i + 1, p.j + 1], total: p.total, zoning: p.zoning, circulation: p.circulation, privacy: p.privacy, relations: p.relations, substantive: p.substantive, verdict: p.verdict, v1: { total: v1.total, verdict: v1.verdict }, human: h?.human || null, why: h?.why || null, explain: ex.sentences, ignored: ex.ignored };
    }) };
  }
  // من يبقى تحت شرط المالك: بالترتيب، يُقبل البديل فقط إن كان «مختلفًا معماريًا» (بعدان جوهريان) عن كل بديل قُبل قبله
  for (const c of Object.values(cases)) {
    if (!c.produced) continue;
    const kept = [1], rejected = [];
    for (let n = 2; n <= c.produced; n++) {
      const against = kept.map(k => c.pairs.find(p => p.pair[0] === k && p.pair[1] === n)).filter(p => p.verdict !== 'distinct');
      if (against.length) rejected.push({ alt: n, against: against.map(p => ({ alt: p.pair[0], verdict: p.verdict, substantive: p.substantive })) }); else kept.push(n);
    }
    c.underV2 = { kept, rejected };
  }
  const all = Object.values(cases).flatMap(c => c.pairs);
  stages[st] = { cases, summary: { pairs: all.length, variant: all.filter(p => p.verdict === 'variant').length, partial: all.filter(p => p.verdict === 'partial').length, distinct: all.filter(p => p.verdict === 'distinct').length } };
}

// --- الاتفاق مع الأحكام البشرية
const rows = HUMAN_V2.map(h => {
  const p = stages[h.stage].cases[h.case].pairs.find(x => x.pair[0] === h.pair[0] && x.pair[1] === h.pair[1]);
  return { ...h, total: p.total, dims: { zoning: p.zoning, circulation: p.circulation, privacy: p.privacy, relations: p.relations }, verdict: p.verdict, strict: human(p.verdict, h.human), lenient: lenient(p.verdict, h.human), v1: p.v1 };
});
const agreement = { strict: `${rows.filter(r => r.strict).length}/${rows.length}`, lenient: `${rows.filter(r => r.lenient).length}/${rows.length}`,
  v1: `${rows.filter(r => (r.human === 'same' ? r.v1.verdict === 'cosmetic' : r.human === 'partial' ? r.v1.verdict === 'partial' : r.v1.verdict === 'distinct')).length}/${rows.length}` };

// --- بحث شبكي اختياري عن العتبات
let grid = null;
if (process.argv.includes('--grid')) {
  const vals = [0.1, 0.125, 0.15, 0.175, 0.2, 0.225, 0.25, 0.275, 0.3, 0.35];
  const res = [];
  for (const z of vals) for (const c of vals) for (const p of vals) for (const r of vals) {
    const T = { zoning: z, circulation: c, privacy: p, relations: r };
    const ok = rows.filter(x => human(verdictV2(x.dims, T).verdict, x.human)).length;
    res.push({ T, ok });
  }
  // الترتيب: الأكثر اتفاقًا، ثم الأقرب إلى العتبات القبلية (0.25/0.25/0.2/0.2) — لا نختار عتبة شاذة لمجرد تساوي النتيجة
  const PRIOR = { zoning: 0.25, circulation: 0.25, privacy: 0.2, relations: 0.2 }, dist = T => Math.hypot(...DIMENSIONS_V2.map(k => T[k] - PRIOR[k]));
  const pick = rs => [...rs].sort((a, b) => b.ok - a.ok || dist(a.T) - dist(b.T))[0];
  res.sort((a, b) => b.ok - a.ok || dist(a.T) - dist(b.T));
  // تحقق «اترك واحدًا»: لكل زوج تُختار العتبات على الأزواج الأخرى ثم يُحكم عليه — تقدير صادق لا يرى الزوج المحكوم
  let loo = 0;
  for (let h = 0; h < rows.length; h++) {
    const rs = res.map(({ T }) => ({ T, ok: rows.filter((x, i) => i !== h && human(verdictV2(x.dims, T).verdict, x.human)).length }));
    if (human(verdictV2(rows[h].dims, pick(rs).T).verdict, rows[h].human)) loo++;
  }
  grid = { best: res[0].ok, of: rows.length, top: res.slice(0, 12), chosenScore: rows.filter(r => r.strict).length, leaveOneOut: `${loo}/${rows.length}` };
}

const out = { version: ARCH_DIFF_V2_VERSION, weights: WEIGHTS_V2, substantive: SUBSTANTIVE_V2, floorWeights: FLOOR_WEIGHTS_V2, dimensions: DIMENSIONS_V2,
  invariance: { mirrorMax: mx(invariance.mirror), stretchMax: mx(invariance.stretch), rows: invariance }, agreement, human: rows, grid, stages };
if (!process.argv.includes('--no-write')) { mkdirSync(OUT, { recursive: true }); writeFileSync(OUT + 'functional-difference-r9.json', JSON.stringify(out, null, 1)); }

console.log('الانعكاس max', out.invariance.mirrorMax, '| التمديد 25% max', out.invariance.stretchMax);
console.log('الاتفاق مع الأحكام البشرية: صارم', agreement.strict, '| متساهل', agreement.lenient, '| v1 (بالمستويات الثلاثة)', agreement.v1);
for (const r of rows) console.log(r.strict ? '✓' : r.lenient ? '~' : '✗', r.stage, r.case, r.pair.join('-'), 'بشري', r.human, '| v2', r.verdict, JSON.stringify(r.dims), '| v1', r.v1.total, r.v1.verdict);
for (const st of STAGES) {
  console.log(`\n== ${st}`, JSON.stringify(stages[st].summary));
  for (const [id, c] of Object.entries(stages[st].cases)) if (c.pairs.length) console.log(id, c.pairs.map(p => `${p.pair.join('-')}:${p.verdict[0]}[${p.substantive.map(k => k[0]).join('')}]`).join('  '), '| يبقى', c.underV2.kept.join(','), c.underV2.rejected.length ? '| يُرفض ' + c.underV2.rejected.map(r => `${r.alt}(${r.against.map(a => a.alt + ':' + a.verdict[0]).join(',')})`).join(' ') : '');
}
if (grid) { console.log('\nبحث العتبات: الأفضل', grid.best, '/', grid.of, '| المعتمد', grid.chosenScore, '| اترك-واحدًا', grid.leaveOneOut); for (const t of grid.top) console.log(' ', t.ok, JSON.stringify(t.T)); }
