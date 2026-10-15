// تسليم تصميم من الصفحة الرئيسية إلى المرسم دون المساس بمشروع محفوظ سابقًا.
// الكاتب (الصفحة الرئيسية) يضع المستند في sessionStorage؛ والمرسم يستهلكه مرة واحدة عند الفتح،
// وإن كان في المرسم مشروع محفوظ له جدران يُنسخ احتياطيًا قبل الاستبدال ولا يُحذف.
import { parseDoc, serialize } from './doc.mjs';

export const HANDOFF_KEY = 'mizan.home.handoff.v1';
export const STUDIO_KEY = 'mizan.studio.doc.v1';
export const BACKUP_KEY = 'mizan.studio.doc.v1.before-home';
export const HANDOFF_SCHEMA = 'mizan-home-handoff/1';

/** يكتب التسليم. meta اختياري: مصدر التصميم والأرض (للعرض فقط، لا يغيّر المستند). */
export function writeHandoff(session, doc, meta = {}) {
  const checked = parseDoc(serialize(doc)); // يرفض المستند غير الصالح قبل الانتقال
  session.setItem(HANDOFF_KEY, JSON.stringify({ schema: HANDOFF_SCHEMA, at: meta.at ?? null, meta: { source: meta.source || 'home', ...(meta.note ? { note: String(meta.note).slice(0, 200) } : {}) }, doc: checked }));
  return checked;
}

/**
 * يستهلك التسليم إن وُجد. يعيد { doc, backedUp, meta } أو null.
 * مشروع المرسم المحفوظ الذي يحتوي جدرانًا لا يضيع: ينتقل إلى BACKUP_KEY.
 */
export function consumeHandoff(session, local) {
  let raw; try { raw = session.getItem(HANDOFF_KEY); } catch { return null; }
  if (!raw) return null;
  try { session.removeItem(HANDOFF_KEY); } catch { /* ignore */ }
  let parsed; try { parsed = JSON.parse(raw); } catch { return null; }
  if (parsed?.schema !== HANDOFF_SCHEMA) return null;
  let doc; try { doc = parseDoc(parsed.doc); } catch { return null; }
  let backedUp = false;
  try {
    const previous = local.getItem(STUDIO_KEY);
    if (previous) {
      let saved = null; try { saved = JSON.parse(previous); } catch { /* غير صالح: لا يستحق نسخًا */ }
      if (saved?.walls?.length) { local.setItem(BACKUP_KEY, previous); backedUp = true; }
    }
    local.setItem(STUDIO_KEY, serialize(doc));
  } catch { /* التخزين غير متاح: يبقى المستند محمولًا في الذاكرة */ }
  return { doc, backedUp, meta: parsed.meta || {} };
}
