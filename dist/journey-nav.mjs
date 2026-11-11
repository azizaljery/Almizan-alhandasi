// مسار العميل: الأرض ← شرعاء ← التصميم ← الشكل الخارجي ← ثلاثي الأبعاد ← المخططات ← جدول الكميات.
// منطق خالص بلا DOM (يُختبر في node): روابط المراحل، أيّها بُلغ فيُضغط، وأيّها لم يُبلغ فيُعطَّل مع سببه.
// الروابط نسبية بامتداد ‎.html‎: تعمل محليًا كما هي، وفي الإنتاج (Cloudflare) تُحوَّل 307 إلى المسار بلا امتداد مع بقاء الـ hash.

export const STAGES = Object.freeze([
  { id: 'land', label: 'الأرض', href: './home.html#land' },
  { id: 'shara', label: 'شرعاء', href: './home.html#shara' },
  { id: 'design', label: 'التصميم', href: './design.html' },
  { id: 'exterior', label: 'الشكل الخارجي', href: './design.html#exterior' },
  { id: 'view3d', label: 'ثلاثي الأبعاد', href: './view3d.html' },
  { id: 'sheets', label: 'المخططات', href: './final.html#plan0' },
  { id: 'boq', label: 'جدول الكميات', href: './final.html#qty' },
]);
export const stageIndex = id => STAGES.findIndex(s => s.id === id);

export const SESSION_KEY = 'mizan.design.session.v1';
export const HOME_KEY = 'mizan.home.state.v1';
export const REACHED_KEY = 'mizan.journey.reached.v1';
export const STUDIO_DOC_KEY = 'mizan.studio.doc.v1';

const read = (store, key) => { try { return JSON.parse(store.getItem(key) || 'null'); } catch { return null; } };

/** ما يلزم لمعرفة موضع العميل في المسار، مقروءًا من التخزين (بلا تحليل للمخططات). */
export function readJourney(store) {
  const s = read(store, SESSION_KEY), ok = !!(s && s.v === 1 && Array.isArray(s.designs) && s.designs.length);
  const home = read(store, HOME_KEY), mark = read(store, REACHED_KEY);
  let studio = false; try { studio = !!store.getItem(STUDIO_DOC_KEY); } catch { studio = false; }
  return {
    session: ok ? { id: s.createdAt ?? 0, designs: s.designs.length, current: s.current ?? 0, approved: s.approved ?? null, land: s.input?.land || null } : null,
    hasLand: !!(home?.confirmedLand || (ok && s.input?.land)),
    studio, mark: mark && typeof mark === 'object' ? mark : null,
  };
}

/** أبعد مرحلة بلغها العميل في هذه الجلسة (فهرس في STAGES). الجلسات الأقدم من هذه العلامة تُستنتج من حالتها. */
export function reachedIndex(j) {
  if (!j.session) return j.hasLand ? stageIndex('shara') : stageIndex('land');
  let at = stageIndex('design');
  if (j.mark && j.mark.sid === j.session.id && Number.isInteger(j.mark.max)) at = Math.max(at, Math.min(STAGES.length - 1, j.mark.max));
  else if (j.session.approved !== null) at = stageIndex(j.studio ? 'view3d' : 'exterior'); // جلسة سابقة لعلامة البلوغ: المعتمد بلغ العرض
  // ما بعد التصميم يحتاج مخططًا معتمدًا محفوظًا؛ بلا ذلك لا يُفتح ولو سُجّل
  if (at > stageIndex('exterior') && !j.studio) at = stageIndex('exterior');
  if (at > stageIndex('design') && j.session.approved === null) at = stageIndex('design');
  return at;
}

const WHY = {
  shara: 'أدخل بيانات الأرض أولًا ثم اضغط «متابعة إلى شرعاء».',
  design: 'لم يُولَّد تصميم بعد: أكمل حديثك مع شرعاء ثم اضغط «توليد التصميم».',
  exterior: 'اعتمد التصميم أولًا بزر «أعجبني» لتسألك شرعاء عن الشكل الخارجي.',
  view3d: 'أكمل أسئلة الشكل الخارجي ثم اضغط «ولّد الشكل الخارجي» ليُفتح العرض ثلاثي الأبعاد.',
  sheets: 'افتح العرض ثلاثي الأبعاد ثم اضغط «المخرجات» لتُجهَّز المخططات.',
  boq: 'افتح العرض ثلاثي الأبعاد ثم اضغط «المخرجات» ليُحسب جدول الكميات.',
};

/**
 * حالة كل مرحلة لشريط الخطوات: { id, label, href, current, reached, reason }.
 * المرحلة الحالية لا رابط لها؛ ما بُلغ رابط؛ ما لم يُبلغ معطّل وسببه في reason.
 */
export function stageStates(j, current) {
  const at = Math.max(reachedIndex(j), stageIndex(current));
  return STAGES.map((s, i) => ({ ...s, current: s.id === current, reached: i <= at, reason: i <= at ? '' : WHY[s.id] || '' }));
}

/** تسجيل بلوغ مرحلة (لا تنقص أبدًا داخل الجلسة نفسها؛ جلسة جديدة تبدأ من جديد). */
export function markReached(store, stageId) {
  const j = readJourney(store), i = stageIndex(stageId); if (!j.session || i < 0) return false;
  const prev = j.mark && j.mark.sid === j.session.id ? j.mark.max : -1;
  const base = prev >= 0 ? prev : reachedIndex({ ...j, mark: null });
  try { store.setItem(REACHED_KEY, JSON.stringify({ sid: j.session.id, max: Math.max(base, i) })); return true; } catch { return false; }
}

/** مسار الصفحة بصيغة موحّدة بين الوضعين: ‎/design.html‎ و ‎/design‎ واحد، و«/» و ‎/home‎ و ‎/home.html‎ واحد. */
export function pageKey(pathname) {
  let p = String(pathname || '/').replace(/\.html$/, '').replace(/\/+$/, '');
  if (p === '' || /(^|\/)home$/.test(p)) p = p.replace(/home$/, '').replace(/\/+$/, '');
  return p || '/';
}
/** هل الرابط في الصفحة المفتوحة نفسها (فيُعالَج بلا إعادة تحميل)؟ */
export function samePage(href, here) {
  try { const a = new URL(href, here), b = new URL(here); return a.origin === b.origin && pageKey(a.pathname) === pageKey(b.pathname); } catch { return false; }
}

export default { STAGES, stageIndex, readJourney, reachedIndex, stageStates, markReached, pageKey, samePage };
