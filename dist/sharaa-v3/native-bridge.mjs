// SHARAA V3 — جسر إلى شرعاء الحالي (home-flow.mjs / SharaSession). نقي: لا DOM ولا شبكة.
// V3 لا يولّد بنفسه: يصوغ ما أكده العميل نصًّا يفهمه فهمُ شرعاء المحلي، ويُسلَّم إلى مسار شرعاء القائم (الحديث الحر)
// فيمرّ بما فيه من «ما فهمته» و«ما لن أطبّقه». ما لا يستطيع الجسر نقله يُعلَن صراحةً بحالته وسببه ولا يُسقَط بصمت.
import { bank, factSupport, gateMatches, readiness } from './core.mjs';

/** أرض شرعاء المؤكدة (home-flow normalizeLand) → أرض V3. لا يُسأل العميل عنها ثانيةً. */
export function toV3Land(land) {
  if (!land || !(land.width > 0 && land.length > 0)) throw Error('أرض مؤكدة مطلوبة');
  const out = { widthM: land.width, depthM: land.length, entries: [...(land.entries || [])], streets: (land.streets || []).map(side => ({ side })), floors: land.floors || 1 };
  if (land.geo?.city) out.city = land.geo.city;
  return out;
}
const confirmed = (b, id) => { const f = b.facts[id]; return f && f.verification === 'confirmed' && !f.recheck && gateMatches(bank.find(q => q.id === id).gate, b) ? f : null; };
const plural = (n, one, two, many) => (n === 1 ? one : n === 2 ? two : `${n} ${many}`);

// كل بند: الصياغة التي يفهمها الفهم المحلي لشرعاء (مُتحقَّق منها باختبار الذهاب والإياب)
const PHRASES = {
  'household.bedrooms': n => (n === 1 ? 'غرفة نوم واحدة' : `${n} غرف نوم`),
  'living.count': n => (n > 0 ? plural(n, 'صالة', 'صالتان', 'صالات') : null),
  'living.diningCount': n => (n === 1 ? 'غرفة طعام' : n > 1 ? `${n} غرف طعام` : null), // «غرفتا/غرفتين طعام» لا يفهمها الفهم المحلي (تُضيف غرف نوم)
  'services.kitchens': n => (n > 0 ? plural(n, 'مطبخ', 'مطبخان', 'مطابخ') : null),
  'living.baths': n => (n > 0 ? `${n} دورات مياه` : null),
};
const FLAGS = { 'hospitality.men': 'مجلس رجال', 'hospitality.women': 'مجلس نساء', 'daily.prayer': 'مصلى', 'daily.office': 'مكتب', 'services.laundry': 'غرفة غسيل', 'household.guestBedroom': 'غرفة ضيوف' };

/** يصوغ نص الإرسال إلى شرعاء، ويعيد ما نُقل وما لم يُنقل (بالسبب). */
export function toSharaText(b) {
  const parts = [], applied = [];
  for (const [id, fn] of Object.entries(PHRASES)) { const f = confirmed(b, id); const p = f ? fn(f.value) : null; if (p) { parts.push(p); applied.push(id); } }
  const womenOnly = confirmed(b, 'hospitality.women')?.value === true && confirmed(b, 'hospitality.men')?.value === false;
  for (const [id, phrase] of Object.entries(FLAGS)) {
    const f = confirmed(b, id); if (!(f && f.value === true)) continue;
    // «مجلس نساء» وحدها يضيف الفهم المحلي معها مجلس رجال؛ يُصرَّح بالنفي
    parts.push(id === 'hospitality.women' && womenOnly ? 'مجلس نساء بدون مجلس رجال' : phrase); applied.push(id);
  }
  if (womenOnly) applied.push('hospitality.men');
  // «لا مجلس» لا يُفهم من الصمت (الفهم المحلي يفترض مجلسًا): يُصرَّح به
  if (confirmed(b, 'hospitality.men')?.value === false && confirmed(b, 'hospitality.women')?.value === false) { parts.push('بدون مجلس'); applied.push('hospitality.men', 'hospitality.women'); }
  const text = parts.length ? 'أبغى ' + parts.join('، ') + '.' : '';
  const support = factSupport(b), appliedSet = new Set(applied);
  const notApplied = support.filter(r => !appliedSet.has(r.id) && r.support !== 'not_applicable').map(r => {
    const q = bank.find(x => x.id === r.id), f = b.facts[r.id];
    // حقيقة منفية (false) أو صفرية لا تحتاج إرسالًا؛ ما سواه غير مطبق في التوليد الحالي
    const negative = r.support !== 'unconfirmed' && (f.value === false || f.value === 0);
    return { id: r.id, text: q.text, value: f.value, importance: r.importance, mandatory: r.mandatory, support: negative ? 'no_action_needed' : r.support === 'unconfirmed' ? 'unconfirmed' : 'not_applied',
      reason: negative ? 'الجواب سلبي ولا يتطلب فراغًا' : r.support === 'unconfirmed' ? r.reason : 'لا يستهلكه توليد شرعاء الحالي؛ يُعلَن ولا يُطبَّق' };
  });
  const blocking = notApplied.filter(x => x.mandatory && x.support === 'not_applied');
  return { text, applied, notApplied, blocking, expectedCounts: expectedCounts(b) };
}
/** الأعداد المتوقع أن يستخرجها فهم شرعاء من النص (للتحقق بعد الإرسال). */
export function expectedCounts(b) {
  const v = id => { const f = confirmed(b, id); return f ? f.value : undefined; };
  const out = {};
  if (v('household.bedrooms') !== undefined) out.bedrooms = v('household.bedrooms');
  const majlis = (v('hospitality.men') === true ? 1 : 0) + (v('hospitality.women') === true ? 1 : 0); if (v('hospitality.men') !== undefined || v('hospitality.women') !== undefined) out.majlis = majlis;
  if (v('living.baths') > 0) out.baths = v('living.baths'); if (v('services.kitchens') > 0) out.kitchens = v('services.kitchens');
  if (v('living.count') > 0) out.halls = v('living.count'); if (v('living.diningCount') > 0) out.dining = v('living.diningCount');
  return out;
}
/** هل يسمح الجسر بالإرسال؟ يمنع: تعارض، سؤال أساسي ناقص، إلزامي غير مدعوم، نص فارغ. */
export function canSend(b) {
  const r = readiness(b), s = toSharaText(b), reasons = [];
  if (r.conflicts.length) reasons.push('يوجد تعارض يحتاج قرارك: ' + r.conflicts.map(c => c.reason).join('؛ '));
  if (r.missing.length) reasons.push('أسئلة أساسية لم تُجَب بعد: ' + r.missing.map(id => bank.find(q => q.id === id).text).join('؛ '));
  if (r.pending.length) reasons.push('طلبات إلزامية غير مؤكدة: ' + r.pending.join('، '));
  if (s.blocking.length) reasons.push('طلبات إلزامية لا يدعمها التوليد الحالي (لا يجوز إسقاطها بصمت؛ غيّر أولويتها إلى تفضيل أو أبقِها خارج الإرسال): ' + s.blocking.map(x => x.text).join('؛ '));
  if (!s.text) reasons.push('لا توجد معلومة قابلة للإرسال بعد');
  return { ok: !reasons.length, reasons, sharaText: s };
}
