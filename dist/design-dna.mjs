// بصمة التصميم (Design DNA) وبصمة الهندسة.
//  - بصمة التصميم: ثمانية محاور تُشتق من إجابات العميل فقط، وكل محور يحمل سبب اشتقاقه أو يوسَم «افتراضي».
//  - تتحول المحاور إلى أوزان لمقاييس التقييم في محرك القرار (home-design-engine)، فيُقيَّم كل بديل بميزان العميل.
//  - بصمة الهندسة: بصمة قصيرة ثابتة لهندسة المستند (جدران وفتحات)، تتغير إذا تغيّر الرسم، لإثبات ما بقي وما تغيّر.
// لا يغيّر هذا الملف اختيار AZIZ. يعرض ترتيبًا مقابلًا بحسب البصمة، والقرار للعميل.
import { createEngineeringProject, modelToEngineeringDesign } from './home-design-engine.mjs';
import { evaluateDesign, DEFAULT_METRIC_WEIGHTS } from './mizan-home-design-engine.mjs';

export const DNA_AXES = Object.freeze([
  { id: 'privacy', label: 'الخصوصية' },
  { id: 'hospitality', label: 'الضيافة' },
  { id: 'family', label: 'العائلة' },
  { id: 'accessibility', label: 'سهولة الحركة' },
  { id: 'futureExpansion', label: 'التوسع المستقبلي' },
  { id: 'gardens', label: 'الحدائق' },
  { id: 'openness', label: 'الانفتاح' },
  { id: 'budgetSensitivity', label: 'الميزانية' },
]);

/** أي مقياس تقييم يتأثر بأي محور. المقاييس التي يرجعها المحرك «غير مُقيَّسة» لا تؤثر في الدرجة وتُعلَن كذلك. */
export const DNA_TO_METRICS = Object.freeze({
  privacy: ['privacy', 'acousticSeparation'],
  hospitality: ['functionalAdjacency'],
  family: ['functionalAdjacency'],
  accessibility: ['circulation'],
  futureExpansion: ['futureExpansion'],
  gardens: ['daylight', 'ventilation'],
  openness: ['daylight', 'solarOrientation'],
  budgetSensitivity: ['costEfficiency', 'wasteControl', 'spaceEfficiency'],
});

const clamp01 = v => Math.min(1, Math.max(0, Number(v) || 0));

/**
 * يبني البصمة من الإجابات. القيم الافتراضية معلنة ولا تُنسب للعميل.
 * @returns {{ values: Record<string, number>, sources: Record<string, string[]>, defaults: string[] }}
 */
export function buildDNA({ plot, rooms = [], discovery = {}, idea = '', counts = {} } = {}) {
  const project = createEngineeringProject({ plot, rooms, discovery, idea });
  const values = Object.fromEntries(DNA_AXES.map(a => [a.id, clamp01(project.designDNA?.[a.id])]));
  const base = { ...values };
  const sources = Object.fromEntries(DNA_AXES.map(a => [a.id, []]));
  const set = (axis, value, why) => { values[axis] = clamp01(value); sources[axis].push(why); };
  const life = discovery.life || {}, avoids = discovery.avoids || [];

  if (life.guests === 'متكررة') set('hospitality', 0.9, 'الضيوف: متكررة');
  else if (life.guests === 'قليلة') set('hospitality', 0.45, 'الضيوف: قليلة');
  if (counts.majlis >= 2) set('hospitality', Math.max(values.hospitality, 0.8), `عدد المجالس ${counts.majlis}`);
  if (life.children === 'قريبون من الصالة') set('family', 0.9, 'الأطفال: قريبون من الصالة');
  else if (life.children === 'جناح هادئ') { set('family', 0.75, 'الأطفال: جناح هادئ'); set('privacy', Math.max(values.privacy, 0.85), 'الأطفال: جناح هادئ'); }
  if (life.seniors === 'موجودون') set('accessibility', 0.95, 'كبار السن: موجودون');
  else if (life.seniors === 'غير موجودين') set('accessibility', 0.45, 'كبار السن: غير موجودين');
  if (life.future === 'مهمة') set('futureExpansion', 0.9, 'التوسع المستقبلي: مهم');
  else if (life.future === 'ليست أولوية') set('futureExpansion', 0.25, 'التوسع المستقبلي: ليس أولوية');
  if (avoids.includes('غرف نوم مكشوفة أو قريبة من الضيافة')) set('privacy', Math.max(values.privacy, 0.95), 'تجنّب: غرف نوم مكشوفة أو قريبة من الضيافة');
  if (avoids.includes('مرور الضيوف عبر خصوصية العائلة')) set('privacy', Math.max(values.privacy, 0.9), 'تجنّب: مرور الضيوف عبر خصوصية العائلة');
  if (avoids.includes('الممرات الطويلة والمظلمة')) set('accessibility', Math.max(values.accessibility, 0.8), 'تجنّب: الممرات الطويلة والمظلمة');
  if (discovery.likes?.includes('courtyard_privacy')) set('privacy', Math.max(values.privacy, 0.85), 'تفضيل: فناء يحفظ الخصوصية');
  const noCourt = /بدون\s+فناء|من\s+غير\s+فناء|بلا\s+فناء/.test(String(idea));
  if (noCourt) set('openness', Math.min(values.openness, 0.3), 'نص العميل: بدون فناء');

  const defaults = DNA_AXES.filter(a => !sources[a.id].length).map(a => a.id);
  for (const a of DNA_AXES) if (!sources[a.id].length) sources[a.id].push('افتراضي (لم تُذكر في إجاباتك)');
  void base;
  return { values, sources, defaults };
}

/** يحوّل البصمة إلى أوزان المقاييس: وزن المقياس الأساسي × (0.6 + 0.8×قيمة المحور)، ثم تطبيع المجموع إلى 1. */
export function weightsFromDNA(dna) {
  const factor = Object.fromEntries(Object.keys(DEFAULT_METRIC_WEIGHTS).map(k => [k, []]));
  for (const [axis, metrics] of Object.entries(DNA_TO_METRICS)) for (const m of metrics) if (factor[m]) factor[m].push(0.6 + 0.8 * clamp01(dna[axis]));
  const raw = Object.fromEntries(Object.entries(DEFAULT_METRIC_WEIGHTS).map(([k, w]) => [k, w * (factor[k].length ? factor[k].reduce((a, b) => a + b, 0) / factor[k].length : 1)]));
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum]));
}

/** يقيّم كل بديل بميزان العميل ويقارنه بالميزان الافتراضي. لا يلمس البدائل. */
export function rankByDNA({ plot, rooms, discovery, idea = '', counts = {}, models = [], selectedIndex = 0 }) {
  const dna = buildDNA({ plot, rooms, discovery, idea, counts });
  const project = createEngineeringProject({ plot, rooms, discovery, idea });
  project.designDNA = { ...project.designDNA, ...dna.values };
  const weights = weightsFromDNA(dna.values);
  const rows = models.map((model, index) => {
    const design = modelToEngineeringDesign(model, `alt-${index}`);
    const mine = evaluateDesign(project, design, { weights });
    const neutral = evaluateDesign(project, design, { weights: DEFAULT_METRIC_WEIGHTS });
    return { index, strategy: model.strategy || `alt-${index}`, score: mine.score, neutralScore: neutral.score, metrics: mine.metrics, blockers: mine.blockers.map(b => b.message) };
  });
  const scored = rows.filter(r => r.score !== null);
  const best = scored.reduce((w, r) => (!w || r.score > w.score ? r : w), null);
  const measured = new Set(Object.entries(rows[0]?.metrics || {}).filter(([, v]) => v !== null).map(([k]) => k));
  const axes = DNA_AXES.map(a => ({ ...a, value: dna.values[a.id], sources: dna.sources[a.id], measured: DNA_TO_METRICS[a.id].some(m => measured.has(m)) }));
  return { dna: { values: dna.values, sources: dna.sources, defaults: dna.defaults, axes }, weights, rows, selectedIndex, bestIndex: best ? best.index : null, fingerprint: fingerprint({ axes: dna.values }) };
}

/** FNV-1a 64 بت (BigInt) → 16 خانة. ثابتة بين المتصفح وNode بلا مكتبات. */
export function fingerprint(value) {
  const text = canonical(value); let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) { h ^= BigInt(text.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, '0');
}
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
  return JSON.stringify(v);
}

/**
 * بصمة هندسة المستند: الجدران والفتحات والغرف المسمّاة فقط (إحداثيات مقرّبة إلى مليمتر)، دون العنوان أو المظهر.
 * ترتيب العناصر لا يؤثر. تتغير إذا تحرك جدار أو أُضيفت فتحة أو غُيّر موضعها.
 */
export function geometryFingerprint(doc) {
  const r = n => Math.round(Number(n) * 1000) / 1000;
  const pt = p => (p ? [r(p.x), r(p.y)] : null);
  const byId = new Map((doc.walls || []).map(w => [w.id, w]));
  const wall = w => { const [p, q] = [pt(w.a), pt(w.b)].sort((x, y) => x[0] - y[0] || x[1] - y[1]); return [w.level || '', p, q, r(w.t ?? 0)]; };
  const walls = (doc.walls || []).map(w => JSON.stringify(wall(w))).sort();
  const openings = (doc.openings || []).map(o => { const host = byId.get(o.wall); return JSON.stringify([o.level || '', o.kind || '', host ? wall(host) : null, r(o.at ?? 0), r(o.w ?? 0), !!o.entry]); }).sort();
  const labels = (doc.labels || []).map(l => JSON.stringify([l.level || '', l.type || '', l.name || '', pt(l.seed)])).sort();
  return fingerprint({ n: [walls.length, openings.length, labels.length], walls, openings, labels });
}
