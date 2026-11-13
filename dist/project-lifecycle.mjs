// دورة حياة المشروع: «الدخول الجديد» إلى الصفحة الرئيسية أو «مشروع جديد» يبدأ مشروعًا نظيفًا، ولا يضيع المشروع السابق:
// يُحفظ أولًا في «مشاريعي السابقة» (محليًا في متصفح العميل فقط، آخر 20) مع زر استعادة.
// التنقل داخل التبويب نفسه (رجوع لشرعاء، العودة إلى تصميمي، تحديث الصفحة) يستعيد مشروعه الحالي كما كان:
// علامة «جلسة العمل النشطة» في sessionStorage (تبقى مع التحديث وتزول بإغلاق التبويب أو بفتح تبويب جديد).
// وحدة نقية: التخزين يُمرَّر (localStorage وsessionStorage أو بدائل الاختبار). كل استدعاء يتحمّل فشل التخزين.

/** مفاتيح localStorage المرتبطة بمشروع واحد: تُحفظ في «السابقة» ثم تُمسح عند البدء من جديد. */
export const PROJECT_KEYS = Object.freeze([
  'mizan.design.session.v1', 'mizan.home.state.v1', 'mizan.journey.reached.v1',
  'mizan.studio.doc.v1', 'mizan.studio.doc.v1.before-home', 'mizan.studio.doc.v1.before-dna', 'mizan.studio.dna.v1', 'mizan.studio.structure.v1',
  'mizan.facade.wish', 'mizan.exterior.v1', 'mizan.geometry.v1', 'mizan.land.geo.v1', 'mizan.mep.systems.v1', 'mizan_portal_project_v1',
]);
/** مفاتيح تُمسح ولا تُحفظ (لقطة 3D كبيرة تُعاد من التصميم نفسه). */
export const PROJECT_TRANSIENT_KEYS = Object.freeze(['mizan.studio.snap3d.v1']);
/** مفاتيح sessionStorage المرتبطة بالمشروع. */
export const PROJECT_SESSION_KEYS = Object.freeze(['mizan.home.handoff.v1', 'mizan.shara.chat.v1', 'mizan.card.sun', 'mizan.card.regs']);
/** تبقى كما هي دائمًا (إعدادات لا ترتبط بتصميم): تفضيلات الصوت وفتح شرعاء، رمز الدخول، أسعار الكميات، معرض الصور، علامة الاتفاق على الأرشيف. */
export const KEPT_KEYS = Object.freeze(['mizan.shara.voice', 'mizan.shara.open', 'mizan.access', 'mizan.ai.code', 'mizan_image_access_code', 'mizan_gallery_v1', 'mizan.final.rates.v1', 'mizan.archive.consent.v1']);

export const PAST_KEY = 'mizan.projects.past.v1';
export const ACTIVE_KEY = 'mizan.tab.active.v1';
export const NOTICE_KEY = 'mizan.fresh.notice.v1';
export const PAST_MAX = 20;
export const PAST_MAX_BYTES = 2_500_000;

const get = (store, k) => { try { return store.getItem(k); } catch { return null; } };
const set = (store, k, v) => { try { store.setItem(k, v); return true; } catch { return false; } };
const del = (store, k) => { try { store.removeItem(k); } catch { /* التخزين غير متاح */ } };

/** هل في التخزين مشروع فيه عمل فعلي (تصميم أو أرض أو مرسم)؟ */
export function hasProject(local) {
  if (get(local, 'mizan.design.session.v1') || get(local, 'mizan.studio.doc.v1')) return true;
  try { const h = JSON.parse(get(local, 'mizan.home.state.v1') || 'null'); return !!(h && (h.confirmedLand || h.shara)); } catch { return false; }
}
function summarize(snapshot, now) {
  let land = null, designs = 0, approved = false;
  try { const s = JSON.parse(snapshot['mizan.design.session.v1'] || 'null'); if (s?.input?.land) land = { width: s.input.land.width, length: s.input.land.length }; designs = s?.designs?.length || 0; approved = s?.approved !== null && s?.approved !== undefined; } catch { /* بلا ملخص */ }
  if (!land) { try { const h = JSON.parse(snapshot['mizan.home.state.v1'] || 'null'); const l = h?.confirmedLand; if (l) land = { width: l.width, length: l.length }; } catch { /* بلا ملخص */ } }
  return { land, designs, approved, savedAt: now };
}
export function listPast(local) {
  try { const v = JSON.parse(get(local, PAST_KEY) || 'null'); return v && v.v === 1 && Array.isArray(v.items) ? v.items.filter(i => i && typeof i.id === 'string' && i.data && typeof i.data === 'object') : []; } catch { return []; }
}
function writePast(local, items) {
  let list = items.slice(0, PAST_MAX);
  const size = l => l.reduce((n, i) => n + JSON.stringify(i).length, 0);
  while (list.length > 1 && size(list) > PAST_MAX_BYTES) list = list.slice(0, -1);
  while (list.length) { if (set(local, PAST_KEY, JSON.stringify({ v: 1, items: list }))) return true; list = list.slice(0, -1); }
  del(local, PAST_KEY); return false;
}
/** يحفظ المشروع الحالي في «السابقة» (لا يمسح شيئًا). يعيد المدخل المحفوظ أو null إن لم يوجد مشروع أو تعذّر الحفظ. */
export function archiveCurrent(local, now = Date.now()) {
  if (!hasProject(local)) return null;
  const data = {}; for (const k of PROJECT_KEYS) { const v = get(local, k); if (v !== null) data[k] = v; }
  const item = { id: 'p' + now.toString(36) + Math.random().toString(36).slice(2, 6), savedAt: now, summary: summarize(data, now), data };
  const before = listPast(local);
  if (!writePast(local, [item, ...before])) return null;
  return listPast(local).some(i => i.id === item.id) ? item : null;
}
export function clearProject(local, session) {
  for (const k of [...PROJECT_KEYS, ...PROJECT_TRANSIENT_KEYS]) del(local, k);
  if (session) for (const k of PROJECT_SESSION_KEYS) del(session, k);
}
/** مشروع جديد: يحفظ السابق ثم يمسح. يعيد { archived: item|null, hadProject }. المشروع غير المحفوظ بسبب فشل التخزين يُعلن (archived=null مع hadProject=true). */
export function startNewProject(local, session, now = Date.now()) {
  const had = hasProject(local), archived = had ? archiveCurrent(local, now) : null;
  clearProject(local, session);
  if (had) set(session, NOTICE_KEY, archived ? 'archived' : 'lost');
  return { archived, hadProject: had };
}
/** عند فتح الصفحة الرئيسية: دخول جديد (لا علامة نشطة في هذا التبويب) → مشروع نظيف؛ وإلا يستعيد. */
export function beginVisit(local, session, now = Date.now()) {
  if (get(session, ACTIVE_KEY)) return { fresh: false };
  if (!set(session, ACTIVE_KEY, '1')) return { fresh: false, reason: 'no-session-storage' }; // لا نمسح أبدًا ما لا نستطيع تمييزه
  const r = startNewProject(local, session, now);
  return { fresh: true, ...r };
}
/** الصفحات الأخرى (التصميم، المرسم…) تضع العلامة فقط ولا تمسح: دخول مباشر إلى صفحة داخلية لا يهدم مشروعًا. */
export function touchVisit(session) { if (!get(session, ACTIVE_KEY)) set(session, ACTIVE_KEY, '1'); }
/** تلميح البدء مرة واحدة: 'archived' | 'lost' | null. */
export function takeNotice(session) { const v = get(session, NOTICE_KEY); if (v) del(session, NOTICE_KEY); return v === 'archived' || v === 'lost' ? v : null; }
/** يستعيد مشروعًا سابقًا: يحفظ الحالي أولًا (إن وُجد) ثم يكتب لقطة السابق. */
export function restorePast(local, session, id, now = Date.now()) {
  const item = listPast(local).find(i => i.id === id); if (!item) return false;
  const rest = listPast(local).filter(i => i.id !== id);
  set(local, PAST_KEY, JSON.stringify({ v: 1, items: rest }));
  if (hasProject(local)) archiveCurrent(local, now);
  clearProject(local, session);
  for (const [k, v] of Object.entries(item.data)) if (PROJECT_KEYS.includes(k) && typeof v === 'string') set(local, k, v);
  return true;
}
export function deletePast(local, id) { return writePast(local, listPast(local).filter(i => i.id !== id)); }
