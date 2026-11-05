// محرك موجز شرعاء: من كلام العميل (فصحى ولهجة) إلى «البرنامج المعماري كما فهمته» جدولًا معلَّلًا،
// بالبناء على الفهم المحلي القائم (requestLocalBrief) واستخراج المتطلبات (extractRequirements) لا بديلًا عنهما:
// يستعملهما ثم يكمل ما يفوتهما (معجم الفراغات السعودية، تركيبة الأسرة، أعراف التصميم المعلنة).
// المخرجات متوافقة تمامًا مع ما يستهلكه المولّد: counts + requirements + discovery + idea. نقي: لا DOM ولا شبكة.
import { extractRequirements, withAi, normalizeAr } from '../requirements.mjs';
import { mergeRules } from '../rules.mjs';
import { normalizeDiscovery, AVOIDS } from '../client-brief.mjs';
import { findSpaces, SPACE, SPACES } from './lexicon.mjs';
import { parseFamily, inferFromFamily } from './family.mjs';
import { applicableCustoms, CUSTOM } from './customs.mjs';

export const SOURCE_AR = Object.freeze({ said: 'قلتَ', custom: 'افتراض عرفي', family: 'استنتاج من الأسرة', edit: 'عدّلتَه', derived: 'محسوب من البرنامج' });
export const FLOOR_AR = Object.freeze({ ground: 'الأرضي', upper: 'العلوي', any: 'أيٌّ منهما', both: 'الأرضي والعلوي' });
/** صفوف الجدول التي يمكن إضافتها يدويًا (الفراغات المدعومة في المولّد) */
export const ADDABLE = Object.freeze(['majlis_men', 'majlis_women', 'dining', 'hall', 'kitchen', 'kitchen_prep', 'master', 'bedroom_boys', 'bedroom_girls', 'bedroom', 'elderly_room', 'guest_room', 'maid', 'driver', 'prayer', 'office', 'storage', 'laundry', 'guest_wc', 'bath_suite', 'bath']);
const BATH_ROWS = Object.freeze({
  guest_wc: { label: 'دورة مياه الضيوف (المجلس)', area: 4, floor: 'ground' },
  bath_suite: { label: 'حمامات غرف النوم (ملحقة)', area: 5, floor: 'upper' },
  bath_service: { label: 'حمام الخادمة / السائق', area: 3.5, floor: 'ground' },
  bath: { label: 'دورة مياه', area: 5, floor: 'any' },
});
const COUNT_KEY = { majlis_men: 'majlis', majlis_women: 'majlis', majlis: 'majlis', dining: 'dining', hall: 'halls', kitchen: 'kitchens', kitchen_prep: 'kitchens', master: 'bedrooms', bedroom_boys: 'bedrooms', bedroom_girls: 'bedrooms', bedroom: 'bedrooms', elderly_room: 'bedrooms', guest_wc: 'baths', bath_suite: 'baths', bath_service: 'baths', bath: 'baths' };
const EXTRA_KEY = { maid: 'maid', driver: 'driver', prayer: 'prayer', office: 'office', storage: 'storage', laundry: 'laundry', guest_room: 'guestRoom' };
const EXTRA_UNDERSTOOD = /^(غرفة خادمة|غرفة سائق|مكتب|مصلى|مخزن|غرفة غسيل|غرفة نوم للضيوف|بدون (مكتب|مصلى|غرفة خادمة|غرفة سائق|غرفة طعام)|عدد دورات المياه|مطبخ ثانٍ|\d+ غرف نوم ماستر)/;
const THREE_FLOORS = /(?<![؀-ۿ])(?:ثلاث(?:ه)? (?:ادوار|طوابق)|3 (?:ادوار|طوابق)|دور ارضي واول وثاني|ارضي واول وثاني|اربع(?:ه)? (?:ادوار|طوابق)|4 (?:ادوار|طوابق))/;
const ROW_FLOOR = id => SPACE[id]?.floor || BATH_ROWS[id]?.floor || 'ground';
const ROW_AREA = id => SPACE[id]?.area ?? BATH_ROWS[id]?.area ?? 0;
const ROW_LABEL = id => SPACE[id]?.label || BATH_ROWS[id]?.label || id;

/**
 * يبني الموجز من نص العميل (قد يكون عدة جمل متراكمة من أدوار الحوار).
 * @param {string} text  كلام العميل كاملًا
 * @param {object} o  { ai: فهم Claude المنقّح إن وجد، disabledCustoms: أعراف عطّلها العميل، edits: تعديلات الجدول اليدوية [{op,id,count}],
 *                      land: الأرض {entries,floors} لأسئلة الموقع، skipped: أسئلة تخطّاها العميل }
 * @returns { program: rows[], customs[], counts, requirements, discovery, idea, questions[], unsupported[], understood[], notes[], family, totals }
 */
export function buildBrief(text, { ai = null, disabledCustoms = [], edits = [], land = null, skipped = [] } = {}) {
  const idea = String(text || '').trim();
  const t = normalizeAr(idea);
  const mentions = findSpaces(idea);
  const fam = parseFamily(idea);
  const inferred = inferFromFamily(fam);
  const notes = [...inferred.notes], unsupported = [], questions = [];

  // ---- 1) ما قاله العميل من فراغات: تجميع الذكر المتكرر (الصريح يُجمع، الضمني واحد)
  const said = new Map(); // id -> { count, negated, explicit }
  for (const m of mentions) {
    const cur = said.get(m.id) || { count: 0, negated: false, explicit: false, texts: [] };
    if (m.negated) { cur.negated = true; cur.count = 0; }
    else if (!cur.negated) { if (m.explicit) { cur.count = cur.explicit ? cur.count + m.count : m.count; cur.explicit = true; } else if (!cur.explicit) cur.count = Math.max(cur.count, 1); }
    cur.texts.push(m.text); said.set(m.id, cur);
  }
  const S = id => said.get(id);
  const saidCount = id => (S(id) && !S(id).negated ? S(id).count : 0);
  const negated = id => !!S(id)?.negated;

  // ---- 2) صفوف البرنامج. الترتيب: الضيافة ← العائلة ← الخدمة ← النوم ← دورات المياه
  const rows = [];
  const add = (id, count, source, reason, extra = {}) => { if (count > 0) rows.push({ id, label: ROW_LABEL(id), count, source, reason, area: ROW_AREA(id), floor: ROW_FLOOR(id), ...extra }); };

  // المجالس: «مجلسين» = رجال ونساء؛ «مجلس رجال ومجلس نساء» صريح
  const genericMajlis = saidCount('majlis');
  let men = saidCount('majlis_men'), women = saidCount('majlis_women');
  if (!men && !women && genericMajlis) { men = 1; women = genericMajlis >= 2 ? 1 : 0; }
  const majlisNegated = negated('majlis') || (negated('majlis_men') && !women);
  if (men) add('majlis_men', men, 'said', S('majlis_men') ? `قلتَ «${S('majlis_men').texts[0]}»` : genericMajlis >= 2 ? `قلتَ ${genericMajlis === 2 ? 'مجلسين' : genericMajlis + ' مجالس'}: الأول للرجال` : 'قلتَ «مجلس»: مجلس الرجال بمدخله');
  else if (!majlisNegated && !negated('majlis_men')) add('majlis_men', 1, 'custom', 'العرف: مجلس رجال لاستقبال الضيوف بمدخل مستقل؛ احذفه إن لم تحتجه');
  if (women) add('majlis_women', women, 'said', S('majlis_women') ? `قلتَ «${S('majlis_women').texts[0]}»` : 'قلتَ مجلسين: الثاني للنساء');
  if (genericMajlis > 2) add('majlis', genericMajlis - 2, 'said', `قلتَ ${genericMajlis} مجالس: ما زاد عن مجلسي الرجال والنساء`);
  const majlisTotal = rows.filter(r => COUNT_KEY[r.id] === 'majlis').reduce((a, r) => a + r.count, 0);
  // المقلط
  if (saidCount('dining')) add('dining', saidCount('dining'), 'said', `قلتَ «${S('dining').texts[0]}»`);
  else if (!negated('dining') && majlisTotal) add('dining', 1, 'custom', 'العرف: مقلط بجوار المجلس لضيافة الطعام؛ احذفه إن كنت تأكل في الصالة');
  // الصالة العائلية
  if (saidCount('hall')) add('hall', saidCount('hall'), 'said', `قلتَ «${S('hall').texts[0]}»`);
  else if (!negated('hall')) add('hall', 1, 'custom', 'صالة عائلية واحدة قلب البيت تتفرع منها الغرف (بدل الممرات الطويلة)');
  // المطبخ
  const prep = saidCount('kitchen_prep'), kGeneric = saidCount('kitchen');
  if (!negated('kitchen')) add('kitchen', 1, kGeneric ? 'said' : 'custom', kGeneric ? `قلتَ «${S('kitchen').texts[0]}»` : 'كل بيت يحتاج مطبخًا رئيسيًا؛ أُدرج تلقائيًا');
  if (prep || kGeneric >= 2) add('kitchen_prep', Math.max(prep, kGeneric - 1), 'said', prep ? `قلتَ «${S('kitchen_prep').texts[0]}»: مطبخ تحضيري يخدم المقلط` : 'قلتَ «مطبخين»: الثاني تحضيري للضيافة');
  // الخدمة
  if (saidCount('maid')) add('maid', saidCount('maid'), 'said', `قلتَ «${S('maid').texts[0]}»`, { bath: true });
  if (saidCount('driver')) add('driver', saidCount('driver'), 'said', `قلتَ «${S('driver').texts[0]}»`);
  if (saidCount('laundry')) add('laundry', 1, 'said', `قلتَ «${S('laundry').texts[0]}»: شريط خدمة ملاصق للمطبخ`);
  if (saidCount('storage')) add('storage', 1, 'said', `قلتَ «${S('storage').texts[0]}»: مخزن ملاصق للمطبخ`);
  if (saidCount('office')) add('office', 1, 'said', `قلتَ «${S('office').texts[0]}»`);
  if (saidCount('prayer')) add('prayer', 1, 'said', `قلتَ «${S('prayer').texts[0]}»: قرب المجلس لصلاة الضيوف`);
  if (saidCount('guest_room')) add('guest_room', 1, 'said', `قلتَ «${S('guest_room').texts[0]}»: قرب المجلس بعيدًا عن جناح العائلة`);
  // غرف النوم: المجموع الصريح («أربع غرف نوم») يحكم؛ وإلا يُركَّب من الأسرة والفراغات المسماة
  const totalSaid = S('bedroom')?.explicit ? saidCount('bedroom') : 0;
  const masterSaid = saidCount('master') > 0;
  const boysSaid = saidCount('bedroom_boys'), girlsSaid = saidCount('bedroom_girls');
  const elderSaid = saidCount('elderly_room');
  const famRow = id => inferred.rows.filter(r => r.id === id).reduce((a, r) => a + r.count, 0);
  const famBoys = famRow('bedroom_boys'), famGirls = famRow('bedroom_girls'), famElder = famRow('elderly_room');
  const reasonOf = id => inferred.rows.find(r => r.id === id)?.reason || '';
  const masterCount = Math.max(1, saidCount('master'));
  add('master', masterCount, masterSaid ? 'said' : 'custom', masterSaid ? `قلتَ «${S('master').texts[0]}»` : totalSaid ? `ضمن الغرف الـ${totalSaid} التي ذكرتها: غرفة الوالدين الرئيسية بحمامها وخزانتها` : 'جناح الوالدين الرئيسي بحمامه وخزانته؛ لا يُولَّد بيت بلا غرفة نوم', { bath: true });
  const boys = Math.max(boysSaid, famBoys), girls = Math.max(girlsSaid, famGirls), elder = Math.max(elderSaid, famElder);
  if (boys) add('bedroom_boys', boys, boysSaid ? 'said' : 'family', boysSaid ? `قلتَ «${S('bedroom_boys').texts[0]}»` : reasonOf('bedroom_boys'), { bath: !!inferred.rows.find(r => r.id === 'bedroom_boys' && r.bath) });
  if (girls) add('bedroom_girls', girls, girlsSaid ? 'said' : 'family', girlsSaid ? `قلتَ «${S('bedroom_girls').texts[0]}»` : reasonOf('bedroom_girls'));
  if (elder) add('elderly_room', elder, elderSaid ? 'said' : 'family', elderSaid ? `قلتَ «${S('elderly_room').texts[0]}»` : reasonOf('elderly_room'), { bath: true, floor: 'ground' });
  const named = masterCount + boys + girls + elder;
  if (totalSaid > named) add('bedroom', totalSaid - named, 'said', `قلتَ «${S('bedroom').texts[0]}»: ${totalSaid - named} ${totalSaid - named === 1 ? 'غرفة' : 'غرف'} أخرى غير الرئيسية${boys || girls || elder ? ' والمسماة' : ''}`);
  else if (totalSaid && totalSaid < named) notes.push(`قلتَ ${totalSaid} غرف نوم، لكن الغرف المسماة (الرئيسية والأبناء والوالدين) ${named}؛ اعتمدتُ ${named} وعدّل الجدول إن أردت.`);
  else if (!totalSaid && saidCount('bedroom') && !S('bedroom').explicit && !boys && !girls && !elder) add('bedroom', 1, 'said', `قلتَ «${S('bedroom').texts[0]}» بلا عدد: غرفة واحدة غير الرئيسية`);
  const bedroomsTotal = rows.filter(r => COUNT_KEY[r.id] === 'bedrooms').reduce((a, r) => a + r.count, 0);
  const bedroomInfo = totalSaid || boys || girls || elder || masterSaid || fam.couple || saidCount('bedroom');

  // ---- 3) الأعراف المنطبقة (معلنة، قابلة للتعطيل)
  const base0 = extractRequirements(idea, { clauses: false });
  const ctx = { majlis: majlisTotal, majlisWomen: women, bedrooms: bedroomsTotal, kidsRooms: boys + girls, dining: rows.some(r => r.id === 'dining') ? 1 : 0, kitchens: rows.some(r => r.id === 'kitchen') ? 1 : 0, maid: rows.some(r => r.id === 'maid'), elderly: elder > 0, saidOpenKitchen: base0.prefs.openKitchen === true || !!base0.prefs.kitchenOpenHall, saidKitchenClosed: base0.prefs.openKitchen === false };
  const customs = applicableCustoms(ctx, disabledCustoms);
  const on = id => customs.some(c => c.id === id && c.on);

  // ---- 4) دورات المياه: محسوبة من البرنامج ما لم يذكر العميل عددًا صريحًا
  const allEnsuite = !!base0.prefs.allEnsuite, shared = !!base0.prefs.sharedBaths;
  const menRow = rows.some(r => r.id === 'majlis_men') ? 1 : 0, womenRow = rows.some(r => r.id === 'majlis_women') ? 1 : 0;
  const guestWc = menRow + womenRow + (saidCount('guest_wc') ? Math.max(0, saidCount('guest_wc') - menRow - womenRow) : 0);
  const others = bedroomsTotal - masterCount;
  const suiteBaths = masterCount + (shared ? Math.ceil(others / 2) : others);
  const serviceBaths = (rows.some(r => r.id === 'maid') && on('maid_service') ? 1 : 0) + (rows.some(r => r.id === 'driver') && /سائق[^،,.]{0,20}(حمام|دوره مياه)/.test(t) ? 1 : 0);
  const bathSaid = S('bath')?.explicit ? saidCount('bath') : 0;
  if (bathSaid) {
    add('bath', bathSaid, 'said', `قلتَ «${S('bath').texts[0]}»؛ يوزّعها المولّد: الضيوف أولًا ثم الرئيسية ثم بقية الغرف`);
    const need = guestWc + suiteBaths + serviceBaths;
    if (bathSaid < need) notes.push(`قلتَ ${bathSaid} دورات مياه؛ تغطية كل الغرف (الضيوف ${guestWc}، النوم ${suiteBaths}${serviceBaths ? '، الخدمة ' + serviceBaths : ''}) تحتاج ${need}. أبقيتُ عددك؛ زد الصف إن أردت.`);
  } else {
    if (guestWc) add('guest_wc', guestWc, saidCount('guest_wc') ? 'said' : 'custom', womenRow ? 'دورة مياه لمجلس الرجال وأخرى لمجلس النساء' : 'دورة مياه ضيوف ملاصقة للمجلس (لا يدخل الضيف جناح العائلة)');
    add('bath_suite', suiteBaths, allEnsuite || shared ? 'said' : 'custom', allEnsuite ? 'قلتَ: حمام لكل غرفة' : shared ? 'قلتَ: الرئيسية بحمامها وكل غرفتين تتشاركان حمامًا' : 'الرئيسية بحمامها، وحمام ملحق لكل غرفة نوم (نمط الفلل الحديثة)؛ عدّله إن أردت حمامات مشتركة');
    if (serviceBaths) add('bath_service', serviceBaths, 'custom', 'حمام الخادمة بغرفتها (عرف)' + (serviceBaths > 1 ? ' وحمام السائق' : ''));
  }

  // ---- 5) ما لا يُرسم في هذا الإصدار (بصدق)
  for (const m of mentions) if (SPACE[m.id].unsupported && !m.negated && !unsupported.includes(SPACE[m.id].unsupported)) unsupported.push(SPACE[m.id].unsupported);
  if (saidCount('dressing')) notes.push('غرفة الملابس تُقتطع من جناح الغرفة الرئيسية ولا تظهر صفًا مستقلًا.');
  let floors = base0.prefs.floors || (land?.floors === 2 ? 2 : 1);
  if (THREE_FLOORS.test(t)) { unsupported.push('ثلاثة أدوار فأكثر غير مدعومة في المولّد حاليًا؛ سأصمم دورين (أرضي وأول) وما زاد يُضاف لاحقًا في المرسم.'); floors = 2; }

  // ---- 6) التعديلات اليدوية على الجدول (تبقى على الصفوف بعد كل إعادة بناء)
  for (const e of edits) {
    const i = rows.findIndex(r => r.id === e.id);
    if (e.op === 'remove' || (e.op === 'set' && e.count <= 0)) { if (i >= 0) rows.splice(i, 1); continue; }
    if (e.op === 'set' && i >= 0) { rows[i] = { ...rows[i], count: e.count, source: 'edit', reason: `عدّلتَه إلى ${e.count}` }; continue; }
    if ((e.op === 'add' || e.op === 'set') && i < 0 && (ADDABLE.includes(e.id) || BATH_ROWS[e.id])) add(e.id, e.count || 1, 'edit', 'أضفتَه بنفسك', e.id === 'master' || e.id === 'elderly_room' ? { bath: true } : {});
  }
  // الدور المقترح: بدور واحد كل شيء أرضي؛ بدورين النوم فوق والضيافة والخدمة تحت، والصالة الثانية فوق
  let hallSeen = 0;
  for (const r of rows) { r.floor = floors === 1 ? 'ground' : r.id === 'hall' && r.count >= 2 ? 'both' : ROW_FLOOR(r.id); if (r.id === 'hall') hallSeen++; }
  if (floors === 2 && hallSeen) notes.push('بدورين: الدور المقترح في الجدول اقتراح؛ المولّد يقرر التوزيع النهائي ويضع الصالة الثانية علويًا.');

  // ---- 7) الأعداد التي يستهلكها المولّد
  const counts = { bedrooms: 0, majlis: 0, baths: 0, kitchens: 0, halls: 0, dining: 0 };
  for (const r of rows) if (COUNT_KEY[r.id]) counts[COUNT_KEY[r.id]] += r.count;
  for (const k of Object.keys(counts)) counts[k] = Math.min(10, counts[k]);
  if (counts.bedrooms < 1) { counts.bedrooms = 1; if (!rows.some(r => r.id === 'master')) add('master', 1, 'custom', 'لا يُولَّد بيت بلا غرفة نوم؛ أُعيدت الغرفة الرئيسية', { bath: true }); }

  // ---- 8) المتطلبات: الفهم المحلي القائم + فهم Claude إن وجد + الأعراف المفعّلة
  let req = extractRequirements(idea, { counts });
  if (ai) req = withAi(req, ai);
  req.counts = { ...counts };
  if (floors === 2) req.prefs.floors = 2;
  // الفراغات الإضافية من الجدول (الجدول هو الحقيقة بعد التعديلات)
  const extras = {};
  for (const r of rows) {
    const k = EXTRA_KEY[r.id]; if (!k) continue;
    const prev = req.extras[k];
    if (k === 'maid') extras.maid = { bath: on('maid_service') || !!prev?.bath, ext: !!prev?.ext || on('maid_service') };
    else if (k === 'driver') extras.driver = { bath: !!prev?.bath };
    else if (k === 'guestRoom') extras.guestRoom = { bath: !!prev?.bath };
    else if (k === 'office') extras.office = prev || true;
    else extras[k] = true;
  }
  req.extras = extras;
  // الأعراف: تفضيلات للمولّد وقواعد مكانية من جمل قياسية (كلام العميل يتقدم عند التعارض)
  const sentences = [];
  for (const c of customs) {
    if (!c.on) continue;
    const def = CUSTOM[c.id];
    if (def.prefs) for (const [k, v] of Object.entries(def.prefs)) if (req.prefs[k] === undefined) req.prefs[k] = v;
    if (def.sentence) sentences.push(def.sentence);
  }
  if (sentences.length) {
    const cr = extractRequirements(sentences.join('، '), { clauses: false }).rules.map(r => ({ ...r, custom: true }));
    req.rules = mergeRules(cr, req.rules || []);
  }
  if (bathSaid) delete req.prefs.allEnsuite; // العدد الصريح يحكم التوزيع
  else if (!shared && !allEnsuite && others > 0) req.prefs.allEnsuite = true; // حمام لكل غرفة (العرف المعلن في الجدول)
  // ما فهمته من العلاقات والتفضيلات (الفراغات نفسها في الجدول فلا تُكرَّر)
  const understood = (req.understood || []).filter(u => !EXTRA_UNDERSTOOD.test(u) && !(u === 'بدون مجلس' && counts.majlis > 0) && !(u === 'بدون غرفة طعام' && counts.dining > 0));
  req.understood = understood;
  req.unsupported = [...new Set([...(req.unsupported || []), ...unsupported])];
  // ما لم يُفهم: يُستبعد منه ما فهمه المعجم أو قارئ الأسرة
  req.unclear = (req.unclear || []).filter(c => { const f = parseFamily(c); return !findSpaces(c).length && !f.mentioned && !f.ages && !/^(?:كلهم|كلهن|الابناء|الأبناء)/.test(normalizeAr(c)); });

  // ---- 9) الاكتشاف (client-brief) من الأسرة والأعراف
  const avoids = [];
  if (on('guest_separation')) avoids.push(AVOIDS[1]);
  if (on('dining_service')) avoids.push(AVOIDS[4]);
  const life = {};
  if (fam.guests === 'frequent') life.guests = 'متكررة'; else if (fam.guests === 'rare') life.guests = 'قليلة';
  if (elder) life.seniors = 'موجودون';
  if (boys || girls) life.children = 'جناح هادئ';
  const discovery = normalizeDiscovery({ likes: [], rejects: [], avoids, life });

  // ---- 10) الأسئلة: فقط ما ينقص ويغيّر التصميم، بترتيب الأثر، كل سؤال بسببه. ثلاثة في الدور الواحد كحد أقصى.
  const skip = new Set(skipped);
  const Q = [];
  if (!bedroomInfo) Q.push({ id: 'bedrooms', text: 'كم غرفة نوم تحتاج (مع غرفة الوالدين الرئيسية)؟ أو حدّثني عن أسرتك.', reason: 'أسأل لأن عدد غرف النوم يحدد حجم جناح العائلة وعدد الحمامات، وهو أكبر مساحة في البيت. بلا جواب أبقي غرفة واحدة.', options: [2, 3, 4, 5, 6].map(n => ({ id: String(n), label: `${n} غرف`, text: `${n} غرف نوم` })), free: true, placeholder: 'مثال: 3 أولاد وبنتين وأمي تسكن معنا' });
  for (const q of inferred.questions) Q.push(q);
  if (rows.some(r => r.id === 'majlis_men') && !women && !negated('majlis_women') && genericMajlis < 2) Q.push({ id: 'women_majlis', text: 'هل تحتاج مجلس نساء مستقلًا، أم تكفي الصالة لاستقبال النساء؟', reason: 'أسأل لأن مجلس النساء يضيف فراغًا ودورة مياه ويحدد موقع مدخل العائلة بعيدًا عن مدخل الرجال.', options: [{ id: 'yes', label: 'نعم، مجلس نساء', text: 'ومجلس نساء' }, { id: 'no', label: 'لا، الصالة تكفي', text: 'مجلس النساء غير مطلوب' }], free: true });
  if (!rows.some(r => r.id === 'maid') && !negated('maid') && (boys + girls >= 1 || elder || bedroomsTotal >= 4)) Q.push({ id: 'service', text: 'هل تحتاج غرفة خادمة أو غرفة سائق؟', reason: 'أسأل لأن غرفة الخادمة تحدد باب الخدمة وموقع المطبخ، والسائق يحتاج بابًا على الحوش بعيدًا عن العائلة.', options: [{ id: 'maid', label: 'غرفة خادمة', text: 'وغرفة خادمة' }, { id: 'driver', label: 'غرفة سائق', text: 'وغرفة سائق' }, { id: 'none', label: 'لا أحتاج', text: 'بدون خادمة وبدون سائق' }], multi: true, free: true });
  if (land?.entries?.length > 1 && majlisTotal && !(req.rules || []).some(r => r.kind === 'place' && r.a === 'majlis')) {
    const AR_SIDE = { n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب' };
    Q.push({ id: 'majlis_entry', text: 'على أي شارع يكون مجلس الرجال ومدخله؟', reason: 'أسأل لأن موقع مجلس الرجال يحدد مكان المدخل الثاني؛ والمولّد يوزّع بحسب المدخل الأول ويراعي الجهة التي تختارها كقاعدة مكانية.', options: land.entries.map(s => ({ id: s, label: `جهة ${AR_SIDE[s]}`, text: `المجلس في جهة ${AR_SIDE[s]}` })), free: true });
  }
  if (rows.some(r => r.id === 'kitchen') && !ctx.saidOpenKitchen && !ctx.saidKitchenClosed && !disabledCustoms.includes('kitchen_closed')) Q.push({ id: 'kitchen_style', text: 'المطبخ مغلق بباب أم مفتوح؟', reason: 'أسأل لأن المطبخ المفتوح يُلصق بالصالة أو الطعام ويغيّر شكل قلب البيت؛ المغلق يُعزل عن الضيوف. بلا جواب أبقيه مغلقًا (العرف).', options: [{ id: 'closed', label: 'مغلق', text: 'المطبخ مغلق' }, { id: 'hall', label: 'مفتوح على الصالة', text: 'المطبخ مفتوح على الصالة' }, { id: 'dining', label: 'مفتوح على الطعام', text: 'المطبخ مفتوح على الطعام' }], free: true });
  for (const q of Q) if (!skip.has(q.id) && questions.length < 3) questions.push(q);

  const area = rows.reduce((a, r) => a + r.area * r.count, 0);
  const totals = { rooms: rows.reduce((a, r) => a + r.count, 0), area: Math.round(area), builtArea: Math.round(area * 1.3), note: 'المساحات افتراضات تصميمية من المولّد (ليست اشتراطات نظامية)؛ المبنى ≈ المجموع + 30٪ جدرانًا وممرات.' };
  return { program: rows, customs, counts, requirements: req, discovery, idea, questions, unsupported: req.unsupported, understood, notes, family: fam, floors, totals };
}

/** يحوّل جواب سؤال (اختيار أو كتابة حرة) إلى جملة تُضاف إلى كلام العميل فيُعاد البناء. */
export function answerToText(question, value) {
  if (!question) return '';
  const picks = Array.isArray(value?.picks) ? value.picks : Array.isArray(value) ? value : typeof value === 'string' && question.options?.some(o => o.id === value) ? [value] : [];
  const free = typeof value === 'string' && !picks.length ? value : typeof value?.text === 'string' ? value.text : '';
  const parts = picks.map(p => question.options.find(o => o.id === p)?.text || '').filter(Boolean);
  if (free.trim()) parts.push(free.trim());
  return parts.join(' ');
}

/** خطوات المسار الإرشادي بترتيب أثرها على التصميم؛ كل خطوة سؤال بسببه، بخيارات وكتابة حرة. */
export const GUIDED_STEPS = Object.freeze([
  { id: 'g_family', text: 'من يسكن البيت؟ اذكر الأبناء وأعمارهم تقريبًا، وهل يسكن معكم الوالدان.', reason: 'أسأل أولًا لأن تركيبة الأسرة تحدد عدد غرف النوم وتقسيمها (بنون/بنات/الوالدين) وهي أكبر مساحة في البيت.', options: [{ id: 'couple', label: 'زوجان بلا أبناء', text: 'انا وزوجتي بدون اطفال' }, { id: 'mother', label: 'والدتي تسكن معنا', text: 'وامي تسكن معنا' }, { id: 'father', label: 'والدي يسكن معنا', text: 'وابوي يسكن معنا' }], multi: true, free: true, placeholder: 'مثال: 3 أولاد وبنتين صغار' },
  { id: 'g_guests', text: 'كيف تستقبل ضيوفك؟', reason: 'أسأل لأن المجلس ومدخله يحددان مكان المدخل الثاني وفصل الضيوف عن العائلة، والمقلط يتبع المجلس.', options: [{ id: 'men', label: 'مجلس رجال فقط', text: 'مجلس رجال' }, { id: 'both', label: 'مجلس رجال ومجلس نساء', text: 'مجلس رجال ومجلس نساء' }, { id: 'one', label: 'مجلس واحد للجميع', text: 'مجلس واحد' }, { id: 'none', label: 'بدون مجلس', text: 'بدون مجلس' }, { id: 'frequent', label: 'ضيوفنا كثير', text: 'وضيوفنا كثير' }], multi: true, free: true, placeholder: 'مثال: مجلس رجال كبير يتسع لعشرين شخص ومقلط' },
  { id: 'g_sleep', text: 'غرف النوم وحماماتها: كل غرفة بحمامها، أم تتشارك؟ ويمكنك تحديد العدد.', reason: 'أسأل لأن عدد الحمامات الملحقة يغيّر عرض جناح النوم ومسار الممرات، ولا يُستنتج من عدد الأفراد وحده.', options: [{ id: 'ensuite', label: 'كل غرفة بحمامها', text: 'كل غرفة نوم بحمامها' }, { id: 'shared', label: 'الرئيسية بحمامها والباقي يتشارك', text: 'الماستر بحمامها والباقي يتشاركون الحمام' }, { id: 'dressing', label: 'غرفة ملابس للرئيسية', text: 'وغرفة ملابس للماستر' }], multi: true, free: true, placeholder: 'مثال: 4 غرف نوم، الماستر كبيرة' },
  { id: 'g_kitchen', text: 'المطبخ والخدمة: ما الذي تحتاجه؟', reason: 'أسأل لأن المطبخ يحدد موقع المقلط وباب الخدمة، وغرفة الخادمة والسائق تحتاج أبوابًا خارجية.', options: [{ id: 'closed', label: 'مطبخ مغلق', text: 'المطبخ مغلق' }, { id: 'open', label: 'مطبخ مفتوح على الصالة', text: 'المطبخ مفتوح على الصالة' }, { id: 'prep', label: 'مطبخ تحضيري', text: 'ومطبخ تحضيري' }, { id: 'maid', label: 'غرفة خادمة', text: 'وغرفة خادمة' }, { id: 'driver', label: 'غرفة سائق', text: 'وغرفة سائق' }, { id: 'laundry', label: 'غرفة غسيل', text: 'وغرفة غسيل' }, { id: 'storage', label: 'مستودع', text: 'ومستودع' }], multi: true, free: true },
  { id: 'g_extras', text: 'إضافات: اختر ما تريده، وسأخبرك بصدق بما لا يُرسم في هذا الإصدار.', reason: 'أسأل أخيرًا لأن الإضافات لا تغيّر هيكل البيت لكنها تحجز مكانًا (المكتب والمصلى قرب المجلس، وغرفة الضيوف بعيدًا عن العائلة).', options: [{ id: 'office', label: 'مكتب', text: 'ومكتب' }, { id: 'prayer', label: 'مصلى', text: 'ومصلى' }, { id: 'guest', label: 'غرفة نوم للضيوف', text: 'وغرفة نوم للضيوف' }, { id: 'two', label: 'دورين', text: 'البيت دورين' }, { id: 'pool', label: 'مسبح', text: 'ومسبح' }, { id: 'annex', label: 'ملحق خارجي', text: 'وملحق خارجي' }, { id: 'elevator', label: 'مصعد', text: 'ومصعد' }, { id: 'none', label: 'لا شيء', text: '' }], multi: true, free: true },
]);

export default { buildBrief, answerToText, GUIDED_STEPS, SOURCE_AR, FLOOR_AR, ADDABLE };
