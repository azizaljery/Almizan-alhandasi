// تقرير أثر التعديل: يقيس المستند قبل وبعد بمدقّق مستقل عن المولّد (لا يقرأ نية المحرك بل الرسم نفسه) ثم يُخرج
// جدولًا: المطلب، قبل، بعد، الحالة، الدليل — ويفصل ما تغيّر في الغرف (موضع/مقاس/أبواب/نوافذ)، وما تحسّن، وما تراجع،
// وأثر ذلك في المساحات والكميات والتكلفة. ما لا مصدر له يُكتب «غير متحقق»؛ لا أرقام مخترعة.
// قاعدة القبول: أي مطلب إلزامي كان متحققًا ثم صار غير متحقق ← «مرفوض: تراجع إلزامي» مهما تحسّنت المؤشرات الأخرى.
// نقي: بلا DOM ولا شبكة.
import { analyzeDoc } from './draw/digest.mjs';
import { checkDoc, quality } from './villa-layout.mjs';
import { checkMunicipal } from './municipal-rules.mjs';
import { verifyRequest } from './rules.mjs';
import { scorePlan, SCORE_LABELS } from './plan-score.mjs';
import { reviewDoc } from './draw/review.mjs';
import { computeDocQuantities } from './draw/quantities-doc.mjs';
import { solarSite } from './geo-land.mjs';
import { verifyLocks, describeLockResult } from './design-lock.mjs';

export const IMPACT_VERSION = 'design-impact/1';
export const TIER = Object.freeze({ MANDATORY: 'MANDATORY', IMPORTANT: 'IMPORTANT', INDICATOR: 'INDICATOR' });
export const TIER_AR = Object.freeze({ MANDATORY: 'إلزامي', IMPORTANT: 'تفضيل مهم', INDICATOR: 'مؤشر' });
export const STATUS_AR = Object.freeze({ improved: 'تحسّن', same: 'بلا تغيير', regressed: 'تراجع', new_ok: 'جديد (متحقق)', new_fail: 'جديد (غير متحقق)', fixed: 'أُصلح', gone: 'زال', unverified: 'غير متحقق', still_fail: 'غير متحقق قبل وبعد' });
export const REJECT_LABEL = 'مرفوض: تراجع إلزامي';
const r2 = v => Math.round(v * 100) / 100;
const num = v => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(v);

// ------------------------------------------------------------------------------------------ المدقّق المستقل
/** يقيس مستندًا: قائمة فحوص { id, group, tier, label, ok (true|false|null=غير متحقق), value, evidence }. لا يرمي: ما تعذّر قياسه «غير متحقق». */
export function auditDoc(doc, { requirements = {}, land = {}, entry = null } = {}) {
  const rows = [], put = r => rows.push({ ok: null, value: null, evidence: '', ...r });
  const e = entry || land?.entries?.[0] || doc.plot?.entry || 's';
  const model = analyzeDoc(doc);
  // 1. سلامة الهندسة: إغلاق الغرف وتسمية واحدة لكل فراغ
  try { const c = checkDoc(doc); put({ id: 'geometry', group: 'هندسة', tier: TIER.MANDATORY, label: 'سلامة الرسم: كل غرفة مغلقة ولها تسمية واحدة', ok: c.ok, value: c.ok ? 1 : 0, evidence: c.ok ? `${c.spaces} فراغًا مغلقًا بلا مشكلة.` : c.problems.slice(0, 3).join('؛ ') }); }
  catch (err) { put({ id: 'geometry', group: 'هندسة', tier: TIER.MANDATORY, label: 'سلامة الرسم: كل غرفة مغلقة ولها تسمية واحدة', ok: null, evidence: 'تعذّر القياس: ' + err.message }); }
  // 2. الوصول إلى كل غرفة مسمّاة
  try {
    const un = [];
    for (const lv of model.levels) for (const r of lv.rooms) if (!r.unlabelled && !lv.reach.has(r.id) && !['courtyard', 'garden'].includes(r.type)) un.push(`${r.name} (${lv.level.name})`);
    put({ id: 'access', group: 'حركة', tier: TIER.MANDATORY, label: 'الوصول إلى كل غرفة من المدخل أو السلم', ok: un.length === 0, value: un.length, evidence: un.length ? 'غرف لا يصل إليها باب: ' + un.slice(0, 4).join('، ') : 'كل الغرف المسمّاة متصلة بأبواب من المدخل/السلم.' });
  } catch (err) { put({ id: 'access', group: 'حركة', tier: TIER.MANDATORY, label: 'الوصول إلى كل غرفة من المدخل أو السلم', ok: null, evidence: 'تعذّر القياس: ' + err.message }); }
  // 3. حدود النظام البلدي
  try {
    const m = checkMunicipal(doc, land || {});
    for (const it of m.items) put({ id: 'mun:' + it.id, group: 'اشتراطات', tier: TIER.MANDATORY, label: it.title, ok: it.verdict === 'fail' ? false : it.verdict === 'ok' ? true : null, value: it.actual ?? null, evidence: it.verdict === 'review' ? 'يحتاج مراجعة الجهة: ' + (it.reason || it.text || '') : (it.text || `المطلوب ${it.required ?? '—'}، الفعلي ${it.actual ?? '—'}`) });
  } catch (err) { put({ id: 'mun', group: 'اشتراطات', tier: TIER.MANDATORY, label: 'الاشتراطات البلدية المقاسة', ok: null, evidence: 'تعذّر القياس: ' + err.message }); }
  // 4. سجل طلب العميل (كل بند)
  try {
    const ledger = verifyRequest(doc, requirements || {}, { entry: e });
    const soft = new Set((requirements?.rules || []).filter(r => r.custom).map(r => r.id));
    for (const x of ledger) put({ id: 'req:' + (x.id || x.text), group: 'طلب العميل', tier: soft.has(x.id) ? TIER.IMPORTANT : TIER.MANDATORY, label: x.text, ok: !!x.ok, value: x.ok ? 1 : 0, evidence: x.ok ? 'متحقق من الرسم' + (x.where?.length ? ': ' + [...new Set(x.where.map(w => w.name))].slice(0, 4).join('، ') : '') : (x.why || 'غير متحقق') });
  } catch (err) { put({ id: 'req', group: 'طلب العميل', tier: TIER.MANDATORY, label: 'سجل تنفيذ طلب العميل', ok: null, evidence: 'تعذّر القياس: ' + err.message }); }
  // 5. ملاحظات جودة المخطط (عدّادات: زيادتها تراجع)
  try {
    const bedrooms = doc.labels.filter(l => l.type === 'bedroom' || l.type === 'master').length, q = quality(doc, { bedrooms });
    put({ id: 'quality:reject', group: 'جودة', tier: TIER.MANDATORY, label: 'المخطط لا يتجاوز حدود الرفض (نسب الغرف والمجلس)', ok: !q.reject, value: q.reject ? 1 : 0, evidence: q.reject ? 'تجاوز حد الرفض في نسب الغرف.' : 'ضمن حدود الرفض.' });
    for (const [k, n] of Object.entries(q.issues || {})) put({ id: 'quality:' + k, group: 'جودة', tier: TIER.IMPORTANT, label: 'ملاحظة جودة: ' + k, ok: n === 0, value: n, evidence: n ? `${n} ملاحظة` : 'لا ملاحظات' });
  } catch (err) { put({ id: 'quality', group: 'جودة', tier: TIER.IMPORTANT, label: 'جودة المخطط', ok: null, evidence: 'تعذّر القياس: ' + err.message }); }
  // 6. فتح الأبواب والأثاث (مراجعة الرسم)
  try {
    const iss = reviewDoc(doc, { only: ['SWING_BLOCKED'] }), n = iss.length;
    put({ id: 'review:swing', group: 'قابلية الاستخدام', tier: TIER.IMPORTANT, label: 'فتح الأبواب بلا اعتراض أثاث أو جدار', ok: n === 0, value: n, evidence: n ? `${n} باب يعترض فتحه شيء` : 'كل الأبواب تفتح بحرية.' });
  } catch { /* غير متحقق: لا صف */ }
  return rows;
}

/** درجات مؤشرات الخطة (مقارنة؛ ليست إلزامية). */
export function indicatorsOf(doc, { requirements = {}, land = {}, entry = null } = {}) {
  try {
    const e = entry || land?.entries?.[0] || doc.plot?.entry || 's';
    let ledger = []; try { ledger = verifyRequest(doc, requirements || {}, { entry: e }); } catch { /* بلا سجل */ }
    const site = solarSite(land?.geo || null), sc = scorePlan(doc, { ledger, site: { lat: site.lat, north: site.north } });
    return { total: sc.total, parts: sc.parts.map(p => ({ id: p.id, label: p.label || SCORE_LABELS[p.id] || p.id, score: p.score, weight: p.weight })) };
  } catch { return null; }
}

// ------------------------------------------------------------------------------------------ الغرف
function roomList(doc) {
  const m = analyzeDoc(doc), out = [];
  for (const lv of m.levels) for (const r of lv.rooms) {
    if (r.unlabelled || !r.net) continue;
    const xs = r.net.map(p => p.x), ys = r.net.map(p => p.y);
    const doors = lv.openings.filter(o => o.door && o.sides.some(s => s.room.id === r.id)), wins = lv.openings.filter(o => o.window && o.sides.some(s => s.room.id === r.id));
    out.push({ id: r.id, level: lv.levelIndex, levelName: lv.level.name, name: r.name, type: r.type, area: r2(r.area), x0: r2(Math.min(...xs)), y0: r2(Math.min(...ys)), x1: r2(Math.max(...xs)), y1: r2(Math.max(...ys)), doors: doors.length, windows: wins.length, doorSig: doors.map(o => `${o.kind}@${r2(o.p.x)},${r2(o.p.y)}:${r2(o.w)}`).sort().join('|'), winSig: wins.map(o => `${o.kind}@${r2(o.p.x)},${r2(o.p.y)}:${r2(o.w)}`).sort().join('|') });
  }
  return out;
}
const ov = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? w * h : 0; };
/** مطابقة غرف المستندين: بالاسم والدور أولًا ثم بالتراكب لنفس النوع. */
function matchRooms(A, B) {
  const pairs = [], usedB = new Set();
  const score = (a, b) => (a.level === b.level ? 1 : 0) * 1000 + (a.type === b.type ? 100 : 0) + (a.name === b.name ? 50 : 0) + ov(a, b) / Math.max(1, Math.min(a.area, b.area));
  const cand = []; for (const a of A) for (const b of B) if (a.level === b.level && a.type === b.type && (a.name === b.name || ov(a, b) > .3 * Math.min(a.area, b.area))) cand.push({ a, b, s: score(a, b) });
  cand.sort((p, q) => q.s - p.s);
  const usedA = new Set();
  for (const c of cand) { if (usedA.has(c.a.id + c.a.level) || usedB.has(c.b.id + c.b.level)) continue; usedA.add(c.a.id + c.a.level); usedB.add(c.b.id + c.b.level); pairs.push([c.a, c.b]); }
  for (const a of A) if (!usedA.has(a.id + a.level)) pairs.push([a, null]);
  for (const b of B) if (!usedB.has(b.id + b.level)) pairs.push([null, b]);
  return pairs;
}
const rectTxt = r => `${num(r.x1 - r.x0)}×${num(r.y1 - r.y0)} م عند (${num(r.x0)}، ${num(r.y0)})`;
/** جدول ما تغيّر في الغرف: [{name, level, change:[…], before, after, locked}]. */
export function roomChanges(docBefore, docAfter, lockedKeys = new Set()) {
  const A = roomList(docBefore), B = roomList(docAfter), out = [];
  for (const [a, b] of matchRooms(A, B)) {
    if (a && !b) { out.push({ name: a.name, type: a.type, level: a.levelName, kinds: ['removed'], text: 'حُذفت', before: rectTxt(a) + ` — ${num(a.area)} م²`, after: null, locked: lockedKeys.has(`${a.level}:${a.id}`) }); continue; }
    if (!a && b) { out.push({ name: b.name, type: b.type, level: b.levelName, kinds: ['added'], text: 'أُضيفت', before: null, after: rectTxt(b) + ` — ${num(b.area)} م²`, locked: false }); continue; }
    const kinds = [], bits = [];
    const sameBox = ['x0', 'y0', 'x1', 'y1'].every(k => Math.abs(a[k] - b[k]) <= .01);
    if (!sameBox) {
      const wA = a.x1 - a.x0, hA = a.y1 - a.y0, wB = b.x1 - b.x0, hB = b.y1 - b.y0;
      if (Math.abs(wA - wB) <= .02 && Math.abs(hA - hB) <= .02) { kinds.push('moved'); bits.push('انتقلت'); } else { kinds.push('resized'); bits.push(`المقاس ${num(a.area)} ← ${num(b.area)} م²`); }
    }
    if (a.doorSig !== b.doorSig) { kinds.push('doors'); bits.push(`الأبواب ${a.doors} ← ${b.doors}${a.doors === b.doors ? ' (بمواضع مختلفة)' : ''}`); }
    if (a.winSig !== b.winSig) { kinds.push('windows'); bits.push(`النوافذ ${a.windows} ← ${b.windows}${a.windows === b.windows ? ' (بمواضع مختلفة)' : ''}`); }
    if (a.name !== b.name) { kinds.push('renamed'); bits.push(`الاسم «${a.name}» ← «${b.name}»`); }
    if (kinds.length) out.push({ name: b.name, type: b.type, level: b.levelName, kinds, text: bits.join('؛ '), before: rectTxt(a) + ` — ${num(a.area)} م²`, after: rectTxt(b) + ` — ${num(b.area)} م²`, locked: lockedKeys.has(`${a.level}:${a.id}`) });
  }
  return out;
}
export function unchangedRooms(docBefore, docAfter) {
  const A = roomList(docBefore), B = roomList(docAfter), ch = new Set(roomChanges(docBefore, docAfter).map(r => r.level + '|' + r.name));
  return matchRooms(A, B).filter(([a, b]) => a && b && !ch.has(b.levelName + '|' + b.name)).map(([a]) => a.name);
}

// ------------------------------------------------------------------------------------------ الكميات والتكلفة
const QTY_IDS = ['footprint', 'rooms', 'circulation', 'wallArea', 'wallVolume', 'doors', 'windows', 'finishArea', 'blocks', 'concreteColumns', 'concreteBeams', 'concreteSlabs'];
/** مفاتيح أسعار الوحدة التي يدخلها المستخدم (لا أسعار معتمدة في النظام) ← صف الكمية المقابل. */
export const RATE_KEYS = Object.freeze({ walls: 'wallArea', plaster: 'finishArea', paint: 'finishArea', floor: ['rooms', 'circulation'], doors: 'doors', windows: 'windows' });
export function quantityDelta(docBefore, docAfter, rates = null) {
  let qa, qb; try { qa = computeDocQuantities(docBefore); qb = computeDocQuantities(docAfter); } catch (err) { return { rows: [], cost: { status: 'unverified', text: 'غير متحقق: تعذّر حساب الكميات — ' + err.message } }; }
  const map = q => new Map(q.rows.map(r => [r.id, r]));
  const A = map(qa), B = map(qb), rows = [];
  for (const id of QTY_IDS) {
    const a = A.get(id), b = B.get(id); if (!a && !b) continue;
    const va = a?.value ?? null, vb = b?.value ?? null;
    rows.push({ id, label: (b || a).label, unit: (b || a).unit, grade: (b || a).grade, before: va, after: vb, delta: va != null && vb != null ? r2(vb - va) : null, evidence: (b || a).basis });
  }
  const val = (M, k) => (Array.isArray(k) ? k : [k]).reduce((s, id) => s + (M.get(id)?.value || 0), 0);
  let cost;
  const priced = rates && typeof rates === 'object' ? Object.keys(RATE_KEYS).filter(k => Number.isFinite(rates[k]) && rates[k] >= 0) : [];
  if (priced.length) {
    const total = M => r2(priced.reduce((s, k) => s + val(M, RATE_KEYS[k]) * rates[k], 0));
    const a = total(A), b = total(B);
    cost = { status: 'estimated', before: a, after: b, delta: r2(b - a), items: priced, text: `تقدير من أسعار الوحدة التي أدخلتها فقط (${priced.length} بنود: ${priced.join('، ')})؛ لا يشمل الإنشاء والتسليح والكهروميكانيك ولا ضريبة. الفرق ${num(b - a)}.` };
  } else cost = { status: 'unverified', text: 'غير متحقق: لا أسعار معتمدة في النظام ولم تُدخل أسعار وحدة؛ لا يُقدَّر رقم بلا مصدر.' };
  return { rows, cost, rebar: 'غير متحقق: يحتاج تصميمًا إنشائيًا يعتمده مهندس إنشائي مرخّص', };
}

// ------------------------------------------------------------------------------------------ المقارنة والحكم
function cmpRow(a, b) {
  if (a && !b) return a.ok === false ? 'gone' : 'gone';
  if (!a && b) return b.ok === true ? 'new_ok' : b.ok === false ? 'new_fail' : 'unverified';
  if (a.ok === null || b.ok === null) return 'unverified';
  if (a.ok && b.ok) return 'same';
  if (a.ok && !b.ok) return 'regressed';
  if (!a.ok && b.ok) return 'fixed';
  return 'still_fail';
}
const showV = (r) => (r == null ? '—' : r.ok === null ? 'غير متحقق' : r.ok ? 'متحقق' : 'غير متحقق مطابقته' + (r.value != null && r.id.startsWith('quality:') ? ` (${r.value})` : ''));

/**
 * تقرير الأثر الكامل لتعديل من docBefore إلى docAfter.
 * ctx: { requirementsBefore, requirementsAfter, land, locks (لقطات), rates }
 * يعيد { verdict: 'accepted'|'needsApproval'|'rejected', rejectLabel?, table:[{group,tier,requirement,before,after,status,evidence}], regressions, improvements, rooms, kept, lock, indicators, quantities, summary }
 */
export function impactReport(docBefore, docAfter, ctx = {}) {
  const { requirementsBefore = {}, requirementsAfter = requirementsBefore, land = {}, locks = [], rates = null } = ctx;
  const auditA = auditDoc(docBefore, { requirements: requirementsBefore, land }), auditB = auditDoc(docAfter, { requirements: requirementsAfter, land });
  const A = new Map(auditA.map(r => [r.id, r])), B = new Map(auditB.map(r => [r.id, r])), table = [], ids = [...new Set([...A.keys(), ...B.keys()])];
  for (const id of ids) {
    const a = A.get(id), b = B.get(id), st = cmpRow(a, b), row = b || a;
    if (st === 'same' && row.group === 'جودة' && row.id !== 'quality:reject') continue; // لا ضجيج: ملاحظات الجودة الصفرية تبقى خارج الجدول
    if (id.startsWith('quality:') && id !== 'quality:reject' && a?.value === 0 && b?.value === 0) continue;
    let status = st;
    if (id.startsWith('quality:') && id !== 'quality:reject' && a && b && a.value != null && b.value != null) status = b.value > a.value ? 'regressed' : b.value < a.value ? 'improved' : (b.value ? 'same' : 'same');
    table.push({ id, group: row.group, tier: row.tier, requirement: a && b && a.label !== b.label ? `${a.label} ← ${b.label}` : row.label, before: showV(a), after: showV(b), status, statusAr: STATUS_AR[status], evidence: b ? b.evidence : `لم يعد يُقاس (${a.evidence})` });
  }
  const indA = indicatorsOf(docBefore, { requirements: requirementsBefore, land }), indB = indicatorsOf(docAfter, { requirements: requirementsAfter, land });
  const indicators = [];
  if (indA && indB) {
    for (const p of indA.parts) {
      const q = indB.parts.find(x => x.id === p.id); if (!q) continue;
      const status = q.score > p.score ? 'improved' : q.score < p.score ? 'regressed' : 'same';
      indicators.push({ id: p.id, group: 'مؤشرات', tier: TIER.INDICATOR, requirement: p.label, before: String(p.score), after: String(q.score), status, statusAr: STATUS_AR[status], evidence: 'درجة من 100 مقيسة من الرسم (plan-score)' });
    }
  }
  const mandatoryRegress = table.filter(r => r.tier === TIER.MANDATORY && (r.status === 'regressed' || r.status === 'new_fail'));
  const importantRegress = table.filter(r => r.tier === TIER.IMPORTANT && (r.status === 'regressed' || r.status === 'new_fail'));
  const indRegress = indicators.filter(r => r.status === 'regressed'), indImprove = indicators.filter(r => r.status === 'improved');
  const lockRes = locks.length ? verifyLocks(docAfter, locks) : { ok: true, checked: 0, kept: [], violated: [], results: [] };
  const lockedKeys = new Set(locks.map(l => l.key));
  const rooms = roomChanges(docBefore, docAfter, lockedKeys);
  const quantities = quantityDelta(docBefore, docAfter, rates);
  const verdict = mandatoryRegress.length ? 'rejected' : !lockRes.ok ? 'needsApproval' : 'accepted';
  const improvements = [...table, ...indicators].filter(r => r.status === 'improved' || r.status === 'fixed' || r.status === 'new_ok');
  const regressions = [...mandatoryRegress, ...importantRegress, ...indRegress];
  const summary = {
    verdict, rejectLabel: verdict === 'rejected' ? REJECT_LABEL : null,
    text: verdict === 'rejected' ? `${REJECT_LABEL}: ${mandatoryRegress.map(r => r.requirement).slice(0, 3).join('؛ ')}` : verdict === 'needsApproval' ? 'يحتاج موافقتك: التعديل يغيّر جزءًا مقفلًا. ' + describeLockResult(lockRes) : 'تعديل مقبول: ' + describeLockResult(lockRes) + (indRegress.length && indImprove.length ? ` (تحسّن ${indImprove.length} مؤشر وتراجع ${indRegress.length}: مبيّنة أدناه)` : ''),
    indicatorTotal: indA && indB ? { before: indA.total, after: indB.total } : null,
    counts: { improved: improvements.length, regressed: regressions.length, mandatoryRegressed: mandatoryRegress.length, importantRegressed: importantRegress.length, indicatorsUp: indImprove.length, indicatorsDown: indRegress.length },
  };
  return { v: IMPACT_VERSION, verdict, rejectLabel: summary.rejectLabel, table, indicators, regressions, improvements, mandatoryRegressions: mandatoryRegress, rooms, unchanged: unchangedRooms(docBefore, docAfter), lock: lockRes, quantities, summary };
}

export default { IMPACT_VERSION, TIER, TIER_AR, STATUS_AR, REJECT_LABEL, RATE_KEYS, auditDoc, indicatorsOf, roomChanges, unchangedRooms, quantityDelta, impactReport };
