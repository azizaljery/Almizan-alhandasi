// جلسة التصميم: التصميم الأولي يُعرض على العميل، ويطلب بديلًا بعد أن تسأله شرعاء عمّا لم يعجبه،
// ثم يعتمده فينتقل إلى العرض ثلاثي الأبعاد. وحدة نقية بلا DOM؛ التخزين يُمرَّر (localStorage أو بديل في الاختبار).
import { generateInitialDesign } from './home-flow.mjs';
import { extractRequirements, detectConflicts, normalizeAr, parseReadingAnswer } from './requirements.mjs';
import { verifyRequest, mergeRules } from './rules.mjs';
import { withAi } from './requirements.mjs';
export { mergeRules };
import { parseDoc, serialize } from './draw/doc.mjs';
import { parseEdit, applyEdits, replayIntents, compareDocs, describeChanges, inspect, measureIntents, FACADE_RENDER } from './plan-edit.mjs';
import { reviewDesign } from './plan-review.mjs';
import { fingerprint, diffFingerprint, compactDiff, touchedKeys, countAr } from './plan-fingerprint.mjs';
import { streetWidthQuestion, parseStreetWidthAnswer, frontSetbackFor } from './regulations-sa.mjs';

export const SESSION_KEY = 'mizan.design.session.v1';
// (الجولة العاشرة) 12 نسخة محفوظة (كانت 8) ولكل نسخة رقم ثابت في الجلسة (version) لا يتغير بحذف الأقدم:
// «ارجع للنسخة الثانية» تعني النسخة رقم 2 دائمًا
const MAX_DESIGNS = 12;
/** يضيف تصميمًا إلى سجل الجلسة برقم نسخة جديد، ويحذف الأقدم فوق الحد. */
function pushDesign(s, d) {
  const maxV = Math.max(0, ...s.designs.map((x, i) => x.version ?? i + 1));
  s.nextVersion = Math.max(s.nextVersion || 0, maxV + 1);
  d.version = s.nextVersion++;
  s.designs.push(d);
  if (s.designs.length > MAX_DESIGNS) s.designs.splice(0, s.designs.length - MAX_DESIGNS);
  s.current = s.designs.length - 1;
  return d.version;
}
/** رقم النسخة المعروضة. */
export const versionOf = (s, i = s.current) => s.designs[i]?.version ?? i + 1;

/** ما الذي لم يعجبك؟ كل خيار يغيّر الطلب تغييرًا محددًا معلنًا (لا تخمين). */
export const FEEDBACK = Object.freeze([
  { id: 'layout', label: 'أريد توزيعًا مختلفًا للغرف', apply: () => {} },
  { id: 'rooms_small', label: 'غرف النوم صغيرة', apply: (r, t) => { t.bedroomScale = (t.bedroomScale || 1) * 1.2; } },
  { id: 'too_big', label: 'المبنى أكبر من حاجتي', apply: (r, t) => { t.envScale = (t.envScale || 1) * .9; t.bedroomScale = (t.bedroomScale || 1) * .92; } },
  { id: 'hall_big', label: 'الصالة كبيرة', apply: (r, t) => { t.hallScale = (t.hallScale || 1) * .75; } },
  { id: 'hall_small', label: 'الصالة صغيرة', apply: (r, t) => { t.hallScale = (t.hallScale || 1) * 1.3; } },
  { id: 'majlis_small', label: 'المجلس صغير', apply: (r, t) => { t.majlisScale = (t.majlisScale || 1) * 1.25; } },
  { id: 'kitchen_small', label: 'المطبخ والطعام صغيران', apply: (r, t) => { t.kitchenScale = (t.kitchenScale || 1) * 1.2; } },
  // «الممرات كثيرة»: تُستبعد الأنماط ذات الممر/الرواق الطويل (المولّد الأول: tee وrows؛ الثاني: الرواق والصفوف
  // والكتلتان وL الخلفي والحوش برواقه والجناحان بممرّيهما)، ويُضاعف وزن الحركة في التقييم
  { id: 'corridors', label: 'الممرات كثيرة', apply: (r, t) => { t.avoidModes = [...new Set([...(t.avoidModes || []), 'tee', 'rows', 'gallery', 'split', 'ellback', 'courtyard', 'wings'])]; t.lessCorridors = true; } },
  { id: 'kitchen_open', label: 'أريد المطبخ مفتوحًا على الطعام', apply: r => { r.prefs.openKitchen = true; } },
  { id: 'kitchen_closed', label: 'أريد المطبخ مغلقًا', apply: r => { r.prefs.openKitchen = false; } },
  { id: 'baths_all', label: 'أريد حمامًا لكل غرفة', apply: r => { r.prefs.allEnsuite = true; r.prefs.sharedBaths = false; const c = r.counts; c.baths = Math.max(c.baths || 0, (c.bedrooms || 0) + Math.min(2, c.majlis || 0)); } },
  { id: 'baths_shared', label: 'لا أحتاج حمامًا لكل غرفة', apply: r => { r.prefs.allEnsuite = false; r.prefs.sharedBaths = true; } },
]);

const clone = v => JSON.parse(JSON.stringify(v));

/** يبدأ جلسة من نتيجة التوليد الأولى. */
export function createSession({ land, counts, requirements, discovery, idea = '', result, engine = null }) {
  const req = clone(requirements || extractRequirements(idea || '', { counts: counts || {}, discovery }));
  req.counts = { ...(req.counts || {}), ...(counts || {}) }; req.prefs ||= {}; req.extras ||= {}; req.areas ||= {}; req.tweaks ||= {};
  // التعارضات في الطلب: تُرفق بالجلسة مع سؤال للعميل (لا رمي ولا تعديل للطلب)
  let conflicts = []; try { conflicts = detectConflicts(req, land || {}); } catch { conflicts = []; }
  return {
    // المولّد: الثاني افتراضيًا؛ engine:'v1' يبقي المولّد الأول (احتياط) لكل إعادة تصميم في الجلسة
    v: 1, input: { land, discovery, idea, requirements: req, engine: engine || (result?.villaEngine === 'v1' ? 'v1' : null) },
    conflicts, reply: conflicts.length ? { conflicts, questions: conflicts.map(c => c.question_ar) } : null,
    // (الجولة الثالثة عشرة) أسئلة الموقع الناعمة (لا تعارض في الطلب): عرض شارع المدخل إن جُهل — الارتداد الأمامي مرسوم 3 م افتراضًا
    siteQuestions: [streetWidthQuestion(land || {})].filter(Boolean),
    designs: [{ ...entry(result, null), version: 1 }], current: 0, nextVersion: 2, approved: null, createdAt: Date.now(),
    dna: result.dna ? clone(result.dna) : null,
    alternatives: (result.alternatives || []).slice(0, 4).map(a => ({ index: a.index, strategy: String(a.strategy || ''), doc: serialize(a.doc), pat: a.pat || null, summary: a.summary || '', notes: a.notes || [], mirror: a.mirror ?? null, review: a.review || null })),
    // كم بديلًا عُرض من المطلوب، وسبب النقص، وأسباب رفض المرشحين (من المولّد نفسه) — تعرضها صفحة التصميم
    alternativesInfo: result.alternativesInfo ? clone(result.alternativesInfo) : null,
  };
}
function entry(result, feedback) {
  return { doc: serialize(result.doc), pat: result.pat || null, summary: result.summary || '', notes: result.notes || [], floors: result.floors || 1, feedback, engine: result.engine || result.strategy || '', ledger: result.ledger || null, review: result.review || null, mirror: result.mirror ?? null };
}
export const currentDoc = s => parseDoc(s.designs[s.current].doc);

/**
 * يطبّق ملاحظات العميل (خيارات + نص حر) على الطلب.
 * - طلب محدد (نص مفهوم أو خيار تعديل): يُطبَّق على التصميم المعروض نفسه متى أمكن (نفس التوزيع) ولا يُفرض توزيع جديد.
 * - «أريد توزيعًا مختلفًا» أو بلا ملاحظات: توزيع مختلف عمّا عُرض (تُستبعد أنماطه).
 * - نص لم يُفهم منه شيء ولا خيار معه: لا يُولَّد تصميم؛ يُرمى SHARA_UNCLEAR ليعيد العميل الصياغة.
 * يعيد { session, changes, reply } — reply: ما نُفّذ وما لم يُنفَّذ (بسببه) وما لم يُفهم، مقيسًا من المخطط الجديد.
 */
/**
 * (الجولة الحادية عشرة) جواب سؤال التعارض: طلب فيه بندان متعارضان (المطبخ في الأمام وفي الخلف، المجلس جنب المطبخ وبعيد عنه)
 * يُسأل عنه عند الإنشاء؛ وملاحظة العميل التالية التي تحسم أحد الطرفين تُسجَّل في الطلب نفسه (يبقى البند المختار ويُحذف المعارض)
 * ويُرفع التعارض من الجلسة ويُذكر في الرد — حتى لو لم يتحقق البند في المخطط بعد (يبقى الطلب محسومًا لإعادة التصميم).
 */
export async function redesign(session, args = {}, opts = {}) {
  // (الجولة الثانية عشرة) جواب سؤال القراءة الحرفية أو الكلمة الغامضة («من ضمنها» / «زيادة»، «مجلسين» / «مجلس واحد»): يُسجَّل في
  // الطلب (req.answers) ويُعاد التوليد ببرنامجه إن تغيّر البرنامج، ويُرفع السؤال — لا يُرمى «لم أفهم» على جواب سؤال طرحناه
  const reading = (session.conflicts || []).filter(c => ['floor-group-member', 'majlis-plural'].includes(c?.type));
  if (reading.length && args.text && !args.picks?.length && !session.pendingEdit) {
    const ans = parseReadingAnswer(args.text, reading.map(c => c.type));
    if (Object.keys(ans).length) return answerReading(session, ans, args.text, opts);
  }
  // (الجولة الثالثة عشرة) جواب سؤال عرض الشارع («الشارع 20 م»): يُسجَّل في الأرض، ويُعاد التوليد إن تغيّر الارتداد الأمامي النظامي عن المرسوم
  if ((session.siteQuestions || []).some(q => q?.type === 'street-width') && args.text && !args.picks?.length && !session.pendingEdit) {
    const w = parseStreetWidthAnswer(args.text);
    if (w) return answerStreetWidth(session, w, args.text, opts);
  }
  const pending = (session.conflicts || []).filter(c => c && c.key && c.type !== 'needs-consent');
  const res = await redesign0(session, args, opts);
  if (!pending.length || !args.text || !res?.session) return res;
  let more = null; try { more = extractRequirements(args.text, { counts: {} }); } catch { more = null; }
  if (!more?.rules?.length) return res;
  const S = res.session, req = S.input.requirements;
  req.rules = mergeRules(session.input?.requirements?.rules || [], more.rules, { keepOld: true });
  let now = new Set(); try { now = new Set(detectConflicts(req, S.input.land || {}).map(c => c.key)); } catch { now = new Set(); }
  const resolved = pending.filter(c => !now.has(c.key));
  if (!resolved.length) return res;
  S.conflicts = (S.conflicts || []).filter(c => !resolved.some(r => r.key === c.key));
  const kept = r => r.quote || r.text || `${r.a} ${r.side || r.b || ''}`;
  res.reply = { ...res.reply, resolved: resolved.map(c => ({ type: c.type, question_ar: c.question_ar, answer_ar: args.text.trim(), kept: more.rules.map(kept) })),
    summary_ar: [`سجّلت اختيارك: ${more.rules.map(kept).join('، ')} (حُسم ${resolved.length === 1 ? 'التعارض' : resolved.length + ' تعارضات'} في طلبك، والبند المعارض حُذف).`, res.reply?.summary_ar].filter(Boolean).join(' ') };
  return res;
}
/** (الجولة الثالثة عشرة) جواب عرض الشارع: يُسجَّل land.streetWidth؛ إن صار الارتداد الأمامي النظامي أكبر من المرسوم يُعاد التوليد به. */
async function answerStreetWidth(session, width, text, { generate = generateInitialDesign } = {}) {
  const s = clone(session); s.input.land = { ...(s.input.land || {}), streetWidth: width };
  s.siteQuestions = (s.siteQuestions || []).filter(q => q.type !== 'street-width');
  const was = frontSetbackFor(session.input.land?.streetWidth), now = frontSetbackFor(width);
  const resolved = [{ type: 'street-width', question_ar: (session.siteQuestions || []).find(q => q.type === 'street-width')?.question_ar || '', answer_ar: text.trim(), kept: [`عرض الشارع ${width} م`] }];
  const what = [`عرض شارع المدخل ${width} م: الارتداد الأمامي النظامي ${now.value} م (${now.why_ar})`];
  if (now.value === was.value) {
    s.reply = null;
    return { session: s, changes: [], reply: { local: true, mode: 'answered', resolved, done: what, failed: [], pending: [], unverified: [], picks: [], unclear: [], unsupported: [], kept: true, unchanged: true, otherFails: [], conflicts: s.conflicts, questions: (s.conflicts || []).map(c => c.question_ar),
      summary_ar: `سجّلت عرض الشارع ${width} م. الارتداد الأمامي المرسوم (${was.value} م) يطابق النظامي (${now.value} م) فلم يتغيّر المخطط — وصارت طبقته «اشتراط نظامي متحقق».` } };
  }
  const req = s.input.requirements;
  const out = await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: req.counts, requirements: req, ...(s.input.engine ? { engine: s.input.engine } : {}) });
  const entryDir = s.input.land?.entries?.[0] || 's';
  let ledger = []; try { ledger = verifyRequest(out.doc, req, { entry: entryDir }); } catch { ledger = out.ledger || []; }
  const reply = { local: false, mode: 'answered-regenerated', resolved, done: what, failed: ledger.filter(x => !x.ok && x.status !== 'pending-render').map(x => ({ text: x.text, why: x.why })).slice(0, 6), pending: [], unverified: [], picks: [], unclear: [], unsupported: [], kept: false, unchanged: false, otherFails: [], conflicts: s.conflicts, questions: (s.conflicts || []).map(c => c.question_ar),
    summary_ar: `سجّلت عرض الشارع ${width} م: الارتداد الأمامي النظامي ${now.value} م بدل ${was.value} م المرسومة، فأعدت توليد المخطط داخل الارتداد الجديد.` };
  pushDesign(s, entry(out, { picks: [], text, changes: what, reply }));
  s.reply = null;
  return { session: s, changes: what, reply };
}
/** يسجّل جواب العميل عن القراءة/الغموض ويعيد التوليد إن تغيّر البرنامج (عدد غرف النوم أو المجالس). */
async function answerReading(session, ans, text, { generate = generateInitialDesign } = {}) {
  const s = clone(session), req = s.input.requirements; req.answers = { ...(req.answers || {}), ...ans }; req.counts ||= {};
  const before = { bedrooms: req.counts.bedrooms, majlis: req.counts.majlis };
  if (ans['majlis-plural']) req.counts.majlis = ans['majlis-plural'];
  if (ans['floor-group-member']) { const n = req.textCounts?.bedrooms; if (Number.isInteger(n)) req.counts.bedrooms = ans['floor-group-member'] === 'included' ? n : Math.max(req.counts.bedrooms || 0, n + 1); }
  // الحمامات تتبع المجلس الثاني (دورة مياه النساء) إن لم تكفِ
  if (ans['majlis-plural'] === 2 && before.majlis < 2) req.counts.baths = Math.max(req.counts.baths || 0, (req.counts.baths || 0) + 1);
  const resolvedTypes = Object.keys(ans);
  s.conflicts = (s.conflicts || []).filter(c => !resolvedTypes.includes(c.type));
  const what = [ans['floor-group-member'] === 'included' ? `«غرفة كبار السن» من ضمن عدد غرف النوم (${req.counts.bedrooms} غرف)` : ans['floor-group-member'] === 'extra' ? `«غرفة كبار السن» زيادة على العدد (${req.counts.bedrooms} غرف نوم)` : null,
    ans['majlis-plural'] === 2 ? 'مجلسان: رجال ونساء' : ans['majlis-plural'] === 1 ? 'مجلس رجال واحد' : null].filter(Boolean);
  const changed = req.counts.bedrooms !== before.bedrooms || req.counts.majlis !== before.majlis;
  const resolved = (session.conflicts || []).filter(c => resolvedTypes.includes(c.type)).map(c => ({ type: c.type, question_ar: c.question_ar, answer_ar: text.trim(), kept: what }));
  if (!changed) {
    s.reply = null;
    return { session: s, changes: [], reply: { local: true, mode: 'answered', resolved, done: what, failed: [], pending: [], unverified: [], picks: [], unclear: [], unsupported: [], kept: true, unchanged: true, otherFails: [], conflicts: s.conflicts, questions: (s.conflicts || []).map(c => c.question_ar),
      summary_ar: `سجّلت جوابك: ${what.join('، ')}. المخطط المعروض مرسوم بهذه القراءة أصلًا فلم يتغيّر شيء.` } };
  }
  const out = await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: req.counts, requirements: req, ...(s.input.engine ? { engine: s.input.engine } : {}) });
  const entryDir = s.input.land?.entries?.[0] || 's';
  let ledger = []; try { ledger = verifyRequest(out.doc, req, { entry: entryDir }); } catch { ledger = out.ledger || []; }
  const reply = { local: false, mode: 'answered-regenerated', resolved, done: what, failed: ledger.filter(x => !x.ok && x.status !== 'pending-render').map(x => ({ text: x.text, why: x.why })).slice(0, 6), pending: [], unverified: [], picks: [], unclear: [], unsupported: [], kept: false, unchanged: false, otherFails: [], conflicts: s.conflicts, questions: (s.conflicts || []).map(c => c.question_ar),
    summary_ar: `سجّلت جوابك: ${what.join('، ')}. تغيّر برنامج البيت بجوابك، فأعدت توليده بهذا البرنامج (${req.counts.bedrooms} غرف نوم${req.counts.majlis ? `، ${req.counts.majlis === 2 ? 'مجلسان' : 'مجلس واحد'}` : ''}).` };
  pushDesign(s, entry(out, { picks: [], text, changes: what, reply }));
  s.reply = null;
  return { session: s, changes: what, reply };
}
async function redesign0(session, { picks = [], text = '', ai = null } = {}, { generate = generateInitialDesign, local = true } = {}) {
  const s = clone(session), req = s.input.requirements, changes = [];
  req.prefs ||= {}; req.tweaks ||= {}; req.counts ||= {}; req.extras ||= {}; req.areas ||= {};
  let more = null;
  if (text && text.trim().length >= 2) more = withAi(extractRequirements(text, { counts: {} }), ai);
  // التعديل الموضعي أولًا (dist/plan-edit.mjs): نوايا التعديل على المستند المعروض نفسه، بلا إعادة توليد
  let parsed = null, consent = false;
  const curDoc = s.designs[s.current].doc;
  // جواب سؤال الإذن («تحقيقه يحتاج تغيير غرفة لم تذكرها — أنفّذه؟»): «نعم» تنفّذ المقترح نفسه، «لا» تبقي المخطط
  const pend = s.pendingEdit; delete s.pendingEdit;
  if (pend && !picks.length && text) {
    const tt = normalizeAr(text);
    const yes = /^(?:نعم|ايه|ايوه|اي|اكيد|تمام|طيب|موافق|نفذ|نفذه|نفذها|اوكي|ok|yes|خلاص نفذ|يلا|اعد التوزيع|اعده)(?:[ ،,.!]|$)/.test(tt);
    // (الجولة العاشرة) موافقة على إعادة التوزيع المقترحة: يُعتمد التصميم الذي عُرض أثره قبل السؤال نفسه حرفيًا
    if (yes && pend.regen) {
      const s2 = clone(session); delete s2.pendingEdit; s2.input = clone(pend.input);
      const d = clone(pend.design); d.feedback = { ...(d.feedback || {}), reply: { ...pend.reply, consented: true } };
      pushDesign(s2, d); s2.reply = null;
      return { session: s2, changes: d.feedback.changes || [], reply: { ...pend.reply, consented: true, summary_ar: `أعدت توزيع البيت كما وافقت. ${pend.reply.fingerprint?.summary_ar || ''}${pend.reply.lost?.length ? ` لا يتحقق فيه مما طلبته سابقًا: ${pend.reply.lost.map(x => `«${x.text}»`).join('، ')}.` : ''}`.trim() } };
    }
    if (yes) { parsed = { intents: pend.intents, unhandled: [], questions: [], keep: false, refs: [] }; consent = true; text = pend.text; more = withAi(extractRequirements(text, { counts: {} }), ai); }
    else if (/^(?:لا|لأ|لا شكرا|خله|خلها|اتركه|لا تنفذ|no)(?:[ ،,.!]|$)/.test(tt)) {
      const keep = clone(session); delete keep.pendingEdit;
      return { session: keep, changes: [], reply: { local: true, mode: 'declined', done: [], failed: [], pending: [], unverified: [], picks: [], unclear: [], unsupported: [], kept: true, unchanged: true, otherFails: [], conflicts: [], questions: [], summary_ar: 'تمام، أبقيت المخطط كما هو حرفيًا.' } };
    }
  }
  if (local && !picks.length && more && !parsed) {
    try { parsed = parseEdit(text, parseDoc(curDoc), { more, lastSubject: lastSubjectOf(s) }); } catch { parsed = null; }
    if (parsed?.questions?.length) {
      // غرفة غير محددة («غرفة البنت»): سؤال، والمخطط كما هو
      const q = parsed.questions, keep = clone(session); keep.reply = { conflicts: q, questions: q.map(x => x.question_ar) };
      return { session: keep, changes: [], reply: { conflicts: q, questions: q.map(x => x.question_ar), done: [], failed: [], pending: [], unverified: [], picks: [], unclear: [], unsupported: [], kept: true, unchanged: true, otherFails: [], local: true, mode: 'clarify' } };
    }
  }
  const localIntents = !!parsed?.intents?.length && !parsed.unhandled.length;
  if (more && !more.understood.length && !more.unsupported.length && !picks.length && !localIntents) {
    const err = Error('لم أفهم ملاحظتك بدقة فلم أغيّر شيئًا' + (more.unclear.length ? ': ' + more.unclear.map(x => '«' + x + '»').join('، ') : '') + '. اكتبها بصيغة مباشرة مثل: «المطبخ في الخلف»، «الماستر بعيدة عن المجلس»، «المجلس أكبر»، «غرفة النوم 4×5»، أو اختر من الخيارات.');
    err.code = 'SHARA_UNCLEAR'; err.unclear = more.unclear; throw err;
  }
  const before = (() => { try { return new Set(detectConflicts(req, s.input.land || {}).map(c => c.key)); } catch { return new Set(); } })();
  for (const id of picks) { const f = FEEDBACK.find(x => x.id === id); if (!f) throw Error('خيار غير معروف.'); f.apply(req, req.tweaks); changes.push(f.label); }
  let layoutChange = picks.length > 0;
  if (more) {
    const any = o => Object.keys(o || {}).length > 0;
    layoutChange ||= !!(more.rules?.length || any(more.prefs) || any(more.extras) || any(more.areas) || any(more.dims) || any(more.textCounts) || more.absent?.length || Object.values(more.tweaks || {}).some(v => typeof v === 'number'));
    Object.assign(req.prefs, more.prefs); Object.assign(req.extras, more.extras); Object.assign(req.areas, more.areas);
    req.dims = { ...(req.dims || {}), ...(more.dims || {}) };
    // الأعداد: ما ذكره العميل صراحة في الملاحظة فقط (لا يُنزل «الماستر …» عدد الغرف إلى 1)، و«بدون مجلس/طعام»، والحمامات المحسوبة لطلبه
    for (const [k, v] of Object.entries(more.textCounts || {})) if (Number.isInteger(v) && v > 0) req.counts[k] = v;
    for (const k of ['majlis', 'dining']) if (more.counts?.[k] === 0) req.counts[k] = 0;
    if (more.counts?.dining > 0 && !req.counts.dining) req.counts.dining = more.counts.dining; // ذكر الطعام في الملاحظة يعني وجوده
    if (Number.isInteger(more.counts?.baths) && (more.prefs?.allEnsuite || more.prefs?.sharedBaths) && more.counts.baths > (req.counts.baths || 0)) req.counts.baths = more.counts.baths;
    if (Number.isInteger(more.counts?.kitchens) && more.counts.kitchens > (req.counts.kitchens || 0)) req.counts.kitchens = more.counts.kitchens;
    req.rules = mergeRules(req.rules || [], more.rules || [], { keepOld: true });
    // معاملات التكبير تتضاعف؛ التعديلات البنيوية (الواجهة) تُستبدل كما هي
    for (const [k, v] of Object.entries(more.tweaks || {})) req.tweaks[k] = typeof v === 'number' ? (typeof req.tweaks[k] === 'number' ? req.tweaks[k] : 1) * v : JSON.parse(JSON.stringify(v));
    if (more.keepLayout) req.keepLayout = true;
    if (more.absent?.length) {
      req.absent = [...new Set([...(req.absent || []), ...more.absent])];
      // الحذف اللاحق يلغي ما سبق عن الفراغ نفسه (قاعدة موضعه، وطلب إضافته) — لا يُعدّ تعارضًا
      for (const k of more.absent) { delete req.extras[k]; req.rules = (req.rules || []).filter(r => !(ABSENT_SUBJ[k] || [k]).some(x => r.a === x || r.b === x)); }
    }
    // إضافة فراغ كان «بدون»: يُرفع من قائمة «بدون»
    if (req.absent?.length) req.absent = req.absent.filter(k => !more.extras?.[k]);
    if (more.unsupported?.length) req.unsupported = [...new Set([...(req.unsupported || []), ...more.unsupported])];
    req.understood = [...new Set([...(req.understood || []), ...more.understood])];
    changes.push(...more.understood);
    s.input.idea = [s.input.idea, text].filter(Boolean).join('\n');
  }
  // تعارض جديد (في الملاحظة نفسها أو بينها وبين الطلب السابق): لا تصميم، بل سؤال للعميل — بلا رمي
  let fresh = [];
  try {
    const all = [...(more ? detectConflicts({ ...more, counts: { ...req.counts, ...(more.textCounts || {}) } }, s.input.land || {}) : []), ...detectConflicts(req, s.input.land || {})];
    const keys = new Set(); fresh = all.filter(c => !before.has(c.key) && !keys.has(c.key) && keys.add(c.key));
  } catch { fresh = []; }
  if (fresh.length) {
    const reply = { conflicts: fresh, questions: fresh.map(c => c.question_ar), done: [], failed: [], pending: [], unverified: [], picks: picks.map(id => FEEDBACK.find(f => f.id === id)?.label).filter(Boolean), unclear: more?.unclear || [], unsupported: more?.unsupported || [], kept: true, unchanged: true, otherFails: [] };
    const keep = clone(session); keep.conflicts = fresh; keep.reply = { conflicts: fresh, questions: reply.questions };
    return { session: keep, changes: [], reply };
  }
  // التعديل الموضعي: ينفَّذ على المستند المعروض؛ إن لم يوجد حل موضعي يُعاد التوليد ويُقال ذلك صراحة مع ما تغيّر
  let fallbackNote = null;
  if (localIntents) {
    const out = localTurn(s, req, parsed, { text, picks, changes, more, original: session, consent });
    if (out.session) return out;
    fallbackNote = out.fallback;
  } else if (parsed && parsed.unhandled?.length && more) fallbackNote = { why_ar: `لا تعديل موضعي لـ: ${parsed.unhandled.map(u => `«${u}»`).join('، ')}؛ هذا يحتاج إعادة توزيع.` };
  // إعادة التوليد تحتاج الطلب نفسه في الأعداد («زيد غرفة نوم» لا عدد صريحًا فيها)
  if (fallbackNote) for (const it of parsed?.intents || []) if (it.op === 'bedCount') { req.counts.bedrooms = it.n; if (req.prefs?.allEnsuite) req.counts.baths = Math.max(req.counts.baths || 0, (req.counts.baths || 0) + (it.n - it.from)); }
  const different = picks.includes('layout') || (!picks.length && !more);
  if (different) changes.push('توزيع مختلف للغرف');
  const cur = s.designs[s.current];
  const exclude = different ? s.designs.map(d => d.pat).filter(Boolean) : [];
  // تعديل نصي بلا خيارات (مثل «انقل المطبخ…»): تعديل موضعي على المخطط المعروض نفسه أولًا (local)؛
  // خيارات التقييم الجاهزة (غرف صغيرة، ممرات كثيرة…) تبقى إعادة توليد تفضّل النمط المعروض
  const prefer = different ? null : { pat: cur.pat, mirror: cur.mirror ?? null, doc: cur.doc, local: !picks.length && !!more };
  // «احتفظ بهذا التوزيع» بلا تغيير يمس المخطط (مثل تغيير الواجهة): المخطط نفسه حرفيًا، بلا توليد
  const reuse = !different && !!more?.keepLayout && !layoutChange;
  const out = reuse
    ? { doc: parseDoc(cur.doc), pat: cur.pat, mirror: cur.mirror ?? null, summary: cur.summary, notes: cur.notes, floors: cur.floors, engine: cur.engine, review: cur.review || null, same: true }
    : await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: req.counts, requirements: req, exclude, prefer, ...(s.input.engine ? { engine: s.input.engine } : {}) });
  // رد شرعاء: البنود التي طلبها الآن، مقيسة من المخطط الجديد
  const entryDir = s.input.land?.entries?.[0] || 's';
  let ledger = []; try { ledger = verifyRequest(out.doc, req, { entry: entryDir }); } catch { ledger = out.ledger || []; }
  const asked = new Set([...(more?.understood || [])]);
  const mine = ledger.filter(x => asked.has(x.text) || (more?.rules || []).some(r => r.text === x.text) || (x.id === 'F-facade' && more?.tweaks?.facade));
  const unchanged = !different && serialize(out.doc) === cur.doc;
  const st = x => x.status || (x.ok ? 'done' : 'failed');
  const reply = {
    done: mine.filter(x => st(x) === 'done').map(x => x.text), failed: mine.filter(x => st(x) === 'failed').map(x => ({ text: x.text, why: x.why })),
    pending: mine.filter(x => st(x) === 'pending-render').map(x => ({ text: x.text, why: x.why })),
    unverified: mine.filter(x => st(x) === 'unverified').map(x => ({ text: x.text, why: x.why })),
    picks: picks.map(id => FEEDBACK.find(f => f.id === id)?.label).filter(Boolean),
    unclear: more?.unclear || [], unsupported: more?.unsupported || [], kept: !different && !!out.same, unchanged, reused: reuse,
    otherFails: ledger.filter(x => st(x) === 'failed' && !mine.includes(x)).map(x => ({ text: x.text, why: x.why })),
    conflicts: [], questions: [],
  };
  // طلب تعديل (لا «توزيع مختلف») غيّر النمط: التوزيع المعروض لم يحقق الطلب فاختير أقرب توزيع يحققه — يُقال صراحة
  if (!different && !reuse && cur.pat && out.pat && out.pat !== cur.pat) reply.patternChanged = { from: cur.pat, to: out.pat, why_ar: 'التوزيع المعروض لا يحقق طلبك كما هو؛ اخترت أقرب توزيع إليه يحققه.' };
  // إعادة التوليد بعد تعذّر الحل الموضعي: يُقاس ما طُلب على الناتج؛ إن لم يتحقق لا يُستبدل المخطط المعروض بتصميم
  // غيّر غيره بلا فائدة، ويُقال لم يُنفَّذ ولماذا
  if (fallbackNote?.intents?.length) {
    const m = measureIntents(parseDoc(cur.doc), out.doc, fallbackNote.intents.filter(i => i.op !== 'none'), { entry: entryDir });
    const failedTexts = new Set((fallbackNote.failed || []).map(f => f.text_ar));
    const achieved = m.filter(x => failedTexts.has(x.text_ar)).some(x => x.ok) || (!failedTexts.size && m.some(x => x.ok));
    if ((unchanged || !achieved) && fallbackNote.partial) { const out2 = fallbackNote.partial(); out2.reply.summary_ar += ' جرّبت إعادة توزيع البيت لما لم يُنفَّذ فلم تحققه، فأبقيت التعديل الموضعي وحده.'; out2.reply.triedRegeneration = true; return out2; }
    if (unchanged || !achieved) {
      const keep = clone(session);
      const why = (fallbackNote.failed || []).map(f => ({ text: f.text_ar, why: f.why_ar }));
      const rep = { local: true, mode: 'not-done', done: [], failed: why.length ? why : m.map(x => ({ text: x.text_ar, why: 'لم يتحقق لا موضعيًا ولا بإعادة التوزيع' })), pending: [], unverified: [], picks: [], unclear: more?.unclear || [], unsupported: more?.unsupported || [], kept: true, unchanged: true, reused: false, otherFails: [], conflicts: [], questions: [], changed: [], unrequested: [],
        summary_ar: `لم يُنفَّذ: ${(why.length ? why : m.map(x => ({ text: x.text_ar, why: '' }))).map(f => `${f.text}${f.why ? ' — ' + f.why : ''}`).join('؛ ')}. جرّبت إعادة توزيع البيت فلم تحقق الطلب أيضًا، فأبقيت المخطط المعروض كما هو حرفيًا.` };
      keep.reply = null;
      return { session: keep, changes: [], reply: rep };
    }
    reply.fallbackMeasured = m;
  }
  // البصمة الهندسية بين المعروض والناتج: كم عنصرًا تغيّر وكم بقي ثابتًا حرفيًا
  let fpd = null; try { fpd = diffFingerprint(parseDoc(cur.doc), out.doc); reply.fingerprint = compactDiff(fpd); } catch { fpd = null; }
  if (fallbackNote && !unchanged) {
    let ch = []; try { ch = describeChanges(compareDocs(parseDoc(cur.doc), out.doc, { gates: false, byName: true }).changed); } catch { ch = []; }
    const rooms = ch.filter(c => c.kind !== 'openings');
    reply.mode = 'regenerated';
    reply.fallback = { why_ar: fallbackNote.why_ar, said_ar: `لم أجد تعديلًا موضعيًا يحقق طلبك على المخطط المعروض، فأعدت توزيع البيت. تغيّر ${rooms.length} فراغًا: ${rooms.slice(0, 12).map(c => c.text_ar).join('؛ ') || '—'}.${fpd ? ' ' + fpd.summary_ar : ''}`, changed: ch };
    if (reply.patternChanged) reply.patternChanged.why_ar = 'التوزيع المعروض لا يحقق طلبك كما هو؛ اخترت أقرب توزيع إليه يحققه — وتغيّرت معه غرف أخرى (مذكورة في الرد).';
    // (الجولة العاشرة) طلب تعديل لم يُحل موضعيًا: لا يُعاد توزيع البيت قبل موافقة العميل — يُعرض أثره مقيسًا بالبصمة
    // (كم عنصرًا سيتغير، وأي الغرف) ويُحفظ التصميم المقترح نفسه ليُعتمد حرفيًا بـ«نعم»
    if (fallbackNote.intents?.length) {
      const why = (fallbackNote.failed || []).map(f => (f.why_ar || '').replace(/\s*\(\d+ محاولة[^)]*\)+/, '')).filter(Boolean).join('؛ ') || fallbackNote.why_ar || '';
      const before = fpd ? fpd.counts.unchanged + fpd.counts.changed + fpd.counts.removed : 0;
      // (الجولة الحادية عشرة) ما طلبه العميل سابقًا ومتحقق في المعروض ولا يتحقق في التوزيع المقترح: يُذكر في السؤال نفسه (لا يضيع بصمت)
      let lost = []; try { const okNow = new Set(verifyRequest(parseDoc(cur.doc), req, { entry: entryDir }).filter(x => x.ok).map(x => x.text)); lost = ledger.filter(x => !x.ok && okNow.has(x.text)).map(x => ({ text: x.text, why: x.why })); } catch { lost = []; }
      const q = `لم أجد تعديلًا موضعيًا يحقق طلبك دون المساس ببقية البيت${why ? ` (${why.replace(/[.。]+$/, '')})` : ''}. تحقيقه يحتاج إعادة توزيع البيت: ${fpd ? `لا يبقى ثابتًا حرفيًا إلا ${countAr(fpd.counts.unchanged)} من ${countAr(before)} في المخطط الحالي (البصمة الهندسية)` : 'يتغير معظم المخطط'}، وتتغير ${countAr(rooms.length, 'room')} لم تطلبها${rooms.length ? ` (${rooms.slice(0, 6).map(c => `«${c.name}»`).join('، ')}${rooms.length > 6 ? '…' : ''})` : ''}.${lost.length ? ` وتنبيه: في التوزيع الجديد لا يتحقق ما طلبته سابقًا ومتحقق الآن: ${lost.map(x => `«${x.text}»`).join('، ')}.` : ''} أعيد توزيع البيت؟ (قل «نعم» أو «لا»)`;
      const proposal = { ...reply, mode: 'regenerated', lost };
      const keep = clone(session);
      keep.pendingEdit = { regen: true, text, input: s.input, design: entry(out, { picks, text, changes, reply: proposal, edit: parsed?.intents?.length ? { local: false, intents: parsed.intents } : null }), reply: proposal };
      const cq = { type: 'needs-consent', key: 'regen|' + text, question_ar: q };
      keep.reply = { conflicts: [cq], questions: [q] };
      return { session: keep, changes: [], reply: { local: true, mode: 'ask-regenerate', conflicts: [cq], questions: [q], done: [], failed: (fallbackNote.failed || []).map(f => ({ text: f.text_ar, why: f.why_ar })), pending: [], unverified: [], picks: [], unclear: reply.unclear, unsupported: reply.unsupported, kept: true, unchanged: true, otherFails: [], changed: [], unrequested: [], proposal: { fingerprint: reply.fingerprint || null, changed: ch, measured: reply.fallbackMeasured || null, pattern: out.pat || null, lost }, summary_ar: q } };
    }
  }
  pushDesign(s, entry(out, { picks, text, changes, reply, edit: parsed?.intents?.length ? { local: false, intents: parsed.intents } : null }));
  return { session: s, changes, reply };
}

const ABSENT_SUBJ = { majlis: ['majlis', 'majlis_w'], dining: ['dining'], office: ['office'], prayer: ['prayer'], maid: ['maid'], driver: ['driver'], laundry: ['laundry'], storage: ['storage'] };
function compactReview(rv) {
  return { version: rv.version, passed: rv.passed, failedGates: rv.failedGates, score: rv.score, rejectReasons_ar: rv.rejectReasons_ar,
    gates: rv.gates.map(g => ({ id: g.id, ar: g.ar, ok: g.ok, applicable: g.applicable !== false, value: g.value, reasons_ar: g.reasons_ar })),
    breakdown: rv.breakdown.map(b => ({ id: b.id, ar: b.ar, value: b.value, weight: b.weight })) };
}
/** آخر فراغ عدّله العميل (لفهم الضمير في «رجّعه مقفل»). */
function lastSubjectOf(s) {
  const ed = s.designs[s.current]?.feedback?.edit;
  for (const it of [...(ed?.intents || [])].reverse()) { if (it.subjectDoor) return 'door:' + it.subjectDoor; if (it.op === 'kitchenOpen') return 'kitchen'; if (it.subjectType) return it.subjectType; }
  return null;
}
const SCOPE_OPS = new Set(['resize', 'delete', 'extDoor', 'revertRoom']);
/**
 * دور تعديل موضعي كامل: ينفّذ النوايا على المستند المعروض، أو يرجع إلى تصميم سابق ويعيد التعديلات المطلوب إبقاؤها.
 * يعيد { session, changes, reply } عند النجاح، أو { fallback } إن لم يوجد حل موضعي.
 */
function localTurn(s, req, parsed, { text, picks, changes, more, original, consent = false }) {
  const cur = s.designs[s.current], doc0 = parseDoc(cur.doc), entryDir = s.input.land?.entries?.[0] || 's';
  const history = s.designs.slice(0, s.current + 1).map((d, i) => ({ doc: d.doc, edit: d.feedback?.edit || null, text: d.feedback?.text || '', version: d.version ?? i + 1 }));
  const reqE = { ...req, entry: entryDir, consent };
  let res = applyEdits(doc0, parsed, { req: reqE, history });
  let restored = null;
  if (res.status === 'restore') {
    // الرجوع إلى تصميم سابق ثم إعادة التعديلات الموضعية اللاحقة المطلوب إبقاؤها؛ ما كان إعادة توليد لا يُعاد ويُذكر
    const R = res.restore, base = parseDoc(history[Math.max(0, R.index)].doc), later = history.slice(R.index + 1);
    const keepIntents = [], lostTurns = [], dropped = [];
    // الغرفة المرجَعة: تُسقط تعديلاتها اللاحقة (ومنها قواعد موضعها)، وتُعاد بقية التعديلات — محليًا إن أمكن
    const dropType = R.dropRoom ? inspect(doc0).rooms.get(R.dropRoom)?.type : null;
    const RULE_KEY = { kitchen: 'kitchen', dining: 'dining', master: 'master', majlis: 'majlis', office: 'office' };
    const isDropped = it => !!R.dropRoom && (it.id === R.dropRoom || (it.op === 'rule' && RULE_KEY[dropType] && (it.rule.a === RULE_KEY[dropType])) || (it.op === 'kitchenOpen' && dropType === 'kitchen'));
    for (const h of later) {
      if (R.reason === 'bedCount' && h.edit?.intents?.some(x => x.op === 'bedCount' || (x.op === 'add' && x.kind === 'bedroom'))) continue;
      if (!h.edit?.intents) { if (h.text) lostTurns.push(h.text); continue; }
      for (const it of h.edit.intents) { if (isDropped(it)) { dropped.push(it); continue; } if (R.keepOnly && !(R.keepIds || []).includes(it.id)) continue; keepIntents.push(it); }
    }
    if (dropped.length) req.rules = (req.rules || []).filter(r => !dropped.some(d => d.op === 'rule' && d.rule.text === r.text));
    const rp = replayIntents(base, keepIntents, { req: reqE });
    // نوايا هذا الدور الأخرى (غير الإرجاع) على الناتج
    const rest = parsed.intents.filter(i => !['restore', 'revertRoom', 'bedCount'].includes(i.op));
    res = rest.length ? applyEdits(rp.doc, { intents: rest, unhandled: [], questions: [] }, { req: reqE, history }) : { status: 'local', doc: rp.doc, results: [], pending: [] };
    const ver = history[R.index].version;
    res.results = [...parsed.intents.filter(i => ['restore', 'revertRoom', 'bedCount'].includes(i.op)).map(i => ({ op: i.op, text_ar: i.text_ar, ok: true, how_ar: `رجعت إلى ${R.index === 0 ? 'التصميم الأول (النسخة 1)' : `النسخة ${ver}`}${rp.ok.length ? ` وأعدت عليها: ${rp.ok.join('، ')}` : ''}`, intent: i })), ...res.results];
    restored = { index: R.index, version: ver, replayed: rp.ok, lost: rp.lost, lostTurns, keepNames: keepIntents.flatMap(i => [i.name, i.aName, i.bName]).filter(Boolean) };
    // (الجولة العاشرة) إثبات الرجوع بالبصمة: الناتج مقارنًا بالنسخة نفسها — مطابق حرفيًا، أو لا يختلف عنها إلا بما غيّرته
    // التعديلات المعادة، وهي العناصر نفسها التي غيّرتها تلك التعديلات أول مرة
    try {
      const vs = diffFingerprint(base, res.doc), replay = touchedKeys(vs), orig = new Set();
      later.forEach((h, k) => { if (h.edit?.intents?.some(it => keepIntents.includes(it))) { const prev = k === 0 ? base : parseDoc(later[k - 1].doc); for (const key of touchedKeys(diffFingerprint(prev, parseDoc(h.doc)))) orig.add(key); } });
      const common = [...replay].filter(k => orig.has(k)).length;
      restored.proof = { version: ver, identical: vs.identical, counts: vs.counts, replayedEdits: rp.ok, replayTouched: replay.size, originalTouched: orig.size, common, summary_ar: vs.identical ? `البصمة: الناتج مطابق للنسخة ${ver} حرفيًا (${countAr(vs.counts.unchanged)}).` : `البصمة: الناتج لا يختلف عن النسخة ${ver} إلا في ${countAr(vs.counts.touched)} أعاد تغييرها ${rp.ok.map(x => `«${x}»`).join(' و') || 'هذا الطلب'}${orig.size ? ` (${common} منها هي نفسها التي غيّرها ذلك التعديل أول مرة من ${orig.size})` : ''}، وبقي ثابتًا حرفيًا كما في النسخة ${ver}: ${countAr(vs.counts.unchanged)}.` };
    } catch { /* الإثبات معلوماتي */ }
  }
  if (res.status === 'clarify') {
    const q = res.questions, keep = clone(original); if (q.some(x => x.type === 'needs-consent')) keep.pendingEdit = { text, intents: parsed.intents }; keep.reply = { conflicts: q, questions: q.map(x => x.question_ar) };
    return { session: keep, changes: [], reply: { conflicts: q, questions: q.map(x => x.question_ar), done: [], failed: res.results.filter(r => !r.ok).map(r => ({ text: r.text_ar, why: r.why_ar })), pending: [], unverified: [], picks: [], unclear: [], unsupported: [], kept: true, unchanged: true, otherFails: [], local: true, mode: 'clarify' } };
  }
  if (res.status === 'fallback') return { fallback: { why_ar: res.why_ar, intents: parsed.unhandled?.length ? null : parsed.intents, failed: res.results.filter(r => !r.ok) } };
  if (res.status !== 'local') return { fallback: { why_ar: 'لا حل موضعي' } };
  // نطاق الطلب: الغرف التي ذكرها العميل والغرف المضافة؛ ما تغيّر غيرها يُعلن «لازمًا للتعديل»
  const I0 = inspect(doc0), I1 = inspect(res.doc), scope = new Set();
  for (const r of res.results) { const it = r.intent || {}; if (SCOPE_OPS.has(it.op) && it.id) scope.add(it.id); }
  for (const r of res.results) if (r.intent?.op === 'kitchenOpen') for (const x of I0.rooms.values()) if (x.type === 'kitchen' || x.type === 'dining' || (r.intent.to === 'hall' && x.type === 'living')) scope.add(x.id);
  for (const id of I1.rooms.keys()) if (!I0.rooms.has(id)) scope.add(id);
  if (restored) { const it = parsed.intents.find(i => i.op === 'revertRoom'); if (it) scope.add(it.id); for (const x of I0.rooms.values()) if (restored.keepNames.includes(x.name)) scope.add(x.id); }
  const cmp = compareDocs(doc0, res.doc, { scope, gates: false, byName: !!restored });
  const changed = describeChanges(cmp.changed);
  const failedRes = res.results.filter(r => !r.ok);
  if (failedRes.length === res.results.length && !restored) return { fallback: { why_ar: failedRes.map(r => r.why_ar).join(' '), intents: parsed.intents, failed: failedRes } };
  // بعض المطلوب لا حل موضعيًا له (إضافة لا تتسع…): تُجرَّب إعادة التوزيع للطلب كله، فإن لم تحققه يبقى الجزء الموضعي
  const noLocal = failedRes.filter(r => ['add', 'bedCount', 'rule', 'extDoor', 'kitchenOpen'].includes(r.op) && !r.ask);
  const finish = () => commitLocal();
  if (noLocal.length && !restored) return { fallback: { why_ar: noLocal.map(r => r.why_ar).join(' '), intents: parsed.intents, failed: noLocal, partial: finish } };
  return finish();
  function commitLocal() {
  // تحديث الطلب بما صار عليه المستند (الأعداد للبوابات اللاحقة)
  const beds = [...I1.rooms.values()].filter(r => r.type === 'bedroom' || r.type === 'master').length;
  if (beds !== [...I0.rooms.values()].filter(r => r.type === 'bedroom' || r.type === 'master').length) req.counts.bedrooms = beds;
  const baths = [...I1.rooms.values()].filter(r => r.type === 'bath').length; if (baths > (req.counts.baths || 0)) req.counts.baths = baths;
  for (const [k, t] of [['majlis', 'majlis'], ['dining', 'dining']]) { const n = [...I1.rooms.values()].filter(r => r.type === t).length; if (Number.isInteger(req.counts[k]) && n < req.counts[k]) req.counts[k] = n; }
  const doorOf = new Map(res.results.filter(r => r.subjectDoor).map(r => [r.intent, r.subjectDoor]));
  const intents = parsed.intents.map(i => ({ ...i, subjectType: i.id ? I0.rooms.get(i.id)?.type || null : i.op === 'kitchenOpen' ? 'kitchen' : null, ...(doorOf.has(i) ? { subjectDoor: doorOf.get(i) } : {}) }));
  // البصمة الهندسية للدور: كل عنصر قبل التعديل وبعده
  let fpd = null; try { fpd = diffFingerprint(doc0, res.doc); } catch { fpd = null; }
  // «نُفّذ» لما تغيّر فعلًا فقط؛ ما كان متحققًا أصلًا (أو حذف فراغ غير موجود) يُذكر وحده بسببه
  // حذف فراغ غير موجود أصلًا ليس «نُفّذ»: يُذكر وحده بسببه (ما كان متحققًا أصلًا يبقى في «نُفّذ» كما كان)
  const absent = r => r.ok && r.already && r.intent?.op === 'none' && /غير موجود/.test(r.why_ar || '');
  // (الجولة الثانية عشرة) ما كان متحققًا أصلًا بسبب مقيس (مثل باب المقلط الافتراضي بين المجلس والطعام) يُعرض في «لم يحتج تغييرًا» لا «نُفّذ»
  const doneTxt = res.results.filter(r => r.ok && !absent(r)).map(r => r.text_ar);
  const alreadyTxt = res.results.filter(r => absent(r) || (r.ok && r.already && r.why_ar)).map(r => `${r.text_ar}${r.why_ar ? ' — ' + r.why_ar.replace(/[.。]+$/, '') : ''}`);
  const doneShown = res.results.filter(r => r.ok && !absent(r) && !(r.already && r.why_ar)).map(r => r.text_ar);
  // الرجوع يعيد الواجهة أيضًا: يُقال صراحة إن تغيّرت مادتها
  const facA = doc0.finish?.facade?.material || null, facB = res.doc.finish?.facade?.material || null;
  const facadeNote = facA !== facB ? (facB ? `الواجهة صارت «${res.doc.finish.facade.materialAr || facB}»` : `الواجهة عادت إلى مادتها في ذلك التصميم (أُلغي «${doc0.finish?.facade?.materialAr || facA}»)`) : null;
  let ledger = []; try { ledger = verifyRequest(res.doc, req, { entry: entryDir }).map(x => facadeStatus(x, res.doc, req)); } catch { ledger = []; }
  const unrequested = changed.filter(c => !c.inScope && c.kind !== 'openings');
  const reply = {
    local: true, mode: restored ? 'restore' : 'local',
    done: doneTxt, failed: failedRes.map(r => ({ text: r.text_ar, why: r.why_ar })), pending: (res.pending || []).map(p => ({ text: p.text, why: p.why })), unverified: [],
    already: res.results.filter(r => r.ok && r.already).map(r => ({ text: r.text_ar, why: r.why_ar })),
    how: res.results.filter(r => r.ok && r.how_ar).map(r => r.how_ar),
    // عبارة الرجوع («رجّع مثل أول») يفهمها التعديل الموضعي وإن لم يفهمها مستخرج المتطلبات: لا تُعرض «غير مفهومة»
    picks: [], unclear: (more?.unclear || []).filter(u => !(parsed.intents.some(i => ['restore', 'revertRoom'].includes(i.op)) && /(?:^|\s)(?:رجع|ارجع|ترجع|رد|تراجع|نسخه)/.test(normalizeAr(u))) && !(parsed.intents.some(i => i.op === 'door' || i.op === 'window') && /(?:باب|ابواب|نافذه|نوافذ|شباك|دريشه)/.test(normalizeAr(u)))), unsupported: more?.unsupported || [], kept: true,
    unchanged: serialize(res.doc) === cur.doc, reused: false, geometryIdentical: JSON.stringify([res.doc.walls, res.doc.openings, res.doc.labels]) === JSON.stringify([doc0.walls, doc0.openings, doc0.labels]),
    changed, unrequested, restored,
    otherFails: ledger.filter(x => !(x.status ? x.status === 'done' : x.ok) && x.status !== 'pending-render').map(x => ({ text: x.text, why: x.why })).slice(0, 6),
    conflicts: [], questions: [],
  };
  const same = I0.rooms.size - changed.filter(c => c.kind !== 'added').length;
  reply.keptRooms = Math.max(0, same); reply.alreadyTxt = alreadyTxt; if (restored && facadeNote) reply.facadeNote = facadeNote;
  if (fpd) reply.fingerprint = compactDiff(fpd);
  if (restored?.proof) reply.restoreProof = restored.proof;
  reply.summary_ar = [
    doneShown.length ? `نُفّذ: ${doneShown.join('، ')}${reply.how.length ? ` (${reply.how.join('؛ ')})` : ''}.` : '',
    alreadyTxt.length ? `لم يحتج تغييرًا: ${alreadyTxt.join('؛ ')}.` : '',
    reply.failed.length ? `لم يُنفَّذ: ${reply.failed.map(f => `${f.text} — ${f.why}`).join('؛ ')}.` : '',
    reply.pending.length ? `محفوظ ولم يظهر في المجسّم بعد: ${reply.pending.map(p => p.text).join('، ')}.` : '',
    restored && facadeNote ? facadeNote + '.' : '',
    unrequested.length ? (restored ? `وعادت معه إلى حالها في ذلك التصميم: ${unrequested.map(c => c.text_ar).join('؛ ')}.` : `تغيّر أيضًا لأن التعديل يحتاجه: ${unrequested.map(c => c.text_ar).join('؛ ')}.`) : '',
    restored?.lost?.length || restored?.lostTurns?.length ? `لم يُعَد بعد الرجوع: ${[...restored.lost.map(l => `${l.text}${l.why ? ` (${l.why})` : ''}`), ...restored.lostTurns.map(t => `«${t}»`)].join('، ')} — قل «أعده» إن أردته ولو بإعادة توزيع.` : '',
    `بقية الغرف (${Math.max(0, same)}) كما هي مقيسًا${reply.geometryIdentical ? '، والجدران والفتحات نفسها حرفيًا' : ''}.`,
    fpd ? fpd.summary_ar : '',
    restored?.proof ? restored.proof.summary_ar : '',
  ].filter(Boolean).join(' ');
  // جزء نُفّذ وجزء يحتاج إذنًا (غرفة لم يذكرها العميل): يُسأل عنه صراحة ويُحفظ ليُنفَّذ بـ«نعم» على المخطط الجديد
  const asks = failedRes.filter(r => r.ask);
  if (asks.length) { s.pendingEdit = { text, intents: asks.map(r => r.intent).filter(Boolean) }; reply.questions = asks.map(r => r.ask); reply.summary_ar += ' ' + asks.map(r => r.ask).join(' '); }
  changes.push(...doneTxt);
  if (text) s.input.idea = [s.input.idea, text].filter(Boolean).join('\n');
  let review = null; try { review = compactReview(reviewDesign(res.doc, { text: s.input.idea || '', counts: { ...req.counts }, land: s.input.land || {} }, { external: false })); } catch { review = cur.review || null; }
  reply.version = pushDesign(s, { doc: serialize(res.doc), pat: cur.pat, summary: cur.summary, notes: [...(cur.notes || []).filter(n => !/^تعديل موضعي/.test(n)), `تعديل موضعي: ${doneTxt.join('، ') || '—'}`], floors: cur.floors, feedback: { picks, text, changes: [...changes], reply, edit: { local: true, intents } }, engine: cur.engine, ledger, review, mirror: cur.mirror ?? null });
  return { session: s, changes, reply };
  }
}

export function approve(session) { const s = clone(session); s.approved = s.current; return s; }

export function saveSession(store, s) { try { store.setItem(SESSION_KEY, JSON.stringify(s)); return true; } catch { return false; } }
export function loadSession(store) {
  try { const s = JSON.parse(store.getItem(SESSION_KEY) || 'null'); if (!s || s.v !== 1 || !Array.isArray(s.designs) || !s.designs.length) return null; parseDoc(s.designs[s.current ?? 0].doc); return s; }
  catch { return null; }
}

/** سجل التنفيذ للتصميم المعروض: يُقاس من المستند نفسه (ولو عُدّل في المرسم). */
export function ledgerFor(session, doc = currentDoc(session)) {
  const req = session.input.requirements || {}, entry = session.input.land?.entries?.[0] || doc.plot?.entry || 's';
  let led; try { led = verifyRequest(doc, req, { entry }); } catch { return session.designs[session.current]?.ledger || []; }
  return led.map(x => facadeStatus(x, doc, req));
}
/** بند الواجهة مقيسًا من المستند: المادة في doc.finish.facade ولها خامة في المجسّم ← «نُفّذ»؛ وإلا «بانتظار العرض» بسببه. */
function facadeStatus(x, doc, req) {
  if (x.id !== 'F-facade') return x;
  const fac = req.tweaks?.facade || {}, f = doc.finish?.facade || {};
  const matOk = !fac.material || (f.material === fac.material && FACADE_RENDER[fac.material] && f.base === FACADE_RENDER[fac.material]);
  const styleOk = !fac.style; // الطراز يُحفظ ولا يُرسم بعد
  if (matOk && styleOk && (fac.material || fac.style)) return { ...x, ok: true, status: 'done', why: `مادة الواجهة في المستند (${f.base}) ويعرضها المجسّم.` };
  if (f.material === fac.material || f.style === fac.style) return { ...x, why: `حُفظ طلب الواجهة في المستند${fac.material && !FACADE_RENDER[fac.material] ? `؛ لا خامة «${fac.materialAr}» في المجسّم بعد` : ''}${fac.style ? `؛ الطراز «${fac.styleAr}» لا يُرسم بعد` : ''}.` };
  return x;
}

export default { SESSION_KEY, FEEDBACK, createSession, redesign, approve, saveSession, loadSession, currentDoc, ledgerFor, mergeRules };

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
