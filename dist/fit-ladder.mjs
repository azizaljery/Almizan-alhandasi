// سُلّم الاتساع: الموقع يصمّم دائمًا. إن لم يجد المولّد توزيعًا سليمًا للبرنامج كاملًا على الأرض لا يرفض، بل يتدرّج:
// (أ) دوران بدل دور إن لم يحدد العميل عدد الأدوار، (ب) تصغير المقاسات الافتراضية، (ج) استبعاد ما لم يطلبه العميل صراحة،
// ثم المقاسات التي حددها (إلى المقاس المعتاد)، ثم فراغات الخدمة والكماليات، ثم الأساسيات (مجلس ثانٍ، غرف نوم، المجلس)،
// حتى يخرج تصميم سليم. ثم «بيان» مقيس من المخطط نفسه بما استُبعد وما صُغّر وما دُمج وسببه، وقرارات يضغطها العميل.
// وحدة نقية بلا DOM. لا يُدّعى شيء: البيان يُحسب من المستند وطلب العميل الأصلي، لا من نية السلّم.
import { DESIGN_TARGETS, buildProgram, NARROW, ENV_MIN } from './villa-layout.mjs';
import { footprint, validatePlot } from './planner.mjs';
import { docRooms, ROOM_OF, verifyRequest } from './rules.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const r1 = v => Math.round(v * 10) / 10;
const int = v => (Number.isInteger(v) && v > 0 ? v : 0);

/** درجات الأولوية (الأولى تُمسّ أولًا) وتعليل كل درجة بلغة العميل. */
export const FIT_TIERS = Object.freeze({
  unasked: 'اخترته أولًا لأنك لم تطلبه صراحة (افتراض من أعراف التصميم).',
  size: 'صغّرته إلى المقاس المعتاد قبل أن أستبعد أي فراغ طلبته.',
  luxury: 'اخترته قبل غيره لأنه من فراغات الخدمة والكماليات، لا من أساس البيت.',
  core: 'من أساس البيت؛ لم أمسّه إلا بعد تصغير واستبعاد كل ما هو أقل أولوية.',
});
export const KEY_LABEL = Object.freeze({
  kitchen_prep: 'المطبخ التحضيري', hall2: 'الصالة العائلية الثانية', dining: 'غرفة الطعام', ensuite: 'حمام خاص لكل غرفة نوم', majlis_w: 'مجلس النساء', majlis: 'المجلس',
  office: 'المكتب', prayer: 'المصلى', storage: 'المخزن', laundry: 'غرفة الغسيل', driver: 'غرفة السائق', guestRoom: 'غرفة الضيوف', maid: 'غرفة الخادمة', bedrooms: 'غرف النوم',
  shrink: 'مقاسات الغرف', 'size:hall': 'مقاس الصالة', 'size:kitchen': 'مقاس المطبخ', 'size:dining': 'مقاس غرفة الطعام', 'size:bedroom': 'مقاس غرف النوم', 'size:master': 'مقاس الغرفة الرئيسية', 'size:majlis': 'مقاس المجلس',
  floors: 'عدد الأدوار', baths: 'دورات المياه', elevator: 'المصعد',
});
const SOURCE_OF = { kitchen_prep: ['kitchen_prep'], hall2: ['hall'], dining: ['dining'], majlis_w: ['majlis_women'], majlis: ['majlis_men', 'majlis'], office: ['office'], prayer: ['prayer'], storage: ['storage'], laundry: ['laundry'], driver: ['driver'], guestRoom: ['guest_room'], maid: ['maid'], ensuite: ['bath_suite'] };
/** هل طلب العميل هذا البند صراحة؟ requirements.sources (من جدول شرعاء: said/edit = صريح، custom/family = افتراض). بلا مصادر: يُعدّ صريحًا. */
export function isAsked(req, key) {
  if (/^size:/.test(key)) return true; // المقاس لا يدخل الطلب إلا إن قاله العميل
  const src = req?.sources; if (!src) return true;
  if (key === 'ensuite') return ['said', 'edit'].includes(src.bath_suite) || (req.understood || []).some(u => /حمامها الملحق/.test(u));
  return (SOURCE_OF[key] || [key]).some(id => ['said', 'edit'].includes(src[id]));
}

/** حقائق الأرض بالأرقام: الارتدادات والمسطح القابل للبناء (العرض على الواجهة × العمق) كما يحسبه المولّد. */
export function fitFacts(land) {
  const plot = validatePlot({ width: Number(land.width), length: Number(land.length), floors: 1, streets: Object.fromEntries((land.streets || []).map(s => [s, true])), entry: land.entries?.[0] || land.entry });
  const fp = footprint(plot), sn = ['s', 'n'].includes(plot.entry);
  const W = r1(sn ? fp.w : fp.h), D = r1(sn ? fp.h : fp.w);
  const side = sn ? [fp.sb.w, fp.sb.e] : [fp.sb.s, fp.sb.n], deep = sn ? [fp.sb.s, fp.sb.n] : [fp.sb.w, fp.sb.e];
  return { plotW: sn ? plot.width : plot.length, plotD: sn ? plot.length : plot.width, W, D, area: Math.round(W * D), sideSetbacks: side, depthSetbacks: deep, entry: plot.entry };
}
/** احتياج البرنامج التقريبي بالمقاسات التصميمية (م²، بين محاور الجدران، قبل الممرات). */
export function programNeed(req) {
  try { const p = buildProgram(req.counts || {}, req); return Math.round(p.blocks.reduce((a, b) => a + b.area, 0) + DESIGN_TARGETS.foyer + (p.hall ? p.hallArea : 14)); } catch { return null; }
}

function normalizeBaths(req) {
  const c = req.counts, N = int(c.bedrooms), M = Math.min(2, int(c.majlis)), ex = req.extras || {};
  const cap = M + (req.prefs?.allEnsuite ? N : 1 + Math.ceil(Math.max(0, N - 1) / 2)) + (ex.maid?.bath ? 1 : 0) + (ex.driver?.bath ? 1 : 0) + (ex.guestRoom?.bath ? 1 : 0);
  if (int(c.baths) > cap) c.baths = cap;
  return req;
}
const SOFT = { hall: .86, bedroom: .9, kitchen: .9, majlis: .9 }, HARD = { hall: .74, bedroom: .82, kitchen: .82, majlis: .8 };
const explicitKinds = req => { const a = req.areas || {}, p = req.prefs || {}; return { hall: !!(a.hall || p.big_hall), bedroom: !!(a.bedroom || a.master || p.big_master), kitchen: !!(a.kitchen || a.dining || p.big_kitchen), majlis: !!(a.majlis || p.big_majlis) }; };
/** تصغير المقاسات الافتراضية (لا يمسّ فراغًا حدّد العميل مقاسه): الدرجة الخفيفة ثم الشديدة (تحل محلها، لا تُضرب فيها). */
function scale(req, hard) {
  const ex = explicitKinds(req), tw = (req.tweaks ||= {}), done = (tw.__fit ||= {});
  for (const k of Object.keys(SOFT)) { if (ex[k]) continue; const f = hard ? HARD[k] / (done[k] ? SOFT[k] : 1) : SOFT[k]; tw[k + 'Scale'] = (tw[k + 'Scale'] || 1) * f; done[k] = true; }
  return req;
}

/**
 * درجات السلّم لهذا الطلب بالترتيب. كل درجة: { id, key, tier, kind: 'shrink'|'drop'|'merge', label, can(req), apply(req) }.
 * ما ثبّته العميل (requirements.fit.keep) لا يُمسّ.
 */
export function ladderSteps(req0) {
  const keep = new Set(req0.fit?.keep || []), out = [];
  const add = (id, key, tier, kind, can, apply, label = KEY_LABEL[key]) => { if (!keep.has(key)) out.push({ id, key, tier, kind, label, asked: key !== 'shrink' && isAsked(req0, key), can, apply: r => normalizeBaths(apply(r) || r) }); };
  const drop = (key, kind, can, apply) => ({ key, kind, can, apply });
  const extra = k => drop(k, 'drop', r => !!r.extras?.[k], r => { delete r.extras[k]; });
  const ITEMS = [
    drop('kitchen_prep', 'drop', r => int(r.counts.kitchens) > 1, r => { r.counts.kitchens = 1; }),
    drop('hall2', 'drop', r => int(r.counts.halls) > 1, r => { r.counts.halls = 1; }),
    extra('office'), extra('prayer'), extra('storage'), extra('laundry'), extra('driver'), extra('guestRoom'), extra('maid'),
    drop('dining', 'merge', r => int(r.counts.dining) > 0, r => { r.counts.dining = 0; }),
  ];
  const CORE = [
    drop('majlis_w', 'merge', r => int(r.counts.majlis) >= 2, r => { r.counts.majlis = 1; (r.prefs ||= {}).womenSeparate = false; }),
    drop('ensuite', 'merge', r => !!r.prefs?.allEnsuite && int(r.counts.bedrooms) >= 3, r => { r.prefs.allEnsuite = false; r.prefs.sharedBaths = true; }),
  ];
  // (ب) تصغير المقاسات الافتراضية أولًا
  add('shrink:soft', 'shrink', 'unasked', 'shrink', r => Object.values(explicitKinds(r)).some(x => !x), r => scale(r, false));
  // (ج-1) ما لم يطلبه العميل صراحة
  for (const it of [...ITEMS, ...CORE]) if (!isAsked(req0, it.key)) add(it.key, it.key, 'unasked', it.kind, it.can, it.apply);
  if (!isAsked(req0, 'majlis')) add('majlis', 'majlis', 'unasked', 'drop', r => int(r.counts.majlis) >= 1, r => { r.counts.majlis = Math.max(0, int(r.counts.majlis) - 1); if (r.areas) delete r.areas.majlis; });
  // المقاسات التي حددها العميل: إلى المقاس المعتاد (تصغير لا استبعاد)
  for (const k of ['hall', 'kitchen', 'dining', 'bedroom', 'master', 'majlis']) add('size:' + k, 'size:' + k, 'size', 'shrink', r => !!(r.areas?.[k] || r.prefs?.['big_' + k]), r => { if (r.areas) delete r.areas[k]; if (r.prefs) delete r.prefs['big_' + k]; });
  // (ج-2) الخدمة والكماليات التي طلبها
  for (const it of ITEMS) if (isAsked(req0, it.key)) add(it.key, it.key, 'luxury', it.kind, it.can, it.apply);
  add('shrink:hard', 'shrink', 'luxury', 'shrink', r => Object.values(explicitKinds(r)).some(x => !x), r => scale(r, true));
  // (ج-3) الأساسيات: مجلس النساء (يُدمج)، الحمامات الخاصة، غرف النوم واحدة واحدة، ثم المجلس، ثم غرفة النوم الثانية
  for (const it of CORE) if (isAsked(req0, it.key)) add(it.key, it.key, 'core', it.kind, it.can, it.apply);
  const N = int(req0.counts?.bedrooms);
  for (let n = N; n > 2; n--) add('bed:' + n, 'bedrooms', 'core', 'drop', r => int(r.counts.bedrooms) === n, r => { r.counts.bedrooms = n - 1; });
  if (isAsked(req0, 'majlis')) add('majlis', 'majlis', 'core', 'drop', r => int(r.counts.majlis) >= 1, r => { r.counts.majlis = Math.max(0, int(r.counts.majlis) - 1); if (r.areas) delete r.areas.majlis; });
  add('bed:2', 'bedrooms', 'core', 'drop', r => int(r.counts.bedrooms) === 2, r => { r.counts.bedrooms = 1; });
  return out;
}
/** يطبّق درجات بعينها (بمعرّفاتها وبترتيب السلّم) على نسخة من الطلب. */
export function applySteps(req0, ids, { floors = null } = {}) {
  let r = clone(req0); r.counts ||= {}; r.prefs ||= {}; r.extras ||= {}; r.areas ||= {}; r.tweaks ||= {};
  if (floors) r.prefs.floors = floors;
  const set = new Set(ids);
  for (const st of ladderSteps(req0)) if (set.has(st.id) && st.can(r)) r = st.apply(r);
  if (r.tweaks) delete r.tweaks.__fit;
  return r;
}

/** عدد الأدوار كما طلبه العميل، وهل حدّده فعلًا (في كلامه، أو غيّر اختيار نموذج الأرض، أو اختار دورين). */
export function floorsAsked(land, req) {
  const said = req?.prefs?.floors ?? null, form = Number(land?.floors) || 1;
  return { floors: said || form, specified: !!said || !!land?.floorsExplicit || form === 2 };
}

/**
 * يمشي السلّم حتى أول تصميم سليم ثم يحاول ردّ ما أمكن (الأهم أولًا).
 * attempt(req, { floors, probe }) → نتيجة التوليد أو null (لم يجد). يعيد { out, applied, floors, auto } أو null إن لم ينجح شيء.
 * hint: درجات مجرّبة سابقًا لهذا الطلب نفسه (تُجرَّب مباشرة بلا مشي ولا ردّ).
 */
export async function climb(req0, land, attempt, { hint = null, budgetMs = 4500, now = () => Date.now() } = {}) {
  const fa = floorsAsked(land, req0), steps = ladderSteps(req0);
  if (hint?.ids) { const out = await attempt(applySteps(req0, hint.ids, { floors: hint.floors }), { floors: hint.floors, probe: false }); if (out) return { out, applied: steps.filter(s => hint.ids.includes(s.id)).map(s => ({ ...s, tried: false })), floors: hint.floors, asked: fa }; }
  // الفروع: الأدوار كما طُلبت أولًا؛ بلا تحديد يُجرَّب الدوران قبل أي تخفيف؛ مخالفة عدد أدوار محدد آخر الحلول (وتُعلن)
  const branches = fa.specified ? [fa.floors, fa.floors === 2 ? 1 : 2] : [2, 1];
  for (const floors of branches) {
    const ids = []; let out = floors !== fa.floors ? await attempt(applySteps(req0, ids, { floors }), { floors, probe: false }) : null;
    for (const st of steps) {
      if (out) break;
      const before = applySteps(req0, ids, { floors }); if (!st.can(before)) continue;
      ids.push(st.id); out = await attempt(applySteps(req0, ids, { floors }), { floors, probe: false });
    }
    if (!out) continue;
    // الردّ: نحاول إعادة كل ما خُفّف، الأهم (آخر ما مُسّ) أولًا، ما دام التصميم يبقى سليمًا
    const t0 = now(), tried = new Set(); let restored = false;
    for (const id of [...ids].reverse()) {
      if (now() - t0 > budgetMs) break;
      const less = ids.filter(x => x !== id); tried.add(id);
      if (await attempt(applySteps(req0, less, { floors }), { floors, probe: true })) { ids.splice(ids.indexOf(id), 1); restored = true; }
    }
    if (restored) out = (await attempt(applySteps(req0, ids, { floors }), { floors, probe: false })) || out;
    return { out, applied: steps.filter(s => ids.includes(s.id)).map(s => ({ id: s.id, key: s.key, tier: s.tier, kind: s.kind, label: s.label, asked: s.asked, tried: tried.has(s.id) })), floors, asked: fa };
  }
  return null;
}

// ------------------------------------------------------------------------------------------ البيان (مقيس من المخطط)
const TARGET = { hall: ['الصالة', DESIGN_TARGETS.hall], majlis: ['المجلس', DESIGN_TARGETS.majlis], kitchen: ['المطبخ', DESIGN_TARGETS.kitchen], master: ['غرفة النوم الرئيسية', DESIGN_TARGETS.master], bedroom: ['غرف النوم', DESIGN_TARGETS.bedroom] };
const SHRUNK = .8; // دون 80٪ من المقاس التصميمي (بين المحاور) يُعدّ الصافي مصغَّرًا فعلًا؛ ما فوقه فرق سماكة الجدران لا أكثر
/**
 * بيان ما تغيّر عن طلب العميل، مقيسًا من المستند: { facts, items, decisions }.
 * item: { id, key, kind: 'drop'|'merge'|'shrink'|'floors', what, from, to, unit, text, why, asked, actions:[{id,label}] }.
 * fit: سجل السلّم لهذا التصميم (إن مشى): يعلّل البنود ويحدد القرارات؛ لا يُنشئ بندًا لا يظهر في القياس.
 */
export function fitStatement(doc, req = {}, { land = null, fit = null } = {}) {
  const rooms = docRooms(doc).rooms, sel = id => rooms.filter(r => ROOM_OF[id]?.(r)), named = n => rooms.filter(r => r.name === n);
  const c = req.counts || {}, ex = req.extras || {}, pr = req.prefs || {}, items = [];
  let facts = null; try { facts = land ? fitFacts(land) : null; } catch { facts = null; }
  const need = programNeed(req), nLv = doc.levels.length, applied = fit?.applied || [], stepOf = key => applied.find(s => s.key === key), keep = new Set(req.fit?.keep || []);
  const F = facts ? `عرض البناء الصافي بعد الارتدادات ${facts.W} م وعمقه ${facts.D} م (${facts.area} م² للدور)` : 'مسطح البناء المتاح بعد الارتدادات';
  const whyOf = (key, fallback) => {
    const st = stepOf(key);
    if (!st) return fallback || 'لم يجد المولّد له موضعًا سليمًا في هذا التوزيع.';
    return `لم أجد توزيعًا سليمًا يضمّه مع بقية البرنامج: ${F}${need ? `، والبرنامج كما طلبته يحتاج نحو ${need} م²${nLv > 1 ? ' على الدورين' : ''}` : ''}. ${FIT_TIERS[st.tier]}${st.tried ? ' وجرّبت إعادته بعد اكتمال التصميم فلم ينجح.' : ''}`;
  };
  const acts = key => (keep.has(key) ? [] : [{ id: 'keep:' + key, label: `أعِد ${KEY_LABEL[key] ? '«' + KEY_LABEL[key] + '»' : 'هذا'} وخفّف غيره` }]);
  const push = (key, kind, o) => items.push({ id: 'F-' + key, key, kind, asked: isAsked(req, key), byLadder: !!stepOf(key), why: whyOf(key, o.fallback), actions: stepOf(key) ? acts(key) : [], ...o });
  // الأدوار
  const fa = floorsAsked(land, req);
  if (nLv !== fa.floors) {
    const auto = !fa.specified;
    items.push({ id: 'F-floors', key: 'floors', kind: 'floors', byLadder: !!fit, what: 'عدد الأدوار', from: fa.floors, to: nLv, unit: 'دور', asked: fa.specified,
      text: nLv === 2 ? 'صُمّم البيت على دورين بدل دور واحد' : 'صُمّم البيت دورًا واحدًا بدل دورين',
      why: nLv === 2 ? `${auto ? 'لم تحدد عدد الأدوار، و' : 'طلبت دورًا واحدًا، ولكن '}لم أجد توزيعًا سليمًا للبرنامج في دور واحد (${F}${need ? `، والبرنامج يحتاج نحو ${need} م²` : ''})؛ فوزّعته على دورين.`
        : `طلبت دورين، ولم أجد توزيعًا سليمًا لدورين على هذه الأرض (${F}${facts && facts.D < ENV_MIN.d2 ? '؛ عمق البناء دون ما يلزم السلم داخل الصالة في مولّد الميزان حاليًا' : ''})؛ فصمّمته دورًا واحدًا.`,
      actions: nLv === 2 && auto ? [{ id: 'floors:1', label: 'أريده دورًا واحدًا (ويُخفَّف البرنامج)' }] : [] });
  }
  // غرف النوم
  const beds = sel('bedrooms').length, wantBeds = int(c.bedrooms);
  if (wantBeds && beds < wantBeds) push('bedrooms', 'drop', { what: 'غرف النوم', from: wantBeds, to: beds, unit: 'غرفة', text: `غرف النوم ${beds} بدل ${wantBeds}` });
  // المجالس
  const maj = sel('majlis').length + sel('majlis_w').length, wantMaj = int(c.majlis);
  if (wantMaj >= 2 && maj === 1) push('majlis_w', 'merge', { what: 'مجلس النساء', from: wantMaj, to: 1, unit: 'مجلس', text: 'مجلس واحد بدل مجلسين (دُمج مجلس النساء في المجلس)' });
  else if (wantMaj >= 1 && maj === 0) push('majlis', 'drop', { what: wantMaj >= 2 ? 'المجلسان' : 'المجلس', from: wantMaj, to: 0, unit: 'مجلس', text: wantMaj >= 2 ? 'استُبعد المجلسان' : 'استُبعد المجلس' });
  if (int(c.dining) >= 1 && !sel('dining').length) push('dining', 'merge', { what: 'غرفة الطعام', from: int(c.dining), to: 0, unit: 'غرفة', text: 'لا غرفة طعام مستقلة (دُمج الأكل في الصالة أو المطبخ)' });
  if (int(c.kitchens) >= 2 && !named('مطبخ تحضيري').length) push('kitchen_prep', 'drop', { what: 'المطبخ التحضيري', from: int(c.kitchens), to: 1, unit: 'مطبخ', text: 'استُبعد المطبخ التحضيري' });
  if (int(c.halls) >= 2 && !rooms.some(r => /^(الصالة العائلية|صالة عائلية \d+)$/.test(r.name))) push('hall2', 'drop', { what: 'الصالة العائلية الثانية', from: int(c.halls), to: 1, unit: 'صالة', text: 'استُبعدت الصالة العائلية الثانية' });
  for (const [k, sid] of [['maid', 'maid'], ['driver', 'driver'], ['office', 'office'], ['prayer', 'prayer'], ['laundry', 'laundry'], ['storage', 'storage'], ['guestRoom', 'guest']]) {
    if (ex[k] && !sel(sid).length) push(k, 'drop', { what: KEY_LABEL[k], from: 1, to: 0, unit: 'غرفة', text: `استُبعد: ${KEY_LABEL[k]}` });
  }
  // دورات المياه
  const baths = rooms.filter(r => r.type === 'bath').length, wantB = int(c.baths);
  if (wantB && baths < wantB) {
    const asked = req.sources ? ['guest_wc', 'bath_suite', 'bath', 'bath_service'].some(id => ['said', 'edit'].includes(req.sources[id])) : true;
    items.push({ id: 'F-baths', key: 'baths', byLadder: !!stepOf('ensuite'), kind: stepOf('ensuite') ? 'merge' : 'drop', what: 'دورات المياه', from: wantB, to: baths, unit: 'دورة', asked, text: `دورات المياه ${baths} بدل ${wantB}${stepOf('ensuite') ? ' (غرف النوم غير الرئيسية تتشارك الحمامات)' : ''}`,
      why: stepOf('ensuite') ? whyOf('ensuite') : beds < wantBeds || maj < wantMaj ? 'قلّ عددها تبعًا للغرف والمجالس التي استُبعدت (كل دورة مياه كانت ملحقة بفراغ).' : 'بعضها لم يجد موضعًا سليمًا في هذا التوزيع.', actions: stepOf('ensuite') ? acts('ensuite') : [] });
  }
  // المقاسات التي حددها العميل (صافٍ داخل الجدران، بتسامح سجل التنفيذ نفسه: دون 85٪ يُعدّ أصغر)
  const SUBJ = { master: 'master', majlis: 'majlis', hall: 'hall', dining: 'dining', kitchen: 'kitchen', bedroom: 'kids' };
  const pickRooms = sid => { let l = sel(sid); if (sid === 'hall') { const m = l.filter(r => r.name === 'الصالة'); l = m.length ? m : l.slice(0, 1); } if (sid === 'majlis') l = l.slice(0, 1); return l; };
  const sized = new Set();
  for (const [k, a] of Object.entries(req.areas || {})) {
    const sid = SUBJ[k]; if (!sid || !(a > 0)) continue; const small = pickRooms(sid).filter(r => r.area < a * .85).sort((p, q) => p.area - q.area)[0]; if (!small) continue;
    sized.add(k);
    push('size:' + k, 'shrink', { what: small.name, room: small.name, from: a, to: r1(small.area), unit: 'م²', basis: 'net', text: `«${small.name}» ${r1(small.area)} م² صافية بدل ${a} م² التي طلبتها` });
  }
  // تصغير المقاسات الافتراضية: يُذكر فقط إن مشى السلّم درجة تصغير، وكان الصافي المقيس دون 80٪ من المقاس التصميمي فعلًا
  if (stepOf('shrink')) for (const [k, [, target]] of Object.entries(TARGET)) {
    if (sized.has(k) || (req.areas || {})[k]) continue;
    const list = k === 'bedroom' ? sel('kids') : pickRooms(SUBJ[k]); const small = list.filter(r => r.area < target * SHRUNK).sort((p, q) => p.area - q.area)[0]; if (!small) continue;
    items.push({ id: 'F-shrink:' + k, key: 'shrink', byLadder: true, kind: 'shrink', what: small.name, room: small.name, from: target, to: r1(small.area), unit: 'م²', basis: 'axis', asked: false,
      text: `«${small.name}» ${r1(small.area)} م² صافية (المقاس التصميمي المعتاد في الميزان ${target} م² بين محاور الجدران)`, why: whyOf('shrink'), actions: [] });
  }
  if (items.some(i => i.key === 'shrink')) { const first = items.find(i => i.key === 'shrink'); first.actions = acts('shrink').map(a => ({ ...a, label: 'أعِد المقاسات المعتادة وخفّف غيرها' })); }
  // المصعد وعناصر الحوش الخارجي: من سجل التنفيذ نفسه (مقيسة من المستند)
  let ledger = []; try { ledger = verifyRequest(doc, req, { entry: land?.entries?.[0] || 's' }); } catch { ledger = []; }
  for (const x of ledger) if (!x.ok && /^(G-|E-)/.test(x.id)) items.push({ id: 'F-' + x.id, key: x.id, kind: 'drop', what: x.text, from: 1, to: 0, unit: '', asked: true, text: `لم يتحقق: ${x.text}`, why: x.why || '', actions: [] });
  // ما يقابله من بنود سجل التنفيذ (لا تُعرض مرتين بزر «نفّذ» في مقترحات الإصلاح)
  const LEDGER = { bedrooms: ['C-bed'], majlis_w: ['C-maj2', 'P-sep'], majlis: ['C-majlis1', 'C-maj2', 'P-sep', 'P-guest'], dining: ['C-dining1'], kitchen_prep: ['C-kitchen2'], hall2: ['C-hall2'], floors: ['P-floors', 'E-elevator', 'T-terrace'], baths: ['P-ens'] };
  for (const it of items) it.ledgerIds = LEDGER[it.key] || (/^size:/.test(it.key) ? ['A-' + it.key.slice(5)] : ex[it.key] ? ['X-' + it.key, 'X-' + it.key + '-bath', 'X-' + it.key + '-ext', ...(it.key === 'guestRoom' ? ['X-guest'] : [])] : /^(G-|E-)/.test(it.key) ? [it.key] : []);
  return { facts, need, items, decisions: items.length ? fitDecisions(doc, req, { land, fit, rooms, items }) : [] };
}

/** قرارات عامة يضغطها العميل ليختار هو ما يُخفَّف: دور ثانٍ، تصغير فراغ موجود، أو استبعاد فراغ موجود (أقل أولوية أولًا). */
function fitDecisions(doc, req, { land, fit, rooms, items }) {
  const out = [], sel = id => rooms.filter(r => ROOM_OF[id]?.(r)), fa = floorsAsked(land, req);
  if (doc.levels.length === 1 && fa.floors === 1 && items.some(i => i.kind !== 'floors' && !/^(G-|E-)/.test(i.key))) out.push({ id: 'floors:2', label: 'أضف دورًا ثانيًا وأعِد التصميم' });
  if (!items.some(i => ['drop', 'merge', 'shrink'].includes(i.kind) && fit?.applied?.some(s => s.key === i.key))) return out;
  const tw = req.tweaks || {};
  if (sel('majlis').length && (tw.majlisScale || 1) > .72) out.push({ id: 'shrink:majlis', label: 'صغّر المجلس' });
  if (sel('hall').length && (tw.hallScale || 1) > .72) out.push({ id: 'shrink:hall', label: 'صغّر الصالة' });
  const present = { office: 'office', prayer: 'prayer', storage: 'storage', laundry: 'laundry', driver: 'driver', guestRoom: 'guest', maid: 'maid', dining: 'dining', majlis_w: 'majlis_w' };
  for (const [k, sid] of Object.entries(present)) if (sel(sid).length && out.length < 7) out.push({ id: 'drop:' + k, label: `استبعد ${KEY_LABEL[k]}` });
  return out;
}

/**
 * يطبّق قرار العميل على طلبه (نسخة): يعيد { req, label } أو يرمي إن كان القرار غير معروف.
 * keep:<key> تثبيت بند (لا يمسّه السلّم)، drop:<key> استبعاد بقرار العميل، shrink:<kind> تصغير بقراره، floors:<n> عدد الأدوار.
 */
export function applyDecision(req0, id) {
  const r = clone(req0); r.counts ||= {}; r.prefs ||= {}; r.extras ||= {}; r.areas ||= {}; r.tweaks ||= {};
  const [verb, ...rest] = String(id).split(':'), arg = rest.join(':');
  if (verb === 'keep') { r.fit ||= {}; r.fit.keep = [...new Set([...(r.fit.keep || []), arg])]; return { req: r, label: arg === 'shrink' ? 'إعادة المقاسات المعتادة' : `إعادة «${KEY_LABEL[arg] || arg}»` }; }
  if (verb === 'floors') { const n = Number(arg); if (![1, 2].includes(n)) throw Error('قرار غير معروف.'); r.prefs.floors = n; return { req: r, label: n === 2 ? 'إضافة دور ثانٍ' : 'دور واحد' }; }
  if (verb === 'shrink') { if (!['majlis', 'hall'].includes(arg)) throw Error('قرار غير معروف.'); const k = arg + 'Scale'; if (r.areas[arg]) r.areas[arg] = Math.round(r.areas[arg] * .85); else r.tweaks[k] = (r.tweaks[k] || 1) * .85; return { req: r, label: arg === 'majlis' ? 'تصغير المجلس' : 'تصغير الصالة' }; }
  if (verb === 'drop') {
    const st = ladderSteps({ ...r, fit: null, sources: null }).find(s => s.key === arg && s.kind !== 'shrink'); if (!st) throw Error('قرار غير معروف.');
    if (!st.can(r)) throw Error('هذا الفراغ غير موجود في طلبك أصلًا.');
    const out = st.apply(r); if (out.sources) { for (const sid of SOURCE_OF[arg] || []) delete out.sources[sid]; }
    if (arg === 'dining' || arg === 'majlis') { /* «بدون» يُسجَّل صفرًا فيتحقق منه سجل التنفيذ */ }
    return { req: out, label: `استبعاد ${KEY_LABEL[arg] || arg}` };
  }
  throw Error('قرار غير معروف.');
}

export default { ladderSteps, applySteps, climb, fitStatement, fitFacts, applyDecision, floorsAsked, isAsked, programNeed, FIT_TIERS, KEY_LABEL };
