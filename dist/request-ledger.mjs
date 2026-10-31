// (ملاحظات المعاينة 2026-10-31) «هل نُفّذ طلبك؟» كاملًا وبلا تناقض — وحدة عرض نقية فوق ledgerFor (لا تغيّر المحرك ولا ledgerFor).
// المشكلة التي تحلها (مقيسة في REPORT.md): (1) طلبات صريحة لا تظهر في القائمة — علاقة المقلط بالمجلس (GUEST_ACCESS) والباب المباشر
// المرسل علاقةً صلبة (DIRECT_DOOR) دون قاعدة باب في requirements.rules، وما سجّله المحوّل «غير مدعوم»؛ (2) «نُفّذت كل البنود» تُكتب
// بالأخضر بينما حالة العرض «محجوب» بشرط أساسي غير متحقق؛ (3) التفضيل الذي لم يتحقق يُعدّ «بقي» كالإلزامي دون تمييز.
// كل بند هنا مقيس من المستند (verifyRules) أو من بوابات المراجعة المحفوظة مع التصميم؛ وما لا يُقاس يُقال «لم يُتحقق» صراحة.
import { verifyRules } from './rules.mjs';

export const LEVEL_AR = Object.freeze({ must: 'لازم', prefer: 'تفضيل' });
const SUBJ_AR = { majlis: 'مجلس الرجال', dining: 'الطعام', kitchen: 'المطبخ', hall: 'الصالة', majlis_w: 'مجلس النساء' };

/** درجة البند كما أُرسل للمحرك: القاعدة تحمل level؛ الأعداد إلزامية؛ التفضيلات (P-*) تفضيل. */
function levelOf(x) {
  if (x.level === 'must' || x.level === 'forbid') return 'must';
  if (x.level === 'prefer') return 'prefer';
  if (x.kind === 'count' || x.kind === 'dims' || x.kind === 'extra' || x.kind === 'area') return 'must';
  return 'prefer';
}
/** حالة البند للعرض: done | missing (لازم لم يتحقق) | pref-unmet | unverified | pending-render | unsupported */
export function itemState(x) {
  if (x.status === 'unsupported') return 'unsupported';
  if (x.status === 'unverified') return 'unverified';
  if (x.status === 'pending-render') return 'pending-render';
  if (x.ok) return 'done';
  return x.level === 'must' ? 'missing' : 'pref-unmet';
}

/**
 * يكمل سجل التنفيذ بكل طلب صريح للعميل. ledger: ناتج ledgerFor. req: session.input.requirements.
 * design: { doc, review, presentation } للتصميم المعروض. entry: جهة المدخل.
 */
export function completeLedger(ledger, req = {}, { doc = null, review = null, entry = 's' } = {}) {
  const items = (ledger || []).map(x => ({ ...x, level: levelOf(x) }));
  const rules = req.rules || [], ids = new Set(items.map(x => x.id));
  for (const rel of req.relations || []) {
    const lv = rel.level === 'HARD' ? 'must' : 'prefer';
    if (rel.kind === 'DIRECT_DOOR') {
      // مغطّى إن وُجدت قاعدة باب للطرفين نفسيهما في السجل
      const covered = rules.some(r => r.door && ids.has(r.id) && new Set([r.a, r.b]).has(rel.from) && new Set([r.a, r.b]).has(rel.to));
      if (covered || !doc) continue;
      const text = `«${SUBJ_AR[rel.from] || rel.from}» بباب مباشر على «${SUBJ_AR[rel.to] || rel.to}»`;
      let m = null; try { m = verifyRules(doc, [{ id: 'DD-' + rel.id, kind: 'adjacent', a: rel.from, b: rel.to, door: true, level: lv === 'must' ? 'must' : 'prefer', text }], { entry })[0]; } catch { m = null; }
      items.push(m ? { ...m, id: 'DD-' + rel.id, text, level: lv, source: 'relation' } : { id: 'DD-' + rel.id, text, ok: false, status: 'unverified', level: lv, why: 'تعذّر قياس الباب من المستند.', source: 'relation' });
    } else if (rel.kind === 'GUEST_ACCESS') {
      const text = 'المقلط: طعام للضيوف مرتبط بمجلس الرجال' + (rel.directDoor === 'required' ? ' بباب مباشر' : '');
      const gates = (review?.gates || []).filter(g => g.id === 'GUEST_ROUTE' || g.id === 'MAJLIS_DINING');
      if (!gates.length) { items.push({ id: 'GA-' + rel.id, text, ok: false, status: 'unverified', level: lv, why: 'لا مراجعة آلية محفوظة لهذه النسخة (عُدّلت بعد التوليد)؛ لم يُتحقق من مسار الضيف إلى المقلط.', source: 'relation' }); continue; }
      const bad = gates.filter(g => !g.ok);
      items.push({ id: 'GA-' + rel.id, text, ok: !bad.length, level: lv, source: 'relation',
        why: bad.length ? (bad[0].reasons_ar || [])[0] || 'بوابة مسار الضيف أو المجلس والطعام راسبة.' : 'بوابتا المراجعة «مسار الضيف» و«المجلس والطعام» ناجحتان (الضيف يصل الطعام دون المرور بمنطقة العائلة).' });
    }
  }
  for (const u of req.unsupported || []) items.push({ id: 'U-' + items.length, text: String(u), ok: false, status: 'unsupported', level: 'prefer', why: 'مسجّل في ملفك ولا يطبّقه المحرك في هذا الإصدار.', source: 'unsupported' });
  return items.map(x => ({ ...x, state: itemState(x) }));
}

/**
 * سطر الحكم فوق القائمة: لا «نُفّذت كل البنود» بالأخضر والتصميم محجوب، ولا يُخلط التفضيل غير المتحقق بالإلزامي.
 * presentation: حالة العرض (ready | needs-edits | hidden | null).
 */
export function ledgerVerdict(items, presentation = null) {
  const n = s => items.filter(x => x.state === s).length;
  const done = n('done'), missing = n('missing'), prefUnmet = n('pref-unmet'), open = n('unverified') + n('pending-render'), unsup = n('unsupported');
  const counted = items.length - unsup, hidden = presentation?.status === 'hidden';
  const parts = [];
  let text, cls;
  if (!items.length) return { cls: 'sub', text: 'لم تذكر طلبات مكانية أو مقاسات؛ طُبّقت الأعداد التي حددتها.', hidden, done, missing, prefUnmet, open, unsup };
  if (missing) { text = `نُفّذ ${done} من ${counted} بنود، ولم يتحقق ${missing} ${missing === 1 ? 'بند لازم' : 'بنود لازمة'}`; cls = 'bad'; }
  else if (done === counted) { text = `نُفّذت كل بنود طلبك (${counted})`; cls = 'full'; }
  else { text = `نُفّذ ${done} من ${counted} بنود`; cls = 'part'; }
  if (prefUnmet) parts.push(`${prefUnmet} ${prefUnmet === 1 ? 'تفضيل لم يتحقق' : 'تفضيلات لم تتحقق'}`);
  if (open) parts.push(`${open} لم يُتحقق ${open === 1 ? 'منه' : 'منها'} آليًا`);
  if (unsup) parts.push(`${unsup} غير مدعوم`);
  if (parts.length) text += ' — ' + parts.join('، ');
  if (hidden) { cls = 'bad'; text = 'مسودة مرفوضة: تخالف شرطًا أساسيًا (مذكورًا أعلى الصفحة) — ' + text.replace(/^نُفّذت كل بنود طلبك \((\d+)\)/, 'بنود طلبك منفّذة كلها ($1)'); }
  else if (presentation?.status === 'needs-edits') { if (cls === 'full') cls = 'part'; text += '. والتصميم يحتاج تعديلات معمارية قبل اعتماده (مذكورة أعلى الصفحة)'; }
  else if (cls === 'full' && (prefUnmet || open)) cls = 'part';
  return { cls, text, hidden, done, missing, prefUnmet, open, unsup };
}
