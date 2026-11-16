// الجانب العميل لعقل شرعاء (POST /api/shara): بناء السياق المضغوط، الاستدعاء بإيقاف ومهلة، وتفسير ردّ الخادم.
// السياق قائمة بيضاء صريحة: لا إحداثيات (geo/lat/lng/north) ولا الجلسة كاملة ولا هوية؛ اسم المدينة أو الحي نصًا إن وُجد.
// ما يعيده الخادم اقتراحات فقط: التنفيذ على التصميم يمرّ دائمًا بالمحرك المحلي الحتمي في المتصفح بعد تأكيد العميل.
import { currentDoc, ledgerFor, summarizeDoc, scoreDesign } from './design-session.mjs';
import { fixProposals } from './design-fixes.mjs';
import { checkMunicipal, summaryText } from './municipal-rules.mjs';
import { STAGES } from './journey-nav.mjs';

export const SHARA_API = '/api/shara';
export const CLIENT_TIMEOUT_MS = 60_000;
export const TAG_LABEL = Object.freeze({ design: 'من تصميمك', rules: 'من الاشتراطات', web: 'من الويب', general: 'عام' });

/** يبني السياق المضغوط من الجلسة والصفحة. كل جزء يفشل منفردًا بلا إسقاط الباقي. */
export function buildSharaContext(session, page = 'design') {
  const ctx = { stage: page };
  if (!session) return ctx;
  const L = session.input?.land || {};
  ctx.land = { width: L.width, length: L.length, floors: L.floors, streets: L.streets || [], entries: L.entries || [], cityName: typeof L.geo?.cityName === 'string' ? L.geo.cityName : '' };
  let doc = null;
  try { doc = currentDoc(session); const sum = summarizeDoc(doc); ctx.design = { specs: sum.specs, rooms: sum.rooms.map(r => ({ name: r.name, type: r.type, level: r.level, area: r.area, l: r.l, w: r.w })), summary: session.designs[session.current]?.summary || '' }; } catch { /* بلا ملخص */ }
  try { ctx.ledger = ledgerFor(session, doc || undefined).map(x => ({ text: x.text, ok: !!x.ok, why: x.why || '' })); } catch { /* بلا سجل */ }
  try { ctx.notes = fixProposals(session).map(p => ({ text: p.text, why: p.why || '' })); } catch { /* بلا ملاحظات */ }
  try { const d = session.designs[session.current], sc = d.score || scoreDesign(session, d); if (sc) ctx.score = { total: sc.total, grade: sc.grade, parts: sc.parts.map(p => ({ id: p.id, label: p.label, weight: p.weight, score: p.score, good: p.good, bad: p.bad })), why: sc.why }; } catch { /* بلا درجة */ }
  try { if (doc) { const m = checkMunicipal(doc, L); ctx.municipal = { summary: summaryText(m.summary), items: m.items.filter(i => i.verdict !== 'na').map(i => ({ id: i.id, title: i.title, verdict: i.verdict, text: i.text })) }; } } catch { /* بلا مطابقة */ }
  return ctx;
}

/** التاريخ المرسل: آخر 12 دورًا نصيًا فقط (بلا أزرار ولا مصادر). */
export function historyOf(chat, max = 12) {
  return chat.filter(m => (m.who === 'me' || m.who === 'she') && typeof m.text === 'string' && m.text.trim()).slice(-max).map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', text: m.text.slice(0, 2000) }));
}

/** رسالة صادقة بالعربية لسبب العودة إلى المحرك المحلي. */
export function fallbackNote(reason, serverMessage = '') {
  const base = {
    no_key: 'المساعد الذكي غير مفعّل بعد على هذا الموقع',
    disabled: 'المساعد الذكي موقوف الآن',
    day_ip: 'بلغتَ حد أسئلة المساعد الذكي لهذا اليوم',
    day_cap: 'بلغ المساعد الذكي حده اليومي',
    minute: 'أسئلتك متقاربة جدًا',
    timeout: 'تأخر المساعد الذكي أكثر من المسموح',
    provider_limit: 'خدمة الذكاء بلغت حدها الآن',
    provider_auth: 'تعذّر الاتصال بخدمة الذكاء',
    provider_error: 'خدمة الذكاء غير متاحة الآن',
    incomplete: 'لم يكتمل رد المساعد الذكي',
    refusal: 'تعذّر على المساعد الذكي معالجة هذا الطلب',
    network: 'تعذّر الوصول إلى خدمة الذكاء (الشبكة)',
    aborted: 'أوقفتُ الرد',
  }[reason] || serverMessage || 'تعذّر الوصول إلى المساعد الذكي';
  return reason === 'aborted' ? 'أوقفتُ الرد كما طلبت.' : `${base}، فأجيبك بمحركي المحلي: أجيب عن تصميمك واشتراطات الوزارة المصدّرة فقط، ولا أبحث في الويب.`;
}

// أسباب لا يُعاد فيها المحاولة بقية الجلسة (ثابتة): لا نُثقل الخادم بطلب يعرف جوابه مسبقًا
const STICKY = new Set(['no_key', 'disabled']);
let offUntil = 0;
export const aiOff = (now = Date.now()) => now < offUntil;
export const resetAiOff = () => { offUntil = 0; };

/**
 * يسأل الخادم. يعيد { ok: true, data } عند source:'claude'، وإلا { ok: false, reason, note } لاستعمال المحرك المحلي.
 * signal: لإيقاف الرد من العميل؛ fetchFn: للاختبار.
 */
export async function askShara({ text, chat = [], session = null, page = 'design', signal, fetchFn = globalThis.fetch, now = Date.now } = {}) {
  const ctl = new AbortController(), onAbort = () => ctl.abort(); signal?.addEventListener?.('abort', onAbort);
  const timer = setTimeout(() => ctl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const history = historyOf(chat), last = history[history.length - 1];
    if (last?.role === 'user' && last.text === text) history.pop(); // الرسالة الحالية ترسل مرة واحدة
    const res = await fetchFn(SHARA_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ message: text, history, context: buildSharaContext(session, page) }) });
    let data = null; try { data = await res.json(); } catch { data = null; }
    if (data?.source === 'claude' && Array.isArray(data.segments) && data.segments.length) return { ok: true, data };
    const reason = data?.reason || (res.status === 429 ? 'minute' : res.status === 413 || res.status === 400 ? 'invalid' : 'provider_error');
    if (STICKY.has(reason)) offUntil = now() + 6 * 3600_000; else if (reason === 'day_ip' || reason === 'day_cap') offUntil = now() + 3600_000;
    return { ok: false, reason, note: reason === 'invalid' ? (data?.error || 'تعذّر إرسال سؤالك إلى المساعد الذكي') + ' فأجيبك بمحركي المحلي.' : fallbackNote(reason, data?.message) };
  } catch (e) {
    if (signal?.aborted) return { ok: false, reason: 'aborted', note: fallbackNote('aborted'), aborted: true };
    const reason = e?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, reason, note: fallbackNote(reason) };
  } finally { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); }
}

/** رابط صفحة المرحلة من معرّفها (للأمر navigate). null إن لم يُعرف. */
export const stageHref = id => STAGES.find(s => s.id === id)?.href || null;
/** هل الرابط https صالح للعرض؟ (يُتحقق ثانية في العميل رغم تحقق الخادم). */
export const safeHref = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };

/** يحوّل ردّ الخادم إلى نموذج رسالة اللوحة: فقرات موسومة، مصادر، وأوامر مقترحة (navigate رابط؛ غيرها تحتاج تأكيدًا). */
export function toMessage(data) {
  const actions = [];
  for (const a of data.actions || []) {
    if (a.type === 'navigate') { const href = stageHref(a.target); if (href) actions.push({ label: a.label, href }); }
    else if (a.say) actions.push({ label: a.label, say: a.say, confirm: true, type: a.type });
  }
  return {
    who: 'she', text: data.text || data.segments.map(s => s.text).join('\n\n'), ai: true,
    segments: data.segments.map(s => ({ tag: TAG_LABEL[s.tag] ? s.tag : 'general', text: String(s.text) })),
    sources: (data.sources || []).map(s => ({ url: safeHref(s.url), title: String(s.title || s.url).slice(0, 120), cited: s.cited !== false })).filter(s => s.url),
    actions,
  };
}
