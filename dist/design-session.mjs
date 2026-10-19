// جلسة التصميم: التصميم الأولي يُعرض على العميل، ويطلب بديلًا بعد أن تسأله شرعاء عمّا لم يعجبه،
// ثم يعتمده فينتقل إلى العرض ثلاثي الأبعاد. وحدة نقية بلا DOM؛ التخزين يُمرَّر (localStorage أو بديل في الاختبار).
import { generateInitialDesign } from './home-flow.mjs';
import { extractRequirements } from './requirements.mjs';
import { verifyRequest, mergeRules } from './rules.mjs';
import { withAi } from './requirements.mjs';
export { mergeRules };
import { parseDoc, serialize } from './draw/doc.mjs';

export const SESSION_KEY = 'mizan.design.session.v1';
const MAX_DESIGNS = 8;

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

/** يبدأ جلسة من نتيجة التوليد الأولى. */
export function createSession({ land, counts, requirements, discovery, idea = '', result }) {
  const req = clone(requirements || extractRequirements(idea || '', { counts: counts || {}, discovery }));
  req.counts = { ...(req.counts || {}), ...(counts || {}) }; req.prefs ||= {}; req.extras ||= {}; req.areas ||= {}; req.tweaks ||= {};
  return {
    v: 1, input: { land, discovery, idea, requirements: req },
    designs: [entry(result, null)], current: 0, approved: null, createdAt: Date.now(),
    dna: result.dna ? clone(result.dna) : null,
    alternatives: (result.alternatives || []).slice(0, 4).map(a => ({ index: a.index, strategy: String(a.strategy || ''), doc: serialize(a.doc) })),
  };
}
function entry(result, feedback) {
  return { doc: serialize(result.doc), pat: result.pat || null, summary: result.summary || '', notes: result.notes || [], floors: result.floors || 1, feedback, engine: result.engine || result.strategy || '', ledger: result.ledger || null, mirror: result.mirror ?? null };
}
export const currentDoc = s => parseDoc(s.designs[s.current].doc);

/**
 * يطبّق ملاحظات العميل (خيارات + نص حر) على الطلب.
 * - طلب محدد (نص مفهوم أو خيار تعديل): يُطبَّق على التصميم المعروض نفسه متى أمكن (نفس التوزيع) ولا يُفرض توزيع جديد.
 * - «أريد توزيعًا مختلفًا» أو بلا ملاحظات: توزيع مختلف عمّا عُرض (تُستبعد أنماطه).
 * - نص لم يُفهم منه شيء ولا خيار معه: لا يُولَّد تصميم؛ يُرمى SHARA_UNCLEAR ليعيد العميل الصياغة.
 * يعيد { session, changes, reply } — reply: ما نُفّذ وما لم يُنفَّذ (بسببه) وما لم يُفهم، مقيسًا من المخطط الجديد.
 */
export async function redesign(session, { picks = [], text = '', ai = null } = {}, { generate = generateInitialDesign } = {}) {
  const s = clone(session), req = s.input.requirements, changes = [];
  req.prefs ||= {}; req.tweaks ||= {}; req.counts ||= {}; req.extras ||= {}; req.areas ||= {};
  let more = null;
  if (text && text.trim().length >= 3) more = withAi(extractRequirements(text, { counts: {} }), ai);
  if (more && !more.understood.length && !more.unsupported.length && !picks.length) {
    const err = Error('لم أفهم ملاحظتك بدقة فلم أغيّر شيئًا' + (more.unclear.length ? ': ' + more.unclear.map(x => '«' + x + '»').join('، ') : '') + '. اكتبها بصيغة مباشرة مثل: «المطبخ في الخلف»، «الماستر بعيدة عن المجلس»، «المجلس أكبر»، «غرفة النوم 4×5»، أو اختر من الخيارات.');
    err.code = 'SHARA_UNCLEAR'; err.unclear = more.unclear; throw err;
  }
  for (const id of picks) { const f = FEEDBACK.find(x => x.id === id); if (!f) throw Error('خيار غير معروف.'); f.apply(req, req.tweaks); changes.push(f.label); }
  if (more) {
    Object.assign(req.prefs, more.prefs); Object.assign(req.extras, more.extras); Object.assign(req.areas, more.areas);
    for (const [k, v] of Object.entries(more.counts)) if (Number.isInteger(v) && (v > 0 || (v === 0 && ['majlis', 'dining'].includes(k)))) req.counts[k] = v;
    req.rules = mergeRules(req.rules || [], more.rules || []);
    for (const [k, v] of Object.entries(more.tweaks || {})) req.tweaks[k] = (req.tweaks[k] || 1) * v;
    if (more.unsupported?.length) req.unsupported = [...new Set([...(req.unsupported || []), ...more.unsupported])];
    req.understood = [...new Set([...(req.understood || []), ...more.understood])];
    changes.push(...more.understood);
    s.input.idea = [s.input.idea, text].filter(Boolean).join('\n');
  }
  const different = picks.includes('layout') || (!picks.length && !more);
  if (different) changes.push('توزيع مختلف للغرف');
  const cur = s.designs[s.current];
  const exclude = different ? s.designs.map(d => d.pat).filter(Boolean) : [];
  const prefer = different ? null : { pat: cur.pat, mirror: cur.mirror ?? null };
  const out = await generate({ land: s.input.land, rooms: null, discovery: s.input.discovery, idea: s.input.idea, counts: req.counts, requirements: req, exclude, prefer });
  // رد شرعاء: البنود التي طلبها الآن، مقيسة من المخطط الجديد
  const entryDir = s.input.land?.entries?.[0] || 's';
  let ledger = []; try { ledger = verifyRequest(out.doc, req, { entry: entryDir }); } catch { ledger = out.ledger || []; }
  const asked = new Set([...(more?.understood || [])]);
  const mine = ledger.filter(x => asked.has(x.text) || (more?.rules || []).some(r => r.text === x.text));
  const unchanged = !different && serialize(out.doc) === cur.doc;
  const reply = {
    done: mine.filter(x => x.ok).map(x => x.text), failed: mine.filter(x => !x.ok).map(x => ({ text: x.text, why: x.why })),
    picks: picks.map(id => FEEDBACK.find(f => f.id === id)?.label).filter(Boolean),
    unclear: more?.unclear || [], unsupported: more?.unsupported || [], kept: !different && !!out.same, unchanged,
    otherFails: ledger.filter(x => !x.ok && !mine.includes(x)).map(x => ({ text: x.text, why: x.why })),
  };
  s.designs.push(entry(out, { picks, text, changes, reply }));
  if (s.designs.length > MAX_DESIGNS) s.designs.splice(0, s.designs.length - MAX_DESIGNS);
  s.current = s.designs.length - 1;
  return { session: s, changes, reply };
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
  try { return verifyRequest(doc, req, { entry }); } catch { return session.designs[session.current]?.ledger || []; }
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
