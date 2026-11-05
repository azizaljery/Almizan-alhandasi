// تركيبة الأسرة من كلام العميل: الأبناء (بنين/بنات/غير محدد) وأعمارهم تقريبًا، كبار السن، الضيوف، الخدم.
// ثم الاستنتاج إلى برنامج مقترح معلَّل (كل بند بسببه) وفق عرف الأسرة السعودية. نقي: لا DOM ولا شبكة.
import { normalizeAr } from '../requirements.mjs';
import { NUM_WORDS, toNumber } from './lexicon.mjs';

const AR = '\\u0620-\\u064A\\u066E-\\u06D5'; // حروف فقط (لا علامات ترقيم عربية مثل «،» و«؛»)
const NUMW = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|');
const N = `(${NUMW}|\\d+)`;
const END = `(?![${AR}])`;
const POSS = '(?:ي|نا|كم|هم)?'; // «عيالي»، «اولادنا»
const B = `(?<![${AR}])`;
const re = (s, f = '') => new RegExp(s, f);

// المجموعات: «اولاد/عيال/اطفال» في اللهجة قد تعني الأبناء عمومًا؛ تصير بنين فقط إذا ذُكرت البنات صراحة في النص.
const KIDS_GENERIC = '(?:اولاد|عيال|عيالي|اطفال|اطفالي|ابناء|ابنائي|بزران|صغار|ذريه|اولادي)';
const BOYS = '(?:ولد|بنين|اولاد ذكور|ذكور|صبيان|صبي|شباب|شاب|ابني)';
const GIRLS = '(?:بنات|بناتي|بنت|بنتي|بنيات|فتيات)';
const ELDER = [
  { id: 'mother', re: `(?:امي|والدتي|الوالده|والدتنا|امنا|ام زوجي|ام زوجتي|حماتي)`, label: 'والدتك تسكن' },
  { id: 'father', re: `(?:ابوي|والدي|الوالد|ابونا|والدنا|ابو زوجي|ابو زوجتي)`, label: 'والدك يسكن' },
  { id: 'parents', re: `(?:والديني|والداي|والدي وامي|ابوي وامي|امي وابوي|الوالدين|والدين|اهلي|والديّ)`, label: 'والداك يسكنان' },
  { id: 'grand', re: `(?:جدتي|جدي|جده|جد|الجده|الجد)`, label: 'الجد أو الجدة يسكن' },
  { id: 'senior', re: `(?:كبار السن|كبير السن|كبيره السن|شياب|عجوز|مسن|مسنه|مسنين|رجل كبير|امراه كبيره)`, label: 'كبار السن يسكنون' },
];

/**
 * يقرأ تركيبة الأسرة من النص. يعيد:
 * { boys, girls, kids (غير محدد الجنس), ages: 'young'|'older'|'mixed'|null, married (ابن متزوج يسكن معهم), elderly: [{id,label}],
 *   couple (زوجان فقط)، guests: 'frequent'|'rare'|null، mentioned: هل ذُكرت الأسرة أصلًا }
 */
export function parseFamily(raw) {
  const t = normalizeAr(raw);
  const f = { boys: 0, girls: 0, kids: 0, ages: null, married: 0, elderly: [], couple: false, guests: null, mentioned: false, persons: null };
  const has = r => re(r).test(t);
  const sum = (pattern, dualWord) => {
    let n = 0, hit = false;
    // «3 عيال»، «2 منهم بنات»، «عيالي الثلاثة»
    for (const m of t.matchAll(re(`${B}و?${N}\\s+(?:منهم |منهن )?${pattern}${POSS}${END}`, 'g'))) { const v = toNumber(m[1]); if (v !== null && v <= 20) { n += v; hit = true; } }
    if (!hit) for (const m of t.matchAll(re(`${B}و?${pattern}${POSS}\\s+(?:ال)?${N}${END}`, 'g'))) { const v = toNumber(m[1]); if (v !== null && v <= 20) { n += v; hit = true; } }
    if (!hit && dualWord && re(`${B}و?${dualWord}${END}`).test(t)) { n = 2; hit = true; }
    return hit ? n : null;
  };
  const girls = sum(GIRLS, 'بنتين'), boys = sum(BOYS, 'ولدين'), generic = sum(KIDS_GENERIC, null);
  if (girls !== null) f.girls = girls;
  if (boys !== null) f.boys = boys;
  // «4 اولاد و3 بنات»: الأولاد هنا بنون. «6 اولاد» وحدها: أبناء غير محددي الجنس.
  if (generic !== null) {
    const partitive = /(?:منهم|منهن|كلهم|كلهن|كلها|بينهم|فيهم)/.test(t);
    if (girls !== null && boys === null) { if (generic === girls) f.kids = 0; else if (partitive) f.boys += Math.max(0, generic - girls); else f.boys += generic; }
    else if (boys === null) f.kids += generic;
    else f.kids = Math.max(0, generic - boys - (girls || 0)); // «6 اولاد: 4 بنين و2 بنات» = الباقي غير محدد
  }
  // «ولد وبنت» بلا عدد؛ «عندي ولد» و«عندي بنت»
  if (boys === null && generic === null && has(`${B}و?(?:ولد|صبي)${END}`) && !has(`${B}(?:ولد|ابن)[^،,.]{0,14}متزوج`)) f.boys = 1;
  if (girls === null && has(`${B}و?بنت${END}`)) f.girls = Math.max(f.girls, 1);
  // ابن متزوج يسكن معهم: يحتاج غرفة بحمامها (جناحًا)، وقد يحتاج شقة مستقلة لا يرسمها المولّد
  if (has(`(?:ولدي|ابني|ولد|ابن)[^،,.]{0,14}متزوج|متزوج[^،,.]{0,14}(?:يسكن|ساكن|معنا|معي)`)) f.married = 1;
  // كبار السن: وجودهم في البيت. «أمي تسكن معنا» أو مجرد ذكر «غرفة لأمي»
  for (const e of ELDER) if (re(`${B}و?${e.re}${END}`).test(t)) f.elderly.push({ id: e.id, label: e.label });
  if (f.elderly.some(e => e.id === 'parents')) f.elderly = f.elderly.filter(e => !['mother', 'father'].includes(e.id));
  // زوجان فقط
  if (has(`${B}(?:انا وزوجتي|انا وزوجي|زوجين|عروسين|بدون اطفال|بدون عيال|ما عندنا (?:عيال|اطفال|اولاد)|ماعندنا (?:عيال|اطفال)|ما عندي (?:عيال|اطفال|اولاد)|بدون اولاد)${END}`) && !f.boys && !f.girls && !f.kids) f.couple = true;
  // الأعمار تقريبًا
  const young = has(`${B}(?:صغار|صغيرين|رضيع|رضع|بالروضه|روضه|ابتدائي|تحت (?:ال)?(?:عشر|10|عشره)|اطفال صغار|بزران)${END}`);
  const older = has(`${B}(?:كبار(?! السن)|شباب|مراهقين|مراهقون|جامعه|جامعيين|ثانوي|ثانويه|متزوج|كبيرين|بالغين|فوق (?:ال)?(?:عشر|10|عشره|15|خمسطعش|ثمانيه عشر|18))${END}`) || has(`كل واحد[^،,.]{0,12}غرفه|غرفه لكل واحد|لكل واحد غرفه`);
  f.ages = young && older ? 'mixed' : young ? 'young' : older ? 'older' : null;
  // الضيوف
  if (has(`(?:ضيوف|ضيوفنا|زوار|عزايم|عزومات|ولايم|وليمه|عزيمه|الربع|ربعي|جماعتي|اهل زوجتي)[^،,.]{0,12}(?:كثير|كثيره|واجد|مره|دايم|دائم|باستمرار|كل اسبوع|كل يوم|متكرر|متكررين)|(?:نستقبل|استقبل|يجينا|يجونا|تجينا|يزورنا|نعزم|اعزم)[^،,.]{0,12}(?:ضيوف|زوار|ربع|جماعه|اهل|ناس|كثير)|ضيوف متكرر`)) f.guests = 'frequent';
  else if (has(`(?:ضيوف|زوار|عزايم)[^،,.]{0,10}(?:قليل|قليله|نادر|نادرا|مره بالسنه|ما عندنا)|ما (?:عندنا|نستقبل|يجينا) ضيوف`)) f.guests = 'rare';
  // عدد الأفراد الكلي: «اسرة من 7 افراد»، «نحن 8 اشخاص»
  const p = t.match(re(`${B}و?${N}\\s+(?:افراد|اشخاص|انفار|نفر|شخص)${END}`)); if (p) f.persons = toNumber(p[1]);
  if (f.persons && !f.boys && !f.girls && !f.kids && !f.couple && f.persons > 2) f.kids = f.persons - 2 - (f.elderly.some(e => e.id === 'parents') ? 2 : f.elderly.length ? 1 : 0); // الزوجان، ثم الوالدان إن سكنا معهم
  if (f.kids < 0) f.kids = 0;
  f.mentioned = !!(f.boys || f.girls || f.kids || f.couple || f.elderly.length || f.married || f.guests || f.persons);
  return f;
}

/** غرف الأبناء من عددهم وأعمارهم: الصغار اثنان في الغرفة، الكبار غرفة لكل واحد؛ لا يجمع بنين وبنات في غرفة. */
function roomsFor(n, ages) { if (!n) return 0; const per = ages === 'older' ? 1 : 2; return Math.min(10, Math.ceil(n / per)); }

/**
 * يستنتج من تركيبة الأسرة بنودًا للبرنامج مع تعليل كل بند، وأسئلة لما يغيّر التصميم فعلًا.
 * يعيد { rows:[{id, count, reason, bath, floor}], prefs:{}, questions:[{id, text, reason, options}] , notes[] }
 * لا يستنتج شيئًا لم يُذكر ما يُستنتج منه.
 */
export function inferFromFamily(f) {
  const rows = [], prefs = {}, questions = [], notes = [];
  if (!f.mentioned) return { rows, prefs, questions, notes };
  const ages = f.ages;
  const perRoom = ages === 'older' ? 'غرفة لكل واحد لأنهم كبار' : ages === 'young' ? 'كل غرفة لاثنين لأنهم صغار' : 'افتراض: كل غرفة لاثنين (إن كانوا كبارًا زد الغرف)';
  if (f.boys) rows.push({ id: 'bedroom_boys', count: roomsFor(f.boys, ages), reason: `${f.boys} ${f.boys === 1 ? 'ولد' : 'بنين'} ← ${perRoom}` });
  if (f.girls) rows.push({ id: 'bedroom_girls', count: roomsFor(f.girls, ages), reason: `${f.girls} ${f.girls === 1 ? 'بنت' : 'بنات'} ← ${perRoom}؛ غرف البنات مستقلة عن البنين` });
  if (f.kids) {
    const n = roomsFor(f.kids, ages);
    rows.push({ id: 'bedroom_boys', count: n, reason: `${f.kids} من الأبناء ← ${perRoom}` });
    if (f.kids >= 2) questions.push({ id: 'kids_gender', text: `الأبناء ${f.kids === 2 ? 'الاثنان' : 'الـ' + f.kids}: بنون أم بنات أم الاثنان معًا؟`, reason: 'أسأل لأن البنين والبنات لا يتشاركون غرفة، وفصل غرفهم يحدد عدد الغرف وتقسيم جناح النوم.', options: [{ id: 'boys', label: 'كلهم بنون', text: `كلهم ${f.kids} بنين` }, { id: 'girls', label: 'كلهن بنات', text: `كلهن ${f.kids} بنات` }, { id: 'mixed', label: 'بنون وبنات', text: '', free: true, placeholder: 'مثال: 4 أولاد و2 بنات' }], free: true });
    if (!ages) questions.push({ id: 'kids_ages', text: 'أعمار الأبناء تقريبًا: صغار أم كبار؟', reason: 'أسأل لأن الكبار يحتاج كل منهم غرفة، والصغار يكفيهم غرفة لكل اثنين؛ هذا يغيّر عدد الغرف ومساحة الدور العلوي.', options: [{ id: 'young', label: 'صغار (دون 10)', text: 'الأبناء صغار' }, { id: 'older', label: 'كبار (مراهقون فأكبر)', text: 'الأبناء كبار' }, { id: 'mixed', label: 'صغار وكبار', text: 'الأبناء صغار وكبار' }] });
  } else if ((f.boys || f.girls) && !ages && f.boys + f.girls >= 2) {
    questions.push({ id: 'kids_ages', text: 'أعمار الأبناء تقريبًا: صغار أم كبار؟', reason: 'أسأل لأن الكبار يحتاج كل منهم غرفة، والصغار يكفيهم غرفة لكل اثنين.', options: [{ id: 'young', label: 'صغار (دون 10)', text: 'الأبناء صغار' }, { id: 'older', label: 'كبار (مراهقون فأكبر)', text: 'الأبناء كبار' }, { id: 'mixed', label: 'صغار وكبار', text: 'الأبناء صغار وكبار' }] });
  }
  if (f.married) { rows.push({ id: 'bedroom_boys', count: 1, reason: 'ابن متزوج يسكن معكم ← غرفة بحمامها (جناح مستقل)', bath: true }); notes.push('شقة مستقلة للابن المتزوج (مطبخ ومدخل خاص) لا يولّدها هذا الإصدار؛ أدرجتها غرفة بحمامها فقط.'); }
  if (f.elderly.length) {
    const who = f.elderly.map(e => e.label).join('، و');
    // الوالدان معًا غرفة واحدة؛ الجد/الجدة أو كبار السن غرفة أخرى
    const count = Math.min(3, (f.elderly.some(e => ['mother', 'father', 'parents'].includes(e.id)) ? 1 : 0) + (f.elderly.some(e => e.id === 'grand') ? 1 : 0) + (f.elderly.some(e => e.id === 'senior') && f.elderly.length === 1 ? 1 : 0)) || 1;
    rows.push({ id: 'elderly_room', count, reason: `${who} معكم ← غرفة نوم بحمامها في الدور الأرضي قرب الصالة (بلا درج)`, bath: true, floor: 'ground' });
    prefs.elderlyRoom = true;
  }
  if (f.guests === 'frequent') notes.push('ضيوفكم متكررون ← مجلس الرجال بمدخله ودورة مياهه، والمقلط بجواره، وفصل تام عن جناح العائلة.');
  return { rows, prefs, questions, notes };
}

export default { parseFamily, inferFromFamily };
