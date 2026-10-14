// Browser client for the drawing assistant. Order of work:
//   1. the local Arabic interpreter (no network) answers what it can resolve without ambiguity;
//   2. otherwise (or with forceRemote) a compact digest + review issues go to POST /api/assistant/drawing;
//   3. every command that comes back is validated strictly and dry-run against the document; failures are
//      dropped and reported in Arabic. NOTHING is ever applied here: proposals carry a preview, the UI applies.
import { digestDoc, describeDigestAr, analyzeDoc } from './digest.mjs';
import { reviewDoc } from './review.mjs';
import { interpretAr } from './assistant-local.mjs';
import { applyCommand, DrawError } from './doc.mjs';
import { validateDrawingAnswer, LIMITS } from './assistant-schema.mjs';

export const DRAWING_ENDPOINT = 'https://almizan-handasi.aljeryabod.workers.dev/api/assistant/drawing';

const TYPE_AR = { 'set-meta': 'تغيير المواد والواجهة', 'add-opening': 'إضافة فتحة', 'add-fixture': 'إضافة قطعة', update: 'تعديل عنصر', 'flip-opening': 'عكس اتجاه باب', 'add-label': 'تسمية غرفة', 'add-level': 'إضافة دور', 'close-gap': 'سدّ ثغرة', delete: 'حذف', translate: 'تحريك' };
const r2 = v => Math.round(v * 100) / 100;

function areasOf(doc) {
  const out = {};
  for (const lv of analyzeDoc(doc).levels) for (const r of lv.rooms) out[r.id] = { name: r.name, area: r2(r.area) };
  return out;
}

/** What would these commands do? Dry-runs them; throws DrawError if one fails. */
export function previewCommands(doc, commands) {
  let after = doc;
  for (const c of commands) after = applyCommand(after, c).doc;
  const before = areasOf(doc), next = areasOf(after);
  const beforeAreas = {}, afterAreas = {}, notes = [];
  for (const id of new Set([...Object.keys(before), ...Object.keys(next)])) {
    const b = before[id]?.area, a = next[id]?.area;
    if (b !== a) {
      if (b !== undefined) beforeAreas[id] = b;
      if (a !== undefined) afterAreas[id] = a;
      const name = next[id]?.name || before[id]?.name;
      if (b !== undefined && a !== undefined) notes.push(`«${name}» ${b} ← ${a} م²`);
    }
  }
  const counts = new Map();
  for (const c of commands) counts.set(c.type, (counts.get(c.type) || 0) + 1);
  const what = [...counts].map(([t, n]) => `${TYPE_AR[t] || t}${n > 1 ? ` ×${n}` : ''}`).join('، ');
  const summary = `${commands.length} ${commands.length === 1 ? 'أمر' : 'أوامر'}: ${what}.${notes.length ? ' تتغير المساحات: ' + notes.slice(0, 6).join('، ') + '.' : ''}`;
  return { beforeAreas, afterAreas, summary, doc: after };
}

function proposalOf(doc, label, commands) {
  const { doc: _after, ...preview } = previewCommands(doc, commands);
  return { label, commands, preview };
}

/** Dry-run model-proposed commands one by one on a running copy; returns the survivors and Arabic reasons for the rest. */
function screenCommands(doc, commands) {
  const kept = [], dropped = [];
  let running = doc;
  commands.forEach((c, i) => {
    try { running = applyCommand(running, c).doc; kept.push(c); }
    catch (e) { dropped.push(`الأمر ${i + 1} (${TYPE_AR[c?.type] || c?.type}) لم يُقبل: ${e instanceof DrawError ? e.message : 'غير صالح'}.`); }
  });
  return { kept, dropped };
}

function fromLocal(doc, local, extraLimitations = [], extra = {}) {
  const proposals = [];
  const limitations = [...extraLimitations];
  if (local.commands?.length) {
    try { proposals.push(proposalOf(doc, (local.answer || 'اقتراح').split(/[.،]/)[0].slice(0, 90), local.commands)); }
    catch (e) { limitations.push('تعذر تجهيز المعاينة: ' + (e instanceof DrawError ? e.message : 'خطأ غير متوقع.')); }
  }
  return {
    source: 'local', intent: local.intent, answer: local.answer || '', suggestions: (local.ambiguities || []).flatMap(a => a.options.map(o => `${a.question} ${o.label}`)).slice(0, LIMITS.suggestions),
    proposals, limitations, needsConfirm: !!local.needsConfirm, ambiguities: local.ambiguities || [], referencedIds: local.referencedIds || [], ...(local.issues ? { issues: local.issues } : {}), ...extra,
  };
}

function offline(doc, local, why) {
  const base = local && local.intent !== 'unknown' ? local : { intent: 'query', answer: describeDigestAr(digestDoc(doc, { compact: true })), commands: [], needsConfirm: false, ambiguities: [], referencedIds: [] };
  return fromLocal(doc, base, [why, 'هذا جواب محلي من فهم المخطط دون الذكاء الاصطناعي.'], { offline: true });
}

/**
 * askDrawingAssistant(doc, question, { accessCode, endpoint, fetcher, signal, selection, forceRemote })
 *  -> { source:'local'|'claude', answer, suggestions[], proposals:[{ label, commands[], preview:{ beforeAreas, afterAreas, summary } }], limitations[],
 *       intent, needsConfirm, ambiguities[], referencedIds[], model?, offline? }
 */
export async function askDrawingAssistant(doc, question, { accessCode = '', endpoint = DRAWING_ENDPOINT, fetcher = globalThis.fetch, signal, selection = null, forceRemote = false } = {}) {
  const text = String(question ?? '').trim();
  if (!text) return { source: 'local', intent: 'unknown', answer: 'اكتب سؤالك عن المخطط أولًا.', suggestions: [], proposals: [], limitations: [], needsConfirm: false, ambiguities: [], referencedIds: [] };
  if (text.length > LIMITS.question) return { source: 'local', intent: 'unknown', answer: `السؤال أطول من ${LIMITS.question} حرفًا؛ اختصره.`, suggestions: [], proposals: [], limitations: [], needsConfirm: false, ambiguities: [], referencedIds: [] };
  let local = null;
  try { local = interpretAr(text, doc, { selection }); } catch { local = null; }
  if (!forceRemote && local && local.intent !== 'unknown' && !local.ambiguities.length) return fromLocal(doc, local);

  if (typeof accessCode !== 'string' || !accessCode.trim()) return offline(doc, local, 'لم يُدخل رمز دخول الذكاء، فلم يُرسل شيء إلى الخدمة.');
  if (typeof fetcher !== 'function') return offline(doc, local, 'الاتصال بخدمة الذكاء غير متاح هنا.');
  const digest = digestDoc(doc, { compact: true });
  const issues = reviewDoc(doc, { digest }).slice(0, 20).map(i => ({ code: i.code, severity: i.severity, message: i.message.slice(0, 380), targetIds: i.targetIds.slice(0, 8) }));
  let body = JSON.stringify({ question: text, digest, reviewIssues: issues });
  if (new TextEncoder().encode(JSON.stringify(digest)).length > LIMITS.digestBytes) return offline(doc, local, 'ملخص المخطط أكبر من أن يُرسل إلى خدمة الذكاء.');

  let response;
  try { response = await fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mizan-Access-Code': accessCode.trim() }, body, signal, credentials: 'omit', cache: 'no-store' }); }
  catch (error) {
    if (error?.name === 'AbortError') throw error;
    return offline(doc, local, error?.name === 'TimeoutError' ? 'لم يصل رد من خدمة الذكاء في الوقت المحدد.' : 'تعذّر الاتصال بخدمة الذكاء الآن.');
  }
  let data = null;
  try { if (response.headers.get('content-type')?.toLowerCase().includes('application/json')) data = await response.json(); } catch { data = null; }
  if (!response.ok) return offline(doc, local, typeof data?.error === 'string' && data.error.trim() ? data.error.slice(0, 300) : 'خدمة الذكاء لم تعطِ ردًا صالحًا.');
  let answer;
  try {
    if (data?.source !== 'claude') throw new Error('source');
    answer = validateDrawingAnswer({ answer: data.answer, suggestions: data.suggestions, commands: data.commands });
  } catch { return offline(doc, local, 'رد خدمة الذكاء لم يطابق الصيغة المتوقعة فتجاهلته.'); }

  const { kept, dropped } = screenCommands(doc, answer.commands);
  const proposals = [];
  const limitations = [...(Array.isArray(data.limitations) ? data.limitations.filter(s => typeof s === 'string').slice(0, 12) : []), ...dropped];
  if (kept.length) {
    try { proposals.push(proposalOf(doc, kept.length === 1 ? 'تطبيق اقتراح المساعد' : `تطبيق ${kept.length} أوامر مقترحة من المساعد`, kept)); }
    catch (e) { limitations.push('تعذر تجهيز المعاينة: ' + (e instanceof DrawError ? e.message : 'خطأ غير متوقع.')); }
  }
  return {
    source: 'claude', model: typeof data.model === 'string' ? data.model : undefined, intent: proposals.length ? 'edit' : 'query',
    answer: answer.answer, suggestions: answer.suggestions, proposals, limitations, needsConfirm: proposals.length > 0, ambiguities: [], referencedIds: [],
  };
}

export default { askDrawingAssistant, previewCommands, DRAWING_ENDPOINT };
