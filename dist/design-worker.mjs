// عامل التوليد: البحث عن التوزيعات (توليد أولي، تصميم آخر، علاج الملاحظات، الدمج، تشخيص التعذّر) يجري هنا
// خارج الخيط الرئيسي حتى لا تتجمّد الواجهة. الدوال نفسها بلا تغيير: نفس المدخلات ← نفس التصاميم.
import { generateInitialDesign, diagnoseFit } from './home-flow.mjs';
import { createSession, redesign, mergeDesigns } from './design-session.mjs';
import { applyFix } from './design-fixes.mjs';

export const OPS = {
  /** توليد أولي + جلسة التصميم؛ ومعها ما يلزم لتسليم المرسم إن تعذّر الحفظ. */
  async generate({ input, sessionArgs }) {
    const out = await generateInitialDesign(input);
    return { session: createSession({ ...sessionArgs, result: out }), handoff: { doc: out.doc, notes: out.notes || [], dna: out.dna || null, alternatives: out.alternatives || [] } };
  },
  redesign: ({ session, ask }) => redesign(session, ask),
  fix: ({ session, id }) => applyFix(session, id),
  merge: ({ session, a, b }) => mergeDesigns(session, a, b),
  diagnose: ({ input }) => diagnoseFit(input),
  ping: async () => 'ready',
};
/** النتيجة بيانات صِرفة كما تُحفظ في التخزين (JSON)، فتطابق ما تقرؤه الصفحات بعد الحفظ حرفيًا. */
export const plain = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
export const errorData = e => ({ message: e?.message || String(e), code: e?.code || null, unclear: e?.unclear || null, name: e?.name || 'Error' });

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.addEventListener('message', async ev => {
    const { id, op, args } = ev.data || {};
    try { if (!OPS[op]) throw Error('عملية غير معروفة: ' + op); self.postMessage({ id, ok: true, result: plain(await OPS[op](args || {})) }); }
    catch (e) { self.postMessage({ id, ok: false, error: errorData(e) }); }
  });
}
