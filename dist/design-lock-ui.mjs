// واجهة قفل الأجزاء وتقرير الأثر في صفحة التصميم. منطق العرض نقي (lockModel، impactView) ويُختبر بلا متصفح؛ والبناء DOM في lockCard وimpactCard.
// لا تغيّر هندسة: القفل يسجّل لقطة (design-lock-edit.lockParts)، والتعديل يمرّ بـ proposeChange فيقيس الأثر (design-impact)، والتغيير الذي يمس مقفلًا
// لا يُطبَّق إلا بموافقة صريحة (approveProposal). الرفض يترك كل شيء كما هو. مراجعة آلية أولية؛ لا ادعاء في الأحمال والأساسات والتسليح.
import { lockableParts, verifyLock } from './design-lock.mjs';
import { STATUS_AR, TIER_AR } from './design-impact.mjs';
import { analyzeDoc } from './draw/digest.mjs';

/** مجموعات القفل السريع حسب نوع الغرفة. */
export const LOCK_GROUPS = Object.freeze([
  { id: 'majlis', label: 'المجالس', types: ['majlis'] },
  { id: 'kitchen', label: 'المطبخ والطعام', types: ['kitchen', 'dining'] },
  { id: 'bedrooms', label: 'غرف النوم', types: ['bedroom', 'master'] },
  { id: 'living', label: 'الصالة والمدخل', types: ['living', 'entrance'] },
  { id: 'baths', label: 'الحمامات', types: ['bath'] },
]);
export const STATUS_HEADLINE = Object.freeze({
  applied: 'طُبّق التعديل: الأجزاء المقفلة بقيت كما هي ولا تراجع إلزاميًا.',
  needsApproval: 'التعديل يحتاج موافقتك: يغيّر جزءًا مقفلًا. لم يُطبَّق شيء بعد.',
  rejected: 'مرفوض: تراجع إلزامي. لم يُطبَّق شيء.',
  failed: 'تعذّر التعديل. لم أغيّر تصميمك.',
  unchanged: 'التعديل لا يغيّر المخطط. لم يُضف تصميم.',
});
const STATUS_CLASS = { applied: 'ok', needsApproval: 'warn', rejected: 'bad', failed: 'bad', unchanged: 'warn' };

/**
 * نموذج القفل للعرض: لكل غرفة قابلة للقفل حالتها (locked/stale/free) ولكل مجموعة عدّادها.
 * stale: قفل بمفتاحها لكن لقطته لا تطابق التصميم المعروض (قُفل من تصميم آخر أو تغيّر).
 */
export function lockModel(session, doc) {
  const locks = session?.locks || [], byKey = new Map(locks.map(l => [l.key, l]));
  const m = analyzeDoc(doc), multi = m.levels.filter(l => l.rooms.length).length > 1;
  const rooms = lockableParts(doc).map(p => {
    const l = byKey.get(p.key); let state = 'free';
    if (l) { let kept = false; try { kept = verifyLock(doc, l, m).status === 'kept'; } catch { kept = false; } state = kept ? 'locked' : 'stale'; }
    return { key: p.key, id: p.id, name: p.name, type: p.type, area: p.area, levelId: p.levelId, levelName: multi ? (m.levelById.get(p.levelId)?.level.name || '') : '', state };
  });
  const groups = LOCK_GROUPS.map(g => {
    const rs = rooms.filter(r => g.types.includes(r.type)), locked = rs.filter(r => r.state === 'locked').length;
    return { id: g.id, label: g.label, ids: rs.filter(r => r.state !== 'locked').map(r => r.id), total: rs.length, locked, allLocked: rs.length > 0 && locked === rs.length };
  }).filter(g => g.total > 0);
  const stale = locks.filter(l => !rooms.some(r => r.key === l.key && r.state === 'locked'));
  return { rooms, groups, lockedCount: rooms.filter(r => r.state === 'locked').length, staleKeys: stale.map(l => l.key), total: locks.length };
}

/** عرض نتيجة proposeChange: جدول الأثر (المتطلب، قبل، بعد، الحالة، الدليل) وكتلة الموافقة عند needsApproval. */
export function impactView(result, { maxRows = 60 } = {}) {
  if (!result) return null;
  const report = result.report || null, order = { regressed: 0, new_fail: 1, improved: 2, new_ok: 3, fixed: 3, same: 4 };
  const rows = (report?.table || []).slice().sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5)).slice(0, maxRows).map(r => ({
    id: r.id, requirement: r.requirement, tier: r.tier, tierAr: TIER_AR[r.tier] || r.tier || '', before: r.before ?? '—', after: r.after ?? '—', status: r.status, statusAr: r.statusAr || STATUS_AR[r.status] || r.status, evidence: r.evidence || '' }));
  const approval = result.status === 'needsApproval' && result.proposal ? { reason: result.proposal.reason, desc: result.proposal.desc, changes: (result.proposal.changes || []).map(c => ({ key: c.key, name: c.name, reasons: c.reasons || [], before: c.before, after: c.after })) } : null;
  const counts = report?.summary?.counts || null;
  return { status: result.status, cls: STATUS_CLASS[result.status] || 'warn', headline: STATUS_HEADLINE[result.status] || result.reason || '', reason: result.status === 'applied' ? '' : (result.reason || ''), rows, counts, approval, hasRows: rows.length > 0 };
}

// ------------------------------------------------------------------------------------------ DOM
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : document.createTextNode(String(c))); return n; };

/**
 * بطاقة القفل. opts: { session, doc, busy, message, onLockGroup(group), onToggle(room), onEdit(change) }
 * أزرار ≥ 44px عبر .mz-review .btn؛ كل زر نصّه صريح («اقفل»/«فك القفل»)، والحالة تُقال بالنص لا باللون وحده.
 */
export function lockCard(opts) {
  const { session, doc, busy = false, message = '', onLockGroup, onToggle, onEdit } = opts;
  const card = el('div', { class: 'card mz-review mz-lock', id: 'lockCard' });
  card.append(el('div', { class: 'mzr-head' }, el('h2', {}, 'قفل الأجزاء المعتمدة')));
  let model; try { model = lockModel(session, doc); } catch (e) { card.append(el('p', { class: 'mzr-note bad', role: 'status' }, 'تعذّر عرض الأقفال: ' + (e.message || e))); return card; }
  card.append(el('p', { class: 'mzr-meta', id: 'lockSummary' }, `المقفل في هذا التصميم: ${model.lockedCount} من ${model.rooms.length} غرفة. القفل يحفظ الغرفة حرفيًا (مقاسها وأبوابها ونوافذها)، وأي تعديل يمسّها يحتاج موافقتك الصريحة.`));
  if (model.staleKeys.length) card.append(el('p', { class: 'mzr-note warn', role: 'status', id: 'lockStale' }, `${model.staleKeys.length} قفلًا لا يطابق هذا التصميم (قُفل من تصميم آخر). افكّه أو ارجع إلى ذلك التصميم.`,
    ' ', el('button', { type: 'button', class: 'btn', onclick: () => model.staleKeys.forEach(k => onToggle?.({ key: k, state: 'stale' })) }, 'فك الأقفال غير المطابقة')));
  card.append(el('div', { class: 'mzl-groups', role: 'group', 'aria-label': 'قفل مجموعة' }, model.groups.map(g =>
    el('button', { type: 'button', class: 'btn mzl-group', 'data-group': g.id, disabled: busy || g.allLocked, onclick: () => onLockGroup?.(g) }, g.allLocked ? `${g.label}: مقفلة كلها` : `اقفل ${g.label} (${g.locked}/${g.total})`))));
  card.append(el('details', { class: 'mzr-ok mzl-details', id: 'lockRoomsBox' }, el('summary', {}, `قفل غرفة بعينها (${model.rooms.length})`), el('ul', { class: 'mzr-list mzl-rooms', id: 'lockRooms' }, model.rooms.map(r => el('li', { class: `mzr-item mzl-room ${r.state}`, 'data-room': r.id, 'data-lock-state': r.state },
    el('div', { class: 'mzr-top' }, el('b', {}, r.name), r.levelName ? el('span', { class: 'pill' }, r.levelName) : null, el('span', { class: 'pill st ' + (r.state === 'locked' ? 'verified' : r.state === 'stale' ? 'unverified' : '') }, r.state === 'locked' ? 'مقفلة' : r.state === 'stale' ? 'قفل غير مطابق' : 'غير مقفلة'), el('span', { class: 'pill' }, `${r.area} م²`)),
    el('div', { class: 'mzr-where' }, el('span', {}, r.state === 'locked' ? 'محفوظة حرفيًا' : 'قابلة للتعديل'),
      el('button', { type: 'button', class: 'btn mzr-show', disabled: busy, 'aria-label': (r.state === 'locked' ? 'فك قفل ' : 'اقفل ') + r.name, onclick: () => onToggle?.(r) }, r.state === 'locked' ? 'فك القفل' : 'اقفل')))))));
  const sel = el('select', { id: 'lockEnlargeTarget', class: 'mzl-select', 'aria-label': 'الغرفة المراد توسيعها' }, model.rooms.filter(r => r.state !== 'locked').map(r => el('option', { value: r.id }, r.name + (r.levelName ? ` (${r.levelName})` : ''))));
  card.append(el('div', { class: 'mzl-edit' }, el('b', {}, 'جرّب تعديلًا مع حماية المقفل'),
    el('div', { class: 'row mzl-actions' },
      el('button', { type: 'button', class: 'btn gold', id: 'lockAddBed', disabled: busy, onclick: () => onEdit?.({ type: 'add-bedroom', label: 'إضافة غرفة نوم' }) }, 'أضف غرفة نوم'),
      el('label', { class: 'mzl-lab' }, 'وسّع غرفة بمقدار 3 م²: ', sel),
      el('button', { type: 'button', class: 'btn', id: 'lockEnlarge', disabled: busy || !sel.options.length, onclick: () => onEdit?.({ type: 'enlarge-room', target: sel.value, gain: 3, label: 'توسيع ' + (sel.selectedOptions[0]?.textContent || '') }) }, 'وسّع'))));
  card.append(el('p', { class: 'mzr-note', id: 'lockMsg', role: 'status', 'aria-live': 'polite' }, busy ? 'جارٍ قياس الأثر…' : message));
  return card;
}

/** بطاقة تقرير الأثر مع أزرار الموافقة/الرفض الصريحة عند needsApproval. opts: { result, onApprove(), onReject(), onClose() } */
export function impactCard(opts) {
  const { result, onApprove, onReject, onClose } = opts, v = impactView(result);
  const card = el('div', { class: 'card mz-review mz-impact', id: 'impactCard', 'data-impact-status': v?.status || 'none', 'aria-live': 'polite' });
  card.append(el('div', { class: 'mzr-head' }, el('h2', {}, 'تقرير أثر التعديل')));
  if (!v) { card.append(el('p', { class: 'mzr-note' }, 'لا تعديل بعد.')); return card; }
  card.append(el('p', { class: 'mzr-verdict ' + v.cls, 'data-impact-headline': v.status }, v.headline));
  if (v.reason) card.append(el('p', { class: 'mzr-why', id: 'impactReason' }, v.reason));
  if (v.counts) card.append(el('p', { class: 'mzr-meta' }, `تحسّن ${v.counts.improved} · تراجع ${v.counts.regressed} (إلزامي ${v.counts.mandatoryRegressed})`));
  if (v.approval) {
    card.append(el('div', { class: 'mzr-decide mzi-approval', id: 'impactApproval' },
      el('p', {}, el('b', {}, 'الأسباب: '), v.approval.reason || 'يمسّ جزءًا مقفلًا.'),
      el('p', {}, el('b', {}, 'التغييرات المقترحة: '), v.approval.desc || ''),
      el('ul', { class: 'mzr-list', id: 'impactChanges' }, v.approval.changes.map(c => el('li', { class: 'mzr-item warning', 'data-lock': c.key }, el('b', {}, `«${c.name}»`), el('p', { class: 'mzr-why' }, c.reasons.join('؛ ')),
        c.before || c.after ? el('p', { class: 'mzr-meta' }, `قبل: ${typeof c.before === 'object' ? JSON.stringify(c.before) : c.before ?? '—'} ← بعد: ${typeof c.after === 'object' ? JSON.stringify(c.after) : c.after ?? '—'}`) : null))),
      el('div', { class: 'row mzi-btns' }, el('button', { type: 'button', class: 'btn gold', id: 'impactApprove', onclick: () => onApprove?.() }, 'أوافق على تغيير الأجزاء المقفلة'), el('button', { type: 'button', class: 'btn', id: 'impactReject', onclick: () => onReject?.() }, 'أرفض ولا أغيّر شيئًا'))));
  }
  if (v.hasRows) {
    const head = ['المتطلب', 'قبل', 'بعد', 'الحالة', 'الدليل'];
    const tbl = rows => el('div', { class: 'mzi-wrap' }, el('table', { class: 'mzi-table' }, el('thead', {}, el('tr', {}, head.map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, rows.map(r => el('tr', { class: 'mzi-row ' + r.status, 'data-status': r.status },
        el('td', { 'data-label': head[0] }, r.requirement, r.tierAr ? el('small', { class: 'mzi-tier' }, ' · ' + r.tierAr) : null), el('td', { 'data-label': head[1] }, String(r.before)), el('td', { 'data-label': head[2] }, String(r.after)),
        el('td', { 'data-label': head[3] }, el('span', { class: 'pill st ' + (r.status === 'regressed' || r.status === 'new_fail' ? 'violated' : r.status === 'same' ? '' : 'verified') }, r.statusAr)), el('td', { 'data-label': head[4], class: 'mzi-ev' }, r.evidence))))));
    const changed = v.rows.filter(r => r.status !== 'same'), same = v.rows.filter(r => r.status === 'same');
    if (changed.length) { const t = tbl(changed); t.querySelector('table').id = 'impactTable'; card.append(t); } else card.append(el('p', { class: 'mzr-note ok', id: 'impactNone' }, 'لا بند تغيّرت حالته.'));
    if (same.length) card.append(el('details', { class: 'mzr-ok' }, el('summary', {}, `بنود بلا تغيير (${same.length})`), tbl(same)));
  }
  if (!v.approval) card.append(el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', id: 'impactClose', onclick: () => onClose?.() }, 'إغلاق التقرير')));
  return card;
}
export default { LOCK_GROUPS, lockModel, impactView, lockCard, impactCard };
