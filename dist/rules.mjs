// قواعد العميل المكانية من كلامه: مواضع الفراغات (أمام/خلف/على الشارع/جهات الشمال والجنوب والشرق والغرب)،
// والعلاقات (بجانب/قريب من/بعيد عن)، والدور (الأرضي/العلوي)، وعدم الوجود («بدون مجلس»).
// ثلاث وظائف: extractRules (نص مطبَّع ← قواعد)، rulePenalty (تقييم في الإطار القانوني للمولّد)،
// verifyRules (تحقق هندسي من المستند الناتج: نُفّذ/لم يُنفَّذ مع السبب). نقي: لا DOM ولا شبكة.
import { analyzeDoc } from './draw/digest.mjs';

const AR = '\\u0600-\\u06FF';
const PRE = `(?<![${AR}])(?:[وفبك]?(?:ال|لل)|[وفبكل])?`; // أدوات ملتصقة: و، ب، ل، ال، بال، لل...
const END = `(?![${AR}])`;

/** الفراغات التي يمكن الإشارة إليها في الكلام. */
export const SUBJECTS = Object.freeze([
  { id: 'majlis_w', ar: 'مجلس النساء', re: `مجلس (?:ال)?(?:نساء|حريم|نسوان|عائله)|مجالس (?:ال)?نساء` },
  { id: 'elderly', ar: 'غرفة كبار السن', re: `غرفه(?: نوم)?(?: ارضيه)? (?:ال|لل|ل)?(?:والده|والد|والدين|ام|اب|ابوي|امي|ابوي وامي|جده|جدتي|جدي|كبار السن|كبير السن|شياب|اهلي)|والده|والدين|كبار السن|كبير السن` },
  { id: 'guest', ar: 'غرفة الضيوف', re: `غرف(?:ه)? (?:نوم )?(?:ال|لل|ل)?(?:ضيوف|ضيف)` },
  { id: 'guestwc', ar: 'دورة مياه الضيوف', re: `(?:حمام|دوره مياه|دورات مياه|تواليت) (?:ال|لل|ل)?(?:ضيوف|رجال|مجلس)` },
  { id: 'servicedoor', ar: 'باب الخدمة', re: `(?:باب|مدخل) (?:ال)?خدمه` },
  { id: 'kids', ar: 'غرف الأبناء', plural: true, re: `غرف(?:ه)? (?:ال|لل|ل)?(?:اولاد|اطفال|بنات|عيال|ابناء|عيالي|صغار|شباب)|اولاد|اطفال|عيال|ابناء|بزران` },
  { id: 'onebed', ar: 'غرفة نوم', any: true, re: `غرفه نوم(?! (?:ال)?رئيسيه)` },
  { id: 'master', ar: 'غرفة النوم الرئيسية', re: `غرفه (?:ال)?نوم (?:ال)?رئيسيه|غرفه (?:ال)?ماستر|غرفه (?:ال)?رئيسيه|ماستر|غرفتي` },
  { id: 'maid', ar: 'غرفة الخادمة', re: `(?:غرفه (?:ال)?)?(?:خادمه|خدامه|عامله|شغاله)` },
  { id: 'driver', ar: 'غرفة السائق', re: `(?:غرفه (?:ال)?)?(?:سائق|سواق)` },
  { id: 'laundry', ar: 'غرفة الغسيل', re: `(?:غرفه (?:ال)?)?غسيل` },
  { id: 'storage', ar: 'المخزن', re: `مخزن|مستودع` },
  { id: 'bedrooms', ar: 'غرف النوم', plural: true, re: `(?:كل |جميع )?(?:ال)?غرف (?:ال)?نوم|(?:كل|جميع) (?:ال)?غرف|غرف(?! (?:ال)?(?:ملابس|غسيل|خادمه|سائق|طعام))` },
  { id: 'majlis', ar: 'المجلس', re: `مجلس(?: (?:ال)?رجال)?(?! (?:ال)?طعام)|مجالس|ديوانيه` },
  { id: 'dining', ar: 'الطعام', re: `(?:غرفه|صاله|مجلس) (?:ال)?طعام|طعام|سفره|مقلط|مقالط` },
  { id: 'kitchen', ar: 'المطبخ', re: `مطبخ(?! (?:ال)?(?:تحضيري|ثاني|خارجي))` },
  { id: 'hall', ar: 'الصالة', re: `صاله(?: (?:ال)?(?:عائليه|معيشه|جلوس))?|ليفنج|معيشه` },
  { id: 'office', ar: 'المكتب', re: `مكتب` },
  { id: 'prayer', ar: 'المصلى', re: `مصلي|مصلا` },
  { id: 'entrance', ar: 'المدخل', re: `مدخل(?: (?:ال)?رئيسي)?|باب (?:ال)?(?:رئيسي|بيت)` },
]);
const S = Object.fromEntries(SUBJECTS.map(s => [s.id, { ...s, rx: new RegExp(`${PRE}(?:${s.re})${END}`, 'g') }]));
const subjAr = id => S[id]?.ar || id;

const COMPASS_AR = { n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب' };
const SIDE_AR = { front: 'في الأمام', back: 'في الخلف', n: 'في جهة الشمال', s: 'في جهة الجنوب', e: 'في جهة الشرق', w: 'في جهة الغرب', right: 'على يمين الداخل من الشارع', left: 'على يسار الداخل من الشارع', center: 'في وسط البيت' };
const OPP_SIDE = { front: 'back', back: 'front', n: 's', s: 'n', e: 'w', w: 'e', right: 'left', left: 'right' };
// المواضع: touch = يلامس الجدار الخارجي لتلك الجهة، half = في نصف المبنى من تلك الجهة
const PLACES = [
  { side: 'front', mode: 'touch', re: `(?:يطل|تطل|مطل|مطله)? ?(?:ع|على|علي) (?:ال)?(?:شارع|واجهه)|جهه (?:ال)?شارع|(?:ب|في )?(?:ال)?واجهه` },
  { side: 'back', mode: 'touch', re: `(?:يطل|تطل|مطل|مطله) (?:ع|على|علي) (?:ال)?(?:حوش|حديقه|فناء|ارتداد)(?: (?:ال)?خلفي(?:ه)?)?|(?:ع|على|علي) (?:ال)?(?:حوش|حديقه) (?:ال)?خلفي(?:ه)?` },
  { side: 'front', mode: 'half', re: `(?:في|ب) ?(?:ال)?(?:امام|مقدمه|قدام)|(?:ال)?امامي(?:ه)?|قدام` },
  { side: 'back', mode: 'half', re: `(?:في|ب) ?(?:ال)?(?:خلف|ورا|وراء|عمق|اخر (?:ال)?بيت)|(?:ال)?خلفي(?:ه)?|ورا|بعيد(?:ه)? عن (?:ال)?شارع` },
  { side: 'e', mode: 'half', re: `(?:في |ب)?(?:ال)?(?:جهه|ناحيه|جانب) (?:ال)?(?:شرقي(?:ه)?|شرق)|(?:ال)?شرقي(?:ه)?|(?:جهه|ناحيه) (?:ال)?شرق|(?:في|ب) ?(?:ال)?شرق` },
  { side: 'w', mode: 'half', re: `(?:في |ب)?(?:ال)?(?:جهه|ناحيه|جانب) (?:ال)?(?:غربي(?:ه)?|غرب)|(?:ال)?غربي(?:ه)?|(?:جهه|ناحيه) (?:ال)?غرب|(?:في|ب) ?(?:ال)?غرب` },
  { side: 'n', mode: 'half', re: `(?:في |ب)?(?:ال)?(?:جهه|ناحيه|جانب) (?:ال)?(?:شمالي(?:ه)?|شمال)|(?:ال)?شمالي(?:ه)?|(?:جهه|ناحيه) (?:ال)?شمال|(?:في|ب) ?(?:ال)?شمال` },
  { side: 'right', mode: 'half', re: `(?:على |ع |في |ب)?(?:ال)?يمين(?: (?:ال)?(?:مدخل|داخل|بيت|واجهه))?` },
  { side: 'left', mode: 'half', re: `(?:على |ع |في |ب)?(?:ال)?يسار(?: (?:ال)?(?:مدخل|داخل|بيت|واجهه))?` },
  { side: 'center', mode: 'center', re: `(?:في |ب)?(?:ال)?(?:وسط|نص|منتصف) (?:ال)?(?:بيت|فيلا|مبني|دور)|(?:في|ب) ?(?:ال)?(?:وسط|نص|منتصف)` },
  { side: 's', mode: 'half', re: `(?:في |ب)?(?:ال)?(?:جهه|ناحيه|جانب) (?:ال)?(?:جنوبي(?:ه)?|جنوب)|(?:ال)?جنوبي(?:ه)?|(?:جهه|ناحيه) (?:ال)?جنوب|(?:في|ب) ?(?:ال)?جنوب` },
].map(p => ({ ...p, rx: new RegExp(`(?<![${AR}])و?(?:${p.re})${END}`, 'g') }));
const FLOORS = [
  { floor: 'upper', re: `(?:في |ب)?(?:ال)?(?:دور|طابق) (?:ال)?(?:علوي|اول|ثاني|فوق)|(?:في |ب)?(?:ال)?علوي|فوق` },
  { floor: 'ground', re: `(?:في |ب)?(?:ال)?(?:دور|طابق) (?:ال)?ارضي|(?:في |ب)(?:ال)?ارضي|(?:ال)?ارضي(?:ه)?|تحت(?! (?:ال)?(?:درج|سلم))` },
].map(p => ({ ...p, rx: new RegExp(`(?<![${AR}])و?(?:${p.re})${END}`, 'g') }));
// العلاقات بالترتيب: النفي أولًا (لأن «مو قريب» يحوي «قريب»)
const RELS = [
  { kind: 'far', re: `(?:مو|مب|ما|لا|ليس|مش) ?(?:تكون|يكون|تصير|يصير)? ?(?:قريب(?:ه)?|جنب|بجنب|بجانب|ملاصق(?:ه)?|لاصق(?:ه)?|مجاور(?:ه)?) ?(?:من|عن|ل|لل)?|بعيد(?:ه)? (?:عن|من)|ابعد (?:ما يكون )?(?:عن|من)|منفصل(?:ه)? عن|معزول(?:ه)? عن` },
  { kind: 'adjacent', re: `بجانب|بجنب|جنب|جمب|ملاصق(?:ه)?(?: ل| لل)?|لاصق(?:ه)?|مجاور(?:ه)?(?: ل| لل)?|بجوار|جوار|لصق|مفتوح(?:ه)? (?:ع|على|علي)|يفتح (?:ع|على|علي)|تفتح (?:ع|على|علي)|متصل(?:ه)? (?:ب|مع)|يتصل (?:ب|مع)|تتصل (?:ب|مع)` },
  { kind: 'near', re: `قريب(?:ه)? (?:من|م|ل|لل)|قريب(?:ه)?|بالقرب من|قرب|عند` },
].map(p => ({ ...p, rx: new RegExp(`(?<![${AR}])و?(?:${p.re})${END}`, 'g') }));
const NEG = new RegExp(`(?<![${AR}])و?(?:بدون|بلا|من غير|ما ابي|ما ابغي|لا ابي|لا ابغي|ما ابا|ما بي|ما نبي|ما نبغي|لا اريد|لا نريد|ما اريد|ما احتاج|لا احتاج|ما نحتاج|لا نحتاج|مافي|ما فيه|ما يحتاج|لا داعي ل|ما له داعي)(?: (?:ال)?(?:غرفه|صاله))? ((?:ال)?(?:مجلس|مجالس|طعام|سفره|ممرات|ممر|مكتب|مصلي|خادمه|سائق))`, 'g');

const GROUND_ONLY = new Set(['majlis', 'majlis_w', 'kitchen', 'dining', 'entrance', 'driver', 'maid']);
const find = (rx, t) => { rx.lastIndex = 0; const out = []; let m; while ((m = rx.exec(t))) { out.push({ start: m.index, end: m.index + m[0].length, text: m[0] }); if (m[0] === '') rx.lastIndex++; } return out; };
function subjectsIn(t) {
  const all = [];
  for (const s of SUBJECTS) for (const m of find(S[s.id].rx, t)) all.push({ ...m, id: s.id });
  all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = []; for (const m of all) if (!out.some(o => m.start < o.end && o.start < m.end)) out.push(m);
  return out.sort((a, b) => a.start - b.start);
}
// الفاعل قبل الكلمة المفتاحية: الأقرب، ومعه سابقه إن عُطف عليه مباشرة («المطبخ والطعام في الخلف») ولم تكن قائمة برنامج طويلة
function subjectsBefore(subs, at, t) {
  const before = subs.filter(s => s.end <= at); if (!before.length) return [];
  const last = before[before.length - 1]; if (/[0-9]/.test(t.slice(last.end, at)) || at - last.end > 28) return [];
  const chain = [last];
  for (let i = before.length - 2; i >= 0; i--) { const gap = t.slice(before[i].end, chain[0].start).trim(); if (gap === '') chain.unshift(before[i]); else break; }
  // عطف مباشر يُقبل فقط لقائمة من اثنين وبلا عدد قبلها؛ قائمة البرنامج («3 غرف ومجلس وصالة والمطبخ...») تُبقي الأقرب
  if (chain.length === 2 && !/\d|واحد|اثنين|ثلاث|اربع|خمس/.test(t.slice(Math.max(0, chain[0].start - 8), chain[0].start))) return chain.map(c => c.id);
  return [last.id];
}

/**
 * يستخرج القواعد من نص مطبَّع (normalizeAr). يعيد { rules[], absent[], floors, noCorridors }.
 * rules: { id, kind:'place'|'near'|'adjacent'|'far'|'floor', a, b?, side?, mode?, floor?, text }.
 */
export function extractRules(t) {
  const rules = [], absent = new Set(); let floors = null, noCorridors = false;
  const seen = new Set();
  const push = r => { const k = [r.kind, r.a, r.b, r.side, r.floor].join('|'); if (seen.has(k) || (r.b && r.a === r.b)) return; seen.add(k); rules.push({ id: 'R' + (rules.length + 1), ...r, text: ruleText(r) }); };
  // عدم الوجود
  for (const m of t.matchAll(NEG)) {
    const w = m[1].replace(/^ال/, '');
    if (/^(مجلس|مجالس)$/.test(w)) absent.add('majlis'); else if (/^(طعام|سفره)$/.test(w)) absent.add('dining');
    else if (/^ممر/.test(w)) noCorridors = true; else if (w === 'مكتب') absent.add('office'); else if (w === 'مصلي') absent.add('prayer'); else if (w === 'خادمه') absent.add('maid'); else if (w === 'سائق') absent.add('driver');
  }
  if (/(?<![؀-ۿ])(?:ما|لا|بدون|مو) ?(?:ابي|ابغي|اريد|نبي)? ?ممرات|ممرات (?:قليله|اقل)|بلا ممرات|(?:ما|لا) (?:ابي|ابغي|اريد) ممر/.test(t)) noCorridors = true;
  // عدد الأدوار
  if (/(?<![؀-ۿ])(?:دورين|دوران|طابقين|طابقان|دور ارضي و ?(?:دور )?(?:اول|علوي)|ارضي و ?(?:اول|علوي))/.test(t)) floors = 2;
  else if (/(?<![؀-ۿ])(?:دور واحد|طابق واحد|دور ارضي فقط|ارضي فقط)/.test(t)) floors = 1;
  const NEGW = new RegExp(`(?<![${AR}])(?:لا|ما|مو|مب|ليس|مش|بلاش|غير|ابد)(?![${AR}])`);
  const TOGETHER = new RegExp(`(?<![${AR}])(?:جنب|بجنب|بجانب|بجوار|ورا|مع|قرب|قريب(?:ه|ين)? من) بعض(?:ها|هم)?(?![${AR}])|(?<![${AR}])(?:متجاور(?:ه|ين)|متلاصق(?:ه|ين)|مع بعض)(?![${AR}])`, 'g');
  const BETWEEN = new RegExp(`(?<![${AR}])(?:بين|وسط ما بين)(?![${AR}])`, 'g');
  for (const clause of t.split(/[،,.؛;\n!?؟]+/)) {
    const c = ' ' + clause.trim() + ' ';
    if (c.trim().length < 3) continue;
    const subs = subjectsIn(c), used = [];
    const overlapsUsed = m => used.some(u => m.start < u.end && u.start < m.end);
    // النفي قبل العبارة: «لا تحط غرف النوم على الشارع»، «المجلس ما يكون جنب المطبخ»
    const negated = (from, to) => { const lastUsed = Math.max(0, ...used.filter(u => u.end <= to).map(u => u.end)); return NEGW.test(c.slice(Math.max(lastUsed, from - 16, 0), to)); };
    const firstStart = ids => Math.min(...subs.filter(x => ids.includes(x.id)).map(x => x.start));
    // «وعن المجلس»، «ومن المطبخ»: فراغات معطوفة بعد العبارة تأخذ العلاقة نفسها
    const coordinated = end => { const out = []; let at = end; for (;;) { const m = c.slice(at).match(/^\s*و\s*(?:عن|من|لل|ل|ب)?\s*/); if (!m) break; const nx = subs.find(x => x.start >= at + m[0].length - 3 && x.start <= at + m[0].length + 1); if (!nx) break;
      // «من المطبخ والطعام» أو «عن الشارع وعن المجلس» عطف؛ «الماستر ومجلس» (نكرة بلا حرف جر) بقية قائمة البرنامج
      if (!/(عن|من|ل|ب)\s*$/.test(m[0]) && !/^(?:و)?(?:ال|بال|لل)/.test(c.slice(nx.start, nx.end))) break;
      out.push(nx.id); at = nx.end; } return out; };
    // «بين A و B»
    for (const m of find(BETWEEN, c)) {
      const A = subjectsBefore(subs, m.start, c), after = subs.filter(x => x.start >= m.end && x.start - m.end <= 30).slice(0, 2);
      if (A.length !== 1 || after.length !== 2) continue;
      used.push({ start: m.start, end: after[1].end });
      for (const b of after) push({ kind: 'adjacent', a: A[0], b: b.id });
    }
    // «جنب بعض»: فراغان معطوفان متجاوران، أو مجموعة غرف متجاورة
    for (const m of find(TOGETHER, c)) {
      if (overlapsUsed(m)) continue;
      const before = subs.filter(x => x.end <= m.start), last = before[before.length - 1]; if (!last) continue;
      const prev = before[before.length - 2], joined = prev && /^\s*$/.test(c.slice(prev.end, last.start));
      used.push(m);
      if (joined) push({ kind: negated(prev.start, m.start) ? 'apart' : 'adjacent', a: prev.id, b: last.id });
      else if (S[last.id]?.plural) push({ kind: 'cluster', a: last.id });
    }
    // العلاقات بترتيب ورودها؛ «A قريبة من B وبعيدة عن C»: المعطوف بالواو يعود على الفاعل نفسه
    const relHits = [];
    for (const rel of RELS) for (const m of find(rel.rx, c)) if (!overlapsUsed(m) && !relHits.some(h => m.start < h.end && h.start < m.end)) relHits.push({ ...m, kind: rel.kind });
    relHits.sort((a, b) => a.start - b.start);
    let lastA = null;
    for (const m of relHits) {
      const after = subs.find(x => x.start >= m.end && x.start - m.end <= 6);
      let A = subjectsBefore(subs, m.start, c);
      if (lastA && /^و/.test(m.text)) A = lastA;
      if (!after || !A.length) continue;
      used.push({ start: m.start, end: after.end }); lastA = A;
      // «لا تحط المجلس جنب المطبخ»: النفي يقلب الملاصقة والقرب إلى «غير ملاصق»
      const kind = m.kind !== 'far' && negated(firstStart(A), m.start) ? 'apart' : m.kind;
      for (const b of [after.id, ...coordinated(after.end)]) for (const a of A) push({ kind, a, b });
    }
    const consumed = new Set();
    for (const p of PLACES) for (const m of find(p.rx, c)) {
      if (overlapsUsed(m)) continue;
      // العبارة يجب ألا تكون جزءًا من فاعل؛ عدا «يمين المدخل/يسار المدخل» فالمدخل جزء من العبارة
      const inside = subs.filter(x => m.start < x.end && x.start < m.end);
      if (inside.some(x => !(x.id === 'entrance' && ['right', 'left'].includes(p.side) && x.start > m.start))) continue;
      inside.forEach(x => consumed.add(x));
      const A = subjectsBefore(subs.filter(x => !consumed.has(x)), m.start, c); if (!A.length) continue;
      used.push(m);
      const neg = negated(firstStart(A), m.start);
      for (const a of A) {
        if (!neg) push({ kind: 'place', a, side: p.side, mode: p.mode });
        else if (p.mode === 'touch') push({ kind: 'place', a, side: p.side, mode: 'avoid' });
        else if (OPP_SIDE[p.side]) push({ kind: 'place', a, side: OPP_SIDE[p.side], mode: 'half' });
      }
      // «بعيدة عن الشارع وعن المجلس»
      if (/بعيد/.test(m.text)) for (const b of coordinated(m.end)) for (const a of A) push({ kind: 'far', a, b });
    }
    for (const f of FLOORS) for (const m of find(f.rx, c)) {
      if (overlapsUsed(m)) continue;
      // «غرفة نوم أرضية لأبوي»: الصفة داخل اسم الفراغ
      const host = subs.find(x => m.start >= x.start && m.end <= x.end + 1);
      let A = host ? [host.id] : subjectsBefore(subs, m.start, c);
      if (!A.length) continue;
      // «مجلس ومكتب فوق»: ما لا يصعد للعلوي (المجلس والمطبخ والخدمة) لا يُعطف عليه الدور إلا إن ذُكر وحده
      if (f.floor === 'upper' && A.length > 1) A = A.filter(a => !GROUND_ONLY.has(a));
      used.push(m);
      for (const a of A) push({ kind: 'floor', a, floor: f.floor });
    }
  }
  return { rules, absent: [...absent], floors, noCorridors };
}
export function ruleText(r) {
  const A = `«${subjAr(r.a)}»`;
  if (r.kind === 'cluster') return `${A} متجاورة`;
  if (r.kind === 'apart') return `${A} غير ملاصق لـ«${subjAr(r.b)}»`;
  if (r.kind === 'place' && r.mode === 'avoid') return `${A} لا يطل على ${r.side === 'front' ? 'الشارع' : r.side === 'back' ? 'الواجهة الخلفية' : 'جهة ' + (COMPASS_AR[r.side] || r.side)}`;
  if (r.kind === 'place') return `${A} ${r.mode === 'touch' ? (r.side === 'front' ? 'على الشارع (الواجهة الأمامية)' : r.side === 'back' ? 'على الواجهة الخلفية' : SIDE_AR[r.side]) : SIDE_AR[r.side]}`;
  if (r.kind === 'floor') return `${A} في الدور ${r.floor === 'upper' ? 'العلوي' : 'الأرضي'}`;
  return `${A} ${{ adjacent: 'بجوار', near: 'قرب', far: 'بعيدًا عن' }[r.kind]} «${subjAr(r.b)}»`;
}
// ------------------------------------------------------------------------------------------ التقييم في الإطار القانوني
// الإطار: x عبر الواجهة (0..W)، y من المدخل (0) إلى الخلف (D). الجهات المطلقة تتحول بحسب المدخل والمرآة.
const CANON = { s: { n: 'y1', e: 'x1', w: 'x0' }, n: { s: 'y1', e: 'x0', w: 'x1' }, e: { w: 'y1', n: 'x1', s: 'x0' }, w: { e: 'y1', s: 'x1', n: 'x0' } };
export function canonSide(entry, side, mirror) {
  if (side === 'front' || side === entry) return 'y0';
  if (side === 'back') return 'y1';
  if (side === 'center') return 'c';
  // يمين/يسار الواقف في الشارع مواجهًا البيت: في الإطار القانوني x1 يمينه (قبل المرآة)
  let c = side === 'right' ? 'x1' : side === 'left' ? 'x0' : CANON[entry]?.[side] || null;
  if (c && mirror && c[0] === 'x') c = c === 'x0' ? 'x1' : 'x0';
  return c;
}
const BLOCK_OF = {
  majlis: b => b.kind === 'majlis' && !b.women, majlis_w: b => !!b.women, kitchen: b => b.id === 'kitchen1', dining: b => b.kind === 'dining',
  master: b => !!b.master, kids: b => b.kind === 'suite' && !b.master && !b.elderly && !b.guest, bedrooms: b => b.kind === 'suite' && !b.guest, elderly: b => !!b.elderly,
  maid: b => b.kind === 'maid', driver: b => b.kind === 'driver', office: b => b.kind === 'office', prayer: b => b.kind === 'prayer',
  laundry: b => b.id === 'kitchen1', storage: b => b.id === 'kitchen1', hall: b => b.kind === 'family',
  onebed: b => b.kind === 'suite' && !b.guest, guest: b => !!b.guest, guestwc: b => b.kind === 'majlis' && !b.women, servicedoor: b => b.id === 'kitchen1',
};
/** كتل البرنامج المقصودة بالفراغ (لتوزيع الأدوار). */
export function blocksFor(id, blocks) { const pick = BLOCK_OF[id]; return pick && !['laundry', 'storage', 'hall'].includes(id) ? blocks.filter(pick) : []; }
function rectsOf(id, placed, circ) {
  if (id === 'hall') { const h = circ.find(c => c.id === 'hall'); if (h) return [h.r]; }
  if (id === 'entrance') { const f = circ.find(c => c.id === 'foyer'); return f ? [f.r] : []; }
  const pick = BLOCK_OF[id]; return pick ? placed.filter(p => pick(p.block)).map(p => p.r) : [];
}
const gapOf = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));
const contact = (a, b) => {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (Math.abs(ox) < .3 && oy > 0) return oy; if (Math.abs(oy) < .3 && ox > 0) return ox; return 0;
};
// «قرب»: لفراغ واحد ≤ 2 م (ممر أو باب)، ولمجموعة غرف (غرف الأبناء قرب الماستر) ≤ 4.2 م (عرض صالة أو غرفة بينهما)
const nearGap = r => (S[r.a]?.plural ? 4.2 : 2.0);
const ctr = r => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
/** كم ينقص المستطيل عن تحقيق الموضع (0 = متحقق). sides بإحداثيات قانونية أو مستند. */
function placeDeficit(r, side, mode, B) {
  const w = B.x1 - B.x0, d = B.y1 - B.y0, c = ctr(r);
  if (mode === 'center') return Math.max(0, Math.abs(c.x - (B.x0 + B.x1) / 2) - w * .18) + Math.max(0, Math.abs(c.y - (B.y0 + B.y1) / 2) - d * .3);
  // «لا يطل على الشارع»: العجز = كم يلامس (موجب إن لامس)
  if (mode === 'avoid') return Math.max(0, .5 - placeDeficit(r, side, 'touch', B));
  if (mode === 'touch') return side === 'y0' ? r.y0 - B.y0 : side === 'y1' ? B.y1 - r.y1 : side === 'x0' ? r.x0 - B.x0 : B.x1 - r.x1;
  const f = side === 'y0' ? (B.y1 - c.y) / d : side === 'y1' ? (c.y - B.y0) / d : side === 'x0' ? (B.x1 - c.x) / w : (c.x - B.x0) / w;
  return Math.max(0, .5 - f) * (side[0] === 'x' ? w : d);
}
/**
 * عقوبة القواعد لترتيب مرشح. يعيد { base, p:[بلا مرآة، بمرآة] } — الجهات الجانبية تعتمد على المرآة،
 * فيختار المولّد المرآة التي تحقق طلب العميل.
 */
export function rulePenalty(placed, circ, W, D, rules = [], entry = 's') {
  const B = { x0: 0, y0: 0, x1: W, y1: D }, diag = Math.hypot(W, D);
  let base = 0; const p = [0, 0];
  for (const r of rules) {
    if (r.kind === 'floor') continue;
    const A = rectsOf(r.a, placed, circ); if (!A.length) continue;
    const any = !!S[r.a]?.any;
    if (r.kind === 'place') {
      for (const m of [0, 1]) {
        const side = canonSide(entry, r.side, !!m); if (!side) continue;
        const pens = A.map(a => { const def = placeDeficit(a, side, r.mode, B); return def > (r.mode === 'touch' ? .05 : 0) ? 45 + 18 * def : 0; });
        const pen = any ? Math.min(...pens) : pens.reduce((x, y) => x + y, 0);
        if (side[0] !== 'x') { base += pen; break; } p[m] += pen;
      }
      continue;
    }
    if (r.kind === 'cluster') { for (const a of A) if (A.length > 1 && !A.some(b => b !== a && contact(a, b) >= 1.0)) base += 45; continue; }
    const Bs = rectsOf(r.b, placed, circ); if (!Bs.length) continue;
    if (r.kind === 'apart') { for (const a of A) for (const b of Bs) if (a !== b && contact(a, b) > .3) base += 60; continue; }
    if (any) { const ok = A.some(a => Bs.some(b => r.kind === 'adjacent' ? contact(a, b) >= 1 : r.kind === 'near' ? contact(a, b) >= .8 || gapOf(a, b) <= 1.8 : contact(a, b) <= .3)); if (!ok) base += 55; continue; }
    for (const a of A) {
      const best = Math.min(...Bs.map(b => r.kind === 'adjacent' ? (contact(a, b) >= 1.0 ? 0 : 1 + gapOf(a, b)) : r.kind === 'near' ? (contact(a, b) >= .8 || gapOf(a, b) <= nearGap(r) - .2 ? 0 : gapOf(a, b) - nearGap(r) + 1.2) : 0));
      if (r.kind === 'far') { const need = Math.max(7, diag * .4); for (const b of Bs) { const dd = Math.hypot(ctr(a).x - ctr(b).x, ctr(a).y - ctr(b).y); if (contact(a, b) > .3) base += 55; if (dd < need) base += 10 * (need - dd); } continue; }
      if (best > 0) base += 50 + 14 * best;
    }
  }
  return { base, p };
}

// ------------------------------------------------------------------------------------------ التحقق من المستند
const ROOM_OF = {
  majlis: r => /^(المجلس|مجلس الرجال|مجلس \d+)$/.test(r.name), majlis_w: r => r.name === 'مجلس النساء', kitchen: r => r.name === 'المطبخ', dining: r => /طعام/.test(r.name),
  master: r => r.name === 'غرفة النوم الرئيسية', kids: r => r.type === 'bedroom' && r.name !== 'غرفة كبار السن' && r.name !== 'غرفة الضيوف', bedrooms: r => (r.type === 'bedroom' || r.type === 'master') && r.name !== 'غرفة الضيوف',
  elderly: r => r.name === 'غرفة كبار السن', maid: r => r.name === 'غرفة الخادمة', driver: r => r.name === 'غرفة السائق', office: r => r.name === 'المكتب', prayer: r => r.name === 'المصلى',
  laundry: r => r.name === 'غرفة الغسيل', storage: r => r.name === 'المخزن', entrance: r => /^(مدخل العائلة|الردهة|مدخل الرجال)$/.test(r.name),
  hall: r => /^الصالة( العائلية| العلوية)?$/.test(r.name),
  onebed: r => (r.type === 'bedroom' || r.type === 'master') && r.name !== 'غرفة الضيوف', guest: r => r.name === 'غرفة الضيوف', guestwc: r => /^دورة مياه (الضيوف|الرجال)$/.test(r.name),
  servicedoor: r => r.name === 'المطبخ',
};
/** غرف المستند بمستطيلاتها الصافية (حسب الدور)، وحدود المبنى. +x شرق و+y شمال. */
export function docRooms(doc) {
  const A = analyzeDoc(doc), rooms = [];
  doc.levels.forEach((lv, i) => {
    const L = A.levelById.get(lv.id); if (!L) return;
    for (const r of L.rooms) { if (r.unlabelled || !r.net?.length) continue; const xs = r.net.map(q => q.x), ys = r.net.map(q => q.y); rooms.push({ name: r.name, type: r.type, level: lv.id, li: i, area: r.area, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }); }
  });
  const ws = doc.walls.filter(w => w.level === doc.levels[0].id), bx = ws.flatMap(w => [w.a.x, w.b.x]), by = ws.flatMap(w => [w.a.y, w.b.y]);
  return { rooms, B: { x0: Math.min(...bx), x1: Math.max(...bx), y0: Math.min(...by), y1: Math.max(...by) } };
}
/** أبواب المستند: لكل غرفة جيرانها عبر الأبواب، وأبوابها الخارجية. */
export function doorInfo(doc) {
  const A = analyzeDoc(doc), nb = new Map(), ext = new Map(), names = new Map();
  for (const L of A.levels) {
    for (const r of L.rooms) { names.set(r.id, r.name); nb.set(r.id, new Set()); ext.set(r.id, 0); }
    for (const op of L.openings) {
      if (!op.door) continue;
      if (op.left && op.right && op.left.id !== op.right.id) { nb.get(op.left.id)?.add(op.right.id); nb.get(op.right.id)?.add(op.left.id); }
      const inner = op.left && !op.right ? op.left : op.right && !op.left ? op.right : null; if (inner) ext.set(inner.id, (ext.get(inner.id) || 0) + 1);
    }
  }
  const byName = n => [...names].filter(([, v]) => v === n).map(([k]) => k);
  return { nb, ext, names, byName, neighbors: n => byName(n).flatMap(id => [...(nb.get(id) || [])].map(x => names.get(x))), extDoors: n => byName(n).reduce((a, id) => a + (ext.get(id) || 0), 0) };
}
const docSide = (side, entry) => {
  const opp = { n: 's', s: 'n', e: 'w', w: 'e' }, RIGHT = { s: 'e', n: 'w', e: 'n', w: 's' };
  if (side === 'center') return 'c';
  const c = side === 'front' ? entry : side === 'back' ? opp[entry] : side === 'right' ? RIGHT[entry] : side === 'left' ? opp[RIGHT[entry]] : side;
  return { n: 'y1', s: 'y0', e: 'x1', w: 'x0' }[c];
};
const r1 = v => Math.round(v * 10) / 10;
/**
 * يتحقق من كل قاعدة على المستند. يعيد [{ id, text, ok, why }] — ok=false مع سبب مقيس.
 */
export function verifyRules(doc, rules = [], { entry = 's' } = {}) {
  const { rooms, B } = docRooms(doc), out = [], diag = Math.hypot(B.x1 - B.x0, B.y1 - B.y0);
  const sel = id => rooms.filter(r => ROOM_OF[id]?.(r));
  // الصالة: الرئيسية أولًا
  const pickHall = list => { const main = list.filter(r => r.name === 'الصالة'); return main.length ? main : list.slice(0, 1); };
  for (const r of rules) {
    let A = sel(r.a); if (r.a === 'hall') A = pickHall(A);
    const res = { id: r.id, text: r.text, kind: r.kind, ok: true, why: '' };
    if (!A.length) { res.ok = false; res.why = `لا يوجد «${subjAr(r.a)}» في هذا التصميم.`; out.push(res); continue; }
    if (r.kind === 'floor') {
      const want = r.floor === 'upper' ? 1 : 0, bad = A.filter(a => (a.li > 0 ? 1 : 0) !== want);
      if (doc.levels.length < 2 && want === 1) { res.ok = false; res.why = 'التصميم بدور واحد؛ اختر دورين في بيانات الأرض أو اكتب «دورين».'; }
      else if (bad.length) { res.ok = false; res.why = `«${bad[0].name}» في ${bad[0].li ? 'الدور العلوي' : 'الدور الأرضي'}.`; }
      out.push(res); continue;
    }
    if (r.kind === 'place') {
      const side = docSide(r.side, entry), where = r.side === 'front' ? 'الواجهة الأمامية' : r.side === 'back' ? 'الخلف' : r.side === 'right' ? 'يمين الداخل' : r.side === 'left' ? 'يسار الداخل' : COMPASS_AR[r.side];
      const fail = a => placeDeficit(a, side, r.mode, B) > (r.mode === 'touch' ? .45 : r.mode === 'avoid' ? .15 : 0);
      const bad = S[r.a]?.any ? (A.every(fail) ? A.slice(0, 1) : []) : A.filter(fail);
      if (bad.length && r.mode === 'center') { res.ok = false; res.why = `«${bad[0].name}» ليس في وسط المبنى.`; out.push(res); continue; }
      if (bad.length && r.mode === 'avoid') { res.ok = false; res.why = `«${bad[0].name}» يلامس جدار ${where}.`; out.push(res); continue; }
      const menConflict = r.a === 'majlis' && side !== docSide('front', entry) && rooms.some(x => x.name === 'مدخل الرجال' || x.name === 'مجلس الرجال' || x.name === 'المجلس');
      if (bad.length) { res.ok = false; res.why = (r.mode === 'touch' ? `«${bad[0].name}» لا يلامس جدار ${where} (يبعد ${r1(placeDeficit(bad[0], side, 'touch', B))} م).` : `«${bad[0].name}» ليس في نصف المبنى من جهة ${where}.`) + (menConflict && side === docSide('back', entry) ? ' مجلس الرجال يبقى على الواجهة الأمامية ليأخذ مدخله المستقل عن العائلة، وهذه الجهة خلف المبنى.' : ''); }
      out.push(res); continue;
    }
    const same = (a, b) => a.level === b.level;
    if (r.kind === 'cluster') { const lone = A.find(a => A.length > 1 && !A.some(b => b !== a && same(a, b) && contact(a, b) >= .8)); if (lone) { res.ok = false; res.why = `«${lone.name}» لا تلاصق أيًّا من بقية المجموعة.`; } out.push(res); continue; }
    let Bs = sel(r.b); if (r.b === 'hall') Bs = pickHall(Bs);
    if (!Bs.length) { res.ok = false; res.why = `لا يوجد «${subjAr(r.b)}» في هذا التصميم.`; out.push(res); continue; }
    if (r.kind === 'apart') { for (const a of A) { const t = Bs.find(b => b !== a && same(a, b) && contact(a, b) > .3); if (t) { res.ok = false; res.why = `«${a.name}» ملاصق لـ«${t.name}».`; break; } } out.push(res); continue; }
    if (r.b === 'servicedoor') { const D = doorInfo(doc), k = A.find(a => D.extDoors(a.name) > 0); if (!k) { res.ok = false; res.why = 'المطبخ بلا باب خدمة خارجي في هذا التصميم.'; } out.push(res); continue; }
    if (S[r.a]?.any) { const ok = A.some(a => Bs.some(b => b !== a && same(a, b) && (r.kind === 'adjacent' ? contact(a, b) >= .8 : r.kind === 'near' ? contact(a, b) >= .6 || gapOf(a, b) <= 2 : contact(a, b) <= .3))); if (!ok) { res.ok = false; res.why = `لا توجد «${subjAr(r.a)}» تحقق ذلك.`; } out.push(res); continue; }
    for (const a of A) {
      const cands = Bs.filter(b => same(a, b) && b !== a);
      if (r.kind === 'far') {
        const need = Math.max(7, diag * .4);
        const close = Bs.find(b => b !== a && same(a, b) && (contact(a, b) > .3 || Math.hypot(ctr(a).x - ctr(b).x, ctr(a).y - ctr(b).y) < need));
        if (close) { res.ok = false; res.why = contact(a, close) > .3 ? `«${a.name}» ملاصق لـ«${close.name}».` : `المسافة بين «${a.name}» و«${close.name}» ${r1(Math.hypot(ctr(a).x - ctr(close).x, ctr(a).y - ctr(close).y))} م فقط.`; break; }
        continue;
      }
      if (!cands.length) { res.ok = false; res.why = `«${a.name}» و«${subjAr(r.b)}» في دورين مختلفين.`; break; }
      const okOne = b => r.kind === 'adjacent' ? contact(a, b) >= .8 : contact(a, b) >= .6 || gapOf(a, b) <= nearGap(r);
      if (!cands.some(okOne)) { const g = Math.min(...cands.map(b => gapOf(a, b))); res.ok = false; res.why = `«${a.name}» ${r.kind === 'adjacent' ? 'لا يلاصق' : 'بعيد عن'} «${cands[0].name}»${g > .3 ? ` (بينهما ${r1(g)} م)` : ''}.`; break; }
    }
    out.push(res);
  }
  return out;
}


const EXTRA_AR = { maid: ['غرفة الخادمة', 'maid'], driver: ['غرفة السائق', 'driver'], office: ['المكتب', 'office'], prayer: ['المصلى', 'prayer'], laundry: ['غرفة الغسيل', 'laundry'], storage: ['المخزن', 'storage'] };
const AREA_SUBJ = { master: 'master', majlis: 'majlis', hall: 'hall', dining: 'dining', kitchen: 'kitchen', bedroom: 'kids' };
/**
 * سجل التنفيذ الكامل لطلب العميل على المستند: القواعد المكانية + الفراغات الإضافية + المقاسات + «بدون» +
 * عدد الأدوار + الحمامات. كل بند { text, ok, why } مقيس من المستند نفسه، لا من نية المولّد.
 */
export function verifyRequest(doc, req = {}, { entry = 's' } = {}) {
  const out = verifyRules(doc, req.rules || [], { entry });
  const { rooms } = docRooms(doc), sel = id => rooms.filter(r => ROOM_OF[id]?.(r));
  for (const [k, [ar, id]] of Object.entries(EXTRA_AR)) if (req.extras?.[k]) {
    const got = sel(id).length > 0; out.push({ id: 'X-' + k, kind: 'extra', text: ar, ok: got, why: got ? '' : `«${ar}» لم تتسع في هذا التصميم.` });
    if (got && req.extras[k]?.bath) { const b = rooms.some(r => r.name === (k === 'maid' ? 'حمام الخادمة' : 'حمام السائق')); out.push({ id: 'X-' + k + '-bath', kind: 'extra', text: (k === 'maid' ? 'حمام الخادمة' : 'حمام السائق'), ok: b, why: b ? '' : 'عدد دورات المياه لا يكفي؛ زده واحدًا.' }); }
  }
  for (const [k, a] of Object.entries(req.areas || {})) {
    const sid = AREA_SUBJ[k]; if (!sid) continue;
    let list = sel(sid); if (sid === 'hall') { const m = list.filter(r => r.name === 'الصالة'); list = m.length ? m : list.slice(0, 1); } if (sid === 'majlis') list = list.slice(0, 1);
    if (!list.length) { out.push({ id: 'A-' + k, kind: 'area', text: `${subjAr(sid)} ${a} م²`, ok: false, why: 'الفراغ غير موجود في هذا التصميم.' }); continue; }
    const bad = list.find(r => r.area < a * .85 || r.area > a * 1.25);
    out.push({ id: 'A-' + k, kind: 'area', text: `${list.length > 1 ? subjAr(sid) : `«${list[0].name}»`} بمساحة ${a} م² تقريبًا`, ok: !bad, why: bad ? `مساحة «${bad.name}» الصافية ${r1(bad.area)} م².` : `الفعلي ${list.map(r => r1(r.area)).join('، ')} م² (صافٍ داخل الجدران).` });
  }
  const c = req.counts || {};
  if (c.majlis === 0) { const n = sel('majlis').length + sel('majlis_w').length; out.push({ id: 'C-majlis', kind: 'count', text: 'بدون مجلس', ok: n === 0, why: n ? 'يوجد مجلس؛ عدد المجالس في الأعداد ليس صفرًا.' : '' }); }
  if (c.dining === 0) { const n = sel('dining').length; out.push({ id: 'C-dining', kind: 'count', text: 'بدون غرفة طعام', ok: n === 0, why: n ? 'توجد غرفة طعام؛ عددها في الأعداد ليس صفرًا.' : '' }); }
  if (Number.isInteger(c.bedrooms) && c.bedrooms > 0) { const n = sel('bedrooms').length; out.push({ id: 'C-bed', kind: 'count', text: `${c.bedrooms} غرف نوم`, ok: n === c.bedrooms, why: n === c.bedrooms ? '' : `في التصميم ${n}.` }); }
  if (c.majlis >= 2) { const w = sel('majlis_w').length, m = sel('majlis').length; out.push({ id: 'C-maj2', kind: 'count', text: 'مجلس للرجال ومجلس للنساء', ok: w >= 1 && m >= 1, why: '' }); }
  const pr = req.prefs || {};
  if (pr.floors) { const n = doc.levels.length; out.push({ id: 'P-floors', kind: 'pref', text: pr.floors === 2 ? 'دوران' : 'دور واحد', ok: n === pr.floors, why: n === pr.floors ? '' : `التصميم ${n === 2 ? 'بدورين' : 'بدور واحد'}.` }); }
  if (pr.noCorridors) { const n = rooms.filter(r => r.name === 'ممر الغرف').length; out.push({ id: 'P-corr', kind: 'pref', text: 'بلا ممرات طويلة (الحركة عبر الصالة)', ok: n === 0, why: n ? 'يوجد ممر للغرف.' : '' }); }
  if (pr.allEnsuite) { const beds = sel('bedrooms').length, own = rooms.filter(r => /^حمام (الرئيسية|غرفة)/.test(r.name)).length; out.push({ id: 'P-ens', kind: 'pref', text: 'حمام خاص لكل غرفة نوم', ok: own >= beds, why: own >= beds ? '' : `${own} حمامات خاصة لـ${beds} غرف؛ زد عدد دورات المياه.` }); }
  if (pr.sharedBaths) { const n = rooms.filter(r => r.name === 'دورة مياه مشتركة').length; out.push({ id: 'P-sh', kind: 'pref', text: 'دورات مياه مشتركة بين الغرف', ok: n > 0 || sel('kids').length === 0, why: n ? '' : 'لا توجد دورة مياه مشتركة؛ عدد دورات المياه قليل.' }); }
  if (pr.womenSeparate || (c.majlis >= 2)) {
    const D = doorInfo(doc), MEN = new Set(['مجلس الرجال', 'مدخل الرجال', 'دورة مياه الرجال']), WOMEN = new Set(['مجلس النساء', 'ممر النساء', 'دورة مياه النساء']);
    const link = [...MEN].find(m => D.neighbors(m).some(n => WOMEN.has(n)));
    const menOwn = D.extDoors('مجلس الرجال') + D.extDoors('مدخل الرجال') > 0;
    out.push({ id: 'P-sep', kind: 'pref', text: 'مجلس الرجال بمدخله المستقل، ومجلس النساء منفصل عنه (لا باب بينهما)', ok: !link && menOwn, why: link ? `«${link}» يتصل بمنطقة النساء بباب.` : menOwn ? '' : 'مجلس الرجال بلا مدخل خارجي مستقل في هذا التصميم.' });
  }
  if (pr.bathsOffHall) { const D = doorInfo(doc), bad = [...D.names].filter(([id, n]) => /^(حمام|دورة مياه)/.test(n) && [...(D.nb.get(id) || [])].some(x => /^الصالة/.test(D.names.get(x)))).map(([, n]) => n); out.push({ id: 'P-bathhall', kind: 'pref', text: 'دورات المياه لا تفتح على الصالة مباشرة', ok: !bad.length, why: bad.length ? `«${bad[0]}» تفتح على الصالة${bad.length > 1 ? ` (و${bad.length - 1} غيرها)` : ''}؛ لا يوجد ممر بديل في هذا التوزيع.` : '' }); }
  for (const [k, ar] of [['office', 'المكتب'], ['maid', 'غرفة الخادمة']]) if (req.extras?.[k]?.ext) { const D = doorInfo(doc), n = D.extDoors(ar); out.push({ id: 'X-' + k + '-ext', kind: 'extra', text: `«${ar}» بباب خارجي`, ok: n > 0, why: n ? '' : 'لم يلامس جدارًا خارجيًا مناسبًا في هذا التصميم.' }); }
  if (req.extras?.guestRoom) { const g = rooms.some(r => r.name === 'غرفة الضيوف'), ok = g && (!req.extras.guestRoom.bath || rooms.some(r => r.name === 'حمام غرفة الضيوف')); out.push({ id: 'X-guest', kind: 'extra', text: 'غرفة نوم للضيوف' + (req.extras.guestRoom.bath ? ' بحمامها' : ''), ok, why: ok ? '' : g ? 'عدد دورات المياه لا يكفي لحمامها؛ زده واحدًا.' : 'لم تتسع غرفة الضيوف في هذا التصميم.' }); }
  if (pr.masterDressing) { const n = rooms.some(r => /^غرفة (ال)?ملابس$/.test(r.name)); out.push({ id: 'P-dress', kind: 'pref', text: 'غرفة ملابس للغرفة الرئيسية', ok: n, why: n ? '' : 'لم تتسع غرفة الملابس في هذا التصميم.' }); }
  if (pr.openKitchen) { const k = sel('kitchen')[0], d = sel('dining')[0], n = !!(k && d && contact(k, d) >= .8); out.push({ id: 'P-open', kind: 'pref', text: 'مطبخ مفتوح على الطعام', ok: n, why: n ? '' : 'المطبخ لا يجاور الطعام في هذا التصميم.' }); }
  if (pr.elderlyRoom) { const n = sel('elderly').length > 0 || rooms.some(r => r.type === 'master' && r.li === 0 && doc.levels.length > 1); out.push({ id: 'P-old', kind: 'pref', text: 'غرفة لكبار السن قرب الصالة', ok: n, why: n ? '' : 'لا توجد غرفة مخصصة لكبار السن.' }); }
  if (pr.guestEntrance) { const n = rooms.some(r => r.name === 'مدخل الرجال') || doc.openings.filter(o => o.entry).length >= 2; out.push({ id: 'P-guest', kind: 'pref', text: 'مدخل مستقل للضيوف إلى المجلس', ok: n, why: n ? '' : 'المجلس لا يلامس الواجهة في هذا التصميم.' }); }
  const BIG = { majlis: ['majlis', 30, 'مجلس واسع'], hall: ['hall', 35, 'صالة واسعة'], kitchen: ['kitchen', 15, 'مطبخ واسع'], master: ['master', 22, 'غرفة رئيسية واسعة'] };
  for (const [k, [sid, min, ar]] of Object.entries(BIG)) if (pr['big_' + k] && !(req.areas || {})[k]) {
    let list = sel(sid); if (sid === 'hall') { const m = list.filter(r => r.name === 'الصالة'); list = m.length ? m : list.slice(0, 1); }
    const r0 = list[0]; out.push({ id: 'B-' + k, kind: 'area', text: `${ar} (${min} م² صافية أو أكثر)`, ok: !!r0 && r0.area >= min, why: r0 ? (r0.area >= min ? `الفعلي ${r1(r0.area)} م².` : `الفعلي ${r1(r0.area)} م² فقط.`) : 'الفراغ غير موجود.' });
  }
  return out;
}

/** القاعدة الجديدة تحل محل القديمة لنفس الفراغ ونوع الطلب (مثل: «المطبخ في الأمام» بعد «المطبخ في الخلف»). */
export function mergeRules(old = [], add = []) {
  const key = r => r.kind === 'place' ? `place|${r.a}|${['e', 'w'].includes(r.side) ? 'x' : ['front', 'back', 'n', 's'].includes(r.side) ? 'y' : r.side}` : r.kind === 'floor' ? `floor|${r.a}` : `rel|${r.a}|${r.b}`;
  const m = new Map(); for (const r of [...old, ...add]) m.set(key(r), r);
  return [...m.values()].map((r, i) => ({ ...r, id: 'R' + (i + 1) }));
}


export default { mergeRules, extractRules, rulePenalty, verifyRules, verifyRequest, canonSide, SUBJECTS };
