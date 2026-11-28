// جلسة التصميم: التصميم الأولي يُعرض على العميل، ويطلب بديلًا بعد أن تسأله شرعاء عمّا لم يعجبه،
// ثم يعتمده فينتقل إلى العرض ثلاثي الأبعاد. وحدة نقية بلا DOM؛ التخزين يُمرَّر (localStorage أو بديل في الاختبار).
import { generateInitialDesign } from './home-flow.mjs';
import { extractRequirements } from './requirements.mjs';
import { verifyRequest, mergeRules } from './rules.mjs';
import { withAi } from './requirements.mjs';
export { mergeRules };
import { parseDoc, serialize } from './draw/doc.mjs';
import { visualSig, visualSim, macroSig, macroSim, MACRO_LIMIT, visualItems, alignSig, VISUAL_LIMIT, BLEND_COPY, splitFails, designsAr, HALL_LIMITS, HALL_RELAX, setHallRelax, planMetrics } from './villa-layout.mjs';
import { fitStatement } from './fit-ladder.mjs';
import { scorePlan, rankByScore } from './plan-score.mjs';
import { solarSite } from './geo-land.mjs';
import { reviewV3, validateV3Generation } from './sharaa-v3/quality.mjs';
import { reviewGate, stampDesign, approveDesign, planVersion, ctxOfSession, reviewEnforced, DISCLAIMER as REVIEW_DISCLAIMER } from './design-review.mjs';
export { scorePlan, rankByScore };

export const SESSION_KEY = 'mizan.design.session.v1';
export const MAX_DESIGNS = 30;
/** العدد المستهدف من التصاميم المختلفة في الجلسة (يُولَّد الباقي في الخلفية بعد عرض الأول)؛ ما لم يتوفر يُعلن النفاد بعدده الحقيقي. */
export const TARGET_DESIGNS = 20;

/** ما الذي لم يعجبك؟ كل خيار يغيّر الطلب تغييرًا محددًا معلنًا (لا تخمين). */
export const FEEDBACK = Object.freeze([
  { id: 'layout', label: 'أريد توزيعًا مختلفًا للغرف', apply: () => {} },
  { id: 'rooms_small', label: 'غرف النوم صغيرة', apply: (r, t) => { t.bedroomScale = (t.bedroomScale || 1) * 1.2; } },
  { id: 'too_big', label: 'المبنى أكبر من حاجتي', apply: (r, t) => { t.envScale = (t.envScale || 1) * .9; t.bedroomScale = (t.bedroomScale || 1) * .92; } },
  { id: 'hall_big', label: 'الصالة كبيرة', apply: (r, t) => { t.hallScale = (t.hallScale || 1) * .75; } },
  { id: 'hall_small', label: 'الصالة صغيرة', apply: (r, t) => { t.hallScale = (t.hallScale || 1) * 1.3; } },
  { id: 'majlis_small', label: 'المجلس صغير', apply: (r, t) => { t.majlisScale = (t.majlisScale || 1) * 1.25; } },
  { id: 'kitchen_small', label: 'المطبخ والطعام صغيران', apply: (r, t) => { t.kitchenScale = (t.kitchenScale || 1) * 1.2; } },
  { id: 'corridors', label: 'الممرات كثيرة', apply: (r, t) => { t.avoidModes = [...new Set([...(t.avoidModes || []), 'tee', 'rows'])]; } },
  { id: 'kitchen_open', label: 'أريد المطبخ مفتوحًا على الطعام', apply: r => { r.prefs.openKitchen = true; } },
  { id: 'kitchen_closed', label: 'أريد المطبخ مغلقًا', apply: r => { r.prefs.openKitchen = false; } },
  { id: 'baths_all', label: 'أريد حمامًا لكل غرفة', apply: r => { r.prefs.allEnsuite = true; r.prefs.sharedBaths = false; const c = r.counts; c.baths = Math.max(c.baths || 0, (c.bedrooms || 0) + Math.min(2, c.majlis || 0)); } },
  { id: 'baths_shared', label: 'لا أحتاج حمامًا لكل غرفة', apply: r => { r.prefs.allEnsuite = false; r.prefs.sharedBaths = true; } },
]);

const clone = v => JSON.parse(JSON.stringify(v));

/**
 * درجة المطابقة المفسَّرة لتصميم في الجلسة (انظر plan-score.mjs): تُحسب مرة واحدة عند إنشاء التصميم (في عامل التوليد خارج الخيط الرئيسي)
 * وتُخزَّن في سجله، فلا تُعاد عند كل عرض. ما فاتته الدرجة (جلسة قديمة، أو مستند عُدّل) تُحسب عند الطلب بـ ensureScore.
 */
export function scoreDesign(session, d) {
  try {
    const doc = parseDoc(d.doc), req = session.input.requirements || {}, entry = session.input.land?.entries?.[0] || doc.plot?.entry || 's';
    let ledger = []; try { ledger = verifyRequest(doc, req, { entry }); } catch { ledger = d.ledger || []; }
    const site = solarSite(session.input.land?.geo || null);
    return scorePlan(doc, { ledger, site: { lat: site.lat, north: site.north } });
  } catch { return null; }
}
/** يملأ درجة كل تصميم ناقص الدرجة (يعدّل نسخة الجلسة الممرَّرة ويعيدها). */
export function ensureScores(session) { for (const d of session.designs) if (!d.score) d.score = scoreDesign(session, d); return session; }
/** ترتيب عرض البدائل: بالدرجة الأعلى أولًا؛ يعيد فهارس تصاميم الجلسة. لا يغيّر مصفوفة الجلسة (فهارسها ثابتة). */
export const rankedIndexes = session => rankByScore(session.designs.map(d => d.score || null));

/** يبدأ جلسة من نتيجة التوليد الأولى. */
/** هل يطلب النص تصميمًا بديلًا (لا تعديلًا على المعروض)؟ */
export function wantsAlternative(text = '') {
  const t = String(text).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  return /(?:تصميم|توزيع|مخطط|مسقط|فكره|شكل)\s*(?:ا?خر|بديل|مختلف|ثاني|جديد|غير)|(?:^|\s)(?:بديل|غيره|غيرها|غير التصميم|غير التوزيع|غيّره)(?:\s|$|[.،!؟])|ما (?:عجبني|اعجبني)|(?:ابي|ابغي|اريد|ودي) (?:شي|شيء) (?:ثاني|مختلف|جديد)/.test(t);
}
// V3 permits a new arrangement with the same confirmed program. A mixed or
// unclassified request must return to the interview, even if it says "another".
function v3AlternativeOnly(text) {
  const t = String(text).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[،.!؟]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(?:(?:ابي|ابغى|ابغي|اريد|اعطني|عطني|ورني|ممكن) )?(?:(?:تصميم|توزيع|مخطط|مسقط|فكره|شكل)(?: (?:اخر|بديل|مختلف|ثاني|جديد|غير)){1,3}|بديل|غيره|غيرها|غير التصميم|غير التوزيع|ما (?:عجبني|اعجبني))(?: (?:لو سمحت|من فضلك))?$/.test(t);
}
export function createSession({ land, counts, requirements, discovery, idea = '', result }) {
  const req = clone(requirements || extractRequirements(idea || '', { counts: counts || {}, discovery }));
  req.counts = { ...(req.counts || {}), ...(counts || {}) }; req.prefs ||= {}; req.extras ||= {}; req.areas ||= {}; req.tweaks ||= {};
  const created = ensureScores({
    v: 1, input: { land, discovery, idea, requirements: req },
    designs: [entry(result, null)], current: 0, approved: null, createdAt: Date.now(),
    dna: result.dna ? clone(result.dna) : null,
    // بصمات كل ما عُرض (لا تُقصّ مع سجل التصاميم): لا يُعاد تصميم يشبهها مرئيًا
    seen: [visualSig(parseDoc(serialize(result.doc)))],
    seenMacro: [macroSig(parseDoc(serialize(result.doc)))].filter(Boolean),
    alternatives: (result.alternatives || []).slice(0, 5).map(a => ({ index: a.index, strategy: String(a.strategy || ''), doc: serialize(a.doc) })),
  });
  stampDesign(created, 0, 'first'); // بوابة المراجعة: التوليد الأول
  return created;
}
function entry(result, feedback) {
  return { doc: serialize(result.doc), pat: result.pat || null, summary: result.summary || '', notes: result.notes || [], floors: result.floors || 1, feedback, engine: result.engine || result.strategy || '', ledger: result.ledger || null, mirror: result.mirror ?? null, fit: result.fit || null, search: result.search || null };
}
export const currentDoc = s => parseDoc(s.designs[s.current].doc);

const landKey = l => JSON.stringify([l?.length, l?.width, [...(l?.streets || [])].sort(), [...(l?.entries || [])].sort()]);
/** هل الأرض نفسها (الأبعاد والشوارع والمداخل)؟ عدد الأدوار من الطلب لا من الأرض. */
export const sameLand = (a, b) => !!a && !!b && landKey(a) === landKey(b);
/**
 * «عدّل طلبي وأعد التوليد» من صفحة شرعاء: التصاميم الجديدة تتقدّم، وتصاميم العميل السابقة تبقى بعدها (لا تُمحى)
 * ما دامت الأرض نفسها؛ إن تغيّرت الأرض فالسابقة لا تصلح لها فتُستبدل. يعيد { session, kept }.
 */
export function carryOver(next, prev) {
  if (!prev || !Array.isArray(prev.designs) || !prev.designs.length || !sameLand(next?.input?.land, prev.input?.land)) return { session: next, kept: 0 };
  const s = clone(next), have = new Set(s.designs.map(d => d.doc));
  const old = prev.designs.filter(d => d && typeof d.doc === 'string' && !have.has(d.doc)).slice(-(MAX_DESIGNS - s.designs.length));
  s.designs.push(...clone(old));
  s.seen = [...(s.seen || []), ...clone(prev.seen || [])]; s.seenMacro = [...(s.seenMacro || []), ...clone(prev.seenMacro || [])]; s.seenPats = [...new Set([...(s.seenPats || []), ...(prev.seenPats || []), ...old.map(d => d.pat).filter(Boolean)])];
  return { session: s, kept: old.length };
}

/**
 * يطبّق ملاحظات العميل (خيارات + نص حر) على الطلب.
 * - طلب محدد (نص مفهوم أو خيار تعديل): يُطبَّق على التصميم المعروض نفسه متى أمكن (نفس التوزيع) ولا يُفرض توزيع جديد.
 * - «أريد توزيعًا مختلفًا» أو بلا ملاحظات: توزيع مختلف عمّا عُرض (تُستبعد أنماطه).
 * - نص لم يُفهم منه شيء ولا خيار معه: لا يُولَّد تصميم؛ يُرمى SHARA_UNCLEAR ليعيد العميل الصياغة.
 * يعيد { session, changes, reply } — reply: ما نُفّذ وما لم يُنفَّذ (بسببه) وما لم يُفهم، مقيسًا من المخطط الجديد.
 */
export async function redesign(session, { picks = [], text = '', ai = null, auto = false, maxSim = undefined } = {}, { generate = generateInitialDesign } = {}) {
  if (session?.input?.requirements?.sharaaV3 && (picks.some(id => id !== 'layout') || (String(text || '').trim() && !v3AlternativeOnly(text)) || ai)) {
    const error = Error('هذا المشروع مرتبط بإجابات شرعاء V3؛ عدّل الطلب من «عدّل طلبي» لتأكيد الأعداد والقرارات الجديدة قبل التوليد.'); error.code = 'SHARAA_V3_EDIT_REQUIRED'; throw error;
  }
  const s = clone(session), req = s.input.requirements, changes = [];
  req.prefs ||= {}; req.tweaks ||= {}; req.counts ||= {}; req.extras ||= {}; req.areas ||= {};
  let more = null;
  // «ابي تصميم بديل/آخر/مختلف/جديد» أو «غيّره»: طلب توزيع مختلف، لا ملاحظة غامضة
  const altAsk = wantsAlternative(text);
  if (text && text.trim().length >= 3) more = withAi(extractRequirements(text, { counts: {} }), ai);
  if (more && !more.understood.length && !more.unsupported.length && !picks.length && !altAsk) {
    const err = Error('لم أفهم ملاحظتك بدقة فلم أغيّر شيئًا' + (more.unclear.length ? ': ' + more.unclear.map(x => '«' + x + '»').join('، ') : '') + '. اكتبها بصيغة مباشرة مثل: «المطبخ في الخلف»، «الماستر بعيدة عن المجلس»، «المجلس أكبر»، «غرفة النوم 4×5»، أو اختر من الخيارات.');
    err.code = 'SHARA_UNCLEAR'; err.unclear = more.unclear; throw err;
  }
  for (const id of picks) { const f = FEEDBACK.find(x => x.id === id); if (!f) throw Error('خيار غير معروف.'); f.apply(req, req.tweaks); changes.push(f.label); }
  if (more) {
    Object.assign(req.prefs, more.prefs); Object.assign(req.extras, more.extras); Object.assign(req.areas, more.areas);
    for (const [k, v] of Object.entries(more.counts)) if (Number.isInteger(v) && (v > 0 || (v === 0 && ['majlis', 'dining'].includes(k)))) req.counts[k] = v;
    req.rules = mergeRules(req.rules || [], more.rules || []);
    if (more.privacy?.length) { const have = new Map((req.privacy || []).map(p => [p.kind, p])); for (const p of more.privacy) have.set(p.kind, { ...have.get(p.kind), ...p, must: !!(have.get(p.kind)?.must || p.must) }); req.privacy = [...have.values()]; }
    for (const [k, v] of Object.entries(more.tweaks || {})) req.tweaks[k] = Array.isArray(v) ? [...new Set([...(req.tweaks[k] || []), ...v])] : (req.tweaks[k] || 1) * v; // preferModes قائمة أنماط تُضم، والباقي معاملات تُضرب
    if (more.unsupported?.length) req.unsupported = [...new Set([...(req.unsupported || []), ...more.unsupported])];
    req.understood = [...new Set([...(req.understood || []), ...more.understood])];
    changes.push(...more.understood);
    s.input.idea = [s.input.idea, text].filter(Boolean).join('\n');
  }
  // الشكل الجديد (L/T/U) يغيّر التوزيع كله فلا يُطبَّق على النمط المعروض
  const shapeAsk = !!(more && (more.prefs?.shape || more.prefs?.courtyard === true));
  const different = picks.includes('layout') || altAsk || shapeAsk || (!picks.length && (!more || (!more.understood.length && !more.unsupported.length)));
  if (different) changes.push('توزيع مختلف للغرف');
  const cur = s.designs[s.current];
  s.seen ||= s.designs.map(d => { try { return visualSig(parseDoc(d.doc)); } catch { return null; } }).filter(Boolean);
  s.seenMacro ||= s.designs.map(d => { try { return macroSig(parseDoc(d.doc)); } catch { return null; } }).filter(Boolean);
  s.seenPats = [...new Set([...(s.seenPats || []), ...s.designs.map(d => d.pat).filter(Boolean)])];
  const exclude = different ? s.seenPats : [];
  const prefer = different ? null : { pat: cur.pat, mirror: cur.mirror ?? null };
  const shown = different ? s.seen : [], shownMacro = different ? s.seenMacro : [];
  // الطلب لم يتغيّر (توزيع آخر فقط) والتصميم المعروض مرّ بسلّم الاتساع: تُعاد درجاته نفسها مباشرة بلا مشي السلّم من أوله
  // «توزيع مختلف» الصريح (الخيار أو «تصميم آخر» نصًا) لا يغيّر الطلب أيضًا: تُعاد درجات السلّم نفسها، وإلا ضاعت (كان الطلب الأصلي الذي لا يتسع يُرمى «نفادًا» قبل أن يمشي السلّم)
  const plainAlt = different && picks.every(id => id === 'layout') && (!more || (!more.understood.length && !more.unsupported.length));
  const fitHint = (!more && !picks.length) || plainAlt ? hintOf(cur) : null;
  // «تصميم آخر» لا يخفق في بنود من طلب العميل أكثر مما أخفق أفضل تصميم عُرض (يخفق بنودًا أقل: يُقبل): مختلف لا معيب
  const maxFails = different && !more && !picks.length ? Math.min(...s.designs.map(d => Array.isArray(d.ledger) ? splitFails(d.ledger, req).hard : 99)) : null;
  const out = await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: req.counts, requirements: req, exclude, prefer, shown, shownMacro, light: true, ...(maxSim !== undefined && different ? { maxSim } : {}), ...(maxFails !== null && maxFails < 99 ? { maxFails } : {}), ...(fitHint ? { fitHint } : {}) });
  const outSig = visualSig(parseDoc(serialize(out.doc))), outMac = macroSig(parseDoc(serialize(out.doc)));
  // ضمان أخير مستقل عن المولّد: «تصميم آخر» لا يُقبل إن شابه أي تصميم عُرض فوق الحد
  if (different) {
    const worst = Math.max(0, ...s.seen.map(x => visualSim(outSig, x)));
    const worstMac = Math.max(0, ...s.seenMacro.map(x => macroSim(outMac, x)));
    if (worst > VISUAL_LIMIT.relaxed || worstMac > MACRO_LIMIT.relaxed + 1e-9) { const e = Error('لم يبقَ توزيع يختلف بوضوح عمّا عُرض عليك؛ لن أكرر تصميمًا سبق. غيّر طلبًا (شكلًا أو عددًا أو مقاسًا) أو ادمج تصميمين.'); e.code = 'VILLA_EXHAUSTED'; throw e; }
  }
  // رد شرعاء: البنود التي طلبها الآن، مقيسة من المخطط الجديد
  const entryDir = s.input.land?.entries?.[0] || 's';
  let ledger = []; try { ledger = verifyRequest(out.doc, req, { entry: entryDir }); } catch { ledger = out.ledger || []; }
  const asked = new Set([...(more?.understood || [])]);
  const mine = ledger.filter(x => asked.has(x.text) || (more?.rules || []).some(r => r.text === x.text));
  const unchanged = !different && serialize(out.doc) === cur.doc;
  const reply = {
    done: mine.filter(x => x.ok).map(x => x.text), failed: mine.filter(x => !x.ok).map(x => ({ text: x.text, why: x.why })),
    picks: picks.map(id => FEEDBACK.find(f => f.id === id)?.label).filter(Boolean),
    unclear: more?.unclear || [], unsupported: more?.unsupported || [], kept: !different && !!out.same, unchanged, different, altAsk,
    otherFails: ledger.filter(x => !x.ok && !mine.includes(x)).map(x => ({ text: x.text, why: x.why })),
  };
  s.designs.push(entry(out, { picks, text, changes, reply, ...(auto ? { auto: true } : {}) }));
  // الطلب تغيّر (ملاحظة أو خيار): نفاد التوزيعات السابق لا يسري على الطلب الجديد
  if (!different || picks.some(id => id !== 'layout') || (more && (more.understood.length || more.unsupported.length))) { delete s.exhausted; delete s.softEnd; }
  s.seen.push(outSig); if (outMac) s.seenMacro.push(outMac); if (out.pat) s.seenPats = [...new Set([...s.seenPats, out.pat])];
  if (s.designs.length > MAX_DESIGNS) s.designs.splice(0, s.designs.length - MAX_DESIGNS);
  s.current = s.designs.length - 1;
  ensureScores(s);
  // بوابة المراجعة: تعديل بملاحظة/خيار (محادثة) أو بديل مختلف (توزيع آخر/إكمال تلقائي)
  stampDesign(s, s.current, !auto && (picks.some(id => id !== 'layout') || (more && (more.understood.length || more.unsupported.length))) ? 'chat' : 'alternative');
  return { session: s, changes, reply };
}

/**
 * إكمال التصاميم في الخلفية: خطوة واحدة («توزيع مختلف» عن كل ما عُرض) تُضاف إلى نهاية قائمة التصاميم دون أن يتحرك التصميم المعروض.
 * تنتهي بالنفاد الصادق: حين لا يبقى توزيع يختلف عمّا عُرض تُسجَّل الجلسة exhausted بعدد ما عُرض فعلًا (لا يُختلق عدد).
 * يعيد { session, added, exhausted, error? }؛ added = false عند النفاد أو الفشل.
 */

/**
 * البديل الاحتياطي بصالة مخفَّفة (بعد نفاد البدائل بالحدود المعتادة فقط): تُخفَّف حدود الصالة وحدها (HALL_RELAX) مستوى بعد مستوى
 * (أقل تخفيف يكفي)، ولا يُمسّ غيرها: لا حدود تشابه ولا عرض ممر ولا تهوية ولا مقاسات غرف ولا بنود الطلب. يمرّ على بقية البوابات كغيره:
 * سلامة الرسم والجودة في المولّد، ثم مراجعة الميزان (عزيز والخصوصية والحياة اليومية) بلا مخالفات إلزامية أكثر من أفضل ما عُرض؛
 * وإلا فالنفاد الصادق. يُوسَم بالأرقام الفعلية ودرجته بجانب درجة الأول، منسوبًا لمولّد الميزان.
 */
const FALLBACK_BUDGET_MS = 6000, FALLBACK_TRIES = 4;
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
function mandatoryCount(session, d) { try { const c = d.review?.counts?.mandatory; return c ? c.violated : reviewGate({ route: 'alternative', doc: parseDoc(d.doc), ctx: ctxOfSession(session) }).summary.counts.mandatory.violated; } catch { return null; } }
/** وسم البديل الاحتياطي: أرقام الصالة الفعلية مقابل المعتاد، ودرجته بجانب درجة الأول. */
export function fallbackLabel(session, d, level) {
  let halls = []; try { halls = planMetrics(parseDoc(d.doc)).levels.map((lv, i) => (lv.hall ? { level: i, w: lv.hall.w, l: lv.hall.l, ratio: lv.hall.ratio } : null)).filter(Boolean); } catch { halls = []; }
  const worst = halls.slice().sort((a, b) => b.ratio - a.ratio)[0] || null, first = session.designs[0]?.score?.total ?? null, mine = d.score?.total ?? null;
  const usual = `عرض صافٍ ≥ ${f1(HALL_LIMITS.minNetW)} م ونسبة ≤ 1:${f1(HALL_LIMITS.ratio)}`;
  const text = `بديل بصالة أضيق من المعتاد (من مولّد الميزان، لا من عزيز): ${worst ? `الصالة ${f1(worst.w)} × ${f1(worst.l)} م (نسبة 1:${f1(worst.ratio)}) بدل المعتاد (${usual})` : 'حدود الصالة مخفَّفة'}؛ جاء لأن الأرض لا تتسع لتنوع أكبر بالحدود المعتادة.${mine !== null && first !== null ? ` درجته ${mine}/100 مقابل ${first}/100 للتصميم الأول، فلا يُعرض على أنه بجودة الأول.` : ''}`;
  return { kind: 'hall', level, hall: worst, halls, usual: { ...HALL_LIMITS }, applied: HALL_RELAX[level] ? { ratio: HALL_RELAX[level].ratio, minNetW: HALL_RELAX[level].minNetW } : null, score: mine, firstScore: first, source: 'generator', text };
}
async function hallFallback(session, generate, { levels = HALL_RELAX.length - 1, budgetMs = FALLBACK_BUDGET_MS, now = () => Date.now() } = {}) {
  const t0 = now(), tried = [], keepCurrent = session.current;
  const best = Math.min(...session.designs.map(d => mandatoryCount(session, d) ?? 99));
  for (let lv = 1; lv <= levels; lv++) {
    let base = session;
    for (let k = 0; k < FALLBACK_TRIES; k++) {
      if (now() - t0 > budgetMs) return { out: null, tried, budget: true };
      let out;
      try { setHallRelax(lv); out = await redesign(base, { auto: true, maxSim: VISUAL_LIMIT.relaxed }, { generate }); }
      catch (e) { if (e.code === 'VILLA_EXHAUSTED') break; return { out: null, tried, error: e }; }
      finally { setHallRelax(0); }
      const d = out.session.designs[out.session.designs.length - 1], m = mandatoryCount(out.session, d);
      tried.push({ level: lv, mandatory: m, best, pat: d.pat });
      if (m !== null && m <= best) { d.fallback = fallbackLabel(out.session, d, lv); d.fallback.mandatory = m; d.notes = [d.fallback.text, ...(d.notes || [])]; out.session.current = keepCurrent; out.session.fallbackMode = true; return { out, tried }; }
      // لم يجتز البوابة: يُستبعد نمطه ويُجرَّب غيره في المستوى نفسه
      base = clone(session); base.seenPats = [...new Set([...(base.seenPats || []), ...tried.filter(x => x.level === lv).map(x => x.pat).filter(Boolean)])];
    }
  }
  return { out: null, tried };
}
export async function extendSession(session, { target = TARGET_DESIGNS, relaxed = false } = {}, { generate = generateInitialDesign } = {}) {
  if (session.designs.length >= MAX_DESIGNS) return { session, added: false, exhausted: false, capped: true };
  if (session.exhausted || session.designs.length >= target) return { session, added: false, exhausted: !!session.exhausted };
  // الإكمال التلقائي لا يقبل إلا ما يختلف هيكليًا بوضوح (حتى 60٪ تشابهًا)؛ الأقرب (حتى 70٪) يُعرض بطلب العميل وحده، وبإعلانه في ملاحظات التصميم
  if (session.softEnd && !relaxed) return { session, added: false, exhausted: false, softEnd: true };
  const keepCurrent = session.current;
  // بعد نفاد البدائل العادية مرّة: لا يُعاد البحث العادي في كل ضغطة، بل يُكمَل مباشرة بالبديل الاحتياطي
  const fbOnly = !!session.fallbackMode && relaxed;
  try {
    if (fbOnly) { const x = new Error('fallback'); x.code = 'VILLA_EXHAUSTED'; if (session.exhaustStats) x.stats = session.exhaustStats; throw x; }
    const out = await redesign(session, { auto: true, maxSim: relaxed ? VISUAL_LIMIT.relaxed : VISUAL_LIMIT.mid }, { generate });
    out.session.current = keepCurrent;
    return { session: out.session, added: true, exhausted: false };
  } catch (e) {
    if (e.code === 'VILLA_EXHAUSTED') {
      let fbInfo = null;
      if (relaxed) {
        const narrow = (e.stats?.W ?? 99) < 13, fb = await hallFallback(session, generate, { levels: narrow ? HALL_RELAX.length - 1 : 3 }); fbInfo = fb;
        if (fb.out) return { session: fb.out.session, added: true, exhausted: false, fallback: true };
      }
      const s = clone(session);
      if (relaxed) { s.exhausted = { count: s.seen?.length || s.designs.length, at: Date.now(), ...(e.stats ? { stats: e.stats } : {}), ...(fbInfo?.tried?.length || fbInfo?.budget ? { fallback: { tried: fbInfo.tried.length, rejected: fbInfo.tried.filter(x => x.mandatory === null || x.mandatory > x.best).length, budget: !!fbInfo.budget, shown: s.designs.filter(d => d.fallback).length } } : {}) }; const two = s.designs.length < TARGET_DESIGNS ? await probeTwoFloors(s, generate) : null; if (two) s.exhausted.twoFloors = two; if (s.designs.length < 5) { const sg = await probeEdits(s, generate); if (sg.length) s.exhausted.suggest = sg; } delete s.softEnd; return { session: s, added: false, exhausted: true }; }
      s.softEnd = { count: s.designs.length, at: Date.now() }; if (e.stats) s.exhaustStats = e.stats;
      return { session: s, added: false, exhausted: false, softEnd: true };
    }
    return { session, added: false, exhausted: false, error: { message: e.message, code: e.code || null } };
  }
}
/** رسالة النفاد الصادقة بعدد التصاميم الفعلي. */
export const cappedMessage = n => `عرضتُ عليك ${n} تصميمًا مختلفًا، وهذا أقصى ما تحفظه الجلسة؛ اعتمد أقربها إلى ذوقك أو اطلب تعديلًا (شكلًا أو عددًا أو مقاسًا) لأبدأ بحثًا جديدًا.`;
/** بعد التصاميم المختلفة هيكليًا (≤ 50٪ تشابهًا): الأقرب منها (حتى 70٪) ما زال ممكنًا بطلب العميل ومعلنًا. */
export const softEndMessage = (n, clear = n) => (n > clear ? `أول ${clear} تصميمًا مختلفة جذريًا في الهيكل (موضع الصالة والسلّم والمجالس والمطبخ) عن بعضها، وما بعدها أقرب هيكلًا لما عُرض (حتى ${Math.round(MACRO_LIMIT.relaxed * 100)}٪ تشابهًا) ويُبيَّن ذلك في ملاحظات كل منها. اضغط «تصميم آخر» لأبحث لك عن غيرها.` : `هذه ${n} تصميمًا مختلفة جذريًا في الهيكل (موضع الصالة والسلّم والمجالس والمطبخ). اضغط «تصميم آخر» إن أردت توزيعات أقرب هيكلًا لما عُرض (حتى ${Math.round(MACRO_LIMIT.relaxed * 100)}٪ تشابهًا) وسأبيّن لك ذلك في ملاحظات كل تصميم.`);
export const exhaustedMessage = (n, twoFloors = null, ex = null) => {
  const ideasAr = k => (k === 1 ? 'لفكرة تنظيمية واحدة' : k === 2 ? 'لفكرتين تنظيميتين' : `لـ${k} أفكار تنظيمية`), layoutsAr = k => (k === 1 ? 'توزيعًا واحدًا' : k === 2 ? 'توزيعين' : k <= 10 ? `${k} توزيعات` : `${k} توزيعًا`), st = ex?.stats || null;
  const gates = st?.gate ? (st.gate.visual || 0) + (st.gate.macro || 0) + (st.gate.ideaAgain || 0) : 0;
  const why = st ? ` عرضتُ عليك فعليًا ${designsAr(n)}. مساحة البناء الصافية لأرضك ${st.W} × ${st.D} م${st.floors === 2 ? ' للدور' : ''} تتسع ${ideasAr(st.ideas)} فقط لبرنامجك${st.layouts ? ` (جرّبتُ ${layoutsAr(st.layouts)}${gates ? `، وسقط ${gates} منها لأنها تشبه ما عُرض فوق حدّ التشابه المعتمد` : ''})` : ''}، وليس لقلّة البحث: الحدود لم تُخفَّف.` : '';
  const fbx = ex?.fallback ? ` منها ${ex.fallback.shown} بصالة أضيق من المعتاد (بديل احتياطي موسوم بأرقامه).` + (ex.fallback.tried ? ` وجرّبتُ تخفيف حدّ الصالة وحدها في ${ex.fallback.tried} محاولة، ولم يجتز بوابات المراجعة منها ${ex.fallback.rejected}.` : ' ولم ينتج تخفيف حدّ الصالة وحدها تصميمًا جديدًا مختلفًا.') : '';
  return `وصلنا إلى كل التوزيعات المختلفة الممكنة لأرضك وبرنامجك (${n} تصميمًا). لن أكرر تصميمًا سبق؛ غيّر طلبًا (شكلًا أو عددًا أو مقاسًا) أو ادمج تصميمين لأولّد غيرها.${why}${fbx}${ex?.suggest?.length ? ' خطوات قِسْتُها لتوسيع الخيارات: ' + ex.suggest.map(x => `${x.label} (يعطي ${x.k === 2 ? 'تصميمين مختلفين' : x.k + ' تصاميم مختلفة'})`).join('؛ ') + '.' : st ? ' قِسْتُ ما ينطبق على طلبك من (تقليل غرفة نوم، الاستغناء عن غرفة الطعام أو الخادمة، دمج المجلسين) فلم يزد أيٌّ منها التصاميم المختلفة دون تغيير عدد الأدوار؛ ويبقى دمج تصميمين أو تغيير عدد الأدوار إن لم تكن حدّدته.' : ''}${twoFloors ? ` جرّب دورين: أرضك تتسع لتنويع أكبر بدورين (قِسْتُ ${twoFloors} تصاميم مختلفة بدورين، وقد يوجد أكثر).` : ''}`;
};
/** أرض بدور واحد مصرَّح انتهت قبل العشرين: يُقاس ما يعطيه الدوران (أول دفعة) ليقترحهما الإعلان بعدد حقيقي لا بتخمين. null إن لم يزد العدد أو تعذّر القياس. */
const PROBE_MAX = 8;
async function probeTwoFloors(s, generate) {
  const req = s.input.requirements;
  if ((req.prefs?.floors ?? s.input.land?.floors) !== 1 || s.designs.some(d => (d.floors || 1) !== 1)) return null;
  try {
    const r2 = clone(req); r2.prefs ||= {}; r2.prefs.floors = 2;
    const out = await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: r2.counts, requirements: r2, light: false });
    if ((out.floors || 1) !== 2) return null;
    // أول دفعة ثم إكمال قصير (حتى PROBE_MAX) بالخطوة نفسها: العدد المعلن مقيس لا مخمَّن
    let probe = createSession({ land: { ...s.input.land, floors: 2 }, counts: r2.counts, requirements: r2, discovery: s.input.discovery, idea: s.input.idea, result: out });
    for (let g = 0; g < PROBE_MAX && probe.designs.length < PROBE_MAX; g++) { const o = await extendSession(probe, { target: PROBE_MAX }, { generate }); probe = o.session; if (!o.added) break; }
    const k = probe.designs.length;
    return k > s.designs.length ? k : null;
  } catch { return null; }
}

/**
 * خطوات تعديل محددة تزيد عدد التصاميم المختلفة، مقيسة فعلًا (لا مخمَّنة): كل تعديل يُجرَّب على المولّد نفسه بالبوابات نفسها ويُعدّ ما ينتجه.
 * تُجرى عند النفاد المبكر فقط (أقل من 5 تصاميم) وبميزانية زمن؛ ما لا يزيد العدد لا يُقترح. null/[] إن لم يوجد.
 */
const EDITS = [
  { id: 'bedrooms', can: r => (r.counts?.bedrooms | 0) >= 3, apply: r => { r.counts.bedrooms -= 1; }, label: r => `تقليل غرف النوم من ${r.counts.bedrooms} إلى ${r.counts.bedrooms - 1}` },
  { id: 'dining', can: r => (r.counts?.dining | 0) >= 1, apply: r => { r.counts.dining = 0; }, label: () => 'الاستغناء عن غرفة الطعام المستقلة (يؤكل في الصالة أو المطبخ)' },
  { id: 'maid', can: r => !!r.extras?.maid, apply: r => { delete r.extras.maid; }, label: () => 'الاستغناء عن غرفة الخادمة' },
  { id: 'majlis_w', can: r => (r.counts?.majlis | 0) >= 2, apply: r => { r.counts.majlis = 1; r.prefs.womenSeparate = false; }, label: () => 'دمج مجلس النساء في مجلس واحد' },
];
async function probeEdits(s, generate, { budgetMs = 2500, now = () => Date.now() } = {}) {
  const req = s.input.requirements, floors = req.prefs?.floors ?? s.input.land?.floors ?? 1, t0 = now(), found = [];
  for (const ed of EDITS) {
    if (now() - t0 > budgetMs || found.length >= 2) break;
    const r2 = clone(req); r2.prefs ||= {}; r2.extras ||= {}; r2.counts ||= {}; r2.tweaks ||= {};
    if (!ed.can(r2)) continue;
    const label = ed.label(r2); ed.apply(r2);
    try {
      const out = await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: r2.counts, requirements: r2, light: false });
      if ((out.floors || 1) !== (floors || 1) || out.fit?.applied?.length) continue; // يغيّر الأدوار أو ما زال يحتاج تخفيفًا آخر: ليس تعديلًا نظيفًا
      let probe = createSession({ land: s.input.land, counts: r2.counts, requirements: r2, discovery: s.input.discovery, idea: s.input.idea, result: out });
      for (let g = 0; g < PROBE_MAX && probe.designs.length < PROBE_MAX && now() - t0 <= budgetMs; g++) { const o = await extendSession(probe, { target: PROBE_MAX }, { generate }); probe = o.session; if (!o.added) break; }
      const k = probe.designs.length; if (k > s.designs.length) found.push({ id: ed.id, label, k });
    } catch { /* تعديل لا يتسع: لا يُقترح */ }
  }
  return found;
}

/**
 * دمج تصميمين: توزيع سليم جديد يأخذ من كليهما بتوازن ولا يكون نسخة من أحدهما (تشابهه مع كلٍّ < 90٪).
 * الرد يقول ما بقي في موضعه من كل تصميم، مقيسًا من المخطط الناتج.
 */
export async function mergeDesigns(session, a, b, { generate = generateInitialDesign } = {}) {
  const s = clone(session), req = s.input.requirements;
  if (a === b || !s.designs[a] || !s.designs[b]) throw Error('اختر تصميمين مختلفين للدمج.');
  const docA = parseDoc(s.designs[a].doc), docB = parseDoc(s.designs[b].doc);
  if ((docA.levels?.length || 1) !== (docB.levels?.length || 1)) { const e = Error('لا يُدمج تصميم بدور واحد مع تصميم بدورين؛ اختر تصميمين بعدد الأدوار نفسه.'); e.code = 'MERGE_FLOORS'; throw e; }
  const sigA = visualSig(docA), sigB = visualSig(docB);
  const out = await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: req.counts, requirements: req, exclude: [s.designs[a].pat, s.designs[b].pat].filter(Boolean), prefer: null, blend: [sigA, sigB] });
  const items = visualItems(out.doc), outSig = items.map(x => x.tok);
  const simA = visualSim(outSig, sigA), simB = visualSim(outSig, sigB);
  if (Math.max(simA, simB) >= BLEND_COPY) { const e = Error('الناتج كان نسخة من أحد التصميمين فلم أعرضه؛ جرّب تصميمين آخرين.'); e.code = 'VILLA_NO_BLEND'; throw e; }
  const rA = alignSig(sigA, outSig), rB = alignSig(sigB, outSig), take = (ref, tok) => { const i = ref.indexOf(tok); if (i < 0) return false; ref.splice(i, 1); return true; };
  const fromA = [], fromB = [], both = [], fresh = [], A = [...rA], B = [...rB];
  for (const it of items) { const inA = take(A, it.tok), inB = take(B, it.tok); (inA && inB ? both : inA ? fromA : inB ? fromB : fresh).push(it.name); }
  const uniq = l => [...new Set(l.filter(Boolean))];
  const reply = { merge: [a + 1, b + 1], fromA: uniq(fromA), fromB: uniq(fromB), both: uniq(both), fresh: uniq(fresh), simA: Math.round(simA * 100), simB: Math.round(simB * 100),
    done: [], failed: [], picks: [], unclear: [], unsupported: [], kept: false, unchanged: false, otherFails: [] };
  const changes = [`دمج التصميم ${a + 1} والتصميم ${b + 1}`];
  s.designs.push(entry(out, { picks: [], text: '', changes, reply, merge: [a, b] }));
  s.seen ||= []; s.seen.push(outSig);
  if (s.designs.length > MAX_DESIGNS) s.designs.splice(0, s.designs.length - MAX_DESIGNS);
  s.current = s.designs.length - 1;
  ensureScores(s);
  stampDesign(s, s.current, 'merge'); // بوابة المراجعة: الدمج
  return { session: s, changes, reply };
}

/** درجات سلّم الاتساع التي نجح بها تصميم معروض (تلميح لإعادة التوليد بالطلب نفسه). */
export function hintOf(d) { return d?.fit && (d.fit.applied?.length || d.fit.floors) ? { ids: (d.fit.applied || []).map(x => x.id), floors: d.fit.floors || null } : null; }
/** بيان ما تغيّر عن طلب العميل في التصميم المعروض، مقيسًا من المستند نفسه (انظر fit-ladder.mjs). */
export function fitFor(session, doc = currentDoc(session)) {
  try { return fitStatement(doc, session.input.requirements || {}, { land: session.input.land, fit: session.designs[session.current]?.fit || null }); } catch { return { facts: null, need: null, items: [], decisions: [] }; }
}

export function approve(session) { const s = clone(session); s.approved = s.current; return s; }
/** قرارات العميل الصريحة على شروط إلزامية غير متحقق منها: تُحفظ مربوطة بنسخة المخطط، وأي تعديل هندسي لاحق يُسقطها. */
export function recordReviewDecisions(session, ids) {
  const s = clone(session), pv = planVersion(currentDoc(s), ctxOfSession(s)).planVersion, prev = s.reviewDecisions?.planVersion === pv ? s.reviewDecisions.ids : [];
  s.reviewDecisions = { planVersion: pv, ids: [...new Set([...prev, ...ids])] };
  return s;
}
/**
 * الاعتماد بعد المراجعة. مع مفتاح الإلزام (مطفأ افتراضيًا): يُرفض الاعتماد إن وُجدت مخالفة إلزامية أو كان التقرير قديمًا أو بقي شرط إلزامي
 * غير متحقق منه بلا قرار صريح. بدون المفتاح: يُعتمد دائمًا لكن يُسجَّل في التصميم أن المراجعة كانت إرشادية (advisory) وبأي أسباب.
 * يعيد { session, status: 'approved'|'refused', enforced, advisory, result }. التصميم نفسه لا يتغير.
 */
export function approveReviewed(session, { decisions = null, enforce = null } = {}) {
  const cur = session.designs[session.current], doc = currentDoc(session), ctx = ctxOfSession(session), enforced = enforce ?? reviewEnforced(session.input?.requirements);
  const pv = planVersion(doc, ctx).planVersion, dec = decisions ?? (session.reviewDecisions?.planVersion === pv ? session.reviewDecisions.ids : []);
  const result = approveDesign(doc, { ...ctx, route: cur.review?.route || null }, { report: cur.review || null, decisions: dec });
  if (ctx.requirements?.sharaaV3) {
    let checks;
    try { validateV3Generation({ land: ctx.land, counts: ctx.requirements.counts, requirements: ctx.requirements }); checks = reviewV3(doc, ctx.requirements.sharaaV3).checks; }
    catch (error) { checks = [{ id: 'brief', priority: 'mandatory', state: 'unverified', title: 'مقابلة شرعاء V3', reason: error.message || 'تعذرت قراءة القرارات المؤكدة؛ ارجع إلى المقابلة لمراجعتها.' }]; }
    const unmet = checks.filter(c => c.priority === 'mandatory' && c.state !== 'verified');
    if (unmet.length) return { session, status: 'refused', enforced: true, advisory: false, scope: 'sharaa-v3', result: { ...result, status: 'refused', refused: true, reasons: [{ code: 'SHARAA_V3_MANDATORY_NOT_VERIFIED', message: 'لم يثبت المخطط شروط المقابلة الإلزامية؛ أصلح المخطط أو عدّل القرار صراحة في شرعاء.', findings: unmet.map(c => ({ id: 'sharaa-v3:' + c.id, title: c.title, reason: c.reason })) }] } };
  }
  if (result.refused && enforced) return { session, status: 'refused', enforced, advisory: false, result };
  const s = approve(session);
  s.designs[s.current].approval = result.refused ? { advisory: true, planVersion: result.report.planVersion, reasons: result.reasons.map(r => r.code), disclaimer: REVIEW_DISCLAIMER } : result.approval;
  return { session: s, status: 'approved', enforced, advisory: result.refused, result };
}

export function saveSession(store, s) { try { store.setItem(SESSION_KEY, JSON.stringify(s)); return true; } catch { return false; } }
export function loadSession(store) {
  try { const s = JSON.parse(store.getItem(SESSION_KEY) || 'null'); if (!s || s.v !== 1 || !Array.isArray(s.designs) || !s.designs.length) return null; parseDoc(s.designs[s.current ?? 0].doc); return s; }
  catch { return null; }
}

/** سجل التنفيذ للتصميم المعروض: يُقاس من المستند نفسه (ولو عُدّل في المرسم). */
export function ledgerFor(session, doc = currentDoc(session)) {
  const req = session.input.requirements || {}, entry = session.input.land?.entries?.[0] || doc.plot?.entry || 's';
  try { return verifyRequest(doc, req, { entry }); } catch { return session.designs[session.current]?.ledger || []; }
}

export default { SESSION_KEY, FEEDBACK, createSession, redesign, extendSession, mergeDesigns, approve, approveReviewed, recordReviewDecisions, saveSession, loadSession, currentDoc, ledgerFor, mergeRules, carryOver, sameLand };

// ------------------------------------------------------------------------------------------ العرض
import { analyzeDoc } from './draw/digest.mjs';
/** المناطق كما تُعرض للعميل: الرجال، النساء، العائلة، الخدمة. */
export const ZONES = Object.freeze({
  men: { label: 'منطقة الرجال', color: '#e7d2a6' },
  women: { label: 'منطقة النساء', color: '#efd6da' },
  family: { label: 'العائلة', color: '#efe7d6' },
  service: { label: 'الخدمة', color: '#d8e4da' },
});
export function zoneOf(label) {
  const n = label?.name || '', t = label?.type || '';
  if (/الرجال/.test(n) || (t === 'majlis' && !/النساء/.test(n))) return 'men';
  if (/النساء/.test(n)) return 'women';
  if (['kitchen', 'laundry', 'service'].includes(t) || /الخادمة|السائق|المخزن|الغسيل|مخزن/.test(n)) return 'service';
  return 'family';
}
const r2 = v => Math.round(v * 100) / 100;
/** ملخص المواصفات وجدول الغرف من المستند نفسه (المساحات الصافية من الجدران). */
export function summarizeDoc(doc) {
  const model = analyzeDoc(doc), rooms = [];
  let net = 0, built = 0;
  for (const lv of doc.levels) {
    const L = model.levelById.get(lv.id); if (!L) continue;
    const xs = doc.walls.filter(w => w.level === lv.id).flatMap(w => [w.a.x, w.b.x]), ys = doc.walls.filter(w => w.level === lv.id).flatMap(w => [w.a.y, w.b.y]);
    if (xs.length) built += (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    for (const r of L.rooms) { if (r.unlabelled) continue; net += r.area; rooms.push({ name: r.name, type: r.type, level: lv.name, levelId: lv.id, area: r2(r.area), l: r2(r.rect?.l || 0), w: r2(r.rect?.w || 0), zone: zoneOf(r.label) }); }
  }
  const count = types => rooms.filter(r => types.includes(r.type)).length;
  const first = doc.levels[0], wx = doc.walls.filter(w => w.level === first.id).flatMap(w => [w.a.x, w.b.x]), wy = doc.walls.filter(w => w.level === first.id).flatMap(w => [w.a.y, w.b.y]);
  const entries = doc.openings.filter(o => o.entry).length;
  return {
    specs: { bedrooms: count(['bedroom', 'master']), baths: count(['bath']), majlis: count(['majlis']), floors: doc.levels.length, built: r2(built), net: r2(net), width: wx.length ? r2(Math.max(...wx) - Math.min(...wx)) : 0, depth: wy.length ? r2(Math.max(...wy) - Math.min(...wy)) : 0, entries },
    rooms,
  };
}
